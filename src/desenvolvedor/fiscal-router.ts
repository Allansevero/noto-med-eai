/** Console isolado de homologação: sem banco, fila, Storage ou WhatsApp. */
import { Router, type RequestHandler } from 'express';
import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { XMLParser, XMLValidator } from 'fast-xml-parser';
import { AdnNfseClient } from '../io/fiscal/adn-nfse-client.js';
import { SefinNacionalClient, type ResultadoTransmissaoSefin } from '../io/fiscal/sefin-nacional-client.js';
import { extrairChavesCertificado } from '../io/fiscal/extrair-chaves-certificado.js';
import { ErroXmlReferencia, lerXmlNotaReferencia } from '../onboarding/io/ler-xml-nota-referencia.js';
import { mapearParametrosFiscaisDoXml, type ParametrosFiscaisExtraidos } from '../onboarding/regras/mapear-parametros-fiscais-do-xml.js';
import { mapearServicoFiscalDoXml, type ServicoFiscalExtraido } from '../onboarding/regras/mapear-servico-fiscal-do-xml.js';
import { parametrosEmissaoSchema, type ParametrosEmissao } from '../fiscal/preparacao/parametros-emissao.js';
import { validarReferenciaFiscal } from '../fiscal/preparacao/validar-referencia-fiscal.js';
import { validarDadosDps } from '../fiscal/preparacao/validar-dados-dps.js';
import { validarCpf } from '../paciente/validar-cpf.js';
import { gerarXmlDps } from '../io/fiscal/gerar-xml-dps.js';
import { assinarXmlDps } from '../io/fiscal/assinar-xml-dps.js';
import type { ConfigPrestador, EmissaoInput } from '../io/fiscal/montar-dps.js';

const duracaoSessao = 15 * 60 * 1000;
const certificadoSchema = z.object({ arquivoBase64: z.string().min(1).max(2_800_000).regex(/^[A-Za-z0-9+/]+={0,2}$/),
  senha: z.string().max(512) }).strict();
const preparoSchema = z.object({ sessaoId: z.string().uuid(), cpfPaciente: z.string().regex(/^\d{11}$/).refine(validarCpf, 'CPF inválido'),
  nomePaciente: z.string().trim().min(2).max(150), descricao: z.string().trim().min(2).max(2000),
  valorCentavos: z.number().int().min(1).max(999_999_999), competencia: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  serieDps: z.string().regex(/^\d{1,5}$/), numeroDps: z.string().regex(/^[1-9]\d{0,14}$/) }).strict();
const envioSchema = z.object({ sessaoId: z.string().uuid(), tentativaId: z.string().uuid(), confirmarHomologacao: z.literal(true) }).strict();
type Estado = 'preparada' | 'enviando' | 'autorizada' | 'rejeitada' | 'resultado_incerto';
type Evento = { etapa: string; em: string; tentativaId?: string; estado?: Estado; codigo?: string };
type Tentativa = { id: string; estado: Estado; serie: string; numero: string; xmlDpsAssinado: string; resultado?: Record<string, unknown> };
type Sessao = { id: string; pfx: Buffer; senha: string; expira: number; timer: ReturnType<typeof setTimeout>;
  fiscal?: ParametrosFiscaisExtraidos; servico?: Pick<ServicoFiscalExtraido, 'ctribNac' | 'ctribMun' | 'cnbs'>; hash?: string;
  tentativas: Map<string, Tentativa>; eventos: Evento[] };
