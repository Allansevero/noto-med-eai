import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { varrerESolicitarAprovacao } from './varrer-e-solicitar-aprovacao.js';
import type { PostgresCandidatosNotaRepositorio } from '../io/postgres-candidatos-nota-repositorio.js';
import type { EnviarMensagemPaciente } from '../../whatsapp/enviar-mensagem-paciente.js';

describe('varrerESolicitarAprovacao', () => {
  test('deve encontrar candidato elegível por comprovante visual, salvar na memória e enviar mensagem humanizada', async () => {
    let candidatoSalvoNaMemoria: any = null;
    let mensagemEnviadaWhatsApp: any = null;

    const repositorioFalso = {
      obterDadosMedico: async () => ({
        nomeCompleto: 'Dra. Bruna Botter',
        telefone: '51981936133'
      }),
      buscarConversasComHistorico: async () => [
        {
          conversaId: 'conv-1',
          contatoTelefone: '554888567744',
          contatoNome: null,
          pacienteId: null,
          pacienteNomeCadastrado: null,
          mensagens: [
            {
              id: 'm-1',
              direcao: 'enviada',
              tipo: 'texto',
              conteudo: 'Olá, *Janayna*!\nEste é um lembrete do seu procedimento agendado para, *13/10/2026*, às *10:30* hrs.',
              criadoEm: '2026-10-09T18:58:37.000Z'
            },
            {
              id: 'm-2',
              direcao: 'recebida',
              tipo: 'imagem',
              conteudo: '',
              payloadBruto: {
                comprovante: {
                  ehComprovante: true,
                  valorCentavos: 160000,
                  tipo: 'pix'
                }
              },
              criadoEm: '2026-10-10T15:52:05.000Z'
            }
          ]
        }
      ],
      verificarSeJaPossuiNota: async () => false,
      salvarCandidatoAguardandoAprovacao: async (_mId: string, cand: any) => {
        candidatoSalvoNaMemoria = cand;
      }
    } as unknown as PostgresCandidatosNotaRepositorio;

    const enviadorFalso: EnviarMensagemPaciente = {
      enviarTexto: async (params) => {
        mensagemEnviadaWhatsApp = params;
        return { sucesso: true };
      }
    };

    const resultado = await varrerESolicitarAprovacao('med-123', {
      repositorio: repositorioFalso,
      enviarMensagem: enviadorFalso,
      instanciaNome: 'notomed_oficial'
    });

    assert.equal(resultado.ok, true);
    if (resultado.ok && resultado.status === 'candidato_encontrado_e_notificado') {
      assert.equal(resultado.candidato.pacienteNome, 'Janayna');
      assert.equal(resultado.candidato.valorFormatado, '1600,00');
      assert.equal(resultado.candidato.dataConsulta, '13/10/2026');
      assert.match(resultado.mensagemEnviada, /Oi, Dr\(a\)\. Bruna!/);
      assert.match(resultado.mensagemEnviada, /Janayna/);
      assert.match(resultado.mensagemEnviada, /1600,00/);
      assert.match(resultado.mensagemEnviada, /13\/10\/2026/);
    } else {
      assert.fail('Deveria ter encontrado candidato');
    }

    assert.ok(candidatoSalvoNaMemoria);
    assert.equal(candidatoSalvoNaMemoria.pacienteNome, 'Janayna');
    assert.ok(mensagemEnviadaWhatsApp);
    assert.equal(mensagemEnviadaWhatsApp.contatoTelefone, '51981936133');
  });

  test('deve registrar candidato e salvar memória mesmo se o envio do WhatsApp falhar por conexão', async () => {
    let candidatoSalvo = false;
    const repositorioFalso = {
      obterDadosMedico: async () => ({ nomeCompleto: 'Dra. Bruna', telefone: '51981936133' }),
      buscarConversasComHistorico: async () => [
        {
          conversaId: 'c1', contatoTelefone: '4899998888',
          mensagens: [
            { id: '1', direcao: 'enviada', tipo: 'texto', conteudo: 'Olá Janayna! Consulta dia 13/10/2026', criadoEm: '2026-10-09' },
            {
              id: '2',
              direcao: 'recebida',
              tipo: 'imagem',
              conteudo: '',
              payloadBruto: {
                comprovante: {
                  ehComprovante: true,
                  valorCentavos: 35000,
                  tipo: 'pix'
                }
              },
              criadoEm: '2026-10-10'
            }
          ]
        }
      ],
      verificarSeJaPossuiNota: async () => false,
      salvarCandidatoAguardandoAprovacao: async () => { candidatoSalvo = true; }
    } as any;

    const enviadorFalso: any = { enviarTexto: async () => ({ sucesso: false, erro: 'Connection Closed' }) };

    const res = await varrerESolicitarAprovacao('med-1', {
      repositorio: repositorioFalso,
      enviarMensagem: enviadorFalso,
      instanciaNome: 'oficial'
    });

    assert.equal(res.ok, true);
    if (res.ok && res.status === 'candidato_encontrado_pendente_conexao_whatsapp') {
      assert.equal(res.candidato.pacienteNome, 'Janayna');
      assert.equal(candidatoSalvo, true);
    } else {
      assert.fail('Deveria ter status candidato_encontrado_pendente_conexao_whatsapp');
    }
  });

  test('deve ignorar mensagem de exame médico (ehComprovante: false)', async () => {
    const repositorioFalso = {
      obterDadosMedico: async () => ({ nomeCompleto: 'Dra. Bruna', telefone: '51981936133' }),
      buscarConversasComHistorico: async () => [
        {
          conversaId: 'c1', contatoTelefone: '4899998888',
          mensagens: [
            { id: '1', direcao: 'enviada', tipo: 'texto', conteudo: 'Olá Janayna! Consulta dia 13/10/2026. Valor R$ 350', criadoEm: '2026-10-09' },
            {
              id: '2',
              direcao: 'recebida',
              tipo: 'imagem',
              conteudo: '',
              payloadBruto: {
                comprovante: {
                  ehComprovante: false
                }
              },
              criadoEm: '2026-10-10'
            }
          ]
        }
      ],
      verificarSeJaPossuiNota: async () => false
    } as any;

    const res = await varrerESolicitarAprovacao('med-1', {
      repositorio: repositorioFalso,
      enviarMensagem: { enviarTexto: async () => ({ sucesso: true }) } as any,
      instanciaNome: 'oficial'
    });

    assert.equal(res.ok, true);
    assert.equal((res as any).status, 'nenhum_candidato_pendente');
  });

  test('deve suspender a varredura se os parâmetros fiscais do médico não estiverem confirmados', async () => {
    const repositorioFalso = {
      obterDadosMedico: async () => ({
        nomeCompleto: 'Dr. Teste',
        telefone: '51999998888',
        fiscalConfirmado: false,
        parametrosProntos: false
      }),
      buscarConversasComHistorico: async () => []
    } as any;

    const res = await varrerESolicitarAprovacao('med-pendente', {
      repositorio: repositorioFalso,
      enviarMensagem: { enviarTexto: async () => ({ sucesso: true }) } as any,
      instanciaNome: 'oficial'
    });

    assert.equal(res.ok, false);
    assert.equal((res as any).motivo, 'parametros_fiscais_pendentes');
  });

  test('NÃO deve enviar nova solicitação se já houver nota aguardando aprovação do médico', async () => {
    let buscouConversas = false;
    let enviouWhatsApp = false;

    const repositorioFalso = {
      obterDadosMedico: async () => ({
        nomeCompleto: 'Dra. Bruna',
        telefone: '51981936133',
        fiscalConfirmado: true,
        parametrosProntos: true
      }),
      obterAguardandoCpfMedico: async () => null,
      obterCandidatoAguardandoAprovacao: async () => ({
        pacienteNome: 'Paciente A'
      }),
      buscarConversasComHistorico: async () => {
        buscouConversas = true;
        return [];
      }
    } as any;

    const res = await varrerESolicitarAprovacao('med-1', {
      repositorio: repositorioFalso,
      enviarMensagem: {
        enviarTexto: async () => {
          enviouWhatsApp = true;
          return { sucesso: true };
        }
      } as any,
      instanciaNome: 'oficial'
    });

    assert.equal(res.ok, true);
    assert.equal(res.status, 'nenhum_candidato_pendente');
    assert.match((res as any).mensagem, /Já existe nota aguardando aprovação/);
    assert.equal(buscouConversas, false);
    assert.equal(enviouWhatsApp, false);
  });

  test('NÃO deve enviar nova solicitação se já houver nota aguardando CPF do médico', async () => {
    let enviouWhatsApp = false;

    const repositorioFalso = {
      obterDadosMedico: async () => ({
        nomeCompleto: 'Dra. Bruna',
        telefone: '51981936133',
        fiscalConfirmado: true,
        parametrosProntos: true
      }),
      obterAguardandoCpfMedico: async () => ({
        pacienteNome: 'Carlos'
      }),
      obterCandidatoAguardandoAprovacao: async () => null,
      buscarConversasComHistorico: async () => []
    } as any;

    const res = await varrerESolicitarAprovacao('med-1', {
      repositorio: repositorioFalso,
      enviarMensagem: {
        enviarTexto: async () => {
          enviouWhatsApp = true;
          return { sucesso: true };
        }
      } as any,
      instanciaNome: 'oficial'
    });

    assert.equal(res.ok, true);
    assert.equal(res.status, 'nenhum_candidato_pendente');
    assert.match((res as any).mensagem, /Já existe solicitação aguardando CPF/);
    assert.equal(enviouWhatsApp, false);
  });
});
