/**
 * Testes unitários para consultar-status-onboarding.ts.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { consultarStatusOnboarding } from './consultar-status-onboarding.js';

describe('consultarStatusOnboarding', () => {
  it('identifica corretamente passos completos e liberadoParaEmitir', async () => {
    const poolFalso: any = {
      query: async () => ({
        rows: [
          {
            medico_id: 'med-1',
            usuario_id: 'usr-1',
            medico_nome: 'Dr. Allan Severo',
            crm: '12345/RS',
            usuario_nome: 'Allan Severo',
            razao_social: 'Allan Severo ME',
            inscricao_municipal: '12345',
            uf: 'RS',
            cod_municipio_ibge: '4314902',
            serie_dps: '00001',
            proximo_numero_dps: 2,
            extraido_automaticamente: true,
            confirmado_pelo_medico: true,
            aliquota_iss: '2.00',
            cert_ativos: 1,
            whats_conectados: 1
          }
        ]
      })
    };

    const status = await consultarStatusOnboarding(poolFalso, 'med-1');
    assert.equal(status.nomeUsuario, 'Dr. Allan Severo');
    assert.equal(status.passos.passo1Nome, true);
    assert.equal(status.passos.passo2XmlEnviado, true);
    assert.equal(status.passos.passo2FiscalConfirmado, true);
    assert.equal(status.passos.passo3CertificadoValido, true);
    assert.equal(status.passos.passo4WhatsappConectado, true);
    assert.equal(status.liberadoParaEmitir, true);
  });

  it('indica pendente quando WhatsApp ainda não foi conectado', async () => {
    const poolFalso: any = {
      query: async () => ({
        rows: [
          {
            medico_id: 'med-1',
            usuario_id: 'usr-1',
            medico_nome: 'Dr. Allan Severo',
            crm: '12345/RS',
            usuario_nome: 'Allan Severo',
            razao_social: 'Allan Severo ME',
            inscricao_municipal: '12345',
            uf: 'RS',
            cod_municipio_ibge: '4314902',
            serie_dps: '00001',
            proximo_numero_dps: 2,
            extraido_automaticamente: true,
            confirmado_pelo_medico: true,
            aliquota_iss: '2.00',
            cert_ativos: 1,
            whats_conectados: 0
          }
        ]
      })
    };

    const status = await consultarStatusOnboarding(poolFalso, 'med-1');
    assert.equal(status.passos.passo4WhatsappConectado, false);
    assert.equal(status.liberadoParaEmitir, false);
  });
});

it('nome provisório bloqueia emissão sem bloquear acesso após A1 e WhatsApp', async () => {
  const pool: any = { query: async () => ({ rows: [{ medico_id: 'med', usuario_id: 'user',
    medico_nome: 'Médico', usuario_nome: 'Médico', extraido_automaticamente: true,
    confirmado_pelo_medico: true, cert_ativos: 1, whats_conectados: 1 }] }) };
  const status = await consultarStatusOnboarding(pool, 'med');
  assert.equal(status.passos.passo1Nome, false);
  assert.equal(status.liberadoParaEmitir, false);
  assert.equal(status.passos.passo4WhatsappConectado, true);
});
