import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mapearParametrosFiscaisDoXml } from './mapear-parametros-fiscais-do-xml.js';
import { mapearServicoFiscalDoXml } from './mapear-servico-fiscal-do-xml.js';

describe('Mapeamento de XML da NFS-e Nacional', () => {
  // Fixture 1: Psiquiatra em Alegrete/RS
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

  // Fixture 2: Cardiologista em São Paulo/SP (totalmente diferente)
  const xmlOutroMedicoSp = {
    NFSe: {
      infNFSe: {
        emit: {
          CNPJ: '12345678000199',
          IM: '987654',
          xNome: 'DR CARLOS SILVA CARDIOLOGIA LTDA',
          xFant: 'CLINICA DO CORACAO'
        },
        cLocIncid: '3550308',
        nNFSe: 42,
        DPS: {
          infDPS: {
            tpAmb: 1,
            serie: '00002',
            nDPS: 42,
            cLocEmi: '3550308',
            prest: {
              CNPJ: '12345678000199',
              regTrib: {
                opSimpNac: '2',
                regEspTrib: '1'
              }
            },
            serv: {
              cServ: {
                cTribNac: '040101',
                cTribMun: '012',
                cIntContrib: '8630501',
                xDescServ: 'CONSULTA CARDIOLOGICA COM ELETROCARDIOGRAMA'
              }
            },
            valores: {
              vServPrest: { vServ: '650.00' },
              trib: {
                tribMun: {
                  tribISSQN: 1,
                  pAliq: '5.00'
                }
              }
            }
          }
        }
      }
    }
  };

  it('deve extrair os parâmetros fiscais duradouros da Fixture 1 (RS) corretamente', () => {
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

  it('deve extrair os parâmetros da Fixture 2 (SP - Cardiologia) comprovando ausência de dados fixos', () => {
    const params = mapearParametrosFiscaisDoXml(xmlOutroMedicoSp);
    const servico = mapearServicoFiscalDoXml(xmlOutroMedicoSp);

    assert.equal(params.cnpj, '12345678000199');
    assert.equal(params.inscricaoMunicipal, '987654');
    assert.equal(params.razaoSocial, 'DR CARLOS SILVA CARDIOLOGIA LTDA');
    assert.equal(params.nomeFantasia, 'CLINICA DO CORACAO');
    assert.equal(params.codMunicipioIbge, '3550308');
    assert.equal(params.uf, 'SP');
    assert.equal(params.serieDps, '00002');
    assert.equal(params.opcaoSimplesNacional, 'mei');
    assert.equal(params.regimeApuracaoSn, null);
    assert.equal(params.regimeEspecialTributacao, 1);
    assert.equal(params.cnae, '8630501');
    assert.equal(params.proximoNumeroSequencialSugerido, 43);

    assert.equal(servico.ctribNac, '040101');
    assert.equal(servico.ctribMun, '012');
    assert.equal(servico.aliquotaIss, 5.0);
    assert.equal(servico.valorPadraoCentavos, 65000);
    assert.equal(servico.especialidadeSugerida, 'Cardiologia');
    assert.equal(servico.nomeServico, 'Consulta - Cardiologia');
  });

  it('deve lançar erro se o XML não contiver CNPJ/CPF', () => {
    const xmlInvalido = { NFSe: { infNFSe: {} } };
    assert.throws(() => mapearParametrosFiscaisDoXml(xmlInvalido), /CNPJ\/CPF/);
  });

  it('deve lançar erro se o XML não contiver cTribNac', () => {
    const xmlSemCtrib = {
      NFSe: {
        infNFSe: {
          DPS: {
            infDPS: {
              serv: { cServ: {} }
            }
          }
        }
      }
    };
    assert.throws(() => mapearServicoFiscalDoXml(xmlSemCtrib), /cTribNac/);
  });
});
