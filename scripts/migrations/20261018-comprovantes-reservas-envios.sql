-- Somente proposta de migração: não executar automaticamente.
-- Depende de 20261018-historico-comunicacao-medico.sql; reutiliza histórico e tentativas.
begin;

create table public.noto_auditoria_comprovantes (
  id uuid primary key default gen_random_uuid(),
  medico_id uuid not null references public.medicos(id) on delete cascade,
  lido jsonb check (lido is null or jsonb_typeof(lido) = 'object'),
  estado jsonb not null check (jsonb_typeof(estado) = 'object'),
  decisao jsonb not null check (jsonb_typeof(decisao) = 'object'),
  motivo text generated always as (decisao ->> 'motivo') stored not null,
  confianca jsonb generated always as (lido -> 'campos' -> 'confianca') stored,
  criado_em timestamptz not null default now()
);
create index idx_noto_comprovantes_medico on public.noto_auditoria_comprovantes(medico_id, criado_em, id);

create table public.noto_comunicacao_reservas (
  medico_id uuid not null references public.medicos(id) on delete cascade,
  modo text not null check (modo in ('simulado', 'real')),
  chave_processamento text check (chave_processamento is null or length(chave_processamento) > 0),
  primary key (medico_id, modo),
  foreign key (medico_id, modo) references public.noto_historico_comunicacao_medico(medico_id, modo) on delete cascade
);

create table public.noto_comunicacao_envios (
  medico_id uuid not null references public.medicos(id) on delete cascade,
  modo text not null check (modo = 'real'),
  chave_processamento text not null,
  tipo text not null,
  baloes_enviados integer[] not null,
  criado_em timestamptz not null default now(),
  primary key (medico_id, modo, chave_processamento),
  unique (medico_id, modo, tipo),
  foreign key (medico_id, modo, chave_processamento)
    references public.noto_comunicacao_tentativas(medico_id, modo, chave_processamento) on delete cascade
);

-- Exclusivas do backend: nenhuma policy concede acesso a clientes.
alter table public.noto_auditoria_comprovantes enable row level security;
alter table public.noto_comunicacao_reservas enable row level security;
alter table public.noto_comunicacao_envios enable row level security;
revoke all on table public.noto_auditoria_comprovantes from public;
revoke all on table public.noto_comunicacao_reservas from public;
revoke all on table public.noto_comunicacao_envios from public;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on table public.noto_auditoria_comprovantes from anon';
    execute 'revoke all on table public.noto_comunicacao_reservas from anon';
    execute 'revoke all on table public.noto_comunicacao_envios from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on table public.noto_auditoria_comprovantes from authenticated';
    execute 'revoke all on table public.noto_comunicacao_reservas from authenticated';
    execute 'revoke all on table public.noto_comunicacao_envios from authenticated';
  end if;
end $$;

commit;
