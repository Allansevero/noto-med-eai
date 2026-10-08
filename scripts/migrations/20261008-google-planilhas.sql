create extension if not exists pgcrypto;
create table if not exists google_planilhas_conexoes (
 medico_id uuid primary key references medicos(id) on delete cascade,
 versao integer not null default 0,
 access_token bytea, refresh_token bytea, expira_em timestamptz,
 atualizado_em timestamptz not null default now()
);
create table if not exists google_planilhas_oauth (
 estado_hash text primary key, medico_id uuid not null references medicos(id) on delete cascade,
 versao integer not null, verificador bytea not null, expira_em timestamptz not null
);
create table if not exists google_planilhas_previas (
 id uuid primary key default gen_random_uuid(), medico_id uuid not null references medicos(id) on delete cascade,
 versao integer not null, dados bytea not null, estado text not null default 'pronta' check(estado in ('pronta','importada')),
 resultado jsonb, criado_em timestamptz not null default now(), expira_em timestamptz not null default now()+interval '24 hours'
);
create index if not exists google_planilhas_oauth_medico_idx on google_planilhas_oauth(medico_id);
create index if not exists google_planilhas_previas_medico_idx on google_planilhas_previas(medico_id);
do $$ declare tabela text; papel text; begin
 foreach tabela in array array['google_planilhas_conexoes','google_planilhas_oauth','google_planilhas_previas'] loop
  execute format('alter table %I enable row level security',tabela);
  execute format('revoke all on table %I from public',tabela);
  foreach papel in array array['anon','authenticated'] loop
   if exists(select 1 from pg_roles where rolname=papel) then execute format('revoke all on table %I from %I',tabela,papel);end if;
  end loop;
 end loop;
end $$;
