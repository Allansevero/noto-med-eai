/**
 * Regras verificáveis ligam a rejeição a uma correção estreita. O LLM não pode
 * inventar códigos, escolher regime tributário nem ampliar a edição de XML.
 */
import type { FalhaEmissao } from './investigacao.js';

export const BLOCO_FEDERAL_AUTOMATICO = '<tribFed><piscofins><CST>08</CST></piscofins></tribFed>';
export function podeCorrigirTributosFederais(falha: FalhaEmissao): boolean {
  const raw = falha.respostaSefinRaw;
  const erros = raw?.erros ?? raw?.mensagens;
  return falha.codigoErroSefin === 'E0676' && falha.httpStatus === 422 &&
    Array.isArray(erros) && erros.length === 1 &&
    (erros[0]?.codigo ?? erros[0]?.Codigo) === 'E0676' &&
    typeof falha.xmlDpsOriginal === 'string' &&
    falha.xmlDpsOriginal.split(BLOCO_FEDERAL_AUTOMATICO).length === 2 &&
    typeof falha.contextoTecnico?.dataGeracao === 'string' &&
    Number.isSafeInteger(falha.contextoTecnico?.ndps) && Number(falha.contextoTecnico?.ndps) > 0 &&
    Number.isFinite(Date.parse(String(falha.contextoTecnico?.dataGeracao)));
}

const DIAGNOSTICOS: Record<string, string> = {
  E0676: 'SEFIN informa que o bloco de tributos federais não pode constar nesta DPS porque identifica o emitente como MEI na competência. Remover somente o bloco automático, sem redefinir regime.',
  E0710: 'Rejeição relacionada às informações de tributos de MEI. Conferir retorno completo e configuração; nenhuma correção cadastrada para este código.',
  E0160: 'O enquadramento informado diverge do cadastro na competência. Consultar enquadramento oficial; não alternar regimes por tentativa.',
  E0014: 'A DPS já está associada a uma NFS-e. Recuperar a autorização daquela DPS; não avançar numeração.',
  E0166: 'Verificar regime de apuração do Simples Nacional já confirmado no cadastro. Não inventar opção de apuração.',
  E0116: 'Verificar inscrição municipal do prestador no cadastro oficial e no perfil.'
};
export function diagnosticarRejeicao(falha: FalhaEmissao): string {
  return DIAGNOSTICOS[falha.codigoErroSefin ?? ''] ?? 'Sem regra de correção verificada para este retorno. Investigar evidências disponíveis; não inferir dados fiscais.';
}

/** Somente campos de diagnóstico: não encaminha XML, certificado nem Complemento. */
export function descreverRetornoProvedor(falha: FalhaEmissao): Array<{ codigo: string; mensagem: string }> {
  const erros = falha.respostaSefinRaw?.erros ?? falha.respostaSefinRaw?.mensagens;
  if (!Array.isArray(erros)) return [];
  return erros.slice(0, 5).filter(e => e && typeof e === 'object').map(e => ({
    codigo: String(e.codigo ?? e.Codigo ?? '').slice(0, 30),
    mensagem: String(e.descricao ?? e.Descricao ?? e.mensagem ?? e.Mensagem ?? '')
      .replace(/<[^>]*>/g, '[XML]')
      .replace(/[\w.+-]+@[\w.-]+\.[a-zA-Z]{2,}/g, '[email]')
      .replace(/\b\d[\d.\/ -]{9,}\d\b/g, '[identificador]')
      .replace(/"[^"\n]*"|'[^'\n]*'/g, '[valor informado]')
      .slice(0, 800)
  }));
}
