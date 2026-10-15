-- Criação da tabela de pedidos de emissão de notas solicitados pelo médico via Noto Assistente
create table if not exists pedidos_nota_medico (
  id                          uuid primary key default gen_random_uuid(),
  medico_id                   uuid not null references medicos(id) on delete cascade,
  mensagem_id                 text not null,
  status                      text not null default 'aguardando_confirmacao' check (status in (
    'aguardando_confirmacao',
    'aguardando_dados_faltantes',
    'aguardando_escolha_paciente',
    'aprovado',
    'cancelado',
    'erro_emissao',
    'emitido',
    'expirado'
  )),
  paciente_id                 uuid references pacientes(id) on delete set null,
  nome_paciente               text,
  cpf_paciente_encriptado     bytea,
  cpf_paciente_hash           text,
  telefone_paciente           text,
  data_consulta               text,
  valor_centavos              integer,
  origem_dados                text check (origem_dados in ('supabase', 'sheets', 'conversa', 'manual')),
  dados_brutos                jsonb,
  candidatos_multiplos        jsonb,
  solicitacao_id              uuid references solicitacoes_nota(id) on delete set null,
  referencia_externa          text unique,
  expira_em                   timestamptz not null default (now() + interval '24 hours'),
  criado_em                   timestamptz not null default now(),
  atualizado_em               timestamptz not null default now()
);

create index if not exists idx_pedidos_nota_medico_status on pedidos_nota_medico(medico_id, status);
create index if not exists idx_pedidos_nota_medico_expira on pedidos_nota_medico(expira_em);
