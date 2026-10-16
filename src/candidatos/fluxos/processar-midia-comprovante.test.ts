import assert from 'node:assert/strict';
import test from 'node:test';
import { processarMidiaComprovante } from './processar-midia-comprovante.js';
import type { CandidatosRepositorio, PacienteDadosBasicos, MedicoDadosBasicos } from '../io/candidatos-repositorio.js';
import type { CandidatoEmissao, CriarCandidatoParams, DadosComprovanteExtraidos } from '../tipos.js';
import type { GeminiComprovanteClient } from '../io/gemini-comprovante-client.js';

function criarRepoMemoria(dadosIniciais?: {
  jaFaturado?: boolean;
  paciente?: PacienteDadosBasicos | null;
  medico?: MedicoDadosBasicos | null;
}): CandidatosRepositorio {
  const candidatos: CandidatoEmissao[] = [];

  return {
    salvarCandidato: async (params: CriarCandidatoParams) => {
      const c: CandidatoEmissao = {
        id: 'cand-123',
        medicoId: params.medicoId,
        pacienteId: params.pacienteId,
        mensagemId: params.mensagemId,
        conversaId: params.conversaId,
        telefonePaciente: params.telefonePaciente,
        nomePaciente: params.nomePaciente,
        valorCentavos: params.valorCentavos,
        dataPagamento: params.dataPagamento,
        idTransacao: params.idTransacao,
        tipoPagamento: params.tipoPagamento,
        status: 'pendente_aprovacao',
        referenciaExterna: params.referenciaExterna,
        criadoEm: new Date(),
        atualizadoEm: new Date()
      };
      candidatos.push(c);
      return c;
    },
    buscarCandidatoPorMensagem: async () => null,
    buscarCandidatoPorTxid: async () => null,
    buscarUltimoAguardandoAprovacao: async () => candidatos[0] || null,
    atualizarStatus: async () => {},
    marcarNotificado: async (id: string) => {
      const c = candidatos.find(x => x.id === id);
      if (c) c.notificadoEm = new Date();
    },
    buscarPacientePorTelefone: async () => dadosIniciais?.paciente ?? null,
    salvarCpfPaciente: async () => {},
    jaExisteFaturamento: async () => Boolean(dadosIniciais?.jaFaturado),
    obterDadosMedico: async () => dadosIniciais?.medico ?? {
      id: 'med-1',
      nomeCompleto: 'Dr. Lucas',
      telefone: '5511999999999'
    }
  };
}

function criarGeminiFalso(extracao: DadosComprovanteExtraidos): GeminiComprovanteClient {
  return {
    analisarMidia: async () => extracao
  } as any;
}

test('descarta mídia quando o Gemini identifica que não é comprovante', async () => {
  const gemini = criarGeminiFalso({ ehComprovante: false });
  const repo = criarRepoMemoria();

  const r = await processarMidiaComprovante(
    {
      medicoId: 'med-1',
      conversaId: 'conv-1',
      mensagemId: 'msg-1',
      telefonePaciente: '5511988888888',
      base64: 'abc'
    },
    { geminiClient: gemini, repositorio: repo }
  );

  assert.equal(r.ok, false);
  assert.equal((r as any).motivo, 'nao_eh_comprovante');
});

test('descarta comprovante cujo pagamento já foi faturado anteriormente', async () => {
  const gemini = criarGeminiFalso({
    ehComprovante: true,
    valorCentavos: 35000,
    dataPagamento: '2026-10-14',
    idTransacao: 'PIX-DUPLICADO'
  });
  const repo = criarRepoMemoria({ jaFaturado: true });

  const r = await processarMidiaComprovante(
    {
      medicoId: 'med-1',
      conversaId: 'conv-1',
      mensagemId: 'msg-1',
      telefonePaciente: '5511988888888',
      base64: 'abc'
    },
    { geminiClient: gemini, repositorio: repo }
  );

  assert.equal(r.ok, false);
  assert.equal((r as any).motivo, 'ja_faturado');
});

test('registra candidato e envia notificação formatada para o médico', async () => {
  const gemini = criarGeminiFalso({
    ehComprovante: true,
    tipo: 'pix',
    valorCentavos: 35000,
    dataPagamento: '2026-10-14',
    idTransacao: 'E123456789',
    pagadorNome: 'Mariana Souza'
  });

  const mensagensEnviadas: Array<{ tel: string; texto: string }> = [];
  const repo = criarRepoMemoria({
    paciente: { id: 'pac-1', nome: 'Mariana Souza', cpfLimpo: '52998224725', telefone: '5511988888888' },
    medico: { id: 'med-1', nomeCompleto: 'Dr. Lucas Prado', telefone: '5511999999999' }
  });

  const r = await processarMidiaComprovante(
    {
      medicoId: 'med-1',
      conversaId: 'conv-1',
      mensagemId: 'msg-1',
      telefonePaciente: '5511988888888',
      base64: 'abc'
    },
    {
      geminiClient: gemini,
      repositorio: repo,
      enviarMensagemAoMedico: async (tel, texto) => {
        mensagensEnviadas.push({ tel, texto });
        return true;
      }
    }
  );

  assert.equal(r.ok, true);
  if (r.ok) {
    assert.equal(r.status, 'candidato_notificado');
    assert.equal(r.candidato.valorCentavos, 35000);
    assert.equal(r.candidato.referenciaExterna, 'comp_pix_E123456789');
  }

  assert.equal(mensagensEnviadas.length, 1);
  assert.equal(mensagensEnviadas[0].tel, '5511999999999');
  assert.ok(mensagensEnviadas[0].texto.includes('350,00'));
  assert.ok(mensagensEnviadas[0].texto.includes('Mariana Souza'));
  assert.ok(mensagensEnviadas[0].texto.includes('Posso emitir a NFS-e agora?'));
});
