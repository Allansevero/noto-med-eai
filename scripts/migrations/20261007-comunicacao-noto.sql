-- Histórico e deduplicação exclusivos do backend. Nenhuma policy concede acesso a clientes.
create table if not exists public.noto_comunicacoes (
 id uuid primary key default gen_random_uuid(),
 medico_id uuid not null references public.medicos(id),
 chave_evento text not null,
 evento text not null,
 estado text not null check (estado in ('gerando','falha_ia','reservado','enviado','incerto')),
 entrada jsonb not null,
 mensagens jsonb not null default '[]'::jsonb,
 eventos jsonb not null default '[]'::jsonb,
 criado_em timestamptz not null default now(),
 atualizado_em timestamptz not null default now(),
 unique (medico_id,chave_evento)
);
create index if not exists noto_comunicacoes_historico_idx on public.noto_comunicacoes(medico_id,criado_em desc);
alter table public.noto_comunicacoes enable row level security;
revoke all on table public.noto_comunicacoes from public;
do $$ begin
 if exists(select 1 from pg_roles where rolname='anon') then execute 'revoke all on table public.noto_comunicacoes from anon'; end if;
 if exists(select 1 from pg_roles where rolname='authenticated') then execute 'revoke all on table public.noto_comunicacoes from authenticated'; end if;
end $$;
