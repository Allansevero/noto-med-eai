/**
 * Montagem pura da DPS conforme layout nacional SEFIN Nacional (fork kursku/emissor-nfse).
 * Isola a estrutura XML/JSON da DPS sem I/O e sem rede, permitindo montagem e
 * validação com dados do prestador vindos do PostgreSQL em vez de .env local.
 */

import type { ParametrosEmissao } from '../../fiscal/preparacao/parametros-emissao.js';
import type { LayoutDPS } from '@nfewizard/types';

export interface TomadorEndereco {
  cMun: string;
  CEP: string;
  xLgr: string;
  nro: string;
  xCpl?: string;
  xBairro: string;
}

export interface EmissaoInput {
  nDPS: string;
  tomador: {
    CNPJ?: string;
    CPF?: string;
    xNome: string;
    end?: TomadorEndereco;
    fone?: string;
    email?: string;
  };
  xDescServ: string;
  vServ: number;
  cTribNac: string;
  cNBS: string;
  cIndOp: string;
  cClassTrib: string;
  pTotTribSN?: number;
  cTribMun?: string;
  fiscal?: ParametrosEmissao & { competencia: string };
}

export interface ConfigPrestador {
  cnpj: string;
  im: string;
  codMunicipio: string;
  ambiente: 1 | 2;
  serie?: string;
  regTrib: {
    opSimpNac: 1 | 2 | 3;
    regApTribSN: 1 | 2 | 3;
    regEspTrib: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 9;
  };
  pTotTribSN: number;
}

export function momentoSP(agora: Date): { dhEmi: string; dCompet: string } {
  const local = agora.toLocaleString('sv-SE', {
    timeZone: 'America/Sao_Paulo',
    hour12: false
  });
  return { dhEmi: local.replace(' ', 'T') + '-03:00', dCompet: local.slice(0, 10) };
}

export function montarDps(
  input: EmissaoInput,
  cfg: ConfigPrestador,
  agora: Date = new Date()
): LayoutDPS {
  const { dhEmi, dCompet } = momentoSP(agora);
  const ehMei = cfg.regTrib.opSimpNac === 2;
  const meEpp = cfg.regTrib.opSimpNac === 3;

  return {
    infDps: {
      tpAmb: cfg.ambiente,
      dhEmi,
      verAplic: '1.0',
      serie: cfg.serie || '00001',
      nDPS: input.nDPS,
      dCompet: input.fiscal?.competencia ?? dCompet,
      tpEmit: 1,
      cLocEmi: cfg.codMunicipio,
      prest: {
        ...(cfg.cnpj.replace(/\D/g, '').length === 11 ? { CPF: cfg.cnpj } : { CNPJ: cfg.cnpj }),
        IM: cfg.im,
        regTrib: {
          opSimpNac: cfg.regTrib.opSimpNac,
          ...(meEpp ? { regApTribSN: cfg.regTrib.regApTribSN } : {}),
          regEspTrib: cfg.regTrib.regEspTrib
        }
      },
      toma: {
        ...(input.tomador.CPF ? { CPF: input.tomador.CPF } : { CNPJ: input.tomador.CNPJ }),
        xNome: input.tomador.xNome,
        ...(input.tomador.end
          ? {
              end: {
                endNac: {
                  cMun: input.tomador.end.cMun,
                  CEP: input.tomador.end.CEP
                },
                xLgr: input.tomador.end.xLgr,
                nro: input.tomador.end.nro,
                ...(input.tomador.end.xCpl ? { xCpl: input.tomador.end.xCpl } : {}),
                xBairro: input.tomador.end.xBairro
              }
            }
          : {}),
        ...(input.tomador.fone ? { fone: input.tomador.fone } : {}),
        ...(input.tomador.email ? { email: input.tomador.email } : {})
      },
      serv: {
        locPrest: { cLocPrestacao: input.fiscal?.municipioPrestacao ?? cfg.codMunicipio },
        cServ: {
          cTribNac: input.cTribNac,
          ...(input.cNBS ? { cNBS: input.cNBS } : {}),
          ...(input.cTribMun ? { cTribMun: input.cTribMun } : {}),
          xDescServ: input.xDescServ
        }
      },
      valores: {
        vServPrest: { vServ: input.vServ },
        trib: {
          tribMun: { tribISSQN: input.fiscal?.tribISSQN ?? 1, tpRetISSQN: input.fiscal?.tpRetISSQN ?? 1 },
          ...(ehMei ? {} : { tribFed: { piscofins: { CST: input.fiscal ? input.fiscal.cstPisCofins : '08' } } }),
          totTrib: ehMei ? { indTotTrib: 0 } : { pTotTribSN: input.pTotTribSN ?? cfg.pTotTribSN }
        }
      }
    }
  } as unknown as LayoutDPS;
}
