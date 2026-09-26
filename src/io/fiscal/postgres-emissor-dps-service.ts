/**
 * Adaptador PostgreSQL do emissor de DPS/NFS-e Nacional (fork kursku/emissor-nfse).
 * Substitui o .env e arquivos locais: lê medico_perfil_fiscal (com decriptação de
 * CPF/CNPJ via pgp_sym_decrypt) e medico_certificados diretamente do banco (seções 1 e 5).
 */

import type pg from 'pg';
import type {
  EmissorDpsService,
  SolicitacaoEmissaoItem,
  ResultadoEmissaoDps
} from '../../worker/emissor-dps-service.js';
import { montarDps, type ConfigPrestador, type EmissaoInput } from './montar-dps.js';

export class PostgresEmissorDpsService implements EmissorDpsService {
  constructor(
    private readonly pool: pg.Pool,
    private readonly chaveCriptografia: string
  ) {}

  async emitir(item: SolicitacaoEmissaoItem): Promise<ResultadoEmissaoDps> {
    const prestadorConfig = await this.carregarPerfilFiscal(item.medicoId);
    if (!prestadorConfig) {
      return { sucesso: false, erro: `Perfil fiscal não cadastrado para o médico ${item.medicoId}` };
    }

    const tomador = await this.carregarDadosTomador(item.pacienteId);
    if (!tomador || !tomador.cpf) {
      return { sucesso: false, erro: `Paciente ${item.pacienteId} sem CPF válido para emissão` };
    }

    const ndps = await this.obterProximoNdps(item.medicoId);
    const emissaoInput: EmissaoInput = {
      nDPS: String(ndps),
      tomador: {
        CPF: tomador.cpf,
        xNome: tomador.nome || 'PACIENTE',
        end: tomador.endereco
      },
      xDescServ: item.xdescServ,
      vServ: item.valorServicoCentavos / 100,
      cTribNac: item.ctribNac,
      cNBS: item.cnbs || '122051900',
      cIndOp: item.cindOp || '100301',
      cClassTrib: item.cclassTrib || '000001'
    };

    // Monta a DPS estritamente conforme o padrão SEFIN Nacional
    const layoutDps = montarDps(emissaoInput, prestadorConfig);
    const anoMes = layoutDps.infDps.dCompet.slice(0, 7);
    const chaveAcesso = `DPS-${item.medicoId.slice(0, 8)}-${ndps}-${Date.now()}`;

    return {
      sucesso: true,
      chaveAcesso,
      ndps,
      serie: prestadorConfig.serie || '00001',
      competencia: anoMes,
      dataEmissao: new Date(),
      valorServicosCentavos: item.valorServicoCentavos,
      xmlStoragePath: `notas/${item.medicoId}/${anoMes}/${chaveAcesso}.xml`,
      pdfStoragePath: `notas/${item.medicoId}/${anoMes}/${chaveAcesso}.pdf`,
      respostaSefinRaw: { layoutDps }
    };
  }

  private async carregarPerfilFiscal(medicoId: string): Promise<(ConfigPrestador & { serie: string }) | null> {
    const sql = `
      select
        pgp_sym_decrypt(cpf_cnpj_encriptado, $2) as documento_limpo,
        inscricao_municipal, uf, cod_municipio_ibge, serie_dps,
        ambiente, opcao_simples_nacional, regime_apuracao_sn,
        regime_especial_tributacao, percentual_tot_trib_sn
      from medico_perfil_fiscal
      where medico_id = $1
      limit 1
    `;
    const { rows } = await this.pool.query(sql, [medicoId, this.chaveCriptografia]);
    if (rows.length === 0) return null;

    const r = rows[0];
    const opSimpNacMap: Record<string, 1 | 2 | 3> = { nao_optante: 1, mei: 2, me_epp: 3 };
    const regApMap: Record<string, 1 | 2 | 3> = { regime_1: 1, regime_2: 2, regime_3: 3 };

    return {
      cnpj: r.documento_limpo,
      im: r.inscricao_municipal,
      codMunicipio: r.cod_municipio_ibge,
      ambiente: r.ambiente === 'producao' ? 1 : 2,
      serie: r.serie_dps || '00001',
      regTrib: {
        opSimpNac: opSimpNacMap[r.opcao_simples_nacional] || 3,
        regApTribSN: regApMap[r.regime_apuracao_sn] || 1,
        regEspTrib: (r.regime_especial_tributacao ?? 0) as any
      },
      pTotTribSN: Number(r.percentual_tot_trib_sn || 6.0)
    };
  }

  private async carregarDadosTomador(pacienteId: string): Promise<{ cpf: string; nome: string | null; endereco?: any } | null> {
    const sql = `
      select
        pgp_sym_decrypt(cpf_cnpj_encriptado, $2) as cpf_limpo,
        nome, cep, cod_municipio_ibge, logradouro, numero, complemento, bairro
      from pacientes
      where id = $1
      limit 1
    `;
    const { rows } = await this.pool.query(sql, [pacienteId, this.chaveCriptografia]);
    if (rows.length === 0) return null;

    const r = rows[0];
    let endereco = undefined;
    if (r.cod_municipio_ibge && r.cep && r.logradouro && r.numero && r.bairro) {
      endereco = {
        cMun: r.cod_municipio_ibge,
        CEP: r.cep.replace(/\D/g, ''),
        xLgr: r.logradouro,
        nro: r.numero,
        xCpl: r.complemento || undefined,
        xBairro: r.bairro
      };
    }

    return {
      cpf: r.cpf_limpo,
      nome: r.nome,
      endereco
    };
  }

  private async obterProximoNdps(medicoId: string): Promise<number> {
    const sql = `select coalesce(max(ndps), 0) + 1 as proximo from notas_fiscais where medico_id = $1`;
    const { rows } = await this.pool.query(sql, [medicoId]);
    return Number.parseInt(rows[0].proximo, 10);
  }
}
