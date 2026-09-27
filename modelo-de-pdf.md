# PROMPT PARA LLM: Geração do PDF Padrão Nacional (DANFSe v2.0 - Diretrizes 2026 / RTC)

Atue como um Engenheiro Especialista em Documentos Fiscais Brasileiros e TypeScript.
Você deve gerar o PDF oficial do **DANFSe v2.0 (Documento Auxiliar da Nota Fiscal de Serviço Eletrônica)** de acordo com as normas da Receita Federal / SEFIN (NT-008 v1.02 e NT-009 da Reforma Tributária do Consumo - RTC 2026) e as diretrizes do Convênio Nacional da NFS-e (Resolução CGSN nº 169/2022).

---

### 1. REGRAS FISCAIS E DIRETRIZES 2026 (RTC / IBS / CBS)
1. **Chave de Acesso Nacional**: 50 dígitos numéricos contínuos, formatados visualmente em blocos de 4 dígitos (ex.: `4314 9022 2338 4173 ...`).
2. **QR Code de Consulta Pública**: Dimensão 58x58 pt, correção nível `M`, codificando a URL oficial:
   `https://www.nfse.gov.br/ConsultaPublica/?tpc=1&chave={CHAVE_SEM_PONTUACAO}`.
3. **Reforma Tributária 2026 (RTC)**:
   - **Simples Nacional / MEI**: Alíquotas de CBS e IBS zeradas no documento fiscal (`0.0%`), pois estão incluídas no DAS. Percentual de tributos federais destacado como `0.00%`.
   - **Lucro Presumido / Real**: Alíquotas de teste da transição 2026 aplicadas: CBS Federal `0,9%`, IBS Estadual `0,1%`, IBS Municipal `0,0%`, com tributos federais destacados em `11.33%`.
   - Indicadores de operação no XML/DPS: Operação `030101`, Situação Tributária `000`, Classificação Tributária `000001`, Consumidor Final `1`.
4. **Padrão Médico / Saúde (CFM / RQE)**:
   - A descrição do serviço deve seguir o padrão:
     `REFERENTE A [N] CONSULTA(S) REALIZADA(S) COM [NOME DO PROFISSIONAL] (RQE: [X] / CRM: [Y]) NAS DATAS [DD de mês de AAAA].`
   - Se optante pelo Simples: adicionar `"DOCUMENTO EMITIDO POR ME OU EPP OPTANTE PELO SIMPLES NACIONAL. NÃO GERA DIREITO A CRÉDITO FISCAL DE IPI/ICMS/ISS."`.

---

### 2. GEOMETRIA E DESIGN SYSTEM DO PDF (A4 RETRATO)
- **Dimensões**: 595.28 pt x 841.89 pt (A4). Margens laterais de 20 pt (`contentWidth = 555.28 pt`).
- **Renderização**: 100% vetorial com `pdf-lib` (zero dependência de navegadores, Puppeteer ou canvas).
- **Tipografia**: `Helvetica` e `Helvetica-Bold` nativas do PDF.
- **Estrutura das 8 Bandas Oficiais**:
  - **Banda 1 (Cabeçalho, 45 pt)**: Logotipo/texto `"NFS-e NACIONAL"`, `"DANFSe v2.0"`, `"Documento Auxiliar da NFS-e"`, Município/UF, Ambiente SEFIN.
  - **Banda 2 (Dados da Nota & QR Code, 82 pt)**: Chave de acesso de 50 dígitos em destaque; Grade 3x3 (Número NFS-e, Competência, Data/Hora, DPS número/série, Situação, Finalidade); QR Code à direita (58 pt).
  - **Banda 3 (Prestador, 3 linhas x 19 pt)**: CNPJ/CPF, Inscrição Municipal, Telefone, Opção Simples Nacional, Razão Social, Município/UF, CEP, Endereço e E-mail.
  - **Banda 4 (Tomador, 3 linhas x 19 pt)**: CPF/CNPJ, Inscrição Municipal, Telefone, Nome Completo, Município/UF, CEP, Endereço e E-mail.
  - **Banda 5 (Serviço, 18 pt + 46 pt)**: Código Tributação Nacional (`cTribNac`, ex: `041601`), Código NBS (`123011300`), Local da Prestação, Caixa de Discriminação dos Serviços com quebra de linha (máx. 95 chars).
  - **Banda 6 (Tributação Municipal & RTC, 2 linhas x 19 pt)**: Tipo de tributação, Município de Incidência, Retenção ISSQN, Base de Cálculo, Alíquota (ex: 2.0%), ISSQN Apurado.
  - **Banda 7 (Totais, 24 pt)**: Valor dos Serviços, Desconto Incondicionado, Retenções Federais e **Caixa de Destaque com Fundo Verde Suave para o VALOR LÍQUIDO DA NFS-e**.
  - **Banda 8 (Informações Complementares, 48 pt)**: Textos regulamentares obrigatórios (Simples Nacional, Lei 12.741/2012, Convênio Nacional LC 116/2003).
  - **Marca D'água Dinâmica**: Diagonal em 30°/35° para `"HOMOLOGAÇÃO / SEM VALOR"` (opacidade 0.22) ou `"CANCELADA"` (opacidade 0.28).

