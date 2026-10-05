/**
 * Lê o grupo declaratório da DPS, não o grupo calculado da NFS-e.
 * Campos fora do subconjunto suportado são identificados, nunca descartados em silêncio.
 */
import { ibscbsSchema } from '../../fiscal/preparacao/ibscbs.js';

export function extrairIbscbsReferencia(dps: any) {
  const grupo = dps.IBSCBS;
  const pendencias: string[] = [];
  if (grupo === undefined) {
    if (dps.gIBSCBS || dps.valores?.gIBSCBS) pendencias.push('Grupo IBS/CBS fora do caminho nacional suportado.');
    return { presente: false, parametros: undefined, pendencias };
  }
  const conferir = (obj: any, permitidos: string[], caminho: string) => {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) { pendencias.push(`${caminho}: grupo inválido.`); return; }
    for (const campo of Object.keys(obj)) {
      if (!campo.startsWith('@_') && !permitidos.includes(campo)) pendencias.push(`${caminho}/${campo}: campo ainda não suportado.`);
    }
  };
  conferir(grupo, ['finNFSe', 'indFinal', 'cIndOp', 'indDest', 'valores'], 'IBSCBS');
  conferir(grupo?.valores, ['trib'], 'IBSCBS/valores');
  conferir(grupo?.valores?.trib, ['gIBSCBS'], 'IBSCBS/valores/trib');
  const trib = grupo?.valores?.trib?.gIBSCBS;
  conferir(trib, ['CST', 'cClassTrib'], 'IBSCBS/valores/trib/gIBSCBS');
  const dados = { finNFSe: grupo?.finNFSe, indFinal: grupo?.indFinal, cIndOp: grupo?.cIndOp,
    indDest: grupo?.indDest, CST: trib?.CST, cClassTrib: trib?.cClassTrib };
  const validado = ibscbsSchema.safeParse(dados);
  if (!validado.success) for (const erro of validado.error.issues) pendencias.push(`IBSCBS/${erro.path.join('/')}: valor ausente, inválido ou operação não suportada.`);
  return { presente: true, parametros: validado.success ? validado.data : undefined, pendencias };
}
