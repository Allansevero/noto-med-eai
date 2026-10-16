import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { iniciarOnboardingPosConexao } from './iniciar-onboarding-pos-conexao.js';

describe('iniciarOnboardingPosConexao', () => {
  test('deve enviar boas-vindas tranquila, sincronizar histórico, enriquecer CPFs e varrer a primeira nota quando dados confirmados', async () => {
    let mensagemBoasVindasEnviada = '';
    let historicoSincronizado = false;
    let cpfsEnriquecidos = false;
    let marcouBoasVindas = false;

    const repositorioFalso = {
      obterDadosMedico: async () => ({
        nomeCompleto: 'Dra. Bruna Botter',
        telefone: '51981936133',
        fiscalConfirmado: true,
        parametrosProntos: true,
        dadosProfissionaisConfirmados: true,
        boasVindasJaEnviada: false
      }),
      marcarBoasVindasEnviada: async () => {
        marcouBoasVindas = true;
      },
      enriquecerCpfsPacientesHistorico: async () => {
        cpfsEnriquecidos = true;
        return 3;
      },
      buscarConversasComHistorico: async () => [],
      obterAguardandoCpfMedico: async () => null,
      obterCandidatoAguardandoAprovacao: async () => null
    } as any;

    const enviadorFalso = {
      enviarTexto: async (params: any) => {
        mensagemBoasVindasEnviada = params.texto;
        return { sucesso: true };
      }
    };

    const res = await iniciarOnboardingPosConexao({
      medicoId: 'med-1',
      nomeInstancia: 'instancia_clinica',
      repositorio: repositorioFalso,
      enviarMensagemAssistente: enviadorFalso,
      instanciaAssistenteNome: 'notomed_assistente',
      sincronizarHistorico: async () => {
        historicoSincronizado = true;
        return {};
      },
      esperarMs: async () => {} // sem delay real no teste
    });

    assert.equal(res.ok, true);
    assert.equal(res.boasVindasEnviada, true);
    assert.equal(marcouBoasVindas, true);
    assert.match(mensagemBoasVindasEnviada, /Oi, Dr\(a\)\. Bruna!/);
    assert.match(mensagemBoasVindasEnviada, /organizando e mapeando o histórico dos seus pacientes/);
    assert.equal(historicoSincronizado, true);
    assert.equal(cpfsEnriquecidos, true);
    assert.equal(res.pacientesEnriquecidos, 3);
  });

  test('NÃO deve enviar mensagens ao médico se dados profissionais não estiverem confirmados', async () => {
    let enviouAlgumaMensagem = false;
    let historicoSincronizado = false;
    let cpfsEnriquecidos = false;

    const repositorioFalso = {
      obterDadosMedico: async () => ({
        nomeCompleto: 'Médico 6133',
        telefone: '51981936133',
        fiscalConfirmado: true,
        parametrosProntos: true,
        dadosProfissionaisConfirmados: false,
        boasVindasJaEnviada: false
      }),
      enriquecerCpfsPacientesHistorico: async () => {
        cpfsEnriquecidos = true;
        return 2;
      },
      buscarConversasComHistorico: async () => []
    } as any;

    const enviadorFalso = {
      enviarTexto: async () => {
        enviouAlgumaMensagem = true;
        return { sucesso: true };
      }
    };

    const res = await iniciarOnboardingPosConexao({
      medicoId: 'med-1',
      nomeInstancia: 'instancia_clinica',
      repositorio: repositorioFalso,
      enviarMensagemAssistente: enviadorFalso,
      instanciaAssistenteNome: 'notomed_assistente',
      sincronizarHistorico: async () => {
        historicoSincronizado = true;
        return {};
      },
      esperarMs: async () => {}
    });

    assert.equal(res.ok, true);
    assert.equal(res.boasVindasEnviada, false);
    assert.equal(enviouAlgumaMensagem, false);
    assert.equal(historicoSincronizado, true);
    assert.equal(cpfsEnriquecidos, true);
    assert.equal(res.resultadoVarredura, undefined);
  });

  test('NÃO deve enviar boas-vindas novamente se boasVindasJaEnviada for true', async () => {
    let enviouMensagem = false;

    const repositorioFalso = {
      obterDadosMedico: async () => ({
        nomeCompleto: 'Dr. Allan Silva',
        telefone: '51981936133',
        fiscalConfirmado: true,
        parametrosProntos: true,
        dadosProfissionaisConfirmados: true,
        boasVindasJaEnviada: true
      }),
      enriquecerCpfsPacientesHistorico: async () => 0,
      buscarConversasComHistorico: async () => []
    } as any;

    const enviadorFalso = {
      enviarTexto: async () => {
        enviouMensagem = true;
        return { sucesso: true };
      }
    };

    const res = await iniciarOnboardingPosConexao({
      medicoId: 'med-1',
      nomeInstancia: '',
      repositorio: repositorioFalso,
      enviarMensagemAssistente: enviadorFalso,
      instanciaAssistenteNome: 'notomed_assistente',
      sincronizarHistorico: async () => ({}),
      esperarMs: async () => {}
    });

    assert.equal(res.ok, true);
    assert.equal(res.boasVindasEnviada, false);
    assert.equal(enviouMensagem, false);
  });
});
