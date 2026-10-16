/**
 * Decide status e corpo da resposta para erros que escapam das rotas (JSON
 * malformado, corpo grande demais, exceção inesperada). Separado do middleware
 * porque é regra pura: não conhece Express nem faz log, então testa direto.
 */

export interface RespostaErroHttp {
  status: number;
  corpo: { ok: false; detalhe: string };
}

interface ErroComStatus {
  type?: string;
  status?: number;
  statusCode?: number;
}

export function montarRespostaErroHttp(erro: unknown): RespostaErroHttp {
  const e = (erro ?? {}) as ErroComStatus;
  if (e.type === 'entity.too.large') return resposta(413, 'Corpo da requisição maior que o limite de 10 MB.');
  if (e.type === 'entity.parse.failed') return resposta(400, 'JSON inválido no corpo da requisição.');

  const status = e.status ?? e.statusCode;
  if (typeof status === 'number' && status >= 400 && status < 500) return resposta(status, 'Requisição inválida.');
  return resposta(500, 'Erro interno do servidor.');
}

function resposta(status: number, detalhe: string): RespostaErroHttp {
  return { status, corpo: { ok: false, detalhe } };
}
