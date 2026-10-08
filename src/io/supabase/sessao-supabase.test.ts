import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { SupabaseClient } from '@supabase/supabase-js';
import { SupabaseAuthAdminService } from './supabase-auth-admin-service.js';

const tokenJwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJhdXRoLWlkIn0.assinatura';

function preparar(params: {
  link?: any;
  verificacao?: any;
} = {}) {
  const verificacoes: unknown[] = [];
  let clientesCriados = 0;
  const service = new SupabaseAuthAdminService(
    'https://example.supabase.co', 'chave-teste', {} as any,
    () => {
      clientesCriados++;
      return {
        auth: {
          verifyOtp: async (input: unknown) => {
            verificacoes.push(input);
            return params.verificacao ?? {
              data: { user: { id: 'auth-id' }, session: { access_token: tokenJwt, user: { id: 'auth-id' } } },
              error: null
            };
          }
        }
      } as unknown as SupabaseClient;
    }
  );
  service.supabaseClient.auth.admin.getUserById = (async () => ({
    data: { user: { id: 'auth-id', email: 'identidade@auth.notomed.local' } }, error: null
  })) as any;
  service.supabaseClient.auth.admin.generateLink = (async (input: any) => {
    assert.equal(input.type, 'magiclink');
    assert.equal(input.email, 'identidade@auth.notomed.local');
    return params.link ?? {
      data: { properties: { hashed_token: 'hash-magic-link', action_link: 'https://example.com/login' } },
      error: null
    };
  }) as any;
  service.supabaseClient.auth.verifyOtp = (async () => {
    throw new Error('O cliente administrativo compartilhado não pode autenticar uma sessão.');
  }) as any;
  return { service, verificacoes, clientesCriados: () => clientesCriados };
}

test('troca hash do magic link por access token em cliente de sessão isolado a cada chamada', async () => {
  const contexto = preparar();
  assert.deepEqual(await contexto.service.gerarSessaoParaUsuario('auth-id'), { tokenAcesso: tokenJwt });
  assert.deepEqual(await contexto.service.gerarSessaoParaUsuario('auth-id'), { tokenAcesso: tokenJwt });
  assert.deepEqual(contexto.verificacoes, [
    { token_hash: 'hash-magic-link', type: 'magiclink' },
    { token_hash: 'hash-magic-link', type: 'magiclink' }
  ]);
  assert.equal(contexto.clientesCriados(), 2);
});

for (const [nome, link] of [
  ['erro na geração', { data: null, error: { message: 'Falhou' } }],
  ['propriedades ausentes', { data: {}, error: null }],
  ['hash ausente', { data: { properties: { action_link: 'https://example.com/login' } }, error: null }],
  ['hash vazio', { data: { properties: { hashed_token: '' } }, error: null }]
] as const) {
  test(`rejeita ${nome} sem criar token previsível`, async () => {
    const contexto = preparar({ link });
    await assert.rejects(contexto.service.gerarSessaoParaUsuario('auth-id'));
    assert.equal(contexto.clientesCriados(), 0);
  });
}

for (const [nome, verificacao] of [
  ['erro de verificação', { data: { user: null, session: null }, error: { message: 'Inválido' } }],
  ['usuário diferente', { data: { user: { id: 'outro-id' }, session: { access_token: tokenJwt, user: { id: 'outro-id' } } }, error: null }],
  ['usuário ausente', { data: { user: null, session: { access_token: tokenJwt } }, error: null }],
  ['sessão ausente', { data: { user: { id: 'auth-id' }, session: null }, error: null }],
  ['token ausente', { data: { user: { id: 'auth-id' }, session: { user: { id: 'auth-id' } } }, error: null }],
  ['token vazio', { data: { user: { id: 'auth-id' }, session: { access_token: '', user: { id: 'auth-id' } } }, error: null }]
] as const) {
  test(`rejeita ${nome} sem retornar hash ou token previsível`, async () => {
    const { service } = preparar({ verificacao });
    await assert.rejects(service.gerarSessaoParaUsuario('auth-id'));
  });
}
