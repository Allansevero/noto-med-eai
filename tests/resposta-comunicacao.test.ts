import { describe, expect, it } from 'vitest';
import * as regras from '../src/onboarding/regras/decidir-proxima-acao.js';
import { HistoricoComunicacaoEmMemoria } from '../src/onboarding/historico-comunicacao-repositorio.js';
import { orquestrarComunicacao } from '../src/onboarding/orquestrar-comunicacao.js';

const hoje = '2026-10-18';
const interpretar = (texto: string, data = hoje) => (regras as any).interpretarRespostaNota(texto, data);
const pergunta = 'Tem alguma nota para emitir? Desde que dia?';
const agenda = 'Para eu achar suas consultas, preciso da sua agenda. Posso te mandar o link?';
describe('resposta determinística e textos aprovados', () => {
  it.each([['não', { temNota: false, desde: null }], ['NÃO', { temNota: false, desde: null }],
    ['sim, desde hoje', { temNota: true, desde: hoje }], ['sim, desde ontem', { temNota: true, desde: '2026-10-17' }]])('interpreta %s', (texto, resposta) => {
    expect(interpretar(texto)).toEqual(resposta);
  });
  it('ontem atravessa virada de mês sem inferir resposta', () => {
    expect(interpretar('sim, desde ontem', '2026-03-01')).toEqual({ temNota: true, desde: '2026-02-28' });
  });
  it.each(['sim', 'talvez', 'não sei', 'sim, mas não desde hoje', 'pode emitir'])('não interpreta resposta ambígua: %s', texto => {
    expect(interpretar(texto)).toBeNull();
  });
  it.each([
    [{ tipo: 'perguntar_nota_pendente' }, pergunta], [{ tipo: 'pedir_agenda', agendaInformada: null }, agenda],
    [{ tipo: 'reperguntar', pergunta: 'nota_pendente' }, pergunta], [{ tipo: 'reperguntar', pergunta: 'agenda' }, agenda]
  ])('monta apenas o texto aprovado para %j', (acao, texto) => {
    expect((regras as any).montarPerguntaComunicacao(acao)).toEqual(texto);
  });
});

async function cenario() {
  const historico = new HistoricoComunicacaoEmMemoria(); const medicoId = 'medico-ficticio';
  const agora = new Date('2026-10-18T15:00:00Z');
  const entrada = { medicoId, chaveProcessamento: 'inicio', estado: { agora,
    fiscal: { certificado: 'ok' as const, dadosFiscais: 'ok' as const }, agenda: { nome: null, conectada: false }, ultimaNota: null } };
  const logs: string[] = []; const deps = { historico, envioRealAtivo: false, log: (_nivel: string, texto: string) => logs.push(texto) };
  await orquestrarComunicacao(entrada, deps);
  await orquestrarComunicacao({ ...entrada, chaveProcessamento: 'pergunta' }, deps);
  return { entrada, deps, historico, logs, medicoId };
}
it('resposta reconhecida é gravada em simulado e gera pedir_agenda com texto exato', async () => {
  const c = await cenario();
  const entrada = { ...c.entrada, chaveProcessamento: 'resposta', respostaMedico: { texto: 'sim, desde hoje', dataMensagem: hoje } };
  expect(await orquestrarComunicacao(entrada, c.deps)).toEqual({ tipo: 'pedir_agenda', agendaInformada: null });
  expect((await c.historico.ler(c.medicoId, 'simulado')).perguntaNota.resposta).toEqual({ temNota: true, desde: hoje });
  expect((await c.historico.ler(c.medicoId, 'real')).perguntaNota.resposta).toBeNull();
  expect(c.logs).toContain('enviaria perguntar_nota_pendente: ' + pergunta);
  expect(c.logs.at(-1)).toBe('enviaria pedir_agenda: ' + agenda);
});
it('ambígua não grava resposta, repergunta imediatamente uma vez e depois não insiste', async () => {
  const c = await cenario();
  const entrada = { ...c.entrada, chaveProcessamento: 'ambigua', respostaMedico: { texto: 'talvez', dataMensagem: hoje } };
  expect(await orquestrarComunicacao(entrada, c.deps)).toEqual({ tipo: 'reperguntar', pergunta: 'nota_pendente' });
  expect(await orquestrarComunicacao({ ...entrada, chaveProcessamento: 'outra' }, c.deps)).toEqual({ tipo: 'nenhuma' });
  const h = await c.historico.ler(c.medicoId, 'simulado'); expect(h.perguntaNota.resposta).toBeNull(); expect(h.respostaRecebidaEm).toBeNull(); expect(h.perguntaNota.repeticoes).toBe(1);
});
it('não interpreta um texto antes de fazer a pergunta', async () => {
  const c = await cenario(); const outro = new HistoricoComunicacaoEmMemoria();
  await orquestrarComunicacao({ ...c.entrada, respostaMedico: { texto: 'não', dataMensagem: hoje } }, { ...c.deps, historico: outro });
  expect((await outro.ler(c.medicoId, 'simulado')).perguntaNota.resposta).toBeNull();
});
it('problema fiscal bloqueia a repergunta ambígua e conserva prioridade', async () => {
  const c = await cenario();
  expect(await orquestrarComunicacao({ ...c.entrada, chaveProcessamento: 'fiscal', estado: { ...c.entrada.estado,
    fiscal: { certificado: 'problema', dadosFiscais: 'ok' } }, respostaMedico: { texto: 'talvez', dataMensagem: hoje } }, c.deps))
    .toEqual({ tipo: 'problema_fiscal', campos: ['certificado'] });
});
it('falha ao gravar resposta retorna nenhuma sem log de intenção', async () => {
  const c = await cenario(); c.logs.length = 0;
  c.historico.gravarResposta = async () => { throw Error('erro privado ficticio'); };
  expect(await orquestrarComunicacao({ ...c.entrada, chaveProcessamento: 'falha', respostaMedico: { texto: 'não', dataMensagem: hoje } }, c.deps)).toEqual({ tipo: 'nenhuma' });
  expect(c.logs).toEqual(['HISTORICO_COMUNICACAO_FALHOU']);
});
