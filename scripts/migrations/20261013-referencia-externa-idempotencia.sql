-- Adiciona suporte a referência externa (ref) para controle de idempotência no padrão Focus NFe
alter table solicitacoes_nota add column if not exists referencia_externa text;
create unique index if not exists idx_solicitacoes_medico_ref on solicitacoes_nota(medico_id, referencia_externa) where referencia_externa is not null;
