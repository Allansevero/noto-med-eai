/**
 * Casamento de respostas rápidas da conversa do médico via WhatsApp.
 * Não faz parsing de barras (/agendado); casa a frase natural enviada pelo
 * próprio médico (fromMe: true) contra as frases cadastradas (seção 3 do plano).
 */

import { extrairValorMoedaCentavos } from './extrair-valor-moeda.js';
import { extrairDatasConsulta } from '../emissao/regras/extrair-datas-consulta.js';
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
  | { casou: true; tipo: 'agendado'; textoComando?: string }
  | {
      casou: true;
      tipo: 'emissao';
      valorDigitadoCentavos: number | null;
      datas?: Date[];
      datasTexto?: string | null;
      textoComando?: string;
    }
  | { casou: false; motivo: 'nao_e_from_me' | 'sem_texto' | 'nenhum_modelo_casado' };

export function casarRespostaRapida(
  texto: string | null | undefined,
  fromMe: boolean,
  modelosCadastrados?: RespostaRapidaModelo[]
): ResultadoCasamento {
  if (!fromMe) return { casou: false, motivo: 'nao_e_from_me' };
  if (!texto || !texto.trim()) return { casou: false, motivo: 'sem_texto' };

  const textoLimpo = texto.trim();
  const textoNormalizado = textoLimpo.toLowerCase();
  const modelos = modelosCadastrados && modelosCadastrados.length > 0
    ? modelosCadastrados
    : [
        { tipo: 'agendado' as const, textoModelo: TEXTO_MODELO_PADRAO_AGENDADO },
        { tipo: 'emissao' as const, textoModelo: TEXTO_MODELO_PADRAO_EMISSAO }
      ];

  // 1. Checagem de Agendado (modelo padrão 'Consulta agendada!' ou atalhos /agendamento, /agendado)
  const modeloAgendado = modelos.find((m) => m.tipo === 'agendado');
  if (modeloAgendado) {
    const alvo = modeloAgendado.textoModelo.toLowerCase().trim();
    if (
      textoNormalizado.includes(alvo) ||
      textoNormalizado.startsWith('/agendamento') ||
      textoNormalizado.startsWith('/agendado')
    ) {
      return { casou: true, tipo: 'agendado' };
    }
  }

  // 2. Checagem de Emissão por modelo cadastrado ('Vou enviar em instantes a sua NF no valor de R$')
  const modeloEmissao = modelos.find((m) => m.tipo === 'emissao');
  if (modeloEmissao) {
    const alvo = modeloEmissao.textoModelo.toLowerCase().trim();
    const indice = textoNormalizado.indexOf(alvo);
    if (indice !== -1) {
      const resto = textoLimpo.slice(indice + alvo.length);
      const valorDigitadoCentavos = extrairValorMoedaCentavos(resto);
      const extracaoDatas = extrairDatasConsulta(textoLimpo);
      return {
        casou: true,
        tipo: 'emissao',
        valorDigitadoCentavos,
        datas: extracaoDatas.datas,
        datasTexto: extracaoDatas.textoFormatado,
        textoComando: textoLimpo
      };
    }
  }

  // 3. Fallback inteligente para variações de emissão da NF
  // Ex: "Vou enviar em instantes a sua NF no valor de R$ 350", "sua NF no valor de R$ 200" ou "/emissao 200" / "/emissão 200"
  const regexEmissaoNatural = /(?:vou(?:\s+lhe)?\s+enviar\s+(?:em\s+instantes?\s+)?(?:a\s+)?sua\s+nf(?:\s+no\s+valor\s+de\s*(?:r\$)?)?|\/emiss[aã]o)/i;
  const match = textoLimpo.match(regexEmissaoNatural);
  if (match && match.index !== undefined) {
    const resto = textoLimpo.slice(match.index + match[0].length);
    const valorDigitadoCentavos = extrairValorMoedaCentavos(resto);
    const extracaoDatas = extrairDatasConsulta(textoLimpo);
    return {
      casou: true,
      tipo: 'emissao',
      valorDigitadoCentavos,
      datas: extracaoDatas.datas,
      datasTexto: extracaoDatas.textoFormatado,
      textoComando: textoLimpo
    };
  }

  return { casou: false, motivo: 'nenhum_modelo_casado' };
}

