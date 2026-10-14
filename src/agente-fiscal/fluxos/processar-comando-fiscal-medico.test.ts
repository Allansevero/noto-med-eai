import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  processarComandoFiscalMedico,
  ehConsultaNotasSobDemanda
} from './processar-comando-fiscal-medico.js';
import type { PostgresCandidatosNotaRepositorio } from '../io/postgres-candidatos-nota-repositorio.js';

describe('processarComandoFiscalMedico', () => {
  test('deve reconhecer frases de consulta de notas sob demanda', () => {
    assert.equal(ehConsultaNotasSobDemanda('Tem alguma nota pendente?'), true);
    assert.equal(ehConsultaNotasSobDemanda('ver notas'), true);
    assert.equal(ehConsultaNotasSobDemanda('notas de hoje'), true);
    assert.equal(ehConsultaNotasSobDemanda('comprovantes pendentes'), true);
    assert.equal(ehConsultaNotasSobDemanda('Quero emitir as notas agora'), true);
    assert.equal(ehConsultaNotasSobDemanda('Gera as notas pra mim'), true);
    assert.equal(ehConsultaNotasSobDemanda('Noto, confere se tem nota pra emitir'), true);
    assert.equal(ehConsultaNotasSobDemanda('Pode rodar o fechamento?'), true);
    assert.equal(ehConsultaNotasSobDemanda('Verifica os comprovantes de hoje'), true);
    assert.equal(ehConsultaNotasSobDemanda('E as notas?'), true);
    assert.equal(ehConsultaNotasSobDemanda('Alguma nota?'), true);
    assert.equal(ehConsultaNotasSobDemanda('bom dia'), false);
    assert.equal(ehConsultaNotasSobDemanda('obrigado'), false);
  });

  test('deve acionar varredura sob demanda quando o médico perguntar por notas', async () => {
    let varreu = false;
    const repositorioFalso = {
      obterDadosMedico: async () => ({ nomeCompleto: 'Dra. Bruna', telefone: '51981936133' }),
      buscarConversasComHistorico: async () => {
        varreu = true;
        return [];
      },
      verificarSeJaPossuiNota: async () => false,
      salvarCandidatoAguardandoAprovacao: async () => {}
    } as unknown as PostgresCandidatosNotaRepositorio;

    const enviadorFalso = {
      enviarTexto: async () => ({ sucesso: true })
    } as any;

    const res = await processarComandoFiscalMedico('med-1', 'Tem alguma nota pendente?', '51981936133', {
      repositorio: repositorioFalso,
      enviarMensagem: enviadorFalso,
      instanciaNome: 'notomed_oficial'
    });

    assert.equal(res.tratado, true);
    assert.equal(res.tipo, 'consulta_sob_demanda');
    assert.equal(varreu, true);
  });

  test('deve aprovar nota atual e puxar o próximo candidato pendente em cadeia', async () => {
    let enfileirou = false;
    const mensagensEnviadas: string[] = [];

    const candidatoAtual = {
      medicoId: 'med-1',
      pacienteNome: 'Vanessa Lodi',
      pacienteTelefone: '6699840654',
      valorCentavos: 45000,
      valorFormatado: '450,00',
      dataConsulta: '30/10/2025',
      dataConsultaIso: '2025-10-30'
    };

    const proximoCandidato = {
      pacienteNome: 'Bruno Z',
      pacienteTelefone: '5196854299',
      valorCentavos: 40000,
      valorFormatado: '400,00',
      dataConsulta: '13/10/2026',
      dataConsultaIso: '2026-10-13',
      origemEvidencia: { mensagemPagamentoId: 'm-2' }
    };

    const repositorioFalso = {
      obterCandidatoAguardandoAprovacao: async () => candidatoAtual,
      enfileirarEmissaoAprovada: async () => {
        enfileirou = true;
        return { solicitacaoId: 'sol-1' };
      },
      obterDadosMedico: async () => ({ nomeCompleto: 'Dra. Alice Xavier', telefone: '51981680978' }),
      buscarConversasComHistorico: async () => [
        {
          conversaId: 'c-2',
          contatoTelefone: '5196854299',
          contatoNome: 'Bruno Z',
          mensagens: [
            { id: 'm-1', direcao: 'enviada', tipo: 'texto', conteudo: 'Consulta em 13/10/2026. Valor 400,00', criadoEm: '2026-10-13T10:00:00Z' },
            { id: 'm-2', direcao: 'recebida', tipo: 'imagem', conteudo: '', criadoEm: '2026-10-13T11:00:00Z' }
          ]
        }
      ],
      verificarSeJaPossuiNota: async () => false,
      salvarCandidatoAguardandoAprovacao: async () => {}
    } as unknown as PostgresCandidatosNotaRepositorio;

    const enviadorFalso = {
      enviarTexto: async ({ texto }: { texto: string }) => {
        mensagensEnviadas.push(texto);
        return { sucesso: true };
      }
    } as any;

    const res = await processarComandoFiscalMedico('med-1', 'Sim, pode emitir', '51981680978', {
      repositorio: repositorioFalso,
      enviarMensagem: enviadorFalso,
      instanciaNome: 'notomed_assistente'
    });

    assert.equal(res.tratado, true);
    assert.equal(res.tipo, 'resposta_aprovacao');
    assert.equal(enfileirou, true);
    assert.equal(mensagensEnviadas.length, 2);
    // 1ª mensagem: confirmação da Vanessa
    assert.match(mensagensEnviadas[0], /Perfeito! Já coloquei a nota da paciente Vanessa Lodi/);
    // 2ª mensagem: continuação com Bruno Z
    assert.match(mensagensEnviadas[1], /^Também encontrei o pagamento de R\$ 400,00 da paciente Bruno Z/);
    assert.match(mensagensEnviadas[1], /Posso emitir essa também\?/);
  });

  test('deve aprovar e informar conclusão quando não houver próximo candidato', async () => {
    const mensagensEnviadas: string[] = [];

    const candidatoAtual = {
      medicoId: 'med-1',
      pacienteNome: 'Vanessa Lodi',
      pacienteTelefone: '6699840654',
      valorCentavos: 45000,
      valorFormatado: '450,00',
      dataConsulta: '30/10/2025',
      dataConsultaIso: '2025-10-30'
    };

    const repositorioFalso = {
      obterCandidatoAguardandoAprovacao: async () => candidatoAtual,
      enfileirarEmissaoAprovada: async () => ({ solicitacaoId: 'sol-1' }),
      obterDadosMedico: async () => ({ nomeCompleto: 'Dra. Alice Xavier', telefone: '51981680978' }),
      buscarConversasComHistorico: async () => [],
      verificarSeJaPossuiNota: async () => false,
      salvarCandidatoAguardandoAprovacao: async () => {}
    } as unknown as PostgresCandidatosNotaRepositorio;

    const enviadorFalso = {
      enviarTexto: async ({ texto }: { texto: string }) => {
        mensagensEnviadas.push(texto);
        return { sucesso: true };
      }
    } as any;

    const res = await processarComandoFiscalMedico('med-1', 'Pode emitir', '51981680978', {
      repositorio: repositorioFalso,
      enviarMensagem: enviadorFalso,
      instanciaNome: 'notomed_assistente'
    });

    assert.equal(res.tratado, true);
    assert.equal(res.tipo, 'resposta_aprovacao');
    assert.equal(mensagensEnviadas.length, 2);
    assert.match(mensagensEnviadas[0], /Perfeito! Já coloquei a nota da paciente Vanessa Lodi/);
    assert.match(mensagensEnviadas[1], /Pronto! Todas as notas pendentes foram processadas por hoje/);
  });

  test('deve processar CPF enviado pelo médico para paciente com nota pendente', async () => {
    let salvouCpf = false;
    let pacienteIdSalvo = '';
    let cpfSalvo = '';
    const mensagensEnviadas: string[] = [];

    const repositorioFalso = {
      obterAguardandoCpfMedico: async () => ({
        solicitacaoId: 'sol-marcelo-1',
        pacienteId: 'pac-marcelo-1',
        pacienteNome: 'Marcelo Simões',
        pacienteTelefone: '555181005225'
      }),
      salvarCpfPacienteELiberarSolicitacao: async (_mId: string, pacId: string, cpf: string) => {
        salvouCpf = true;
        pacienteIdSalvo = pacId;
        cpfSalvo = cpf;
        return 1;
      },
      buscarConversasComHistorico: async () => [],
      obterDadosMedico: async () => ({ nomeCompleto: 'Dra. Bruna', telefone: '51981680978' })
    } as unknown as PostgresCandidatosNotaRepositorio;

    const enviadorFalso = {
      enviarTexto: async ({ texto }: { texto: string }) => {
        mensagensEnviadas.push(texto);
        return { sucesso: true };
      }
    } as any;

    const res = await processarComandoFiscalMedico('med-1', 'O CPF dele é 529.982.247-25', '51981680978', {
      repositorio: repositorioFalso,
      enviarMensagem: enviadorFalso,
      instanciaNome: 'notomed_assistente'
    });

    assert.equal(res.tratado, true);
    assert.equal(res.tipo, 'resposta_cpf_medico');
    assert.equal(salvouCpf, true);
    assert.equal(pacienteIdSalvo, 'pac-marcelo-1');
    assert.equal(cpfSalvo, '52998224725');
    assert.match(mensagensEnviadas[0], /CPF de Marcelo Simões registrado com sucesso/);
  });

  test('deve cancelar espera de CPF quando médico responder que não tem no momento', async () => {
    let limpou = false;
    const mensagensEnviadas: string[] = [];

    const repositorioFalso = {
      obterAguardandoCpfMedico: async () => ({
        solicitacaoId: 'sol-marcelo-1',
        pacienteId: 'pac-marcelo-1',
        pacienteNome: 'Marcelo Simões',
        pacienteTelefone: '555181005225'
      }),
      limparAguardandoCpfMedico: async () => {
        limpou = true;
      }
    } as unknown as PostgresCandidatosNotaRepositorio;

    const enviadorFalso = {
      enviarTexto: async ({ texto }: { texto: string }) => {
        mensagensEnviadas.push(texto);
        return { sucesso: true };
      }
    } as any;

    const res = await processarComandoFiscalMedico('med-1', 'Não tenho agora, depois eu vejo', '51981680978', {
      repositorio: repositorioFalso,
      enviarMensagem: enviadorFalso,
      instanciaNome: 'notomed_assistente'
    });

    assert.equal(res.tratado, true);
    assert.equal(res.tipo, 'resposta_cpf_medico_cancelada');
    assert.equal(limpou, true);
    assert.match(mensagensEnviadas[0], /Deixei a nota de Marcelo Simões pendente/);
  });

  test('deve ignorar mensagem automática de ausência do médico sem tratar como comando fiscal', async () => {
    let consultouRepo = false;
    const repositorioFalso = {
      obterAguardandoCpfMedico: async () => {
        consultouRepo = true;
        return null;
      }
    } as any;

    const enviadorFalso = { enviarTexto: async () => ({ sucesso: true }) } as any;

    const res = await processarComandoFiscalMedico(
      'med-1',
      'Olá! Agradecemos o contato. No momento estamos ausentes. Nosso horário de atendimento é de 8h às 18h.',
      '51981680978',
      {
        repositorio: repositorioFalso,
        enviarMensagem: enviadorFalso,
        instanciaNome: 'notomed_assistente'
      }
    );

    assert.equal(res.tratado, false);
    assert.equal(consultouRepo, false);
  });

  test('NÃO deve solicitar próxima nota quando a nota aprovada está aguardando CPF do médico', async () => {
    let varreuProximo = false;
    const candidatoAtual = {
      medicoId: 'med-1',
      pacienteNome: 'Carlos Silva',
      pacienteTelefone: '5199998888',
      valorCentavos: 40000,
      valorFormatado: '400,00',
      dataConsulta: '13/10/2026',
      dataConsultaIso: '2026-10-13'
    };

    const repositorioFalso = {
      obterCandidatoAguardandoAprovacao: async () => candidatoAtual,
      enfileirarEmissaoAprovada: async () => ({
        solicitacaoId: 'sol-carlos-1',
        aguardandoCpf: true,
        pacienteId: 'pac-carlos-1',
        pacienteNome: 'Carlos Silva',
        pacienteTelefone: '5199998888'
      }),
      obterDadosMedico: async () => ({
        nomeCompleto: 'Dra. Bruna',
        telefone: '51981680978',
        solicitarCpfDiretoPaciente: false // Padrão: direto ao médico
      }),
      salvarAguardandoCpfMedico: async () => {},
      buscarConversasComHistorico: async () => {
        varreuProximo = true;
        return [];
      }
    } as any;

    const enviadorFalso = { enviarTexto: async () => ({ sucesso: true }) } as any;

    const res = await processarComandoFiscalMedico('med-1', 'Sim, pode emitir', '51981680978', {
      repositorio: repositorioFalso,
      enviarMensagem: enviadorFalso,
      instanciaNome: 'notomed_assistente'
    });

    assert.equal(res.tratado, true);
    assert.equal(res.tipo, 'resposta_aprovacao');
    assert.equal(res.resultadoAprovacao.processado, true);
    if (res.resultadoAprovacao.processado) {
      assert.equal(res.resultadoAprovacao.acao, 'emissao_aguardando_cpf_medico');
    }
    assert.equal(varreuProximo, false, 'Não deve varrer a próxima nota enquanto aguarda CPF do médico');
  });
});
