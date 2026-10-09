create table if not exists cadastro_certificado_trabalhos (
 id uuid primary key default gen_random_uuid(),
 medico_id uuid not null references medicos(id) on delete cascade,
 certificado_id uuid not null unique references medico_certificados(id) on delete cascade,
 documento_titular text check(documento_titular is null or documento_titular ~ '^(\d{11}|\d{14})$'),
 estado text not null default 'pendente' check(estado in ('pendente','consultando','aguardando_confirmacao','concluido','falha','obsoleto')),
 snapshot jsonb not null default '{}'::jsonb,
 dados jsonb not null default '{}'::jsonb,
 tentativas integer not null default 0,
 reserva uuid, reservado_em timestamptz,
 proxima_tentativa_em timestamptz not null default now(),
 diagnostico text,
 criado_em timestamptz not null default now(), atualizado_em timestamptz not null default now()
);
create index if not exists cadastro_certificado_fila on cadastro_certificado_trabalhos(proxima_tentativa_em) where estado in ('pendente','consultando');
alter table cadastro_certificado_trabalhos enable row level security;
revoke all on cadastro_certificado_trabalhos from public;
do $$ declare r text; begin
 foreach r in array array['anon','authenticated'] loop
  if exists(select 1 from pg_roles where rolname=r) then execute format('revoke all on cadastro_certificado_trabalhos from %I',r); end if;
 end loop;
 if exists(select 1 from pg_roles where rolname='service_role') then grant all on cadastro_certificado_trabalhos to service_role; end if;
end $$;
