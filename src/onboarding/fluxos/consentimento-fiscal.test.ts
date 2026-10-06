import { test } from 'node:test';
import assert from 'node:assert/strict';
import { registrarConsentimentoFiscal, adotarReferenciaConsentida } from './consentimento-fiscal.js';
test('clique em Continuar registra certificado, versão, texto e horário do consentimento sem link inventado', async () => {
  let registro: any;
  await registrarConsentimentoFiscal({ query: async (_sql: string, args: any) => { registro = args; return {} as any; } } as any, 'med', 'cert');
  assert.equal(registro[0], 'med');
  const dados = JSON.parse(registro[1]);
  assert.equal(dados.certificadoId, 'cert');
  assert.equal(dados.versao, 'continuar-a1-v1');
  assert.equal(dados.paginaTermos, null);
  assert.equal(dados.texto.split(/\s+/).length <= 18, true);
  assert.equal(Number.isFinite(Date.parse(dados.aceitoEm)), true);
});
test('referência só é adotada com consentimento do certificado ativo e validação ativada', async () => {
  const adotados: any[] = [];
  const deps: any = { pool: { query: async () => ({ rows: [] }) }, preparacaoFiscalAtiva: true,
    confirmar: async (_pool: any, input: any) => adotados.push(input), registrar() {} };
  await adotarReferenciaConsentida(deps, 'med', 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
  assert.equal(adotados.length, 0);
  deps.pool.query = async () => ({ rows: [{ permitido: true }] });
  deps.preparacaoFiscalAtiva = false;
  await adotarReferenciaConsentida(deps, 'med', 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
  assert.equal(adotados.length, 0);
  deps.preparacaoFiscalAtiva = true;
  await adotarReferenciaConsentida(deps, 'med', 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
  assert.deepEqual(adotados, [{ medicoId: 'med', referenciaHash: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', usarReferencia: true }]);
});
test('consentimento não contorna rejeição da validação fiscal nem inventa parâmetros', async () => {
  const eventos: any[] = [];
  const retorno = await adotarReferenciaConsentida({ pool: { query: async () => ({ rows: [{ permitido: true }] }) } as any,
    preparacaoFiscalAtiva: true, confirmar: async () => { throw Object.assign(new Error('Campo sem suporte'), { codigo: 'REFERENCIA_FISCAL_PENDENTE' }); },
    registrar: e => eventos.push(e) }, 'med', 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
  assert.equal(retorno.ok, false);
  assert.equal(retorno.codigo, 'REFERENCIA_FISCAL_PENDENTE');
  assert.equal(eventos[0].codigo, 'REFERENCIA_FISCAL_PENDENTE');
});
