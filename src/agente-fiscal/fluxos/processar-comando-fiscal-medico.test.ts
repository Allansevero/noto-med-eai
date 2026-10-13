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
});
