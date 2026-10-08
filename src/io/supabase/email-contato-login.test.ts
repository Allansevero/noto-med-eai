import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SupabaseAuthAdminService } from './supabase-auth-admin-service.js';
test('editar email de contato não muda o email usado para autenticar a identidade por WhatsApp', async () => {
  const service = new SupabaseAuthAdminService('https://example.supabase.co', 'chave-teste', {
    query: async () => ({ rows: [{ email: 'contato@example.com' }] })
  } as any, () => ({
    auth: { verifyOtp: async () => ({
      data: { user: { id: 'auth-id' }, session: { access_token: 'jwt-supabase', user: { id: 'auth-id' } } },
      error: null
    }) }
  } as any));
  let emailLogin = '';
  service.supabaseClient.auth.admin.getUserById = (async () => ({ data: { user: { email: 'medico_51999999999@auth.notomed.local' } }, error: null })) as any;
  service.supabaseClient.auth.admin.generateLink = (async (input: any) => {
    emailLogin = input.email; return { data: { properties: { hashed_token: 'token', action_link: 'https://example.com/login' } }, error: null };
  }) as any;
  const sessao = await service.gerarSessaoParaUsuario('auth-id');
  assert.equal(emailLogin, 'medico_51999999999@auth.notomed.local');
  assert.equal(sessao.tokenAcesso, 'jwt-supabase');
});
