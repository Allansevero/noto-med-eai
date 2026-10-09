import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SupabaseAuthAdminService } from './supabase-auth-admin-service.js';

test('cadastrarNovoMedico recupera usuario existente quando Supabase Auth retorna usuario ja cadastrado', async () => {
  const queries: Array<{ sql: string; params?: any[] }> = [];

  const pool = {
    async query(sql: string, params?: any[]) {
      queries.push({ sql, params });
      if (sql.includes('select u.id as usuario_id')) {
        return {
          rows: [
            {
              usuario_id: 'usr-123',
              conta_id: 'conta-123',
              nome: 'Dra. Ana',
              papel: 'medico',
              auth_user_id: 'auth-user-existente-id',
              medico_id: 'med-123'
            }
          ]
        };
      }
      return { rows: [] };
    },
    async connect() {
      return {
        async query(sql: string, params?: any[]) {
          queries.push({ sql, params });
          if (sql.includes('select u.id as usuario_id')) {
            return {
              rows: [
                {
                  usuario_id: 'usr-123',
                  conta_id: 'conta-123',
                  nome: 'Dra. Ana',
                  papel: 'medico',
                  auth_user_id: 'auth-user-existente-id',
                  medico_id: 'med-123'
                }
              ]
            };
          }
          return { rows: [] };
        },
        release() {}
      };
    }
  } as any;

  const service = new SupabaseAuthAdminService(
    'https://example.supabase.co',
    'chave-teste',
    pool
  );

  // Simula o erro do Supabase Auth quando email já existe
  service.supabaseClient.auth.admin.createUser = (async () => {
    return {
      data: { user: null },
      error: { message: 'A user with this email address has already been registered' } as any
    };
  }) as any;

  // Simula listUsers retornando o usuário existente
  service.supabaseClient.auth.admin.listUsers = (async () => {
    return {
      data: {
        users: [
          {
            id: 'auth-user-existente-id',
            email: 'medico_51999998888@auth.notomed.local',
            phone: '51999998888'
          }
        ]
      },
      error: null
    };
  }) as any;

  const res = await service.cadastrarNovoMedico({
    telefone: '51999998888',
    nomePadrao: 'Dra. Ana'
  });

  assert.equal(res.authUserId, 'auth-user-existente-id');
  assert.equal(res.usuarioId, 'usr-123');
  assert.equal(res.ehNovoUsuario, false);
});
