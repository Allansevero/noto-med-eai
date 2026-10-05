-- Não insere destinatários nem dispara mensagens para a base existente.
create table if not exists onboarding_treinos_whatsapp (
  medico_id uuid primary key references medicos(id) on delete cascade,
  versao integer not null default 1 check (versao = 1),
  etapa integer not null default 0 check (etapa between 0 and 6),
  estado text not null default 'pendente'
    check (estado in ('pendente', 'enviando', 'concluido', 'falha', 'incerto')),
  eventos jsonb not null default '[]'::jsonb,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
alter table onboarding_treinos_whatsapp enable row level security;
revoke all on onboarding_treinos_whatsapp from public, anon, authenticated;
