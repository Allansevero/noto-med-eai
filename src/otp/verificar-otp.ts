/**
 * Caso de uso: Verificação do código OTP digitado pelo usuário.
 * Valida integridade do hash com pepper, expiração e número de tentativas,
 * marcando o registro como verificado sem manter código em texto puro.
 */

import { compararHashOtp } from './hash-otp.js';
import { otpEstaExpirado, excedeuTentativasOtp } from './limite-otp.js';
import { LIMITE_TENTATIVAS_OTP } from './otp-config.js';
import type { OtpRepositorio } from './otp-repositorio.js';

export interface VerificarOtpDeps {
  repositorio: OtpRepositorio;
  pepper: string;
  agora?: () => Date;
}

export type ResultadoVerificarOtp =
  | { ok: true; telefone: string }
  | {
      ok: false;
      motivo: 'codigo_invalido' | 'nao_encontrado' | 'expirado' | 'bloqueado_tentativas' | 'incorreto';
      detalhe?: string;
      tentativasRestantes?: number;
    };

export async function verificarOtp(
  telefone: string,
  codigo: string,
  deps: VerificarOtpDeps
): Promise<ResultadoVerificarOtp> {
  const telefoneLimpo = telefone.replace(/\D/g, '');
  const codigoLimpo = codigo.trim();

  if (!/^\d{4,8}$/.test(codigoLimpo)) {
    return { ok: false, motivo: 'codigo_invalido', detalhe: 'Código deve conter apenas dígitos' };
  }

  const registro = await deps.repositorio.buscarUltimoPorTelefone(telefoneLimpo);
  if (!registro || registro.verificadoEm !== null) {
    return { ok: false, motivo: 'nao_encontrado', detalhe: `Nenhum código pendente para ${telefoneLimpo}` };
  }

  if (excedeuTentativasOtp(registro.tentativas, LIMITE_TENTATIVAS_OTP)) {
    return { ok: false, motivo: 'bloqueado_tentativas', detalhe: 'Limite de tentativas excedido' };
  }

  const dataAtual = deps.agora ? deps.agora() : new Date();
  if (otpEstaExpirado(registro.expiraEm, dataAtual)) {
    return { ok: false, motivo: 'expirado', detalhe: 'Código expirado' };
  }

  const confere = compararHashOtp(codigoLimpo, registro.codigoHash, deps.pepper);
  if (!confere) {
    const novasTentativas = registro.tentativas + 1;
    await deps.repositorio.incrementarTentativas(registro.id);
    const tentativasRestantes = Math.max(0, LIMITE_TENTATIVAS_OTP - novasTentativas);
    return { ok: false, motivo: 'incorreto', detalhe: 'Código incorreto', tentativasRestantes };
  }

  await deps.repositorio.marcarVerificado(registro.id, dataAtual);
  return { ok: true, telefone: telefoneLimpo };
}
