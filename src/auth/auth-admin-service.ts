/**
 * Porta para a Admin API do Supabase (service role).
 * Permite que a aplicação orquestre a criação de contas/usuários e gere
 * a sessão autenticada (auth.users) após a confirmação do OTP (seção 4.6 do plano).
 */

export interface UsuarioAutenticadoInfo {
  usuarioId: string;
  authUserId: string;
  papel: 'medico' | 'secretaria' | 'contador' | 'admin';
  ehNovoUsuario: boolean;
}

export interface SessaoUsuarioResult {
  usuario: UsuarioAutenticadoInfo;
  tokenAcesso: string;
  urlRedirecionamento?: string;
}

export interface AuthAdminService {
  buscarPorTelefone(telefone: string): Promise<UsuarioAutenticadoInfo | null>;
  cadastrarNovoMedico(params: {
    telefone: string;
    nomePadrao?: string;
  }): Promise<UsuarioAutenticadoInfo>;
  gerarSessaoParaUsuario(authUserId: string): Promise<{ tokenAcesso: string; urlRedirecionamento?: string }>;
}
