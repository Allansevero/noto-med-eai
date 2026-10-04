/** Integração do ponto de bloqueio: nenhum certificado/SEFIN é acessado com pendências. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PostgresEmissorDpsService } from './postgres-emissor-dps-service.js';
test('ausência de política fiscal vira resultado estruturado sem transmissão', async () => {
  const consultas: string[] = [];
  const pool: any = { async query(sql: string) {
    consultas.push(sql);
    if (sql.includes('from solicitacoes_nota s join medico_perfil_fiscal')) return { rows: [{
      ambiente: 'homologacao', confirmado: true, opcao: 'me_epp', regime: 'regime_1', especial: 0, municipio: '3550308', serie: '1', referencia: 'xml', competencia: null,
      datas: ['2026-01-01'], servicos: [{ id: 's', ctribNac: '040101', cnbs: null, ctribMun: null, politica: null }]
    }] };
    if (sql.includes('from medico_perfil_fiscal')) return { rows: [{ documento_limpo: '11222333000181', ambiente: 'homologacao' }] };
    assert.fail(`Consulta indevida antes da validação: ${sql}`);
  } };
  const emissor = new PostgresEmissorDpsService(pool, 'fake', undefined, undefined, {} as any,
    { transmitirDps: async () => assert.fail('Não transmitir') } as any, true, true);
  const resultado = await emissor.emitir({ id: 'sol', medicoId: 'm', pacienteId: 'p', xdescServ: 'Consulta', valorServicoCentavos: 10000, ctribNac: '040101' });
  assert.equal(resultado.sucesso, false);
  if (!resultado.sucesso) {
    assert.ok(resultado.pendenciasFiscais?.some(p => p.codigo === 'PARAMETROS_NAO_CONFIRMADOS'));
    assert.equal(resultado.contextoTecnico?.transmitida, false);
  }
  assert.equal(consultas.length, 2);
});
