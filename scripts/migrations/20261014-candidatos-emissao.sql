-- Criação da tabela de candidatos a emissão identificados via Gemini multimodal
create table if not exists candidatos_emissao (
  id                    uuid primary key default gen_random_uuid(),
  medico_id             uuid not null references medicos(id) on delete cascade,
  paciente_id           uuid references pacientes(id) on delete set null,
  mensagem_id           text not null,
  conversa_id           uuid references whatsapp_conversas(id) on delete cascade,
  telefone_paciente     text not null,
  nome_paciente         text,
  valor_centavos        integer not null,
  data_pagamento        date,
  id_transacao          text,
  tipo_pagamento        text default 'pix',
  dados_brutos          jsonb,
  status                text not null default 'pendente_aprovacao' check (status in ('pendente_aprovacao', 'aprovado', 'recusado', 'ja_faturado', 'erro_emissao', 'emitido')),
  solicitacao_id        uuid references solicitacoes_nota(id) on delete set null,
  referencia_externa    text unique,
  notificado_em         timestamptz,
  respondido_em         timestamptz,
  criado_em             timestamptz not null default now(),
  atualizado_em         timestamptz not null default now()
);

create index if not exists idx_candidatos_medico_status on candidatos_emissao(medico_id, status);
create unique index if not exists idx_candidatos_medico_mensagem on candidatos_emissao(medico_id, mensagem_id);
create index if not exists idx_candidatos_medico_txid on candidatos_emissao(medico_id, id_transacao) where id_transacao is not null;
