/**
 * Router Express para a API pública de emissão e consulta de NFS-e.
 * Compatível com o padrão de chamadas da Focus NFe (Basic Auth / Bearer / Query Token)
 * e com a semântica Zero-Config do Notomed Whats.
 */

import { Router, type Request, type Response, type NextFunction } from 'express';
import type { EmissaoApiRepositorio } from './emissao-api-repositorio.js';
import { processarSolicitacaoEmissaoApi } from './processar-solicitacao-emissao-api.js';
import { consultarSolicitacaoPorRef } from './consultar-solicitacao-por-ref.js';
import type { RespostaEmissaoApi } from './nfse-api-types.js';

export interface NfseRouterDeps {
  repositorio: EmissaoApiRepositorio;
  autenticar: (token: string) => Promise<string | null>;
}

export function criarRouterNfse(deps: NfseRouterDeps): Router {
  const router = Router();

  const middlewareAuth = async (req: Request, res: Response, next: NextFunction) => {
    const token = extrairToken(req);
    if (!token) {
      return res.status(401).json({
        codigo: 'nao_autorizado',
        mensagem: 'Autenticação necessária. Forneça o token via Basic Auth, Bearer ou query param ?token='
      });
    }

    const medicoId = await deps.autenticar(token);
    if (!medicoId) {
      return res.status(401).json({
        codigo: 'nao_autorizado',
        mensagem: 'Token de autenticação inválido ou médico não localizado'
      });
    }

    (req as any).medicoId = medicoId;
    next();
  };

  router.use(middlewareAuth);

  router.post('/', async (req: Request, res: Response) => {
    tratarRequisicaoEmissao(req, res, deps.repositorio);
  });

  router.get('/:ref', async (req: Request, res: Response) => {
    tratarRequisicaoConsulta(req, res, deps.repositorio);
  });

  return router;
}

async function tratarRequisicaoEmissao(
  req: Request,
  res: Response,
  repo: EmissaoApiRepositorio
): Promise<void> {
  const refQuery = typeof req.query['ref'] === 'string' ? req.query['ref'].trim() : undefined;
  const corpo = {
    ...req.body,
    ref: req.body?.ref || refQuery,
    medicoId: (req as any).medicoId
  };

  const resposta = await processarSolicitacaoEmissaoApi(corpo, { repositorio: repo });
  if (!resposta.ok) {
    res.status(resposta.statusHttp).json(resposta.erro);
    return;
  }

  const payloadFormatado = formatarRespostaInteroperavel(resposta.resposta);
  res.status(resposta.statusHttp).json(payloadFormatado);
}

async function tratarRequisicaoConsulta(
  req: Request,
  res: Response,
  repo: EmissaoApiRepositorio
): Promise<void> {
  const refParam = req.params['ref'];
  const refQuery = req.query['ref'];
  const ref = typeof refParam === 'string' ? refParam : typeof refQuery === 'string' ? refQuery : '';
  const medicoId = (req as any).medicoId;

  const resultado = await consultarSolicitacaoPorRef({ medicoId, ref }, repo);
  if (!resultado.ok) {
    res.status(resultado.statusHttp).json(resultado.erro);
    return;
  }

  const payloadFormatado = formatarRespostaInteroperavel(resultado.dados);
  res.status(200).json(payloadFormatado);
}

function extrairToken(req: Request): string | null {
  const authHeader = req.headers['authorization'];
  if (authHeader) {
    if (authHeader.startsWith('Basic ')) {
      const decoded = Buffer.from(authHeader.slice(6).trim(), 'base64').toString('utf8');
      const token = decoded.split(':')[0];
      if (token && token.trim().length > 0) return token.trim();
    }
    if (authHeader.startsWith('Bearer ')) {
      const token = authHeader.slice(7).trim();
      if (token.length > 0) return token;
    }
  }

  const headerApiKey = req.headers['x-api-key'] || req.headers['x-token'];
  if (typeof headerApiKey === 'string' && headerApiKey.trim().length > 0) {
    return headerApiKey.trim();
  }

  if (typeof req.query['token'] === 'string' && req.query['token'].trim().length > 0) {
    return req.query['token'].trim();
  }

  return null;
}

function formatarRespostaInteroperavel(res: RespostaEmissaoApi): Record<string, unknown> {
  if (res.status === 'processando_autorizacao') {
    return {
      status: res.status,
      ref: res.ref,
      referencia: res.ref,
      solicitacao_id: res.solicitacaoId,
      solicitacaoId: res.solicitacaoId,
      mensagem: res.mensagem
    };
  }

  if (res.status === 'autorizado') {
    return {
      status: res.status,
      ref: res.ref,
      referencia: res.ref,
      solicitacao_id: res.solicitacaoId,
      solicitacaoId: res.solicitacaoId,
      chave_acesso: res.chaveAcesso,
      chaveAcesso: res.chaveAcesso,
      ndps: res.ndps,
      numero: String(res.ndps),
      serie: res.serie,
      data_emissao: res.dataEmissao,
      dataEmissao: res.dataEmissao,
      caminho_xml_nota_fiscal: res.xmlStoragePath,
      xmlStoragePath: res.xmlStoragePath,
      caminho_danfse: res.pdfStoragePath,
      url_danfse: res.pdfStoragePath,
      pdfStoragePath: res.pdfStoragePath,
      erros: []
    };
  }

  if (res.status === 'cancelado') {
    return {
      status: res.status,
      ref: res.ref,
      referencia: res.ref,
      solicitacao_id: res.solicitacaoId,
      solicitacaoId: res.solicitacaoId,
      mensagem: res.mensagem
    };
  }

  return {
    status: res.status,
    ref: res.ref,
    referencia: res.ref,
    solicitacao_id: res.solicitacaoId,
    solicitacaoId: res.solicitacaoId,
    erros: res.erros
  };
}
