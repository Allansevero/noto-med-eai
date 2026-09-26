/**
 * Aplica as correções de segurança recomendadas pelo Supabase Advisor:
 * 1. Habilitar RLS em todas as tabelas públicas remanescentes
 * 2. Fixar search_path nas funções
 * 3. Proteger funções security definer contra chamadas anon
 */
import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const connectionString = process.env.DATABASE_URL;

const hardeningSql = `
-- 1. Habilitar RLS em todas as tabelas do schema public
alter table contas enable row level security;
alter table usuarios enable row level security;
alter table otp_verificacoes enable row level security;
alter table medicos enable row level security;
alter table secretarias enable row level security;
alter table secretaria_medico enable row level security;
alter table contadores enable row level security;
alter table contador_medico enable row level security;
alter table planos enable row level security;
alter table assinaturas enable row level security;
alter table faturas_assinatura enable row level security;
alter table uso_mensal_medico enable row level security;
alter table medico_servicos_fiscais enable row level security;
alter table whatsapp_instancias enable row level security;
alter table whatsapp_conversas enable row level security;
alter table medico_respostas_rapidas enable row level security;
alter table whatsapp_mensagens enable row level security;
alter table agendamentos enable row level security;
alter table agenda_slots enable row level security;
alter table pagamentos enable row level security;
alter table solicitacao_nota_agendamentos enable row level security;
alter table consentimentos enable row level security;
alter table auditoria enable row level security;

-- 2. Corrigir search_path das funções para prevenir injeção de schema
alter function public.atualizar_timestamp() set search_path = public;
alter function public.registrar_uso_mensal() set search_path = public;
alter function public.medicos_visiveis_para(uuid) set search_path = public;

-- 3. Restringir execução de funções SECURITY DEFINER (apenas authenticated / service_role)
revoke execute on function public.medicos_visiveis_para(uuid) from public, anon;
grant execute on function public.medicos_visiveis_para(uuid) to authenticated, service_role;

-- 4. Políticas de isolamento RLS para usuários autenticados
create policy usuarios_proprio on usuarios
  using (auth_user_id = auth.uid());

create policy medicos_isolado on medicos
  using (id in (select medicos_visiveis_para(auth.uid())));

create policy agendamentos_isolado on agendamentos
  using (medico_id in (select medicos_visiveis_para(auth.uid())));

create policy whatsapp_conversas_isolado on whatsapp_conversas
  using (medico_id in (select medicos_visiveis_para(auth.uid())));

create policy whatsapp_mensagens_isolado on whatsapp_mensagens
  using (conversa_id in (
    select id from whatsapp_conversas where medico_id in (select medicos_visiveis_para(auth.uid()))
  ));

create policy pagamentos_isolado on pagamentos
  using (medico_id in (select medicos_visiveis_para(auth.uid())));

create policy servicos_fiscais_isolado on medico_servicos_fiscais
  using (medico_id in (select medicos_visiveis_para(auth.uid())));

create policy respostas_rapidas_isolado on medico_respostas_rapidas
  using (medico_id in (select medicos_visiveis_para(auth.uid())));
`;

async function main() {
  const client = new pg.Client({
    connectionString,
    ssl: { rejectUnauthorized: false }
  });

  await client.connect();
  console.log('Aplicando hardening de segurança Supabase...');
  await client.query(hardeningSql);
  console.log('Hardening de segurança aplicado com sucesso!');
  await client.end();
}

main().catch(err => {
  console.error('Erro no hardening:', err);
  process.exit(1);
});
