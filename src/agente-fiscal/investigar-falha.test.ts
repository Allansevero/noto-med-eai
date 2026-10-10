/**
 * Exercita o ciclo real do worker com ferramentas em memória, sem emitir notas
 * nem enviar dados de pacientes a serviços externos.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { processarItemFila } from '../worker/processar-item-fila.js';
import { investigarFalha } from './investigar-falha.js';
import type { ContextoInvestigacao, EstadoInvestigacao, InvestigacaoRepositorio } from './investigacao.js';
import type { ResultadoEmissaoDps } from '../worker/emissor-dps-service.js';

const item = { id: 'sol', medicoId: 'med', pacienteId: 'pac', tentativas: 0,
  xdescServ: 'descricao privada', valorServicoCentavos: 10000, ctribNac: '040101' };
const sucesso: ResultadoEmissaoDps = { sucesso: true, chaveAcesso: '1'.repeat(50), ndps: 1,
  serie: '1', competencia: '2026-10', dataEmissao: new Date(), valorServicosCentavos: 10000,
  xmlStoragePath: 'xml', pdfStoragePath: 'pdf' };
class Repo implements InvestigacaoRepositorio {
  assumido = false;
  reservado = false;
  estado: EstadoInvestigacao = 'investigando';
  eventos: any[] = [];
  contexto: ContextoInvestigacao = { status: 'pendente', tentativas: 1, autorizada: false, perfil: {}, historico: [] };
  async assumir() { if (this.assumido) return false; this.assumido = true; return true; }
  async consultar() { return { ...this.contexto }; }
  async registrar(_item: unknown, evento: any, estado?: EstadoInvestigacao) {
    this.eventos.push(evento); if (estado) this.estado = estado;
  }
  async reservarTentativa() {
    if (this.reservado) return false;
    this.reservado = true;
    return true;
  }
}
function montar(resultados: ResultadoEmissaoDps[]) {
  const repo = new Repo();
  let chamadas = 0, avisos = 0, avisosDev = 0, entregas = 0, decisoes = 0;
  const deps = {
    agenteFiscal: { repositorio: repo, decisor: { async decidir(contexto: any) {
      decisoes++;
      assert.ok(!JSON.stringify(contexto).includes('descricao privada'));
      return { acao: 'tentar_novamente' as const, causa: 'conexão', justificativa: 'sem envio', acaoNecessaria: 'repetir' };
    } } },
    emissorDps: { async emitir() { return resultados[chamadas++] ?? sucesso; } },
    filaRepositorio: {
      async buscarETravarProximoItem() { return null; },
      async registrarSucesso() { repo.contexto.autorizada = true; repo.contexto.status = 'emitida'; },
      async buscarContextoEnvio() { return { instanciaNome: 'i', contatoTelefone: 'p', telefoneMedico: 'm', nomePaciente: null }; },
      async reagendarTentativa() { assert.fail('Não deve usar retentativa legada'); },
      async marcarFalhaDefinitiva() { assert.fail('Não deve liberar consultas para nova emissão'); }
    },
    enviarPdfDanfse: { async enviarPdf() { entregas++; return { sucesso: true }; } },
    notificadorAlertas: {
      async notificarMedicoWhatsApp() { avisos++; },
      async notificarDesenvolvedorEmail() { avisosDev++; }
    }
  };
  return { repo, deps, contadores: () => ({ chamadas, avisos, avisosDev, entregas, decisoes }) };
}
test('falha antes do envio → investiga → repete uma vez → verifica banco → resolve e entrega', async () => {
  const c = montar([{ sucesso: false, erro: 'DNS', falhaAntesDoEnvio: 'EAI_AGAIN' }, sucesso]);
  assert.equal((await processarItemFila(item, c.deps)).status, 'emitida');
  assert.equal(c.repo.estado, 'resolvido');
  assert.deepEqual(c.contadores(), { chamadas: 2, avisos: 0, avisosDev: 0, entregas: 1, decisoes: 1 });
  assert.ok(c.repo.eventos.some(e => e.tipo === 'verificacao'));
});
test('sucesso normal não chama agente nem abre caso', async () => {
  const c = montar([sucesso]);
  await processarItemFila(item, c.deps);
  assert.equal(c.repo.assumido, false);
  assert.equal(c.contadores().decisoes, 0);
});
for (const codigo of ['E0160', 'E0014', 'E0676', 'E0710', undefined]) {
  test(`bloqueia proposta insegura do modelo: ${codigo ?? 'timeout/resultado incerto'}`, async () => {
    const c = montar([{ sucesso: false, erro: 'falha', codigoErroSefin: codigo }]);
    await processarItemFila(item, c.deps);
    assert.equal(c.repo.estado, 'necessita_intervencao');
    assert.equal(c.contadores().chamadas, 1);
    assert.equal(c.contadores().avisos + c.contadores().avisosDev, 1);
  });
}
test('segunda falha encerra sem loop', async () => {
  const falha = { sucesso: false as const, erro: 'conexão', falhaAntesDoEnvio: 'ECONNREFUSED' as const };
  const c = montar([falha, falha]);
  await processarItemFila(item, c.deps);
  assert.equal(c.contadores().chamadas, 2);
  assert.equal(c.repo.estado, 'necessita_intervencao');
  await investigarFalha({ item, falha }, { ...c.deps.agenteFiscal, emissor: c.deps.emissorDps,
    concluir: async () => assert.fail(), notificar: async () => assert.fail() });
  assert.equal(c.contadores().chamadas, 2);
});
test('falha do modelo escala sem retransmissão', async () => {
  const c = montar([{ sucesso: false, erro: 'DNS', falhaAntesDoEnvio: 'EAI_AGAIN' }]);
  c.deps.agenteFiscal.decisor.decidir = async () => { throw new Error('timeout'); };
  await processarItemFila(item, c.deps);
  assert.equal(c.contadores().chamadas, 1);
  assert.equal(c.repo.estado, 'necessita_intervencao');
});
test('sucesso sem persistência confirmada não resolve', async () => {
  const c = montar([{ sucesso: false, erro: 'DNS', falhaAntesDoEnvio: 'EAI_AGAIN' }, sucesso]);
  c.deps.filaRepositorio.registrarSucesso = async () => {};
  await processarItemFila(item, c.deps);
  assert.equal(c.repo.estado, 'necessita_intervencao');
});
test('limite de tentativas prevalece sobre proposta do modelo', async () => {
  const c = montar([{ sucesso: false, erro: 'DNS', falhaAntesDoEnvio: 'EAI_AGAIN' }]);
  c.repo.contexto.tentativas = 3;
  await processarItemFila(item, c.deps);
  assert.equal(c.contadores().chamadas, 1);
});
test('erro de persistência após autorização não retransmite', async () => {
  const c = montar([sucesso]);
  c.deps.filaRepositorio.registrarSucesso = async () => { throw new Error('banco'); };
  await processarItemFila(item, c.deps);
  assert.equal(c.contadores().chamadas, 1);
  assert.equal(c.repo.estado, 'necessita_intervencao');
});
test('falha de entrega preserva autorização e exige revisão sem retransmitir', async () => {
  const c = montar([sucesso]);
  c.deps.enviarPdfDanfse.enviarPdf = async () => { throw new Error('WhatsApp indisponível'); };
  await processarItemFila(item, c.deps);
  assert.equal(c.repo.contexto.autorizada, true);
  assert.equal(c.contadores().chamadas, 1);
  assert.equal(c.repo.estado, 'necessita_intervencao');
});
test('falha ao persistir caso não cai no retry legado', async () => {
  const c = montar([{ sucesso: false, erro: 'DNS', falhaAntesDoEnvio: 'EAI_AGAIN' }]);
  c.repo.assumir = async () => { throw new Error('banco indisponível'); };
  await assert.rejects(() => processarItemFila(item, c.deps));
  assert.equal(c.contadores().chamadas, 1);
});

test('agente escolhe correção de rejeição, ferramenta corrige e verifica autorização', async () => {
  const falha = {
    sucesso: false as const, erro: 'Tributos federais não permitidos', codigoErroSefin: 'E0676', httpStatus: 422,
    respostaSefinRaw: { erros: [{ Codigo: 'E0676' }] },
    xmlDpsOriginal: '<DPS><tribFed><piscofins><CST>08</CST></piscofins></tribFed></DPS>',
    contextoTecnico: { dataGeracao: '2026-10-04T12:00:00.000Z', ndps: 10 }
  };
  const c = montar([falha]);
  let correcoes = 0;
  const resultado = await processarItemFila(item, {
    ...c.deps,
    emissorDps: { ...c.deps.emissorDps, async corrigirRejeicao(_item, evidencia) {
      correcoes++;
      assert.equal(evidencia, falha);
      return sucesso;
    } },
    agenteFiscal: { repositorio: c.repo, decisor: { async decidir(contexto: any) {
      assert.ok(contexto.ferramentasPermitidas.includes('corrigir_tributos_federais'));
      assert.equal(JSON.stringify(contexto).includes('<DPS>'), false);
      return { acao: 'corrigir_tributos_federais', causa: 'Bloco não permitido', justificativa: 'Rejeição explícita', acaoNecessaria: 'Remover bloco automático' };
    } } }
  });
  assert.equal(resultado.status, 'emitida');
  assert.equal(correcoes, 1);
  assert.equal(c.contadores().chamadas, 1, 'Correção usa ferramenta própria, não retry cego');
  assert.equal(c.repo.estado, 'resolvido');
  assert.ok(c.repo.eventos.some(e => e.nome === 'corrigir_tributos_federais'));
});

test('proposta de correção para rejeição sem regra é bloqueada', async () => {
  const c = montar([{ sucesso: false, erro: 'Regime divergente', codigoErroSefin: 'E0160' }]);
  await processarItemFila(item, {
    ...c.deps,
    emissorDps: { ...c.deps.emissorDps, async corrigirRejeicao() { assert.fail('Não deve editar'); } },
    agenteFiscal: { repositorio: c.repo, decisor: { async decidir() {
      return { acao: 'corrigir_tributos_federais', causa: 'x', justificativa: 'x', acaoNecessaria: 'x' };
    } } }
  });
  assert.equal(c.repo.estado, 'necessita_intervencao');
});

test('falha na comunicação com médico registra resultado falhou na auditoria e não enviada', async () => {
  const c = montar([{ sucesso: false, erro: 'Enquadramento cadastral diverge', codigoErroSefin: 'E0160' }]);
  c.deps.notificadorAlertas.notificarMedicoWhatsApp = async () => {
    throw new Error('Falha no WhatsApp');
  };
  await processarItemFila(item, c.deps);
  assert.equal(c.repo.estado, 'necessita_intervencao');
  const eventoNotificacao = c.repo.eventos.find(e => e.tipo === 'notificacao');
  assert.ok(eventoNotificacao, 'Deve registrar evento de notificação');
  assert.equal(eventoNotificacao.resultado, 'falhou');
  assert.equal(c.repo.eventos.some(e => e.tipo === 'notificacao' && e.resultado === 'enviada'), false);
});

test('erro de FORA_DA_VIGENCIA escala diretamente para desenvolvedor sem alertar o médico via WhatsApp', async () => {
  const falhaVigencia: ResultadoEmissaoDps = {
    sucesso: false,
    erro: 'Há parâmetros fiscais pendentes de revisão antes do envio.',
    pendenciasFiscais: [
      { campo: 'vigencia', codigo: 'FORA_DA_VIGENCIA', mensagem: 'Revisar os parâmetros aplicáveis à competência da nota.' }
    ]
  };
  const c = montar([falhaVigencia]);
  await processarItemFila(item, c.deps);
  assert.equal(c.repo.estado, 'necessita_intervencao');
  assert.equal(c.contadores().avisos, 0, 'Não deve incomodar o médico com falha de vigência do sistema');
  assert.equal(c.contadores().avisosDev, 1, 'Deve alertar os desenvolvedores por e-mail');
  const escalonamento = c.repo.eventos.find(e => e.tipo === 'escalonamento');
  assert.ok(escalonamento);
  assert.equal(escalonamento.responsavel, 'desenvolvedor');
});

