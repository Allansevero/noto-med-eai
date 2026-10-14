import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { iniciarOnboardingPosConexao } from './iniciar-onboarding-pos-conexao.js';

describe('iniciarOnboardingPosConexao', () => {
  test('deve enviar boas-vindas tranquila, sincronizar histórico, enriquecer CPFs e varrer a primeira nota', async () => {
    let mensagemBoasVindasEnviada = '';
    let historicoSincronizado = false;
    let cpfsEnriquecidos = false;

    const repositorioFalso = {
      obterDadosMedico: async () => ({
        nomeCompleto: 'Dra. Bruna Botter',
        telefone: '51981936133',
        fiscalConfirmado: true,
        parametrosProntos: true
      }),
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
    assert.match(mensagemBoasVindasEnviada, /Oi, Dr\(a\)\. Bruna!/);
    assert.match(mensagemBoasVindasEnviada, /organizando e mapeando o histórico dos seus pacientes/);
    assert.equal(historicoSincronizado, true);
    assert.equal(cpfsEnriquecidos, true);
    assert.equal(res.pacientesEnriquecidos, 3);
  });
});
