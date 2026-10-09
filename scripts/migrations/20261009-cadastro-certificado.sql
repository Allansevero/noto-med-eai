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
create table if not exists cadastro_certificado_avisos (
 id uuid primary key default gen_random_uuid(),
 trabalho_id uuid not null references cadastro_certificado_trabalhos(id) on delete cascade,
 chave text not null, pendencia_id uuid,
 tipo text not null check(tipo in ('pergunta','esclarecer','concluido')),
 mensagem_recebida text,
 texto text check(texto is null or length(texto) between 1 and 500),
 estado text not null default 'pendente' check(estado in ('pendente','preparado','enviando','confirmado','incerto','falha','obsoleto')),
 reserva uuid, reservado_em timestamptz, tentativas integer not null default 0,
 proxima_tentativa_em timestamptz not null default now(), diagnostico text,
 criado_em timestamptz not null default now(), unique(trabalho_id,chave)
);
create table if not exists cadastro_certificado_respostas (
 id uuid primary key default gen_random_uuid(),
 trabalho_id uuid not null references cadastro_certificado_trabalhos(id) on delete cascade,
 pendencia_id uuid not null, instancia text not null, mensagem_id text not null,
 texto text not null check(length(texto) between 1 and 2000),
 estado text not null default 'pendente' check(estado in ('pendente','analisando','processado','falha')),
 reserva uuid, reservado_em timestamptz, tentativas integer not null default 0,
 proxima_tentativa_em timestamptz not null default now(), diagnostico text,
 criado_em timestamptz not null default now(), unique(instancia,mensagem_id)
);
create index if not exists cadastro_avisos_fila on cadastro_certificado_avisos(proxima_tentativa_em) where estado in ('pendente','preparado','enviando');
create index if not exists cadastro_respostas_fila on cadastro_certificado_respostas(proxima_tentativa_em) where estado in ('pendente','analisando');
alter table cadastro_certificado_avisos enable row level security;
alter table cadastro_certificado_respostas enable row level security;
revoke all on cadastro_certificado_avisos,cadastro_certificado_respostas from public;
do $$ declare r text; begin
 foreach r in array array['anon','authenticated'] loop
  if exists(select 1 from pg_roles where rolname=r) then execute format('revoke all on cadastro_certificado_avisos,cadastro_certificado_respostas from %I',r); end if;
 end loop;
 if exists(select 1 from pg_roles where rolname='service_role') then grant all on cadastro_certificado_avisos,cadastro_certificado_respostas to service_role; end if;
end $$;
