/**
 * Implementação da porta `AuthAdminService` usando o cliente oficial do Supabase.
 * Cria usuários no auth.users via Admin API (service role), vincula contas
 * no banco e gera links mágicos / tokens de sessão para login por WhatsApp (seção 4.6).
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type pg from 'pg';
import type {
  AuthAdminService,
  UsuarioAutenticadoInfo
} from '../../auth/auth-admin-service.js';

export class SupabaseAuthAdminService implements AuthAdminService {
  private readonly supabase: SupabaseClient;

  constructor(
    supabaseUrl: string,
    supabaseServiceRoleKey: string,
    private readonly pool: pg.Pool
  ) {
    this.supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });
  }

  async buscarPorTelefone(telefone: string): Promise<UsuarioAutenticadoInfo | null> {
    const sql = `
      select u.id, u.auth_user_id, u.papel
      from usuarios u
      where u.telefone = $1 and u.ativo = true
      limit 1
    `;
    const { rows } = await this.pool.query(sql, [telefone]);
    if (rows.length === 0) return null;

    return {
      usuarioId: rows[0].id,
      authUserId: rows[0].auth_user_id,
      papel: rows[0].papel,
      ehNovoUsuario: false
    };
  }

  async cadastrarNovoMedico(params: {
    telefone: string;
    nomePadrao?: string;
  }): Promise<UsuarioAutenticadoInfo> {
    const emailFicticio = `medico_${params.telefone}@auth.notomed.local`;
    const nome = params.nomePadrao || `Médico ${params.telefone.slice(-4)}`;

    const { data: authData, error: authError } = await this.supabase.auth.admin.createUser({
      email: emailFicticio,
      phone: params.telefone,
      email_confirm: true,
      phone_confirm: true,
      user_metadata: { nome, papel: 'medico' }
    });

    if (authError || !authData.user) {
      throw new Error(`Falha ao criar usuário no Supabase Auth: ${authError?.message}`);
    }

    const authUserId = authData.user.id;
    const client = await this.pool.connect();
    try {
      await client.query('begin');
      const { rows: contaRows } = await client.query(
        `insert into contas (tipo, nome) values ('individual', $1) returning id`,
        [`Consultório ${nome}`]
      );
      const contaId = contaRows[0].id;

      const { rows: userRows } = await client.query(
        `insert into usuarios (auth_user_id, conta_id, papel, nome, email, telefone)
         values ($1, $2, 'medico', $3, $4, $5)
         returning id`,
        [authUserId, contaId, nome, emailFicticio, params.telefone]
      );
      const usuarioId = userRows[0].id;

      await client.query(
        `insert into medicos (usuario_id, conta_id, nome_completo) values ($1, $2, $3)`,
        [usuarioId, contaId, nome]
      );

      await client.query('commit');
      return {
        usuarioId,
        authUserId,
        papel: 'medico',
        ehNovoUsuario: true
      };
    } catch (err) {
      await client.query('rollback');
      throw err;
    } finally {
      client.release();
    }
  }

  async gerarSessaoParaUsuario(authUserId: string): Promise<{ tokenAcesso: string; urlRedirecionamento?: string }> {
    const { data, error } = await this.supabase.auth.admin.generateLink({
      type: 'magiclink',
      email: (await this.buscarEmailPorAuthId(authUserId)) || ''
    });

    if (error || !data?.properties) {
      return { tokenAcesso: `sessao_${authUserId}` };
    }

    return {
      tokenAcesso: data.properties.hashed_token || `sessao_${authUserId}`,
      urlRedirecionamento: data.properties.action_link
    };
  }

  private async buscarEmailPorAuthId(authUserId: string): Promise<string | null> {
    const { rows } = await this.pool.query('select email from usuarios where auth_user_id = $1 limit 1', [authUserId]);
    return rows[0]?.email || null;
  }
}
