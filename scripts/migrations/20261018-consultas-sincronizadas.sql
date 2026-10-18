-- Somente proposta de migração: não executar automaticamente.
begin;

create table public.noto_consultas_sincronizadas (
  medico_id uuid not null references public.medicos(id) on delete cascade,
  fonte text not null,
  id_externo text not null,
  paciente_id uuid not null references public.pacientes(id) on delete cascade,
  data_hora timestamptz not null,
  status text not null check (status in ('realizada', 'cancelada', 'faltou', 'agendada')),
  valor_consulta_centavos integer,
  primary key (medico_id, fonte, id_externo)
);

alter table public.noto_consultas_sincronizadas enable row level security;
revoke all on table public.noto_consultas_sincronizadas from public;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on table public.noto_consultas_sincronizadas from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on table public.noto_consultas_sincronizadas from authenticated';
  end if;
end $$;

commit;
