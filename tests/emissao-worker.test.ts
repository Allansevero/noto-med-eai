import { describe, expect, it } from 'vitest';
import { processarItemFila, type ProcessarItemFilaDeps } from '../src/worker/processar-item-fila.js';
import type { ItemFilaComTentativas } from '../src/worker/fila-repositorio.js';
import type { ResultadoEmissaoDps } from '../src/worker/emissor-dps-service.js';

const item: ItemFilaComTentativas = { id: 'solicitacao-1', medicoId: 'medico-1', pacienteId: 'paciente-1', valorServicoCentavos: 35025,
  xdescServ: 'Consulta de Ana Oliveira', ctribNac: '040101', tentativas: 0 };
const autorizada: ResultadoEmissaoDps = { sucesso: true, chaveAcesso: 'chave-ficticia', ndps: 42, serie: '00001', competencia: '2026-10-17',
  dataEmissao: new Date('2026-10-17T12:00:00Z'), valorServicosCentavos: 35025, xmlStoragePath: 'nota.xml', pdfStoragePath: 'nota.pdf' };
const contexto = { instanciaNome: 'clinica-1', contatoTelefone: '5511999990000', telefoneMedico: '5511888880000', nomePaciente: 'Ana Oliveira' };

function bordasWorker(resultado: ResultadoEmissaoDps) {
  const eventos: Array<{ acao: string; dados?: unknown }> = [];
  const deps: ProcessarItemFilaDeps = {
    agora: () => new Date('2026-10-17T12:00:00Z'),
    emissorDps: { async emitir(entrada) { eventos.push({ acao: 'emitir', dados: entrada }); return resultado; } },
    filaRepositorio: {
      async buscarETravarProximoItem() { throw new Error('Reserva deve ocorrer antes do processamento individual'); },
      async registrarSucesso(dados) { eventos.push({ acao: 'sucesso', dados }); },
      async buscarContextoEnvio() { return contexto; },
      async reagendarTentativa(dados) { eventos.push({ acao: 'reagendar', dados }); },
      async marcarFalhaDefinitiva(dados) { eventos.push({ acao: 'falha_definitiva', dados }); },
      async suspenderPorDadosProfissionais(id) { eventos.push({ acao: 'suspender', dados: id }); }
    },
    enviarPdfDanfse: { async enviarPdf(dados) { eventos.push({ acao: 'pdf', dados }); return { sucesso: true }; } },
    notificadorAlertas: {
      async notificarMedicoWhatsApp(dados) { eventos.push({ acao: 'aviso_medico', dados }); },
      async notificarDesenvolvedorEmail(dados) { eventos.push({ acao: 'aviso_desenvolvedor', dados }); }
    },
    dadosProfissionais: { async retomar(id) { eventos.push({ acao: 'retomar', dados: id }); return 0; } }
  };
  return { deps, eventos };
}

