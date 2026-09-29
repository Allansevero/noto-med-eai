/**
 * Adaptador PostgreSQL do emissor de DPS/NFS-e Nacional (fork kursku/emissor-nfse).
 * Substitui o .env e arquivos locais: lê medico_perfil_fiscal (com decriptação de
 * CPF/CNPJ via pgp_sym_decrypt) e medico_certificados diretamente do banco (seções 1 e 5).
 */

import type pg from 'pg';
import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  EmissorDpsService,
  SolicitacaoEmissaoItem,
  ResultadoEmissaoDps
} from '../../worker/emissor-dps-service.js';
import { montarDps, type ConfigPrestador, type EmissaoInput } from './montar-dps.js';
import { gerarXmlDps } from './gerar-xml-dps.js';
import { extrairChavesCertificado } from './extrair-chaves-certificado.js';
import { assinarXmlDps } from './assinar-xml-dps.js';
import { carregarCertificadoMedico } from './carregar-certificado-medico.js';
import { SefinNacionalClient } from './sefin-nacional-client.js';
import { generateDanfsePdf } from '../../fiscal/danfse/gerar-danfse-pdf.js';
import { comporChaveAcessoNacional } from '../../fiscal/danfse/formatadores-fiscais.js';
import { montarXmlNfse } from '../../fiscal/danfse/montar-xml-nfse.js';
import type { MeuDanfeClient } from '../meudanfe/meu-danfe-client.js';
import type { ConsultaCpfProvider } from '../../paciente/consulta-cpf-provider.js';

export type ConfigPrestadorCompleto = ConfigPrestador & {
  serie: string;
  razaoSocial: string;
  nomeFantasia?: string;
  uf: string;
  email?: string;
  telefone?: string;
  proximoNumeroDps?: number;
};

