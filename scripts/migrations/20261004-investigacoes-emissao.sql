-- Aplicar antes de ativar AGENTE_FISCAL_ATIVO. Apenas o backend acessa os casos.
create table if not exists investigacoes_emissao (
  solicitacao_id uuid primary key references solicitacoes_nota(id),
  medico_id uuid not null references medicos(id),
  estado text not null default 'investigando'
    check (estado in ('investigando', 'tentando_resolver', 'resolvido', 'necessita_intervencao')),
  problema jsonb not null,
  eventos jsonb not null default '[]'::jsonb,
  retentativas integer not null default 0 check (retentativas between 0 and 1),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists idx_investigacoes_medico_estado on investigacoes_emissao(medico_id, estado);
alter table investigacoes_emissao enable row level security;
revoke all on investigacoes_emissao from public, anon, authenticated;
