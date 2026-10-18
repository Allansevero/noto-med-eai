-- Somente proposta de migração: não executar automaticamente.
-- Um futuro adaptador deve reservar a tentativa e travar a linha médico/modo
-- antes de ler/decidir; atualizar histórico e tentativa na mesma transação.
-- Reservas incertas não expiram nem autorizam reenvio automático.
begin;

create table public.noto_historico_comunicacao_medico (
  medico_id uuid not null references public.medicos(id) on delete cascade,
  modo text not null check (modo in ('simulado', 'real')),
  boas_vindas_em timestamptz,
  pergunta_nota_em timestamptz,
  pergunta_nota_repeticoes smallint not null default 0 check (pergunta_nota_repeticoes between 0 and 1),
  resposta_nota jsonb check (resposta_nota is null or jsonb_typeof(resposta_nota) = 'object'),
  resposta_recebida_em timestamptz,
  pergunta_agenda_em timestamptz,
  pergunta_agenda_repeticoes smallint not null default 0 check (pergunta_agenda_repeticoes between 0 and 1),
  problema_fiscal_em timestamptz,
  problema_fiscal_repeticoes smallint not null default 0 check (problema_fiscal_repeticoes between 0 and 1),
  agendas_nao_atendidas text[] not null default '{}',
  consultas_listadas boolean not null default false,
  aguardando_comprovante boolean not null default false,
  atualizado_em timestamptz not null default now(),
  primary key (medico_id, modo)
);

create table public.noto_comunicacao_tentativas (
  medico_id uuid not null,
  modo text not null,
  chave_processamento text not null check (length(chave_processamento) > 0),
  estado text not null check (estado in ('reservado', 'simulado', 'enviado', 'falha', 'nenhuma')),
  acao text check (acao in ('problema_fiscal', 'boas_vindas', 'perguntar_nota_pendente',
    'pedir_agenda', 'agenda_nao_atendida', 'listar_consultas_sem_nota',
    'aguardar_comprovante', 'reperguntar', 'nenhuma')),
  pergunta text check (pergunta in ('nota_pendente', 'agenda', 'problema_fiscal')),
  agenda text check (agenda is null or length(btrim(agenda)) > 0),
  chave_acao text generated always as (
    case when acao = 'nenhuma' then null
      when acao = 'reperguntar' then acao || ':' || pergunta
      when acao = 'agenda_nao_atendida' then acao || ':' || lower(btrim(agenda))
      else acao end
  ) stored,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  primary key (medico_id, modo, chave_processamento),
  foreign key (medico_id, modo) references public.noto_historico_comunicacao_medico(medico_id, modo) on delete cascade,
  unique (medico_id, modo, chave_acao),
  check ((acao is not distinct from 'reperguntar') = (pergunta is not null)),
  check ((acao is not distinct from 'agenda_nao_atendida') = (agenda is not null)),
  check ((modo = 'simulado' and estado <> 'enviado') or (modo = 'real' and estado <> 'simulado'))
);

-- Histórico exclusivo do backend; nenhuma policy concede acesso a clientes.
alter table public.noto_historico_comunicacao_medico enable row level security;
alter table public.noto_comunicacao_tentativas enable row level security;
revoke all on table public.noto_historico_comunicacao_medico, public.noto_comunicacao_tentativas from public;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on table public.noto_historico_comunicacao_medico, public.noto_comunicacao_tentativas from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on table public.noto_historico_comunicacao_medico, public.noto_comunicacao_tentativas from authenticated';
  end if;
end $$;

commit;
