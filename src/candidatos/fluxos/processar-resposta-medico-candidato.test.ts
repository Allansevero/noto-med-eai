import assert from 'node:assert/strict';
import test from 'node:test';
import { processarRespostaMedicoCandidato } from './processar-resposta-medico-candidato.js';
import type { CandidatosRepositorio, PacienteDadosBasicos } from '../io/candidatos-repositorio.js';
import type { CandidatoEmissao, CriarCandidatoParams } from '../tipos.js';

function criarCandidatoPadrao(): CandidatoEmissao {
  return {
    id: 'cand-001',
    medicoId: 'med-001',
    pacienteId: 'pac-001',
    mensagemId: 'msg-001',
    conversaId: 'conv-001',
    telefonePaciente: '5511988887777',
    nomePaciente: 'Mariana Souza',
    valorCentavos: 35000,
    dataPagamento: '2026-10-14',
    idTransacao: 'E12345',
    tipoPagamento: 'pix',
    status: 'pendente_aprovacao',
    referenciaExterna: 'comp_pix_E12345',
    criadoEm: new Date(),
    atualizadoEm: new Date()
  };
}

function criarRepoMemoria(candidato: CandidatoEmissao | null, paciente: PacienteDadosBasicos | null): CandidatosRepositorio {
  return {
    salvarCandidato: async () => candidato!,
    buscarCandidatoPorMensagem: async () => null,
    buscarCandidatoPorTxid: async () => null,
    buscarUltimoAguardandoAprovacao: async () => candidato,
    atualizarStatus: async (_id, status, extra) => {
      if (candidato) {
        candidato.status = status;
        if (extra?.solicitacaoId) candidato.solicitacaoId = extra.solicitacaoId;
        if (extra?.valorCentavos) candidato.valorCentavos = extra.valorCentavos;
      }
    },
    marcarNotificado: async () => {},
    buscarPacientePorTelefone: async () => paciente,
    salvarCpfPaciente: async (_m, _p, cpf) => {
      if (paciente) paciente.cpfLimpo = cpf;
    },
    jaExisteFaturamento: async () => false,
    obterDadosMedico: async () => ({ id: 'med-001', nomeCompleto: 'Dr. Lucas', telefone: '5511999999999' })
  };
}

test('ignora mensagens que não são respostas de aprovação/recusa', async () => {
  const candidato = criarCandidatoPadrao();
  const repo = criarRepoMemoria(candidato, null);

  const r = await processarRespostaMedicoCandidato(
    {
      medicoId: 'med-001',
      textoRecebido: 'bom dia tudo bem?',
      telefoneMedico: '5511999999999'
    },
    {
      repositorio: repo,
      emissaoApiRepo: {} as any,
      processarEmissaoApi: async () => ({} as any)
    }
  );

  assert.equal(r.tratado, false);
});

test('cancela emissão quando médico responde negativamente', async () => {
  const candidato = criarCandidatoPadrao();
  const repo = criarRepoMemoria(candidato, null);
  const avisosMedico: string[] = [];

  const r = await processarRespostaMedicoCandidato(
    {
      medicoId: 'med-001',
      textoRecebido: 'não, cancela por favor',
      telefoneMedico: '5511999999999'
    },
    {
      repositorio: repo,
      emissaoApiRepo: {} as any,
      processarEmissaoApi: async () => ({} as any),
      enviarMensagemAoMedico: async (_tel, msg) => {
        avisosMedico.push(msg);
        return true;
      }
    }
  );

  assert.equal(r.tratado, true);
  if (r.tratado) {
    assert.equal(r.acao, 'recusado');
  }
  assert.equal(candidato.status, 'recusado');
  assert.ok(avisosMedico[0].includes('Cancelei a emissão da nota de Mariana Souza'));
});

