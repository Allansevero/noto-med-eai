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
});