export class PostgresEmissorDpsService implements EmissorDpsService {
  constructor(
    private readonly pool: pg.Pool,
    private readonly chaveCriptografia: string,
    private readonly meuDanfeClient?: MeuDanfeClient,
    private readonly consultaCpfProvider?: ConsultaCpfProvider,
    private readonly supabaseClient?: SupabaseClient,
    private readonly sefinClient?: SefinNacionalClient
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

    // Garante que o nome completo do tomador seja obtido via API oficial da Receita
    if (!tomador.nome || tomador.nome.trim() === '' || tomador.nome.toUpperCase() === 'PACIENTE') {
      if (this.consultaCpfProvider) {
        try {
          const dadosCpf = await this.consultaCpfProvider.consultar(tomador.cpf);
          if (dadosCpf?.nome) {
            tomador.nome = dadosCpf.nome;
            await this.pool.query(
              `update pacientes set nome = $1, data_nascimento = coalesce(data_nascimento, $2), atualizado_em = now() where id = $3`,
              [dadosCpf.nome, dadosCpf.dataNascimento || null, item.pacienteId]
            );
          }
        } catch (err: any) {
          console.warn('[PostgresEmissorDpsService] Falha ao consultar CPF do tomador:', err?.message || err);
        }
      }
    }

    const ndps = await this.obterProximoNdps(item.medicoId, prestadorConfig.proximoNumeroDps);
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

    const anoMes = new Date().toISOString().slice(0, 7);
    let chaveAcessoFinal = '';
    let respostaSefinRaw: Record<string, unknown> | undefined;
    let xmlAutorizadoFinal: string | undefined;
    let dataEmissaoFinal = new Date();

    if (this.supabaseClient && this.sefinClient) {
      const cert = await carregarCertificadoMedico(this.pool, this.supabaseClient, item.medicoId);
      if (!cert) {
        return {
          sucesso: false,
          erro: `Médico ${item.medicoId} não possui certificado digital A1 ativo cadastrado no sistema para emissão com validade jurídica na SEFIN.`
        };
      }

      let chaves;
      try {
        chaves = extrairChavesCertificado(cert.pfxBuffer, cert.senhaCertificado);
      } catch (err: any) {
        return {
          sucesso: false,
          erro: `Falha ao decodificar certificado A1 do médico: ${err?.message || err}`
        };
      }

      const { dpsId, xml: xmlDps } = gerarXmlDps(emissaoInput, prestadorConfig);
      const xmlAssinado = assinarXmlDps({
        xml: xmlDps,
        dpsId,
        pemKey: chaves.pemKey,
        pemCert: chaves.pemCert,
        certBase64: chaves.certBase64
      });

      const resSefin = await this.sefinClient.transmitirDps({
        xmlAssinado,
        pfxBuffer: cert.pfxBuffer,
        senhaCertificado: cert.senhaCertificado,
        ambiente: prestadorConfig.ambiente
      });

      if (!resSefin.sucesso) {
        if (resSefin.codigoErro === 'E0014') {
          await this.pool.query(
            `update medico_perfil_fiscal
             set proximo_numero_dps = greatest(coalesce(proximo_numero_dps, 1), $2 + 1),
                 atualizado_em = now()
             where medico_id = $1`,
            [item.medicoId, ndps]
          );
        }
        return {
          sucesso: false,
          erro: resSefin.motivo,
          codigoErroSefin: resSefin.codigoErro,
          respostaSefinRaw: resSefin.respostaRaw
        };
      }

      chaveAcessoFinal = resSefin.chaveAcesso;
      respostaSefinRaw = resSefin.respostaRaw;
      xmlAutorizadoFinal = resSefin.xmlAutorizado;
      dataEmissaoFinal = resSefin.dataAutorizacao;
    } else {
      // Modo de simulação local (quando executado sem credenciais do Supabase/SEFIN)
      const layoutDps = montarDps(emissaoInput, prestadorConfig);
      chaveAcessoFinal = comporChaveAcessoNacional({
        codIbgeMunicipio: prestadorConfig.codMunicipio,
        ambiente: prestadorConfig.ambiente === 1 ? 'producao' : 'homologacao',
        anoMes,
        cnpjOuCpf: prestadorConfig.cnpj,
        serie: prestadorConfig.serie || '00001',
        ndps
      });
      respostaSefinRaw = { layoutDps };
    }

    const valorServico = item.valorServicoCentavos / 100;
    const aliquotaIss = prestadorConfig.regTrib.opSimpNac === 1 ? 2.0 : 2.0;
    const issApurado = (valorServico * aliquotaIss) / 100;

    const dadosDanfse = {
      chaveAcesso: chaveAcessoFinal,
      numero: String(ndps),
      serie: prestadorConfig.serie || '00001',
      competencia: anoMes,
      dataEmissao: dataEmissaoFinal.toISOString(),
      ambiente: (prestadorConfig.ambiente === 1 ? 'producao' : 'homologacao') as 'producao' | 'homologacao',
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
    };

    let pdfBytes: Uint8Array | Buffer | undefined;

    if (this.meuDanfeClient) {
      try {
        const xmlString = xmlAutorizadoFinal || montarXmlNfse({
          chaveAcesso: chaveAcessoFinal,
          numero: String(ndps),
          serie: prestadorConfig.serie || '00001',
          competencia: anoMes,
          dataEmissao: dadosDanfse.dataEmissao,
          codigoMunicipio: prestadorConfig.codMunicipio,
          prestador: dadosDanfse.prestador,
          tomador: dadosDanfse.tomador,
          servico: dadosDanfse.servico
        });

        const resMeuDanfe = await this.meuDanfeClient.converterXmlParaPdf(xmlString);
        if (resMeuDanfe.sucesso && resMeuDanfe.pdfBytes) {
          pdfBytes = resMeuDanfe.pdfBytes;
        }
      } catch {
        // Fallback silencioso para o gerador vetorial nativo
      }
    }

    if (!pdfBytes) {
      pdfBytes = await generateDanfsePdf(dadosDanfse);
    }

    const xmlStoragePath = `notas/${item.medicoId}/${anoMes}/${chaveAcessoFinal}.xml`;
    if (this.supabaseClient && xmlAutorizadoFinal) {
      try {
        await this.supabaseClient.storage
          .from('notas')
          .upload(xmlStoragePath, Buffer.from(xmlAutorizadoFinal, 'utf-8'), {
            contentType: 'application/xml',
            upsert: true
          });
      } catch (err: any) {
        console.warn('[PostgresEmissorDpsService] Aviso ao gravar XML no Storage:', err?.message || err);
      }
    }

    const pdfBase64 = `data:application/pdf;base64,${Buffer.from(pdfBytes).toString('base64')}`;

    return {
      sucesso: true,
      chaveAcesso: chaveAcessoFinal,
      ndps,
      serie: prestadorConfig.serie || '00001',
      competencia: anoMes,
      dataEmissao: dataEmissaoFinal,
      valorServicosCentavos: item.valorServicoCentavos,
      xmlStoragePath,
      pdfStoragePath: pdfBase64,
      respostaSefinRaw
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
        pf.proximo_numero_dps,
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
      proximoNumeroDps: r.proximo_numero_dps ? Number(r.proximo_numero_dps) : undefined,
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

  private async obterProximoNdps(medicoId: string, numeroConfigurado?: number): Promise<number> {
    const sql = `select coalesce(max(ndps), 0) + 1 as proximo from notas_fiscais where medico_id = $1`;
    const { rows } = await this.pool.query(sql, [medicoId]);
    const proximoLocal = Number.parseInt(rows[0].proximo, 10);
    return Math.max(proximoLocal, numeroConfigurado || 1);
  }
}