---

### 3. IMPLEMENTAÇÃO EM TYPESCRIPT (pdf-lib + qrcode)

```typescript
import { PDFDocument, StandardFonts, rgb, degrees } from 'pdf-lib';
import QRCode from 'qrcode';

export interface DanfsePdfOptions {
  chaveAcesso?: string;
  numero?: string;
  serie?: string;
  dataEmissao?: string;
  competencia?: string;
  ambiente?: 'producao' | 'homologacao';
  cancelada?: boolean;
  prestador?: {
    razaoSocial?: string;
    cnpj?: string;
    inscricaoMunicipal?: string;
    endereco?: string;
    municipio?: string;
    uf?: string;
    cep?: string;
    telefone?: string;
    email?: string;
    simplesNacional?: boolean;
  };
  tomador?: {
    nome?: string;
    cpf?: string;
    inscricaoMunicipal?: string;
    endereco?: string;
    municipio?: string;
    uf?: string;
    cep?: string;
    telefone?: string;
    email?: string;
  };
  servico?: {
    cTribNac?: string;
    cNBS?: string;
    discriminacao?: string;
    valor?: number;
    aliquota?: number;
    issApurado?: number;
    desconto?: number;
    retencoes?: number;
    deducoes?: number;
  };
}

export async function generateDanfsePdf(options: DanfsePdfOptions = {}): Promise<Uint8Array> {
  const {
    chaveAcesso = '43149022233841732000163000000000001226097414639456',
    numero = '1',
    serie = '1',
    dataEmissao = new Date().toISOString(),
    competencia = new Date().toISOString().slice(0, 10),
    ambiente = 'producao',
    cancelada = false,
    prestador = {},
    tomador = {},
    servico = {},
  } = options;

  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595.28, 841.89]);
  const { width, height } = page.getSize();

  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const marginX = 20;
  const contentWidth = width - marginX * 2;
  let currentY = height - 20;

  const colorBlack = rgb(0, 0, 0);
  const colorGrayText = rgb(0.35, 0.35, 0.35);
  const colorBorder = rgb(0.2, 0.2, 0.2);
  const colorSectionHeaderBg = rgb(0.88, 0.88, 0.88);
  const colorFieldBg = rgb(0.96, 0.96, 0.96);

  const drawBox = (x: number, y: number, w: number, h: number, bg?: any) => {
    page.drawRectangle({
      x, y, width: w, height: h, borderWidth: 0.5, borderColor: colorBorder, color: bg,
    });
  };

  const drawField = (x: number, yTop: number, w: number, h: number, label: string, value: string, isBold = false, bg?: any) => {
    drawBox(x, yTop - h, w, h, bg);
    if (label) {
      page.drawText(label.toUpperCase(), { x: x + 2.5, y: yTop - 7.5, size: 5.5, font: fontBold, color: colorGrayText });
    }
    const valY = label ? yTop - 16.5 : yTop - h / 2 - 3;
    const valStr = value || '-';
    const maxChars = Math.floor(w / 4.8);
    const displayVal = valStr.length > maxChars ? `${valStr.slice(0, maxChars - 2)}..` : valStr;
    page.drawText(displayVal, { x: x + 2.5, y: valY, size: isBold ? 7.5 : 7, font: isBold ? fontBold : fontRegular, color: colorBlack });
  };

  const drawSectionTitle = (title: string, h = 12) => {
    drawBox(marginX, currentY - h, contentWidth, h, colorSectionHeaderBg);
    page.drawText(title.toUpperCase(), { x: marginX + 4, y: currentY - 8.5, size: 6.5, font: fontBold, color: colorBlack });
    currentY -= h;
  };

  // 1. CABEÇALHO
  const cabecalhoH = 45;
  drawBox(marginX, currentY - cabecalhoH, contentWidth, cabecalhoH);
  page.drawText('NFS-e', { x: marginX + 10, y: currentY - 26, size: 20, font: fontBold, color: colorBlack });
  page.drawText('NACIONAL', { x: marginX + 10, y: currentY - 37, size: 9, font: fontBold, color: colorGrayText });
  page.drawText('DANFSe v2.0', { x: marginX + 135, y: currentY - 14, size: 11, font: fontBold, color: colorBlack });
  page.drawText('Documento Auxiliar da Nota Fiscal de Serviço Eletrônica', { x: marginX + 135, y: currentY - 26, size: 8.5, font: fontRegular, color: colorBlack });
  page.drawText('Padrão Nacional da NFS-e (Receita Federal do Brasil / SEFIN)', { x: marginX + 135, y: currentY - 37, size: 7, font: fontRegular, color: colorGrayText });

  const dirW = 140;
  const dirX = width - marginX - dirW;
  page.drawText(`MUNICÍPIO: ${(prestador.municipio || 'PORTO ALEGRE').toUpperCase()} - ${(prestador.uf || 'RS').toUpperCase()}`, { x: dirX, y: currentY - 13, size: 7, font: fontBold, color: colorBlack });
  page.drawText('Ambiente Gerador: SEFIN Nacional', { x: dirX, y: currentY - 24, size: 6.5, font: fontRegular, color: colorGrayText });
  page.drawText(`Tipo de Ambiente: ${ambiente === 'homologacao' ? 'Homologação' : 'Produção'}`, { x: dirX, y: currentY - 34, size: 6.5, font: fontBold, color: ambiente === 'homologacao' ? rgb(0.85, 0.1, 0.1) : rgb(0.1, 0.5, 0.1) });
  currentY -= cabecalhoH;

  // 2. DADOS DA NFS-E E QR-CODE
  const dadosNfseH = 82;
  const qrColW = 95;
  const dadosColW = contentWidth - qrColW;
  drawBox(marginX, currentY - dadosNfseH, contentWidth, dadosNfseH);

  const chaveLimpa = chaveAcesso.replace(/\D/g, '');
  const chaveFmt = chaveLimpa.replace(/(\d{4})/g, '$1 ').trim();
  page.drawText('CHAVE DE ACESSO DA NFS-e', { x: marginX + 4, y: currentY - 9, size: 6, font: fontBold, color: colorGrayText });
  page.drawText(chaveFmt, { x: marginX + 4, y: currentY - 20, size: 8.5, font: fontBold, color: colorBlack });

  const cW3 = dadosColW / 3;
  const rowH = 19;
  let rY = currentY - 25;
  drawField(marginX, rY, cW3, rowH, 'Número da NFS-e', numero, true, colorFieldBg);
  drawField(marginX + cW3, rY, cW3, rowH, 'Competência', competencia);
  drawField(marginX + cW3 * 2, rY, cW3, rowH, 'Data/Hora Emissão NFS-e', dataEmissao.replace('T', ' ').slice(0, 19));

  rY -= rowH;
  drawField(marginX, rY, cW3, rowH, 'Número da DPS', numero, false);
  drawField(marginX + cW3, rY, cW3, rowH, 'Série da DPS', serie, false);
  drawField(marginX + cW3 * 2, rY, cW3, rowH, 'Data/Hora Emissão DPS', dataEmissao.slice(0, 10));

  rY -= rowH;
  drawField(marginX, rY, cW3, rowH, 'Emitente da NFS-e', 'Prestador', false);
  drawField(marginX + cW3, rY, cW3, rowH, 'Situação da NFS-e', cancelada ? 'CANCELADA' : 'EMITIDA COM SUCESSO', true);
  drawField(marginX + cW3 * 2, rY, cW3, rowH, 'Finalidade', 'Normal');

  // QR Code
  const qrBoxX = marginX + dadosColW;
  const qrUrl = `https://www.nfse.gov.br/ConsultaPublica/?tpc=1&chave=${chaveLimpa}`;
  try {
    const qrBuffer = await QRCode.toBuffer(qrUrl, { margin: 1, width: 140, errorCorrectionLevel: 'M' });
    const qrImg = await pdfDoc.embedPng(qrBuffer);
    page.drawImage(qrImg, { x: qrBoxX + (qrColW - 58) / 2, y: currentY - 58 - 4, width: 58, height: 58 });
  } catch {}
  page.drawText('Consulte pela chave ou QR Code', { x: qrBoxX + 5, y: currentY - 68, size: 5, font: fontRegular, color: colorGrayText });
  page.drawText('no Portal Nacional da NFS-e', { x: qrBoxX + 11, y: currentY - 76, size: 5, font: fontRegular, color: colorGrayText });
  currentY -= dadosNfseH;

  // 3. PRESTADOR
  drawSectionTitle('Prestador / Fornecedor');
  const colW4 = contentWidth / 4;
  drawField(marginX, currentY, colW4, 19, 'CNPJ / CPF', prestador.cnpj || '-', true);
  drawField(marginX + colW4, currentY, colW4, 19, 'Inscrição Municipal', prestador.inscricaoMunicipal || '-');
  drawField(marginX + colW4 * 2, currentY, colW4, 19, 'Telefone', prestador.telefone || '-');
  drawField(marginX + colW4 * 3, currentY, colW4, 19, 'Opção Simples Nacional', prestador.simplesNacional ? 'Optante - ME/EPP' : 'Não Optante', false, colorFieldBg);
  currentY -= 19;
  drawField(marginX, currentY, colW4 * 2, 19, 'Nome / Nome Empresarial', (prestador.razaoSocial || '').toUpperCase(), true);
  drawField(marginX + colW4 * 2, currentY, colW4, 19, 'Município / UF', `${prestador.municipio || ''} - ${prestador.uf || ''}`);
  drawField(marginX + colW4 * 3, currentY, colW4, 19, 'CEP', prestador.cep || '-');
  currentY -= 19;
  drawField(marginX, currentY, colW4 * 2.5, 19, 'Endereço', prestador.endereco || '-');
  drawField(marginX + colW4 * 2.5, currentY, colW4 * 1.5, 19, 'E-mail', (prestador.email || '-').toLowerCase());
  currentY -= 19;

  // 4. TOMADOR
  drawSectionTitle('Tomador / Adquirente');
  drawField(marginX, currentY, colW4, 19, 'CPF / CNPJ', tomador.cpf || '-', true);
  drawField(marginX + colW4, currentY, colW4, 19, 'Inscrição Municipal', tomador.inscricaoMunicipal || '-');
  drawField(marginX + colW4 * 2, currentY, colW4 * 2, 19, 'Telefone', tomador.telefone || '-');
  currentY -= 19;
  drawField(marginX, currentY, colW4 * 2, 19, 'Nome / Nome Empresarial', (tomador.nome || '').toUpperCase(), true);
  drawField(marginX + colW4 * 2, currentY, colW4, 19, 'Município / UF', `${tomador.municipio || ''} - ${tomador.uf || ''}`);
  drawField(marginX + colW4 * 3, currentY, colW4, 19, 'CEP', tomador.cep || '-');
  currentY -= 19;
  drawField(marginX, currentY, colW4 * 2.5, 19, 'Endereço', tomador.endereco || '-');
  drawField(marginX + colW4 * 2.5, currentY, colW4 * 1.5, 19, 'E-mail', (tomador.email || '-').toLowerCase());
  currentY -= 19;

  // 5. SERVIÇO PRESTADO
  drawSectionTitle('Serviço Prestado');
  drawField(marginX, currentY, colW4, 18, 'Cód. Tributação Nacional', servico.cTribNac || '041601', true);
  drawField(marginX + colW4, currentY, colW4, 18, 'Código da NBS', servico.cNBS || '123011300');
  drawField(marginX + colW4 * 2, currentY, colW4 * 2, 18, 'Local da Prestação', `${prestador.municipio || ''} - ${prestador.uf || ''} / Brasil`);
  currentY -= 18;

  const descH = 46;
  drawBox(marginX, currentY - descH, contentWidth, descH);
  page.drawText('DISCRIMINAÇÃO DOS SERVIÇOS', { x: marginX + 4, y: currentY - 8, size: 5.5, font: fontBold, color: colorGrayText });
  const rawDesc = servico.discriminacao || '';
  const descLines: string[] = [];
  let currentLine = '';
  for (const word of rawDesc.split(' ')) {
    if ((currentLine + ' ' + word).trim().length <= 95) currentLine = (currentLine + ' ' + word).trim();
    else { descLines.push(currentLine); currentLine = word; }
  }
  if (currentLine) descLines.push(currentLine);
  let descY = currentY - 20;
  for (const line of descLines.slice(0, 3)) {
    page.drawText(line, { x: marginX + 6, y: descY, size: 7.5, font: fontRegular, color: colorBlack });
    descY -= 11;
  }
  currentY -= descH;

  // 6. TRIBUTAÇÃO MUNICIPAL (ISSQN) & RTC
  drawSectionTitle('Tributação Municipal (ISSQN)');
  drawField(marginX, currentY, colW4, 19, 'Tipo de Tributação', 'Operação Tributável');
  drawField(marginX + colW4, currentY, colW4, 19, 'Município de Incidência', `${prestador.municipio || ''} - ${prestador.uf || ''}`);
  drawField(marginX + colW4 * 2, currentY, colW4, 19, 'Regime Especial', 'Nenhum');
  drawField(marginX + colW4 * 3, currentY, colW4, 19, 'Retenção ISSQN', 'Não Retido');
  currentY -= 19;
  const vServ = (servico.valor || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
  const aliq = (servico.aliquota || 2).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
  const vIss = (servico.issApurado || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
  drawField(marginX, currentY, colW4, 19, 'Base de Cálculo ISSQN', `R$ ${vServ}`);
  drawField(marginX + colW4, currentY, colW4, 19, 'Alíquota Aplicada', `${aliq}%`);
  drawField(marginX + colW4 * 2, currentY, colW4, 19, 'ISSQN Apurado', `R$ ${vIss}`);
  drawField(marginX + colW4 * 3, currentY, colW4, 19, 'Total Deduções / Reduções', 'R$ 0,00');
  currentY -= 19;

  // 7. VALORES TOTAIS
  drawSectionTitle('Valores Totais da NFS-e');
  const totH = 24;
  drawField(marginX, currentY, colW4, totH, 'Valor dos Serviços', `R$ ${vServ}`, true);
  drawField(marginX + colW4, currentY, colW4, totH, 'Desconto Incondicionado', 'R$ 0,00');
  drawField(marginX + colW4 * 2, currentY, colW4, totH, 'Total Retenções Federais', 'R$ 0,00');

  // Destaque Valor Líquido
  const valLiq = (servico.valor || 0) - (servico.desconto || 0) - (servico.retencoes || 0);
  drawBox(marginX + colW4 * 3, currentY - totH, colW4, totH, rgb(0.9, 0.95, 0.9));
  page.drawText('VALOR LÍQUIDO DA NFS-e', { x: marginX + colW4 * 3 + 3, y: currentY - 8, size: 6, font: fontBold, color: rgb(0.1, 0.4, 0.1) });
  page.drawText(`R$ ${valLiq.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, { x: marginX + colW4 * 3 + 3, y: currentY - 19, size: 10, font: fontBold, color: rgb(0.1, 0.4, 0.1) });
  currentY -= totH;

  // 8. INFORMAÇÕES COMPLEMENTARES
  drawSectionTitle('Informações Complementares', 11);
  const infoH = 48;
  drawBox(marginX, currentY - infoH, contentWidth, infoH);
  const infoTexts = [
    prestador.simplesNacional
      ? 'I - Documento emitido por ME ou EPP optante pelo Simples Nacional (Microempreendedor Individual ou EPP).'
      : 'I - Empresa tributada pelo Lucro Presumido/Real. CBS e IBS apurados conforme RTC/2026.',
    'II - Não gera direito a crédito fiscal de IPI ou ISSQN.',
    'III - Total aproximado de tributos federais, estaduais e municipais: R$ 0,00 (dispensado conforme Decreto Federal nº 8.264/2014).',
    'IV - NFS-e emitida em conformidade com o Convênio Nacional da NFS-e (Lei Complementar nº 116/2003 e Resolução CGSN nº 169/2022).',
  ];
  let infoY = currentY - 11;
  for (const t of infoTexts) {
    page.drawText(t, { x: marginX + 6, y: infoY, size: 6, font: fontRegular, color: colorGrayText });
    infoY -= 10;
  }
  currentY -= infoH;

  // MARCA D'ÁGUA
  if (cancelada) {
    page.drawText('CANCELADA', { x: width / 2 - 170, y: height / 2 - 40, size: 62, font: fontBold, color: rgb(0.9, 0.15, 0.15), opacity: 0.28, rotate: degrees(35) });
  } else if (ambiente === 'homologacao') {
    page.drawText('HOMOLOGAÇÃO / SEM VALOR', { x: width / 2 - 210, y: height / 2 - 40, size: 38, font: fontBold, color: rgb(0.85, 0.2, 0.2), opacity: 0.22, rotate: degrees(30) });
  }

  return await pdfDoc.save();
}