describe('worker real com emissor, persistência e entrega externos fake', () => {
  it('registra autorização antes de enviar PDF ao paciente da conversa', async () => {
    const bordas = bordasWorker(autorizada);
    expect(await processarItemFila(item, bordas.deps)).toEqual({ ok: true, status: 'emitida', chaveAcesso: 'chave-ficticia' });
    expect(bordas.eventos).toEqual([
      { acao: 'emitir', dados: item },
      { acao: 'sucesso', dados: { solicitacaoId: item.id, medicoId: item.medicoId, chaveAcesso: 'chave-ficticia', ndps: 42, serie: '00001', competencia: '2026-10-17', dataEmissao: autorizada.dataEmissao,
        valorServicosCentavos: 35025, xmlStoragePath: 'nota.xml', pdfStoragePath: 'nota.pdf', respostaSefinRaw: undefined } },
      { acao: 'pdf', dados: { instanciaNome: 'clinica-1', contatoTelefone: '5511999990000', pdfPathOuUrl: 'nota.pdf', nomeArquivo: 'DANFSe-42.pdf' } }
    ]);
  });
  it.each([[0, '2026-10-17T12:01:00Z'], [1, '2026-10-17T12:02:00Z']])('retentativa com %s tentativas anteriores', async (tentativas, proxima) => {
    const bordas = bordasWorker({ sucesso: false, erro: 'REJEICAO_FICTICIA' });
    expect(await processarItemFila({ ...item, tentativas }, bordas.deps)).toEqual({ ok: false, status: 'reagendada', motivo: 'REJEICAO_FICTICIA' });
    expect(bordas.eventos).toEqual([{ acao: 'emitir', dados: { ...item, tentativas } }, { acao: 'reagendar', dados: {
      solicitacaoId: item.id, tentativas: tentativas + 1, proximaTentativaEm: new Date(proxima), erro: 'REJEICAO_FICTICIA' } }]);
  });
  it('na terceira falha encerra e avisa o médico, sem enviar PDF ao paciente', async () => {
    const bordas = bordasWorker({ sucesso: false, erro: 'REJEICAO_FICTICIA' });
    expect(await processarItemFila({ ...item, tentativas: 2 }, bordas.deps)).toEqual({ ok: false, status: 'erro_definitivo', motivo: 'REJEICAO_FICTICIA' });
    expect(bordas.eventos.slice(1)).toEqual([
      { acao: 'falha_definitiva', dados: { solicitacaoId: item.id, tentativas: 3, erro: 'REJEICAO_FICTICIA' } },
      { acao: 'aviso_medico', dados: { telefoneMedico: '5511888880000', medicoId: item.medicoId, solicitacaoId: item.id, nomePaciente: 'Ana Oliveira', valorCentavos: 35025, motivoErro: 'REJEICAO_FICTICIA' } }
    ]);
  });
  it('dados profissionais pendentes suspendem item sem gastar nova tentativa', async () => {
    const bordas = bordasWorker({ sucesso: false, erro: 'CRM ausente', dadosProfissionaisPendentes: true });
    expect(await processarItemFila(item, bordas.deps)).toEqual({ ok: false, status: 'aguardando_dados_profissionais' });
    expect(bordas.eventos.slice(1)).toEqual([{ acao: 'suspender', dados: item.id }, { acao: 'retomar', dados: item.medicoId }]);
  });
  it('pendência fiscal também é reagendada pelo caminho genérico atual (achado)', async () => {
    const bordas = bordasWorker({ sucesso: false, erro: 'Revisar parâmetros', pendenciasFiscais: [{ campo: 'referencia', codigo: 'REFERENCIA_PENDENTE', mensagem: 'Confirmar referência' }] });
    expect(await processarItemFila(item, bordas.deps)).toEqual({ ok: false, status: 'reagendada', motivo: 'Revisar parâmetros' });
    expect(bordas.eventos[1]).toEqual({ acao: 'reagendar', dados: { solicitacaoId: item.id, tentativas: 1, proximaTentativaEm: new Date('2026-10-17T12:01:00Z'), erro: 'Revisar parâmetros' } });
  });
  it('retorno sucesso=false da entrega PDF não altera resultado emitida (achado)', async () => {
    const bordas = bordasWorker(autorizada);
    bordas.deps.enviarPdfDanfse.enviarPdf = async () => ({ sucesso: false, erro: 'WHATSAPP_INDISPONIVEL' });
    expect(await processarItemFila(item, bordas.deps)).toEqual({ ok: true, status: 'emitida', chaveAcesso: 'chave-ficticia' });
    expect(bordas.eventos.map(e => e.acao)).toEqual(['emitir', 'sucesso']);
  });
  it('exceção ao entregar PDF reagenda mesmo após registrar autorização (achado)', async () => {
    const bordas = bordasWorker(autorizada);
    bordas.deps.enviarPdfDanfse.enviarPdf = async () => { throw new Error('ENTREGA_PDF_FALHOU'); };
    expect(await processarItemFila(item, bordas.deps)).toEqual({ ok: false, status: 'reagendada', motivo: 'ENTREGA_PDF_FALHOU' });
    expect(bordas.eventos.map(e => e.acao)).toEqual(['emitir', 'sucesso', 'aviso_desenvolvedor', 'reagendar']);
    expect(bordas.eventos.at(-1)!.dados).toEqual({ solicitacaoId: item.id, tentativas: 1, proximaTentativaEm: new Date('2026-10-17T12:01:00Z'), erro: 'ENTREGA_PDF_FALHOU' });
  });
});
