-- Evidências consultivas separadas dos parâmetros que autorizam a emissão.
create table if not exists consultas_fiscais_onboarding (
  medico_id uuid not null references medicos(id),
  chave_contexto text not null,
  certificado_id uuid not null references medico_certificados(id),
  referencia_hash text,
  competencia date not null,
  ambiente text not null check (ambiente in ('producao', 'homologacao')),
  evidencias jsonb not null,
  consultado_em timestamptz not null default now(),
  primary key (medico_id, chave_contexto)
);
alter table consultas_fiscais_onboarding enable row level security;
