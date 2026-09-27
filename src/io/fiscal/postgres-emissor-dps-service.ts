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
import { generateDanfsePdf } from '../../fiscal/danfse/gerar-danfse-pdf.js';
import { comporChaveAcessoNacional } from '../../fiscal/danfse/formatadores-fiscais.js';

export type ConfigPrestadorCompleto = ConfigPrestador & {
  serie: string;
  razaoSocial: string;
  nomeFantasia?: string;
  uf: string;
  email?: string;
  telefone?: string;
};

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

    // Chave de Acesso Nacional oficial de 50 dígitos da SEFIN
    const chaveAcesso = comporChaveAcessoNacional({
      codIbgeMunicipio: prestadorConfig.codMunicipio,
      ambiente: prestadorConfig.ambiente === 1 ? 'producao' : 'homologacao',
      anoMes,
      cnpjOuCpf: prestadorConfig.cnpj,
      serie: prestadorConfig.serie || '00001',
      ndps
    });

    const valorServico = item.valorServicoCentavos / 100;
    const aliquotaIss = prestadorConfig.regTrib.opSimpNac === 1 ? 2.0 : 2.0;
    const issApurado = (valorServico * aliquotaIss) / 100;

    // Gera o PDF oficial do DANFSe v2.0 (NT 008/2026 e RTC 2026)
    const pdfBytes = await generateDanfsePdf({
      chaveAcesso,
      numero: String(ndps),
      serie: prestadorConfig.serie || '00001',
      competencia: anoMes,
      dataEmissao: new Date().toISOString(),
      ambiente: prestadorConfig.ambiente === 1 ? 'producao' : 'homologacao',
      prestador: {
        razaoSocial: prestadorConfig.razaoSocial,
        nomeFantasia: prestadorConfig.nomeFantasia,
        cnpj: prestadorConfig.cnpj,
        inscricaoMunicipal: prestadorConfig.im,
        municipio: prestadorConfig.codMunicipio,
        uf: prestadorConfig.uf,
        telefone: prestadorConfig.telefone,
        email: prestadorConfig.email,
        simplesNacional: prestadorConfig.regTrib.opSimpNac !== 1
      },
      tomador: {
        nome: tomador.nome || 'PACIENTE',
        cpf: tomador.cpf,
        telefone: tomador.telefone,
        endereco: tomador.enderecoCompleto
      },
      servico: {
        cTribNac: item.ctribNac,
        cNBS: item.cnbs || '122051900',
        discriminacao: item.xdescServ,
        valor: valorServico,
        aliquota: aliquotaIss,
        issApurado,
        cstIbsCbs: '000 - Tributável Integralmente',
        cClassTrib: item.cclassTrib || '000001',
        cIndOp: item.cindOp || '030101',
        aliquotaCbs: 0.00,
        valorCbs: 0.00,
        aliquotaIbs: 0.00,
        valorIbs: 0.00
      }
    });

    const pdfBase64 = `data:application/pdf;base64,${Buffer.from(pdfBytes).toString('base64')}`;

    return {
      sucesso: true,
      chaveAcesso,
      ndps,
      serie: prestadorConfig.serie || '00001',
      competencia: anoMes,
      dataEmissao: new Date(),
      valorServicosCentavos: item.valorServicoCentavos,
      xmlStoragePath: `notas/${item.medicoId}/${anoMes}/${chaveAcesso}.xml`,
      pdfStoragePath: pdfBase64,
      respostaSefinRaw: { layoutDps }
    };
  }

  private async carregarPerfilFiscal(medicoId: string): Promise<ConfigPrestadorCompleto | null> {
    const sql = `
      select
        m.nome_completo,
        pf.razao_social,
        pf.nome_fantasia,
        pgp_sym_decrypt(pf.cpf_cnpj_encriptado, $2) as documento_limpo,
        pf.inscricao_municipal,
        pf.uf,
        pf.cod_municipio_ibge,
        pf.serie_dps,
        pf.ambiente,
        pf.opcao_simples_nacional,
        pf.regime_apuracao_sn,
        pf.regime_especial_tributacao,
        pf.percentual_tot_trib_sn,
        u.email,
        u.telefone
      from medico_perfil_fiscal pf
      join medicos m on m.id = pf.medico_id
      join usuarios u on u.id = m.usuario_id
      where pf.medico_id = $1
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
      razaoSocial: r.razao_social || r.nome_completo,
      nomeFantasia: r.nome_fantasia || undefined,
      uf: r.uf || 'RS',
      email: r.email,
      telefone: r.telefone,
      regTrib: {
        opSimpNac: opSimpNacMap[r.opcao_simples_nacional] || 3,
        regApTribSN: regApMap[r.regime_apuracao_sn] || 1,
        regEspTrib: (r.regime_especial_tributacao ?? 0) as any
      },
      pTotTribSN: Number(r.percentual_tot_trib_sn || 6.0)
    };
  }

  private async carregarDadosTomador(pacienteId: string): Promise<{
    cpf: string;
    nome: string | null;
    telefone?: string;
    enderecoCompleto?: string;
    endereco?: any;
  } | null> {
    const sql = `
      select
        pgp_sym_decrypt(cpf_cnpj_encriptado, $2) as cpf_limpo,
        nome, telefone, cep, cod_municipio_ibge, logradouro, numero, complemento, bairro
      from pacientes
      where id = $1
      limit 1
    `;
    const { rows } = await this.pool.query(sql, [pacienteId, this.chaveCriptografia]);
    if (rows.length === 0) return null;

    const r = rows[0];
    let endereco = undefined;
    let enderecoCompleto = undefined;

    if (r.cod_municipio_ibge && r.cep && r.logradouro && r.numero && r.bairro) {
      endereco = {
        cMun: r.cod_municipio_ibge,
        CEP: r.cep.replace(/\D/g, ''),
        xLgr: r.logradouro,
        nro: r.numero,
        xCpl: r.complemento || undefined,
        xBairro: r.bairro
      };
      enderecoCompleto = `${r.logradouro}, ${r.numero}${r.complemento ? ' - ' + r.complemento : ''}, ${r.bairro}`;
    }

    return {
      cpf: r.cpf_limpo,
      nome: r.nome,
      telefone: r.telefone || undefined,
      enderecoCompleto,
      endereco
    };
  }

  private async obterProximoNdps(medicoId: string): Promise<number> {
    const sql = `select coalesce(max(ndps), 0) + 1 as proximo from notas_fiscais where medico_id = $1`;
    const { rows } = await this.pool.query(sql, [medicoId]);
    return Number.parseInt(rows[0].proximo, 10);
  }
}
