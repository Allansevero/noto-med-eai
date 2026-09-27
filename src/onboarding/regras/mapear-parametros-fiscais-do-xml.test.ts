import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mapearParametrosFiscaisDoXml } from './mapear-parametros-fiscais-do-xml.js';
import { mapearServicoFiscalDoXml } from './mapear-servico-fiscal-do-xml.js';

describe('Mapeamento de XML da NFS-e Nacional', () => {
  const xmlExemploPlan = {
    NFSe: {
      infNFSe: {
        emit: {
          CNPJ: '54969416000141',
          IM: '104467',
          xNome: 'MARTINA BECKER',
          xFant: 'MB SERVICOS MEDICOS'
        },
        cLocIncid: '4300406',
        nNFSe: 215,
        DPS: {
          infDPS: {
            tpAmb: 1,
            serie: '49999',
            nDPS: 215,
            cLocEmi: '4300406',
            prest: {
              CNPJ: '54969416000141',
              regTrib: {
                opSimpNac: '3',
                regApTribSN: '1',
                regEspTrib: '0'
              }
            },
            serv: {
              cServ: {
                cTribNac: '040303',
                cTribMun: '004',
                cIntContrib: '8630503',
                xDescServ: 'REFERENTE 1 CONSULTA EM PSIQUIATRA COM DR(A) MARTINA'
              }
            },
            valores: {
              vServPrest: { vServ: '380.00' },
              trib: {
                tribMun: {
                  tribISSQN: 1,
                  pAliq: '2.72'
                }
              }
            }
          }
        }
      }
    }
  };

  it('deve extrair os parâmetros fiscais duradouros do médico corretamente', () => {
    const params = mapearParametrosFiscaisDoXml(xmlExemploPlan);

    assert.equal(params.cnpj, '54969416000141');
    assert.equal(params.inscricaoMunicipal, '104467');
    assert.equal(params.razaoSocial, 'MARTINA BECKER');
    assert.equal(params.nomeFantasia, 'MB SERVICOS MEDICOS');
    assert.equal(params.codMunicipioIbge, '4300406');
    assert.equal(params.uf, 'RS');
    assert.equal(params.serieDps, '49999');
    assert.equal(params.opcaoSimplesNacional, 'me_epp');
    assert.equal(params.regimeApuracaoSn, 'regime_1');
    assert.equal(params.regimeEspecialTributacao, 0);
    assert.equal(params.ambiente, 'producao');
    assert.equal(params.cnae, '8630503');
    assert.equal(params.proximoNumeroSequencialSugerido, 216);
  });

  it('deve extrair os parâmetros do serviço fiscal e inferir a especialidade', () => {
    const servico = mapearServicoFiscalDoXml(xmlExemploPlan);

    assert.equal(servico.nomeServico, 'Consulta Médica');
    assert.equal(servico.ctribNac, '040303');
    assert.equal(servico.ctribMun, '004');
    assert.equal(servico.aliquotaIss, 2.72);
    assert.equal(servico.valorPadraoCentavos, 38000);
    assert.equal(servico.especialidadeSugerida, 'Psiquiatria');
  });

  it('deve lançar erro se o XML não contiver CNPJ/CPF', () => {
    const xmlInvalido = { NFSe: { infNFSe: {} } };
    assert.throws(() => mapearParametrosFiscaisDoXml(xmlInvalido), /CNPJ\/CPF/);
  });
});
