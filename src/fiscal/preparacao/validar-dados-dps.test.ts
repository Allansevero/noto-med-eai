/** Documentos inválidos e numeração truncável são rejeitados antes da assinatura. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validarDadosDps } from './validar-dados-dps.js';
import type { ConfigPrestador, EmissaoInput } from '../../io/fiscal/montar-dps.js';
const cfg: ConfigPrestador = { cnpj: '11222333000181', im: '', codMunicipio: '3550308', serie: '1', ambiente: 2,
  regTrib: { opSimpNac: 3, regApTribSN: 2, regEspTrib: 0 }, pTotTribSN: 0 };
const input: EmissaoInput = { nDPS: '1', tomador: { CPF: '52998224725', xNome: 'Maria Souza' }, xDescServ: 'Consulta', vServ: 100, cTribNac: '040101', cNBS: '', cIndOp: '', cClassTrib: '' };
test('aceita documentos válidos e não inventa inscrição municipal', () => assert.deepEqual(validarDadosDps(input, cfg), []));
test('documento ou série inválidos geram pendência, sem truncamento', () => {
  const r = validarDadosDps({ ...input, nDPS: '1234567890123456' }, { ...cfg, cnpj: '11111111111111', serie: '123456' });
  assert.deepEqual(r.map(p => p.campo), ['prestador.documento', 'serie', 'numeroDps']);
});
