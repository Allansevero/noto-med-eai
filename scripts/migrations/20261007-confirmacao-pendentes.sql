-- Aplicar em transação após dados-profissionais; pausar workers antes da migração.
-- O backfill roda somente na primeira inclusão da coluna, nunca em cada deploy.
create table if not exists emissoes_pendentes_confirmacoes (
  medico_id uuid primary key references medicos(id) on delete cascade,
  estado text not null default 'pendente' check(estado in ('pendente','reservado','enviado','incerto','confirmado')),
  capturada_em timestamptz not null default clock_timestamp(),
  confirmado_em timestamptz,
  mensagem_confirmacao_id text,
  atualizado_em timestamptz not null default now()
);
alter table emissoes_pendentes_confirmacoes enable row level security;
revoke all on emissoes_pendentes_confirmacoes from public, anon, authenticated;
do $migracao$
begin
  if not exists(select 1 from information_schema.columns
      where table_schema='public' and table_name='solicitacoes_nota' and column_name='aguardando_confirmacao_medico') then
    alter table solicitacoes_nota add column aguardando_confirmacao_medico boolean not null default false;
    -- Não apaga locks, tentativas, erros nem investigação. Uma nota já transmitida
    -- não deve ser retransmitida após a confirmação do médico.
    update solicitacoes_nota s set aguardando_confirmacao_medico=true,
      aguardando_dados_profissionais=true, fila=null,
      datas_consulta_texto=coalesce(s.datas_consulta_texto,substring(s.xdesc_serv from '(?i)NAS DATAS\s+(.+)$')),
      atualizado_em=now()
    where s.status='pendente'
      and not exists(select 1 from notas_fiscais n where n.solicitacao_id=s.id);
    insert into emissoes_pendentes_confirmacoes(medico_id)
      select distinct medico_id from solicitacoes_nota where aguardando_confirmacao_medico
      on conflict do nothing;
  end if;
end
$migracao$;
create index if not exists idx_solicitacoes_confirmacao_medico on solicitacoes_nota(medico_id)
  where aguardando_confirmacao_medico and status='pendente';
