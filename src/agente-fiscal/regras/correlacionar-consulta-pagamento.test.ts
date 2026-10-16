import { test } from 'node:test';
import assert from 'node:assert/strict';
import { correlacionarConsultaPagamento, type MensagemContextoConversa as Mensagem } from './correlacionar-consulta-pagamento.js';

const agora = new Date('2026-10-15T15:00:00Z');
const consulta: Mensagem = { id: 'consulta', direcao: 'enviada', tipo: 'texto', criadoEm: '2026-10-10T12:00:00Z',
  conteudo: 'Olá, Maria! Sua consulta está agendada para 13/10/2026. Valor: R$ 400,00.' };
function pagamento(patch: Record<string, unknown> = {}, id = 'pagamento'): Mensagem {
  return { id, direcao: 'recebida', tipo: 'imagem', criadoEm: '2026-10-13T15:00:00Z', payloadBruto: { comprovante: {
    ehComprovante: true, statusPagamento: 'realizado', valorCentavos: 40000,
    dataPagamento: '2026-10-13', pagadorNome: 'Maria Silva', favorecidoNome: 'Clinica Exemplo', transacaoId: id, ...patch
  } } };
}
function nota(patch: Record<string, unknown> = {}): Mensagem {
  return { id: 'nf', direcao: 'enviada', tipo: 'documento', criadoEm: '2026-10-14T15:00:00Z', payloadBruto: { notaFiscal: {
    ehNotaFiscal: true, status: 'emitida', numero: '123', valorCentavos: 40000,
    tomadorNome: 'Maria Silva', prestadorNome: 'Clinica Exemplo', ...patch
  } } };
}
const buscar = (mensagens: Mensagem[]) => correlacionarConsultaPagamento(mensagens, '5551999998888', 'Maria Silva', agora);

test('pagamento realizado gera candidato com valor documental e data da consulta', () => {
  const [c] = buscar([consulta, pagamento()]);
  assert.equal(c.valorCentavos, 40000); assert.equal(c.dataConsultaIso, '2026-10-13');
  assert.equal(c.pacienteNome, 'Maria Silva'); assert.equal(c.requerRevisao, false);
});
for (const status of ['agendado', 'cancelado', 'desconhecido', undefined]) {
  test(`pagamento ${String(status)} não autoriza candidato`, () => {
    assert.equal(buscar([consulta, pagamento({ statusPagamento: status })]).length, 0);
  });
}
test('imagem desconhecida e pagamento sem valor não adotam preço citado nem padrão', () => {
  const semAnalise = { ...pagamento(), payloadBruto: {} };
  assert.equal(buscar([consulta, semAnalise]).length, 0);
  assert.equal(correlacionarConsultaPagamento([consulta, pagamento({ valorCentavos: undefined })],
    '51999998888', 'Maria Silva', agora, 40000).length, 0);
});
test('janela usa data do pagamento: comprovante antigo encaminhado hoje é excluído', () => {
  assert.equal(buscar([consulta, pagamento({ dataPagamento: '2026-09-30' })]).length, 0);
  assert.equal(buscar([consulta, pagamento({ dataPagamento: '2026-10-01' })]).length, 1);
  assert.equal(buscar([consulta, pagamento({ dataPagamento: '2026-10-16' })]).length, 0);
});
test('nota correspondente enviada posteriormente elimina pagamento', () => {
  assert.equal(buscar([consulta, pagamento(), nota()]).length, 0);
});
test('PDF arbitrário e texto sobre nota não comprovam emissão', () => {
  const documento: Mensagem = { ...nota(), conteudo: 'Segue o exame.pdf', payloadBruto: {
    message: { documentMessage: { fileName: 'exame.pdf' } } } };
  const texto: Mensagem = { ...nota(), tipo: 'texto', conteudo: 'Vou emitir sua nota fiscal amanhã', payloadBruto: {} };
  assert.equal(buscar([consulta, pagamento(), documento, texto]).length, 1);
});
test('nota de outro valor não elimina pagamento; nota sem identidade suficiente exige revisão', () => {
  assert.equal(buscar([consulta, pagamento(), nota({ valorCentavos: 90000 })]).length, 1);
  const [c] = buscar([consulta, pagamento({ pagadorNome: undefined }), nota()]);
  assert.equal(c.requerRevisao, true);
});
test('dois pagamentos iguais com uma nota ambígua não são descartados juntos', () => {
  const cs = buscar([consulta, pagamento({}, 'p1'), pagamento({}, 'p2'), nota()]);
  assert.equal(cs.length, 2); assert.ok(cs.every(c => c.requerRevisao));
});
test('reenvio da mesma transação gera um único candidato', () => {
  assert.equal(buscar([consulta, pagamento({}, 'p1'), pagamento({ transacaoId: 'p1' }, 'p2')]).length, 1);
});
test('ausência da data da consulta fica pendente; não se inventa data do pagamento', () => {
  const [c] = buscar([pagamento()]);
  assert.equal(c.dataConsultaIso, ''); assert.equal(c.requerRevisao, true);
});
test('comprovante enviado pela clínica e promessa de pagamento não geram candidato', () => {
  assert.equal(buscar([consulta, { ...pagamento(), direcao: 'enviada' }]).length, 0);
  assert.equal(buscar([consulta, { ...pagamento(), tipo: 'texto', conteudo: 'Vou pagar hoje' }]).length, 0);
});
test('extrai CPF do paciente a partir do histórico do WhatsApp', () => {
  const cpfMensagem: Mensagem = {
    id: 'cpf-1',
    direcao: 'recebida',
    tipo: 'texto',
    conteudo: 'Meu CPF para a nota é 123.456.789-09',
    criadoEm: '2026-10-11T12:00:00Z'
  };
  const [c] = buscar([consulta, cpfMensagem, pagamento()]);
  assert.ok(c);
  assert.equal(c.pacienteCpf, '12345678909');
});
