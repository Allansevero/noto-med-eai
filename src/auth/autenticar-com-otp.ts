/**
 * Caso de uso: Autenticação/Cadastro unificado por OTP e sessão Supabase Auth.
 * Valida o código OTP e converte o telefone verificado em uma sessão real
 * no Supabase Auth via Admin API (service role), mantendo RLS intacta (seção 4.6).
 */

import { verificarOtp } from '../otp/verificar-otp.js';
import type { OtpRepositorio } from '../otp/otp-repositorio.js';
import type { AuthAdminService, SessaoUsuarioResult } from './auth-admin-service.js';

export interface AutenticarComOtpDeps {
  otpRepositorio: OtpRepositorio;
  authAdminService: AuthAdminService;
  pepper: string;
  agora?: () => Date;
}

export type ResultadoAutenticarOtp =
  | { ok: true; sessao: SessaoUsuarioResult }
  | { ok: false; motivo: string; tentativasRestantes?: number };

export async function autenticarComOtp(
  telefone: string,
  codigo: string,
  deps: AutenticarComOtpDeps
): Promise<ResultadoAutenticarOtp> {
  const verificacao = await verificarOtp(telefone, codigo, {
    repositorio: deps.otpRepositorio,
    pepper: deps.pepper,
    agora: deps.agora
  });

  if (!verificacao.ok) {
    return { ok: false, motivo: verificacao.motivo, tentativasRestantes: verificacao.tentativasRestantes };
  }

  const telefoneLimpo = verificacao.telefone;
  let usuario = await deps.authAdminService.buscarPorTelefone(telefoneLimpo);
  if (!usuario) {
    usuario = await deps.authAdminService.cadastrarNovoMedico({ telefone: telefoneLimpo });
  }

  const sessaoSupabase = await deps.authAdminService.gerarSessaoParaUsuario(usuario.authUserId);

  return {
    ok: true,
    sessao: {
      usuario,
      tokenAcesso: sessaoSupabase.tokenAcesso,
      urlRedirecionamento: sessaoSupabase.urlRedirecionamento
    }
  };
}