test('solicita CPF quando médico aprova mas paciente não possui CPF cadastrado', async () => {
  const candidato = criarCandidatoPadrao();
  const repo = criarRepoMemoria(candidato, { id: 'pac-001', nome: 'Mariana Souza', cpfLimpo: null, telefone: '5511988887777' });
  const avisosMedico: string[] = [];

  const r = await processarRespostaMedicoCandidato(
    {
      medicoId: 'med-001',
      textoRecebido: 'pode emitir',
      telefoneMedico: '5511999999999'
    },
    {
      repositorio: repo,
      emissaoApiRepo: {} as any,
      processarEmissaoApi: async () => ({} as any),
      enviarMensagemAoMedico: async (_tel, msg) => {
        avisosMedico.push(msg);
        return true;
      }
    }
  );

  assert.equal(r.tratado, true);
  if (r.tratado) {
    assert.equal(r.acao, 'aguardando_cpf');
  }
  assert.ok(avisosMedico[0].toLowerCase().includes('ainda não temos o cpf de mariana souza'));
});

test('aciona API existente de emissão diretamente quando médico aprova e paciente possui CPF', async () => {
  const candidato = criarCandidatoPadrao();
  const repo = criarRepoMemoria(candidato, { id: 'pac-001', nome: 'Mariana Souza', cpfLimpo: '52998224725', telefone: '5511988887777' });
  const avisosMedico: string[] = [];
  const chamadasEmissao: any[] = [];

  const r = await processarRespostaMedicoCandidato(
    {
      medicoId: 'med-001',
      textoRecebido: 'sim, pode emitir',
      telefoneMedico: '5511999999999'
    },
    {
      repositorio: repo,
      emissaoApiRepo: { nome: 'fake_repo' } as any,
      processarEmissaoApi: async (payload) => {
        chamadasEmissao.push(payload);
        return {
          ok: true,
          statusHttp: 201,
          resposta: {
            status: 'processando_autorizacao',
            ref: payload.ref,
            solicitacaoId: 'solic-999',
            mensagem: 'ok'
          }
        };
      },
      enviarMensagemAoMedico: async (_tel, msg) => {
        avisosMedico.push(msg);
        return true;
      }
    }
  );

  assert.equal(r.tratado, true);
  if (r.tratado) {
    assert.equal(r.acao, 'emissao_enfileirada');
    assert.equal(r.solicitacaoId, 'solic-999');
  }

  assert.equal(chamadasEmissao.length, 1);
  assert.equal(chamadasEmissao[0].ref, 'comp_pix_E12345');
  assert.equal(chamadasEmissao[0].valor, 350.00);
  assert.equal(chamadasEmissao[0].paciente.cpf, '52998224725');
  assert.equal(chamadasEmissao[0].paciente.nome, 'Mariana Souza');

  assert.equal(candidato.status, 'aprovado');
  assert.equal(candidato.solicitacaoId, 'solic-999');

  assert.ok(avisosMedico[0].includes('fila de emissão'));
  assert.ok(avisosMedico[0].includes('350,00'));
});

test('grava CPF informado pelo médico e aciona emissão no mesmo passo', async () => {
  const candidato = criarCandidatoPadrao();
  const paciente: PacienteDadosBasicos = { id: 'pac-001', nome: 'Mariana Souza', cpfLimpo: null, telefone: '5511988887777' };
  const repo = criarRepoMemoria(candidato, paciente);
  const chamadasEmissao: any[] = [];

  const r = await processarRespostaMedicoCandidato(
    {
      medicoId: 'med-001',
      textoRecebido: 'o cpf dela é 529.982.247-25',
      telefoneMedico: '5511999999999'
    },
    {
      repositorio: repo,
      emissaoApiRepo: {} as any,
      processarEmissaoApi: async (payload) => {
        chamadasEmissao.push(payload);
        return {
          ok: true,
          statusHttp: 201,
          resposta: {
            status: 'processando_autorizacao',
            ref: payload.ref,
            solicitacaoId: 'solic-888',
            mensagem: 'ok'
          }
        };
      }
    }
  );

  assert.equal(r.tratado, true);
  assert.equal(chamadasEmissao.length, 1);
  assert.equal(chamadasEmissao[0].paciente.cpf, '52998224725');
  assert.equal(candidato.status, 'aprovado');
  assert.equal(paciente.cpfLimpo, '52998224725');
});
