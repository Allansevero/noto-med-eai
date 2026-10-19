-- Proposta idempotente; aplicar somente após revisão, nunca automaticamente.
begin;

create table if not exists public.noto_emissoes_comprovantes (
  id uuid primary key default gen_random_uuid(),
  medico_id uuid not null references public.medicos(id) on delete cascade,
  fonte text not null,
  consulta_id_externo text not null,
  comprovante_chave text not null check (comprovante_chave ~ '^[a-f0-9]{64}$'),
  auditoria_comprovante_id uuid not null references public.noto_auditoria_comprovantes(id),
  solicitacao_id uuid unique references public.solicitacoes_nota(id),
  nota_fiscal_id uuid unique references public.notas_fiscais(id),
  estado text not null check (estado in ('enfileirada', 'emitindo', 'nota_gerada', 'erro', 'bloqueada')),
  erro_codigo text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (medico_id, comprovante_chave),
  unique (medico_id, fonte, consulta_id_externo),
  foreign key (medico_id, fonte, consulta_id_externo)
    references public.noto_consultas_sincronizadas(medico_id, fonte, id_externo)
);

alter table public.noto_emissoes_comprovantes enable row level security;
revoke all on table public.noto_emissoes_comprovantes from public;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on table public.noto_emissoes_comprovantes from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on table public.noto_emissoes_comprovantes from authenticated';
  end if;
end $$;

commit;