class ErroTesteFiscal extends Error {
  constructor(public status: number, public codigo: string, mensagem: string, public pendencias?: string[]) { super(mensagem); }
}
export interface DependenciasTesteFiscal {
  ativo: boolean; token?: string;
  adn?: Pick<AdnNfseClient, 'buscarNfseMaisRecente'>;
  sefin?: Pick<SefinNacionalClient, 'transmitirDps'>;
  agora?: () => Date;
  registrar?: (evento: Record<string, unknown>) => void;
}
export function criarRouterFiscalDesenvolvedor(deps: DependenciasTesteFiscal) {
  const router = Router();
  router.use((_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });
  router.get('/disponibilidade', (_req, res) => res.json({ ativo: deps.ativo, ambiente: 'homologacao' }));
  if (!deps.ativo) {
    router.use((_req, res) => res.status(404).json({ ok: false, codigo: 'AREA_INATIVA', detalhe: 'Área de desenvolvedor não ativada.' }));
    return router;
  }
  if (!deps.token || deps.token.trim() !== deps.token || deps.token.length < 32 || deps.token.length > 256) throw new Error('DESENVOLVEDOR_FISCAL_TOKEN inválido');
  const segredo = createHash('sha256').update(deps.token).digest();
  router.use((req, res, next) => {
    const header = req.header('Authorization') || '';
    const valor = header.startsWith('Bearer ') ? header.slice(7) : '';
    if (!valor || !timingSafeEqual(segredo, createHash('sha256').update(valor).digest())) {
      return res.status(401).json({ ok: false, codigo: 'ACESSO_NEGADO', detalhe: 'Informe a chave de acesso da área de desenvolvedor.' });
    }
    next();
  });
  router.get('/acesso', (_req, res) => res.json({ ok: true, ambiente: 'homologacao' }));
  const agora = deps.agora ?? (() => new Date());
  const adn = deps.adn ?? new AdnNfseClient(); // Produção somente para leitura da referência.
  const sefin = deps.sefin ?? new SefinNacionalClient();
  const sessoes = new Map<string, Sessao>();
  function encerrar(id: string) {
    const s = sessoes.get(id);
    if (s) { clearTimeout(s.timer); s.pfx.fill(0); s.senha = ''; s.tentativas.clear(); s.eventos.length = 0; s.fiscal = undefined; s.servico = undefined; s.hash = undefined; sessoes.delete(id); }
  }
  function expirar() { for (const s of sessoes.values()) if (s.expira <= agora().getTime()) encerrar(s.id); }
  function obter(id: string) {
    expirar(); const s = sessoes.get(id);
    if (!s) throw new ErroTesteFiscal(410, 'SESSAO_EXPIRADA', 'Sessão encerrada ou expirada. Informe o A1 novamente para iniciar outro teste.');
    return s;
  }
  function registrar(s: Sessao, evento: Omit<Evento, 'em'>) {
    const registro = { ...evento, em: agora().toISOString() }; s.eventos.push(registro);
    // Identificadores aleatórios e etapas; nenhum documento, XML, senha ou certificado.
    (deps.registrar ?? (e => console.info('[Desenvolvedor fiscal]', e)))({ sessaoId: s.id, ambiente: 2, ...registro });
  }
  const rota = (acao: RequestHandler): RequestHandler => async (req, res, next) => {
    try { await acao(req, res, next); }
    catch (erro) {
      if (erro instanceof ErroTesteFiscal) return res.status(erro.status).json({ ok: false, codigo: erro.codigo, detalhe: erro.message, pendencias: erro.pendencias });
      if (erro instanceof z.ZodError) return res.status(400).json({ ok: false, codigo: 'DADOS_INVALIDOS', detalhe: 'Confira os dados informados para o teste.',
        campos: erro.issues.map(e => e.path.join('.')) });
      return res.status(502).json({ ok: false, codigo: 'INTEGRACAO_INDISPONIVEL', detalhe: 'Não foi possível concluir a consulta fiscal. Tente novamente mais tarde.' });
    }
  };
  router.post('/referencia', rota(async (req, res) => {
    const dados = certificadoSchema.parse(req.body); expirar();
    if (sessoes.size >= 5) throw new ErroTesteFiscal(429, 'LIMITE_SESSOES', 'Encerre uma sessão de teste antes de abrir outra.');
    const pfx = Buffer.from(dados.arquivoBase64, 'base64');
    if (pfx.length > 2 * 1024 * 1024 || pfx.toString('base64') !== dados.arquivoBase64) {
      pfx.fill(0); throw new ErroTesteFiscal(400, 'A1_INVALIDO', 'Informe um arquivo A1 válido, de até 2 MB.');
    }
    let chaves;
    try { chaves = extrairChavesCertificado(pfx, dados.senha); }
    catch { pfx.fill(0); throw new ErroTesteFiscal(400, 'A1_INVALIDO', 'Não foi possível abrir o A1. Confira o arquivo e a senha.'); }
    if (!chaves.documentoTitular || !chaves.validoAte || chaves.validoAte.getTime() <= agora().getTime() ||
        (chaves.validoDe && chaves.validoDe.getTime() > agora().getTime())) {
      pfx.fill(0); throw new ErroTesteFiscal(400, 'A1_INVALIDO', 'O A1 precisa estar válido e identificar o CPF/CNPJ do titular.');
    }
    const id = randomUUID();
    const timer = setTimeout(() => encerrar(id), duracaoSessao); timer.unref();
    const s: Sessao = { id, pfx, senha: dados.senha, expira: agora().getTime() + duracaoSessao, timer, tentativas: new Map(), eventos: [] };
    sessoes.set(id, s); registrar(s, { etapa: 'busca_referencia' });
    try {
      const consulta = await adn.buscarNfseMaisRecente(pfx, dados.senha, chaves.documentoTitular);
      const { xmlObj } = lerXmlNotaReferencia(consulta.documento.xml);
      const fiscal = mapearParametrosFiscaisDoXml(xmlObj), mapeado = mapearServicoFiscalDoXml(xmlObj);
      const servico = { ctribNac: mapeado.ctribNac, ctribMun: mapeado.ctribMun, cnbs: mapeado.cnbs };
      const prest = xmlObj.NFSe.infNFSe.DPS.infDPS.prest;
      const documentoDps = String(prest?.CNPJ || prest?.CPF || '').replace(/\D/g, '');
      if (fiscal.cnpj !== chaves.documentoTitular || documentoDps !== chaves.documentoTitular) {
        throw new ErroTesteFiscal(422, 'TITULAR_DIVERGENTE', 'A nota localizada não pertence ao titular do A1.');
      }
      obter(id); // Uma consulta demorada não reabre uma sessão já expirada.
      s.fiscal = fiscal; s.servico = servico; s.hash = createHash('sha256').update(consulta.documento.xml).digest('hex');
      registrar(s, { etapa: 'referencia_extraida' });
      const meta = fiscal.dadosReformaTributaria;
      res.json({ ok: true, sessaoId: id, expiraEm: new Date(s.expira).toISOString(), pendencias: meta.pendencias,
        referencia: { hash: s.hash, numero: meta.numero, emitidaEm: meta.emitidaEm, ambienteOrigem: fiscal.ambiente,
          ambienteEmissao: 'homologacao', prestador: { documento: fiscal.cnpj, razaoSocial: fiscal.razaoSocial,
            municipio: fiscal.codMunicipioIbge, inscricaoMunicipal: fiscal.inscricaoMunicipal },
          servico: { ctribNac: servico.ctribNac, ctribMun: servico.ctribMun, cnbs: servico.cnbs }, parametrosExtraidos: meta.parametrosSugeridos } });
    } catch (erro) {
      const codigoOriginal = (erro as { code?: unknown })?.code;
      const http = erro instanceof Error ? erro.message.match(/HTTP (\d{3})/)?.[1] : undefined;
      const codigo = erro instanceof ErroTesteFiscal || erro instanceof ErroXmlReferencia ? erro.codigo
        : typeof codigoOriginal === 'string' && /^[A-Z0-9_]{1,40}$/.test(codigoOriginal) ? codigoOriginal
        : http ? `ADN_HTTP_${http}` : 'BUSCA_REFERENCIA_FALHOU';
      registrar(s, { etapa: 'busca_referencia_falhou', codigo }); encerrar(id);
      if (erro instanceof ErroTesteFiscal) throw erro;
      if (erro instanceof ErroXmlReferencia) throw new ErroTesteFiscal(422, erro.codigo, erro.message);
      throw new ErroTesteFiscal(502, codigo, http
        ? `A consulta ao ADN não foi concluída (HTTP ${http}). Confira o acesso do certificado ao ambiente nacional.`
        : 'Não foi possível consultar a referência fiscal no ADN. Confira o certificado e tente novamente mais tarde.');
    }
  }));
  router.post('/preparar', rota(async (req, res) => {
    const d = preparoSchema.parse(req.body), s = obter(d.sessaoId);
    if (!s.fiscal || !s.servico) throw new ErroTesteFiscal(409, 'REFERENCIA_PENDENTE', 'Aguarde a extração da referência.');
    const data = new Date(`${d.competencia}T12:00:00Z`), hoje = agora().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
    if (!Number.isFinite(data.getTime()) || data.toISOString().slice(0, 10) !== d.competencia || d.competencia > hoje) {
      throw new ErroTesteFiscal(400, 'COMPETENCIA_INVALIDA', 'Informe uma data válida de consulta, até hoje.');
    }
    if ([...s.tentativas.values()].some(t => t.estado === 'enviando' || t.estado === 'resultado_incerto')) {
      throw new ErroTesteFiscal(409, 'RESULTADO_PENDENTE', 'Há um envio sem resultado confirmado nesta sessão. Consulte o histórico antes de iniciar outra emissão.');
    }
    if (s.tentativas.size >= 5) throw new ErroTesteFiscal(429, 'LIMITE_TENTATIVAS', 'Encerre a sessão e inicie outro teste.');
    const meta = s.fiscal.dadosReformaTributaria;
    const original = parametrosEmissaoSchema.safeParse({ ...(meta.parametrosSugeridos as object), vigenciaInicio: d.competencia });
    const pendencias = [...(meta.pendencias as string[] || [])];
    if (!original.success) pendencias.push(...original.error.issues.map(e => `${e.path.join('.')}: ${e.message}`));
    if (original.success) pendencias.push(...validarReferenciaFiscal({ ...meta, hash: s.hash }, { referenciaHash: s.hash,
      fidelidadeReferencia: true, ctribNac: s.servico.ctribNac, ctribMun: s.servico.ctribMun, cnbs: s.servico.cnbs, parametros: original.data }));
    if (pendencias.length || !original.success) throw new ErroTesteFiscal(422, 'REFERENCIA_FISCAL_PENDENTE', 'A referência tem pendências que também impedem o teste de emissão.', pendencias);
    // Única diferença em relação às regras extraídas: ambiente de transmissão.
    // Esta política existe somente na sessão e nunca é salva no perfil do médico.
    const p: ParametrosEmissao = { ...original.data, ambiente: 'homologacao' };
    const cfg: ConfigPrestador = { cnpj: s.fiscal.cnpj, im: s.fiscal.inscricaoMunicipal, codMunicipio: s.fiscal.codMunicipioIbge,
      ambiente: 2, serie: d.serieDps, pTotTribSN: p.percentualTotTribSN ?? 0,
      regTrib: { opSimpNac: ({ nao_optante: 1, mei: 2, me_epp: 3 } as const)[p.opcaoSimplesNacional],
        regApTribSN: ({ regime_1: 1, regime_2: 2, regime_3: 3 } as const)[p.regimeApuracaoSn ?? 'regime_1'], regEspTrib: p.regimeEspecialTributacao } };
    const input: EmissaoInput = { nDPS: d.numeroDps, tomador: { CPF: d.cpfPaciente, xNome: d.nomePaciente }, xDescServ: d.descricao,
      vServ: d.valorCentavos / 100, cTribNac: s.servico.ctribNac, cTribMun: s.servico.ctribMun ?? undefined,
      cNBS: s.servico.cnbs ?? '', cIndOp: p.ibscbs?.cIndOp ?? '', cClassTrib: p.ibscbs?.cClassTrib ?? '', fiscal: { ...p, competencia: d.competencia } };
    const erros = validarDadosDps(input, cfg);
    if (!/^\d{6}$/.test(input.cTribNac) || (input.cTribMun && !/^\d{3}$/.test(input.cTribMun)) || (input.cNBS && !/^\d{9}$/.test(input.cNBS))) {
      throw new ErroTesteFiscal(422, 'SERVICO_INVALIDO', 'Os códigos do serviço extraído precisam de revisão.');
    }
    if (erros.length) throw new ErroTesteFiscal(400, 'DADOS_DPS_INVALIDOS', 'Confira os dados da nova consulta.', erros.map(e => e.mensagem));
    for (const outra of sessoes.values()) if (outra.fiscal?.cnpj === s.fiscal.cnpj && [...outra.tentativas.values()].some(t => t.serie === d.serieDps && t.numero === d.numeroDps)) {
      throw new ErroTesteFiscal(409, 'DPS_JA_PREPARADA', 'Esta série e número já foram usados na sessão de teste. Confira o resultado antes de preparar outra DPS.');
    }
    const chaves = extrairChavesCertificado(s.pfx, s.senha);
    if (!chaves.validoAte || chaves.validoAte.getTime() <= agora().getTime()) throw new ErroTesteFiscal(422, 'A1_VENCIDO', 'O certificado expirou.');
    const gerado = gerarXmlDps(input, cfg, agora());
    const assinado = assinarXmlDps({ xml: gerado.xml, dpsId: gerado.dpsId, ...chaves });
    const tentativa: Tentativa = { id: randomUUID(), estado: 'preparada', serie: d.serieDps, numero: d.numeroDps, xmlDpsAssinado: assinado };
    s.tentativas.set(tentativa.id, tentativa); registrar(s, { etapa: 'dps_preparada', tentativaId: tentativa.id, estado: tentativa.estado });
    res.json({ ok: true, ambiente: 'homologacao', tentativaId: tentativa.id, estado: tentativa.estado, xmlDpsAssinado: assinado });
  }));
  router.post('/emitir', rota(async (req, res) => {
    const d = envioSchema.parse(req.body), s = obter(d.sessaoId), t = s.tentativas.get(d.tentativaId);
    if (!t) throw new ErroTesteFiscal(404, 'TENTATIVA_NAO_ENCONTRADA', 'Prepare uma DPS nesta sessão antes de enviar.');
    if (t.estado === 'enviando') throw new ErroTesteFiscal(409, 'ENVIO_EM_ANDAMENTO', 'O envio já está em andamento. Consulte o resultado sem enviar novamente.');
    if (t.resultado) { res.json(t.resultado); return; }
    t.estado = 'enviando'; registrar(s, { etapa: 'transmissao', tentativaId: t.id, estado: t.estado });
    let retorno: ResultadoTransmissaoSefin;
    try { retorno = await sefin.transmitirDps({ xmlAssinado: t.xmlDpsAssinado, pfxBuffer: s.pfx, senhaCertificado: s.senha, ambiente: 2 }); }
    catch { retorno = { sucesso: false, motivo: 'A conexão terminou sem confirmação do resultado.' }; }
    t.estado = retorno.sucesso ? 'autorizada' : retorno.codigoErro && retorno.httpStatus && retorno.httpStatus >= 400 ? 'rejeitada' : 'resultado_incerto';
    let xmlNota: string | undefined;
    if (retorno.sucesso && !/<!DOCTYPE|<!ENTITY/i.test(retorno.xmlAutorizado) && XMLValidator.validate(retorno.xmlAutorizado) === true) {
      const obj = new XMLParser({ removeNSPrefix: true, parseTagValue: false }).parse(retorno.xmlAutorizado);
      if (obj.NFSe?.infNFSe) xmlNota = retorno.xmlAutorizado;
    }
    t.resultado = retorno.sucesso ? { ok: true, ambiente: 'homologacao', estado: t.estado, chaveAcesso: retorno.chaveAcesso,
      numeroNfse: retorno.numeroNfse, protocolo: retorno.protocoloAutorizacao, xmlNota,
      detalhe: xmlNota ? 'Nota autorizada em homologação.' : 'Autorização informada pela SEFIN; o XML da NFS-e não foi retornado.' }
      : { ok: true, ambiente: 'homologacao', estado: t.estado, codigoErro: retorno.codigoErro, httpStatus: retorno.httpStatus,
        detalhe: t.estado === 'rejeitada' ? retorno.motivo : 'O envio terminou sem confirmação. Não retransmitimos esta tentativa automaticamente.', respostaProvedor: retorno.respostaRaw };
    registrar(s, { etapa: 'resultado', tentativaId: t.id, estado: t.estado, ...(!retorno.sucesso ? { codigo: retorno.codigoErro } : {}) });
    res.json(t.resultado);
  }));
  router.get('/sessoes/:id', rota((req, res) => {
    const s = obter(z.string().uuid().parse(req.params.id));
    res.json({ ok: true, expiraEm: new Date(s.expira).toISOString(), eventos: s.eventos,
      tentativas: [...s.tentativas.values()].map(t => ({ tentativaId: t.id, estado: t.estado, serie: t.serie, numero: t.numero,
        xmlDpsAssinado: t.xmlDpsAssinado, resultado: t.resultado })) });
  }));
  router.delete('/sessoes/:id', rota((req, res) => {
    const id = z.string().uuid().parse(req.params.id), s = obter(id);
    if ([...s.tentativas.values()].some(t => t.estado === 'enviando')) throw new ErroTesteFiscal(409, 'ENVIO_EM_ANDAMENTO', 'Aguarde o resultado antes de encerrar a sessão.');
    registrar(s, { etapa: 'sessao_encerrada' }); encerrar(id); res.json({ ok: true });
  }));
  return router;
}
