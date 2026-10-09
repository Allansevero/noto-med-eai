create table if not exists noto_assistente_sessoes (
 medico_id uuid primary key references medicos(id) on delete cascade,
 versao integer not null default 0,
 estado jsonb not null default '{"etapa":"apresentacao"}'::jsonb,
 reserva uuid, reservado_em timestamptz,
 atualizado_em timestamptz not null default now()
);
create table if not exists noto_assistente_turnos (
 id uuid primary key default gen_random_uuid(),
 sequencia bigint generated always as identity unique,
 medico_id uuid not null references medicos(id) on delete cascade,
 instancia text not null, mensagem_id text not null,
 texto text not null check(length(texto)<=2000),
 estado text not null default 'pendente' check(estado in ('pendente','analisando','aplicado','preparado','enviando','concluido','incerto','falha')),
 decisao jsonb, resultados jsonb, mensagens jsonb not null default '[]'::jsonb,
 confirmadas integer not null default 0 check(confirmadas>=0),
 tentativas integer not null default 0,
 proxima_tentativa_em timestamptz not null default now(),
 diagnostico text, criado_em timestamptz not null default now(), atualizado_em timestamptz not null default now(),
 unique(instancia,mensagem_id)
);
create index if not exists noto_assistente_turnos_fila on noto_assistente_turnos(medico_id,sequencia) where estado in ('pendente','analisando','aplicado','preparado','enviando');
alter table noto_assistente_sessoes enable row level security;
alter table noto_assistente_turnos enable row level security;
revoke all on noto_assistente_sessoes,noto_assistente_turnos from public;
revoke all on sequence noto_assistente_turnos_sequencia_seq from public;
do $$ declare r text; begin
 foreach r in array array['anon','authenticated'] loop
  if exists(select 1 from pg_roles where rolname=r) then
   execute format('revoke all on noto_assistente_sessoes,noto_assistente_turnos from %I',r);
   execute format('revoke all on sequence noto_assistente_turnos_sequencia_seq from %I',r);
  end if;
 end loop;
 if exists(select 1 from pg_roles where rolname='service_role') then
  grant all on noto_assistente_sessoes,noto_assistente_turnos to service_role;
  grant usage,select on sequence noto_assistente_turnos_sequencia_seq to service_role;
 end if;
end $$;
