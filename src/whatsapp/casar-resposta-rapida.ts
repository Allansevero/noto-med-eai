/**
 * Casamento de respostas rápidas da conversa do médico via WhatsApp.
 * Não faz parsing de barras (/agendado); casa a frase natural enviada pelo
 * próprio médico (fromMe: true) contra as frases cadastradas (seção 3 do plano).
 */

import { extrairValorMoedaCentavos } from './extrair-valor-moeda.js';
import {
  TEXTO_MODELO_PADRAO_AGENDADO,
  TEXTO_MODELO_PADRAO_EMISSAO,
  type TipoRespostaRapida
} from './whatsapp-config.js';

export interface RespostaRapidaModelo {
  tipo: TipoRespostaRapida;
  textoModelo: string;
}

export type ResultadoCasamento =
  | { casou: true; tipo: 'agendado' }
  | { casou: true; tipo: 'emissao'; valorDigitadoCentavos: number | null }
  | { casou: false; motivo: 'nao_e_from_me' | 'sem_texto' | 'nenhum_modelo_casado' };

export function casarRespostaRapida(
  texto: string | null | undefined,
  fromMe: boolean,
  modelosCadastrados?: RespostaRapidaModelo[]
): ResultadoCasamento {
  if (!fromMe) return { casou: false, motivo: 'nao_e_from_me' };
  if (!texto || !texto.trim()) return { casou: false, motivo: 'sem_texto' };

  const textoNormalizado = texto.trim().toLowerCase();
  const modelos = modelosCadastrados && modelosCadastrados.length > 0
    ? modelosCadastrados
    : [
        { tipo: 'agendado' as const, textoModelo: TEXTO_MODELO_PADRAO_AGENDADO },
        { tipo: 'emissao' as const, textoModelo: TEXTO_MODELO_PADRAO_EMISSAO }
      ];

  const modeloAgendado = modelos.find((m) => m.tipo === 'agendado');
  if (modeloAgendado && textoNormalizado.startsWith(modeloAgendado.textoModelo.toLowerCase().trim())) {
    return { casou: true, tipo: 'agendado' };
  }

  const modeloEmissao = modelos.find((m) => m.tipo === 'emissao');
  if (modeloEmissao && textoNormalizado.startsWith(modeloEmissao.textoModelo.toLowerCase().trim())) {
    const resto = texto.slice(modeloEmissao.textoModelo.length);
    const valorDigitadoCentavos = extrairValorMoedaCentavos(resto);
    return { casou: true, tipo: 'emissao', valorDigitadoCentavos };
  }

  return { casou: false, motivo: 'nenhum_modelo_casado' };
}
