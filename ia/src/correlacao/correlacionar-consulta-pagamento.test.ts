/**
 * Testes unitários para motor de decisão de candidatos de emissão em /ia.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { decidirCandidatoConversa } from './correlacionar-consulta-pagamento.js';

describe('Decisão de Candidatos de Emissão em /ia', () => {
  it('deve formular pergunta pronta para o Noto quando houver comprovante', () => {
    const res = decidirCandidatoConversa({
      medicoId: 'med-1',
      dadosMedico: {
        nome: 'Dr. Roberto',
        cpfCnpj: '12345678000195',
        valorPadraoCentavos: 40000
      },
      conversa: {
        conversaId: 'conv-1',
        contatoTelefone: '5511999998888',
        pacienteNomeCadastrado: 'Mariana Costa',
        mensagens: [
          { id: '1', direcao: 'enviada', tipo: 'texto', conteudo: 'Consulta agendada para 12/10', timestamp: '2026-10-10T10:00:00.000Z' },
          { id: '2', direcao: 'recebida', tipo: 'imagem', timestamp: '2026-10-15T12:00:00.000Z' }
        ]
      }
    });

    assert.equal(res.candidatoDetectado, true);
    assert.ok(res.perguntaSugeridaMedico?.includes('Mariana Costa'));
    assert.ok(res.perguntaSugeridaMedico?.includes('12/10/2026'));
    assert.deepEqual(res.dadosFaltantes, ['cpf']);
    assert.ok(res.perguntaDadosFaltantes?.includes('Mariana Costa ainda não possui CPF'));
  });

  it('deve retornar candidatoDetectado = false quando não houver indício de pagamento', () => {
    const res = decidirCandidatoConversa({
      medicoId: 'med-1',
      dadosMedico: { nome: 'Dr. Roberto', cpfCnpj: '123' },
      conversa: {
        conversaId: 'conv-1',
        contatoTelefone: '5511999998888',
        mensagens: [
          { id: '1', direcao: 'recebida', tipo: 'texto', conteudo: 'Bom dia doutor, qual o endereço?', timestamp: '2026-10-10T10:00:00.000Z' }
        ]
      }
    });

    assert.equal(res.candidatoDetectado, false);
  });
});
