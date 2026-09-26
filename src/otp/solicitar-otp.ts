/**
 * Caso de uso: Solicitação de código OTP para autenticação por WhatsApp.
 * Orquestra regras puras de validação, limites e hashing com as portas
 * de persistência e envio via Evolution API oficial.
 */

import { gerarCodigoOtp } from './gerar-codigo-otp.js';
import { gerarHashOtp } from './hash-otp.js';
import { estaEmCooldownReenvio, calcularDataExpiracao } from './limite-otp.js';
import { COOLDOWN_REENVIO_SEGUNDOS, TTL_OTP_MINUTOS } from './otp-config.js';
import type { OtpRepositorio } from './otp-repositorio.js';
import type { EnviarOtpWhatsapp } from './enviar-otp-whatsapp.js';

export interface SolicitarOtpDeps {
  repositorio: OtpRepositorio;
  enviador: EnviarOtpWhatsapp;
  pepper: string;
  agora?: () => Date;
}

export type ResultadoSolicitarOtp =
  | { ok: true; expiraEm: Date }
  | { ok: false; motivo: 'telefone_invalido' | 'em_cooldown' | 'falha_envio'; detalhe?: string };

export async function solicitarOtp(
  telefone: string,
  deps: SolicitarOtpDeps
): Promise<ResultadoSolicitarOtp> {
  const telefoneSanitizado = telefone.replace(/\D/g, '');
  if (telefoneSanitizado.length < 10 || telefoneSanitizado.length > 14) {
    return { ok: false, motivo: 'telefone_invalido', detalhe: `Telefone inválido: ${telefone}` };
  }

  const dataAtual = deps.agora ? deps.agora() : new Date();
  const ultimoRegistro = await deps.repositorio.buscarUltimoPorTelefone(telefoneSanitizado);

  if (ultimoRegistro && estaEmCooldownReenvio(ultimoRegistro.criadoEm, COOLDOWN_REENVIO_SEGUNDOS, dataAtual)) {
    return { ok: false, motivo: 'em_cooldown', detalhe: `Aguarde ${COOLDOWN_REENVIO_SEGUNDOS}s para solicitar novamente` };
  }

  const codigo = gerarCodigoOtp();
  const codigoHash = gerarHashOtp(codigo, deps.pepper);
  const expiraEm = calcularDataExpiracao(TTL_OTP_MINUTOS, dataAtual);

  await deps.repositorio.salvar({
    telefone: telefoneSanitizado,
    codigoHash,
    expiraEm,
    criadoEm: dataAtual
  });

  const envio = await deps.enviador.enviar({ telefone: telefoneSanitizado, codigo });
  if (!envio.sucesso) {
    return { ok: false, motivo: 'falha_envio', detalhe: envio.erro };
  }

  return { ok: true, expiraEm };
}
