import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { processarRespostaAprovacaoMedico } from './processar-resposta-aprovacao-medico.js';
import type { PostgresCandidatosNotaRepositorio } from '../io/postgres-candidatos-nota-repositorio.js';

describe('processarRespostaAprovacaoMedico', () => {
  test('deve aprovar e enfileirar quando o médico responder "sim" ou "pode emitir"', async () => {
    let enfileirou = false;

    const repositorioFalso = {
      obterCandidatoAguardandoAprovacao: async () => ({
        medicoId: 'med-1',
        pacienteNome: 'Janayna Silva',
        pacienteTelefone: '4888567744',
        valorCentavos: 160000,
        valorFormatado: '1600,00',
        dataConsulta: '13/10/2026',
        dataConsultaIso: '2026-10-13'
      }),
      enfileirarEmissaoAprovada: async () => {
        enfileirou = true;
        return { solicitacaoId: 'sol-nova-123' };
      }
    } as unknown as PostgresCandidatosNotaRepositorio;

    const res = await processarRespostaAprovacaoMedico('med-1', 'Pode emitir!', {
      repositorio: repositorioFalso
    });

    assert.equal(res.processado, true);
    if (res.processado) {
      assert.equal(res.acao, 'emissao_enfileirada');
      assert.equal(res.solicitacaoId, 'sol-nova-123');
      assert.equal(enfileirou, true);
      assert.match(res.mensagemResposta, /Perfeito! Já coloquei a nota da paciente Janayna Silva/);
    }
  });

  test('deve cancelar quando o médico responder "não"', async () => {
    const repositorioFalso = {
      obterCandidatoAguardandoAprovacao: async () => ({
        medicoId: 'med-1',
        pacienteNome: 'Janayna Silva',
        pacienteTelefone: '4888567744',
        valorCentavos: 160000,
        valorFormatado: '1600,00',
        dataConsulta: '13/10/2026',
        dataConsultaIso: '2026-10-13'
      })
    } as unknown as PostgresCandidatosNotaRepositorio;

    const res = await processarRespostaAprovacaoMedico('med-1', 'Não, agora não', {
      repositorio: repositorioFalso
    });

    assert.equal(res.processado, true);
    if (res.processado) {
      assert.equal(res.acao, 'emissao_recusada');
      assert.match(res.mensagemResposta, /Cancelei a emissão/);
    }
  });

  test('deve solicitar CPF diretamente ao médico por padrão quando faltar CPF', async () => {
    let aguardandoSalvo = false;
    let dadosSalvos: any = null;
    let mensagemPacienteEnviada = false;

    const repositorioFalso = {
      obterCandidatoAguardandoAprovacao: async () => ({
        medicoId: 'med-1',
        pacienteNome: 'Marcelo Simões',
        pacienteTelefone: '555181005225',
        valorCentavos: 70000,
        valorFormatado: '700,00',
        dataConsulta: '13/10/2026',
        dataConsultaIso: '2026-10-13'
      }),
      enfileirarEmissaoAprovada: async () => ({
        solicitacaoId: 'sol-marcelo-1',
        aguardandoCpf: true,
        pacienteNome: 'Marcelo Simões',
        pacienteTelefone: '555181005225',
        pacienteId: 'pac-1'
      }),
      obterDadosMedico: async () => ({
        nomeCompleto: 'Dr. Teste',
        telefone: '555199998888',
        solicitarCpfDiretoPaciente: false
      }),
      salvarAguardandoCpfMedico: async (_medId: string, dados: any) => {
        aguardandoSalvo = true;
        dadosSalvos = dados;
      }
    } as unknown as PostgresCandidatosNotaRepositorio;

    const enviadorFalso = {
      enviarTexto: async ({ contatoTelefone }: any) => {
        if (contatoTelefone === '555181005225') {
          mensagemPacienteEnviada = true;
        }
        return { sucesso: true };
      }
    };

    const res = await processarRespostaAprovacaoMedico('med-1', 'Sim', {
      repositorio: repositorioFalso,
      enviarMensagem: enviadorFalso as any,
      instanciaNome: 'inst-1',
      telefoneMedico: '555199998888'
    });

    assert.equal(res.processado, true);
    if (res.processado) {
      assert.equal(res.acao, 'emissao_aguardando_cpf_medico');
      assert.equal(res.solicitacaoId, 'sol-marcelo-1');
      assert.match(res.mensagemResposta, /qual o CPF dele para eu emitir a nota fiscal\?/);
      assert.equal(mensagemPacienteEnviada, false, 'Não deve enviar mensagem ao paciente no modo médico');
      assert.equal(aguardandoSalvo, true);
      assert.equal(dadosSalvos.pacienteId, 'pac-1');
    }
  });

  test('deve solicitar CPF diretamente ao paciente quando preferência estiver ativada', async () => {
    let mensagemPacienteEnviada = false;
    let textoPaciente = '';

    const repositorioFalso = {
      obterCandidatoAguardandoAprovacao: async () => ({
        medicoId: 'med-1',
        pacienteNome: 'Marcelo Simões',
        pacienteTelefone: '555181005225',
        valorCentavos: 70000,
        valorFormatado: '700,00',
        dataConsulta: '13/10/2026',
        dataConsultaIso: '2026-10-13'
      }),
      enfileirarEmissaoAprovada: async () => ({
        solicitacaoId: 'sol-marcelo-1',
        aguardandoCpf: true,
        pacienteNome: 'Marcelo Simões',
        pacienteTelefone: '555181005225',
        pacienteId: 'pac-1'
      }),
      obterDadosMedico: async () => ({
        nomeCompleto: 'Dr. Teste',
        telefone: '555199998888',
        solicitarCpfDiretoPaciente: true
      })
    } as unknown as PostgresCandidatosNotaRepositorio;

    const enviadorFalso = {
      enviarTexto: async ({ contatoTelefone, texto }: any) => {
        if (contatoTelefone === '555181005225') {
          mensagemPacienteEnviada = true;
          textoPaciente = texto;
        }
        return { sucesso: true };
      }
    };

    const res = await processarRespostaAprovacaoMedico('med-1', 'Sim', {
      repositorio: repositorioFalso,
      enviarMensagem: enviadorFalso as any,
      instanciaNome: 'inst-1',
      telefoneMedico: '555199998888'
    });

    assert.equal(res.processado, true);
    if (res.processado) {
      assert.equal(res.acao, 'emissao_aguardando_cpf');
      assert.equal(res.solicitacaoId, 'sol-marcelo-1');
      assert.match(res.mensagemResposta, /solicitando o CPF no WhatsApp/);
      assert.equal(mensagemPacienteEnviada, true);
      assert.match(textoPaciente, /Olá, Marcelo! Para eu emitir sua nota fiscal/);
    }
  });

  test('deve capturar CPF diretamente se o médico fornecer na resposta afirmativa', async () => {
    let liberouComCpf = false;

    const repositorioFalso = {
      obterCandidatoAguardandoAprovacao: async () => ({
        medicoId: 'med-1',
        pacienteNome: 'Marcelo Simões',
        pacienteTelefone: '555181005225',
        valorCentavos: 70000,
        valorFormatado: '700,00',
        dataConsulta: '13/10/2026',
        dataConsultaIso: '2026-10-13'
      }),
      enfileirarEmissaoAprovada: async () => ({
        solicitacaoId: 'sol-marcelo-1',
        aguardandoCpf: true,
        pacienteNome: 'Marcelo Simões',
        pacienteTelefone: '555181005225',
        pacienteId: 'pac-1'
      }),
      obterDadosMedico: async () => ({
        nomeCompleto: 'Dr. Teste',
        telefone: '555199998888',
        solicitarCpfDiretoPaciente: false
      }),
      salvarCpfPacienteELiberarSolicitacao: async (_mId: string, pacId: string, cpf: string) => {
        assert.equal(pacId, 'pac-1');
        assert.equal(cpf, '52998224725');
        liberouComCpf = true;
        return 1;
      }
    } as unknown as PostgresCandidatosNotaRepositorio;

    const res = await processarRespostaAprovacaoMedico('med-1', 'Sim, o CPF dele é 529.982.247-25', {
      repositorio: repositorioFalso
    });

    assert.equal(res.processado, true);
    if (res.processado) {
      assert.equal(res.acao, 'emissao_enfileirada');
      assert.equal(liberouComCpf, true);
    }
  });
});
