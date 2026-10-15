/**
 * Liga SIGTERM/SIGINT e erros globais ao encerramento gracioso. Em separado de
 * `encerrar-gracioso.ts` porque mexe no objeto `process`: recebê-lo por
 * parâmetro permite testar com um EventEmitter em vez do processo real.
 */

import type { Encerrar } from './encerrar-gracioso.js';

export interface ProcessoObservavel {
  on(evento: string, ouvinte: (...args: any[]) => void): unknown;
}

export function registrarSinaisDeProcesso(processo: ProcessoObservavel, encerrar: Encerrar): void {
  processo.on('SIGTERM', () => void encerrar('SIGTERM', 0));
  processo.on('SIGINT', () => void encerrar('SIGINT', 0));

  // Promessa rejeitada isolada não corrompe o estado: registra e segue atendendo os demais médicos.
  processo.on('unhandledRejection', (motivo: unknown) => {
    console.error('[Processo] Promessa rejeitada sem tratamento:', motivo);
  });

  // Exceção síncrona solta deixa o estado indefinido: encerra de forma ordenada e o orquestrador reinicia.
  processo.on('uncaughtException', (erro: Error) => {
    console.error('[Processo] Exceção não capturada:', erro);
    void encerrar('uncaughtException', 1);
  });
}
