import { normalizarResultadoAgenda, type EntradaFonteAgenda, type FonteAgenda, type RepositorioConsultasSincronizadas } from './fonte-agenda.js';

/** Coordena apenas as duas portas; a transformação determinística não faz I/O. */
export async function sincronizarAgenda(entrada: EntradaFonteAgenda, fonte: FonteAgenda, repositorio: RepositorioConsultasSincronizadas) {
  const resultado = normalizarResultadoAgenda(await fonte.consultar({ medicoId: entrada.medicoId, referenciaCofre: entrada.referenciaCofre }));
  if (resultado.tipo === 'consultas') await repositorio.salvar(entrada.medicoId, resultado.fonte, resultado.consultas);
  return resultado;
}
