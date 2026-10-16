begin;

-- Executar antes de habilitar o agente durável; nenhuma tabela existente é alterada.
create table if not exists agente_fiscal_casos (
  id uuid primary key default gen_random_uuid(),
  medico_id uuid not null references medicos(id) on delete cascade,
  mensagem_pagamento_id text not null check (length(mensagem_pagamento_id) > 0),
  identidade_pagamento text,
  candidato jsonb not null,
  estado text not null default 'em_revisao' check (estado in (
    'em_revisao','aguardando_dados','aguardando_aprovacao','adiado',
    'recusado','enfileirado','emitido','falhou')),
  revisao integer not null default 0,
  solicitacao_id uuid references solicitacoes_nota(id) on delete set null,
  pergunta_pendente jsonb,
  dados jsonb not null default '{}',
  adiado_ate timestamptz,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (medico_id, mensagem_pagamento_id)
);
alter table agente_fiscal_casos add column if not exists identidade_pagamento text;
create unique index if not exists agente_fiscal_identidade_unica
  on agente_fiscal_casos (medico_id, identidade_pagamento) where identidade_pagamento is not null;
-- Apenas uma pergunta pode aguardar resposta de cada médico.
create unique index if not exists agente_fiscal_pergunta_unica
  on agente_fiscal_casos (medico_id) where pergunta_pendente is not null;
create index if not exists agente_fiscal_casos_medico
  on agente_fiscal_casos (medico_id, criado_em);

-- A linha por médico funciona como lease compartilhado da inbox e da outbox.
create table if not exists agente_fiscal_fluxos (
  medico_id uuid primary key references medicos(id) on delete cascade,
  token_lease uuid,
  lease_ate timestamptz
);
create table if not exists agente_fiscal_eventos (
  id uuid primary key default gen_random_uuid(),
  medico_id uuid not null references medicos(id) on delete cascade,
  instancia_nome text not null,
  mensagem_id text not null check (length(mensagem_id) > 0),
  tipo text not null check (tipo in ('entrada','saida')),
  payload jsonb not null,
  estado text not null default 'pendente' check (estado in ('pendente','processando','concluido','incerto','falha')),
  tentativas integer not null default 0,
  disponivel_em timestamptz not null default now(),
  token_lease uuid,
  lease_ate timestamptz,
  ultimo_erro text,
  criado_em timestamptz not null default now(),
  concluido_em timestamptz,
  unique (tipo, instancia_nome, mensagem_id)
);
create index if not exists agente_fiscal_eventos_pendentes
  on agente_fiscal_eventos (tipo, disponivel_em, criado_em) where estado <> 'concluido';
create index if not exists agente_fiscal_eventos_medico
  on agente_fiscal_eventos (medico_id, criado_em) where estado <> 'concluido';

-- Importa aprovações/CPF pendentes conhecidos sem modificar solicitações legadas.
-- A referência sintética preserva rastreabilidade quando o legado perdeu o id do pagamento.
insert into agente_fiscal_casos (
  medico_id,mensagem_pagamento_id,candidato,estado,solicitacao_id,criado_em)
select s.medico_id,coalesce(nullif(s.referencia_externa,''),'legado:' || s.id::text),
  jsonb_build_object(
    'pacienteNome',coalesce(p.nome,'Paciente'),'pacienteTelefone',coalesce(p.telefone,''),
    'valorCentavos',s.valor_servico_centavos,
    'valorFormatado',replace(to_char(s.valor_servico_centavos / 100.0,'FM999999990.00'),'.',','),
    'dataConsulta',coalesce(s.datas_consulta_texto,''),
    'dataConsultaIso',coalesce(s.competencia_emissao::text,''),
    'origemEvidencia',jsonb_build_object(
      'mensagemPagamentoId',coalesce(nullif(s.referencia_externa,''),'legado:' || s.id::text),
      'trechoPagamento','Migrado de solicitação existente')),
  case when s.aguardando_cpf_medico then 'aguardando_dados' else 'aguardando_aprovacao' end,
  s.id,s.criado_em
from solicitacoes_nota s join pacientes p on p.id=s.paciente_id
where s.origem='agente_fiscal' and (s.aguardando_confirmacao_medico or s.aguardando_cpf_medico)
on conflict (medico_id,mensagem_pagamento_id) do nothing;

commit;
