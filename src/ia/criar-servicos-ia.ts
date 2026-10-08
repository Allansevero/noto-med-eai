/** Composição única compartilhada pelo servidor e pelos dois workers. */
import type { AppConfig } from '../config.js';
import { NvidiaApiClient, NvidiaDecisorFiscal, NvidiaDecisorTribemd, NvidiaGeradorMensagemNoto } from '../io/nvidia/adaptadores.js';
import { NvidiaMapeadorColunas } from '../integracoes/google-planilhas/nvidia-mapeador-colunas.js';

export function criarServicosIa(config: Pick<AppConfig, 'nvidiaApiKey' | 'nvidiaModel' | 'nvidiaVisionModel'>) {
  const chave = config.nvidiaApiKey || '';
  return {
    geradorMensagem: new NvidiaGeradorMensagemNoto(chave, config.nvidiaModel),
    extrator: new NvidiaApiClient({ apiKey: chave, modelo: config.nvidiaModel }),
    decisorFiscal: new NvidiaDecisorFiscal(chave, config.nvidiaModel),
    decisorTribemd: new NvidiaDecisorTribemd(chave, config.nvidiaModel, config.nvidiaVisionModel || config.nvidiaModel),
    mapeadorPlanilhas: chave ? new NvidiaMapeadorColunas(chave, config.nvidiaModel) : undefined
  };
}
