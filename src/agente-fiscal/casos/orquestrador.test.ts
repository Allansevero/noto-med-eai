import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OrquestradorCasos } from './orquestrador.js';
import type { CasoFiscal, EventoAgente } from './modelo.js';

function ambiente(estado: CasoFiscal['estado'] = 'aguardando_aprovacao', campo = 'aprovacao') {
  let caso: CasoFiscal = { id: 'c1', medicoId: 'm1', mensagemPagamentoId: 'p1', estado, revisao: 1,
    solicitacaoId: null, perguntaPendente: { campo, mensagemId: 'q1', texto: 'Posso emitir?' },
    candidato: { pacienteNome: 'Maria Silva', pacienteTelefone: '51999998888', valorCentavos: 40000,
      valorFormatado: '400,00', dataConsulta: '13/10/2026', dataConsultaIso: '2026-10-13',
      origemEvidencia: { mensagemPagamentoId: 'p1', trechoPagamento: 'Comprovante' } },
    dados: { pacienteId: 'pac1', impressaoDados: 'assinatura' }, adiadoAte: null, criadoEm: new Date(), atualizadoEm: new Date() };
  const saidas: any[] = [], salvos: any[] = [], emissoes: any[] = [];
  let faltantes: string[] = [], impressao = 'assinatura';
  const repo = {
    obterAtivo: async () => caso,
    listar: async () => [caso],
    criarOuObter: async () => caso,
    enfileirarEvento: async (e: any) => { saidas.push(e); return true; },
    transicionarComSaida: async (_id: string, revisao: number, patch: any, saida: any) => {
      assert.equal(revisao, caso.revisao);
      caso = { ...caso, ...patch, revisao: revisao + 1 }; saidas.push(saida); return caso;
    }
  };
  const emissao = {
    preparar: async () => ({ pacienteId: 'pac1', pacienteNome: 'Maria Silva', camposFaltantes: faltantes, impressaoDados: impressao }),
    salvarDados: async (dados: any) => { salvos.push(dados); faltantes = []; },
    enfileirar: async (e: any) => { emissoes.push(e); return { solicitacaoId: 'sol1' }; }
  };
  const ia = { interpretar: async (_c: any, texto: string) => ({ casoId: 'c1', intencao: 'aprovar', evidencia: texto }) };
  const agente = new OrquestradorCasos(repo as any, { localizar: async () => ({ candidatos: [], incompleto: false, revisoes: 0 }) } as any,
    emissao as any, ia as any);
  const evento = (texto: string, patch: Record<string, unknown> = {}): EventoAgente => ({ id: 'e1', medicoId: 'm1', instanciaNome: 'assistente',
    mensagemId: 'msg1', tipo: 'entrada', tentativas: 1, tokenLease: 'token',
    payload: { texto, telefone: '5551888887777', casoRecebidoId: 'c1', perguntaRecebidaId: 'q1', ...patch } });
  return { agente, evento, caso: () => caso, saidas, salvos, emissoes,
    mudarDados: (campos: string[], assinatura = 'assinatura') => { faltantes = campos; impressao = assinatura; } };
}

test('aprovação contextual encaminha apenas o caso apresentado à fila', async () => {
  const a = ambiente(); await a.agente.processar(a.evento('sim'));
  assert.equal(a.emissoes.length, 1); assert.equal(a.emissoes[0].casoId, 'c1');
  assert.equal(a.emissoes[0].pacienteId, 'pac1'); assert.equal(a.caso().estado, 'enfileirado');
  assert.match(a.saidas[0].payload.texto, /fila de emissão/);
});
test('negação nunca autoriza mesmo quando a IA propõe aprovar', async () => {
  const a = ambiente(); await a.agente.processar(a.evento('Não emita essa nota'));
  assert.equal(a.emissoes.length, 0); assert.equal(a.caso().estado, 'aguardando_aprovacao');
});
test('recusa explícita encerra o caso sem emissão', async () => {
  const a = ambiente(); await a.agente.processar(a.evento('recusar'));
  assert.equal(a.emissoes.length, 0); assert.equal(a.caso().estado, 'recusado');
});
test('sim atrasado de outra pergunta ou outro caso não autoriza', async () => {
  for (const patch of [{ perguntaRecebidaId: 'q0' }, { casoRecebidoId: 'c0' }, { mensagemCitadaId: 'q0' }]) {
    const a = ambiente(); await a.agente.processar(a.evento('sim', patch));
    assert.equal(a.emissoes.length, 0);
  }
});
test('mudança de nome/CPF após pergunta exige nova aprovação', async () => {
  const a = ambiente(); a.mudarDados([], 'novo-cadastro');
  await a.agente.processar(a.evento('sim'));
  assert.equal(a.emissoes.length, 0); assert.equal(a.caso().perguntaPendente?.mensagemId, null);
  assert.equal(a.caso().dados.impressaoDados, 'novo-cadastro');
});
test('CPF solicitado é salvo somente no paciente do caso e pede aprovação depois', async () => {
  const a = ambiente('aguardando_dados', 'cpf');
  await a.agente.processar(a.evento('529.982.247-25'));
  assert.equal(a.salvos.length, 1); assert.equal(a.salvos[0].pacienteId, 'pac1');
  assert.deepEqual(a.salvos[0].dados, { cpf: '529.982.247-25' });
  assert.equal(a.emissoes.length, 0); assert.equal(a.caso().estado, 'aguardando_aprovacao');
  assert.ok(!JSON.stringify(a.caso().dados).includes('529'));
});
test('CPF inválido não é gravado e não avança', async () => {
  const a = ambiente('aguardando_dados', 'cpf'); await a.agente.processar(a.evento('111.111.111-11'));
  assert.equal(a.salvos.length, 0); assert.equal(a.emissoes.length, 0);
});
test('entrega incerta admite reenvio explícito de pergunta sem autorizar', async () => {
  const a = ambiente(); a.caso().perguntaPendente!.mensagemId = null;
  await a.agente.processar(a.evento('reenviar pergunta', { perguntaRecebidaId: null }));
  assert.equal(a.emissoes.length, 0); assert.equal(a.saidas[0].payload.pergunta, true);
});
test('mensagem antiga entregue depois da nova pergunta não aprova o caso',async()=>{
 const a=ambiente();a.caso().perguntaPendente!.enviadaEm='2026-10-15T15:00:00Z';
 await a.agente.processar(a.evento('sim',{instanteMensagem:Date.parse('2026-10-15T14:59:00Z')/1000}));
 assert.equal(a.emissoes.length,0);
});
test('saudação não autoriza emissão mesmo com classificação incorreta do modelo',async()=>{
 const a=ambiente();await a.agente.processar(a.evento('Bom dia'));
 assert.equal(a.emissoes.length,0);
});
