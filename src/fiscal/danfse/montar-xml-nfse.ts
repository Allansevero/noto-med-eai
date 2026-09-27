/**
 * Monta a estrutura XML da NFS-e (Padrão Nacional sped.fazenda.gov.br/nfse v1.01)
 * a partir dos dados consolidados de emissão para conversão em DANFSe oficial.
 * Módulo 100% puro: sem dependências de I/O, rede ou banco de dados.
 */

export interface DadosMontagemXmlNfse {
  chaveAcesso: string;
  numero: string;
  serie: string;
  competencia: string;
  dataEmissao: string;
  codigoMunicipio: string;
  prestador: {
    cnpj: string;
    im?: string;
    razaoSocial: string;
    nomeFantasia?: string;
    endereco?: string;
    municipio?: string;
    uf?: string;
    cep?: string;
    telefone?: string;
    email?: string;
    simplesNacional?: boolean;
  };
  tomador: {
    cpf: string;
    nome: string;
    endereco?: string;
    municipio?: string;
    uf?: string;
    cep?: string;
    telefone?: string;
    email?: string;
  };
  servico: {
    cTribNac: string;
    cNBS?: string;
    discriminacao: string;
    valor: number;
    aliquota: number;
    issApurado: number;
  };
}

function escaparXml(texto: string): string {
  return texto
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function montarXmlNfse(dados: DadosMontagemXmlNfse): string {
  const cnpjLimpo = dados.prestador.cnpj.replace(/\D/g, '');
  const cpfLimpo = dados.tomador.cpf.replace(/\D/g, '');
  const cepPrestador = (dados.prestador.cep || '90000000').replace(/\D/g, '');
  const cepTomador = (dados.tomador.cep || '90000000').replace(/\D/g, '');
  const fonePrestador = (dados.prestador.telefone || '').replace(/\D/g, '');
  const foneTomador = (dados.tomador.telefone || '').replace(/\D/g, '');

  const emitenteXml = `
    <emit>
      <CNPJ>${cnpjLimpo}</CNPJ>
      <xNome>${escaparXml(dados.prestador.razaoSocial)}</xNome>
      ${dados.prestador.nomeFantasia ? `<xFant>${escaparXml(dados.prestador.nomeFantasia)}</xFant>` : ''}
      ${dados.prestador.im ? `<IM>${escaparXml(dados.prestador.im)}</IM>` : ''}
      <enderNac>
        <cMun>${escaparXml(dados.codigoMunicipio)}</cMun>
        <CEP>${cepPrestador}</CEP>
        <xLgr>${escaparXml(dados.prestador.endereco || 'RUA PRINCIPAL')}</xLgr>
        <nro>S/N</nro>
        <xBairro>CENTRO</xBairro>
        <UF>${escaparXml(dados.prestador.uf || 'RS')}</UF>
      </enderNac>
      ${fonePrestador ? `<fone>${fonePrestador}</fone>` : ''}
      ${dados.prestador.email ? `<email>${escaparXml(dados.prestador.email)}</email>` : ''}
    </emit>`;

  const tomadorXml = `
    <toma>
      <CPF>${cpfLimpo}</CPF>
      <xNome>${escaparXml(dados.tomador.nome)}</xNome>
      <enderNac>
        <cMun>${escaparXml(dados.codigoMunicipio)}</cMun>
        <CEP>${cepTomador}</CEP>
        <xLgr>${escaparXml(dados.tomador.endereco || 'ENDEREÇO DO TOMADOR')}</xLgr>
        <nro>S/N</nro>
        <xBairro>CENTRO</xBairro>
        <UF>${escaparXml(dados.tomador.uf || dados.prestador.uf || 'RS')}</UF>
      </enderNac>
      ${foneTomador ? `<fone>${foneTomador}</fone>` : ''}
      ${dados.tomador.email ? `<email>${escaparXml(dados.tomador.email)}</email>` : ''}
    </toma>`;

  const servicoXml = `
        <serv>
          <locPrest>
            <cLocPrestacao>${escaparXml(dados.codigoMunicipio)}</cLocPrestacao>
          </locPrest>
          <cServ>
            <cTribNac>${escaparXml(dados.servico.cTribNac)}</cTribNac>
            <cNBS>${escaparXml(dados.servico.cNBS || '122051900')}</cNBS>
            <xDescServ>${escaparXml(dados.servico.discriminacao)}</xDescServ>
          </cServ>
        </serv>`;

  const valoresXml = `
        <valores>
          <vServPrest>
            <vServ>${dados.servico.valor.toFixed(2)}</vServ>
          </vServPrest>
          <tribTotal>
            <vTotTrib>
              <vTotTribFed>0.00</vTotTribFed>
              <vTotTribEst>0.00</vTotTribEst>
              <vTotTribMun>${dados.servico.issApurado.toFixed(2)}</vTotTribMun>
            </vTotTrib>
          </tribTotal>
          <trib>
            <tribMun>
              <tribISSQN>1</tribISSQN>
              <cLocIncid>${escaparXml(dados.codigoMunicipio)}</cLocIncid>
              <cPaisResult>1058</cPaisResult>
              <vBCISSQN>${dados.servico.valor.toFixed(2)}</vBCISSQN>
              <pAliqISSQN>${dados.servico.aliquota.toFixed(2)}</pAliqISSQN>
              <vISSQN>${dados.servico.issApurado.toFixed(2)}</vISSQN>
              <tpRetISSQN>1</tpRetISSQN>
            </tribMun>
          </trib>
        </valores>`;

  return `<?xml version="1.0" encoding="utf-8"?>
<NFSe xmlns="http://www.sped.fazenda.gov.br/nfse">
  <infNFSe Id="NFS${dados.chaveAcesso}" versao="1.01">
    <xLocEmi>${escaparXml(dados.prestador.municipio || 'PORTO ALEGRE')}</xLocEmi>
    <xLocPrestacao>${escaparXml(dados.prestador.municipio || 'PORTO ALEGRE')}</xLocPrestacao>
    <nNFSe>${dados.numero}</nNFSe>
    <cVerif>ABCD1234EF</cVerif>
    <dhEmi>${dados.dataEmissao}</dhEmi>
    <dCompet>${dados.competencia.slice(0, 10)}</dCompet>${emitenteXml}${tomadorXml}
    <DPS>
      <infDPS Id="DPS${dados.codigoMunicipio}1${cnpjLimpo}${dados.serie.padStart(5, '0')}${dados.numero.padStart(15, '0')}">
        <dhEmi>${dados.dataEmissao}</dhEmi>
        <dCompet>${dados.competencia.slice(0, 10)}</dCompet>
        <serie>${escaparXml(dados.serie)}</serie>
        <nDPS>${dados.numero}</nDPS>
        <cLocEmi>${escaparXml(dados.codigoMunicipio)}</cLocEmi>
        <prest>
          <CNPJ>${cnpjLimpo}</CNPJ>
          ${dados.prestador.im ? `<IM>${escaparXml(dados.prestador.im)}</IM>` : ''}
          <regTrib>
            <opSimpNac>${dados.prestador.simplesNacional ? '1' : '3'}</opSimpNac>
            <regEspTrib>0</regEspTrib>
          </regTrib>
        </prest>
        <toma>
          <CPF>${cpfLimpo}</CPF>
          <xNome>${escaparXml(dados.tomador.nome)}</xNome>
          ${foneTomador ? `<fone>${foneTomador}</fone>` : ''}
        </toma>${servicoXml}${valoresXml}
      </infDPS>
    </DPS>
  </infNFSe>
</NFSe>`;
}
