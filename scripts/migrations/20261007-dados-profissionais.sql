-- Aplicar após 20261004-investigacoes-emissao.sql. Nenhuma chamada fiscal/reenvio.
alter table solicitacoes_nota add column if not exists aguardando_dados_profissionais boolean not null default false;
alter table solicitacoes_nota add column if not exists datas_consulta_texto text;
create table if not exists dados_profissionais_pendencias (
  medico_id uuid primary key references medicos(id) on delete cascade,
  estado text not null check (estado in ('reservado','enviado','incerto','concluido')),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create table if not exists dados_profissionais_mensagens (
  medico_id uuid not null references medicos(id) on delete cascade,
  mensagem_id text not null,
  criado_em timestamptz not null default now(),
  primary key (medico_id,mensagem_id)
);
alter table dados_profissionais_pendencias enable row level security;
alter table dados_profissionais_mensagens enable row level security;
revoke all on dados_profissionais_pendencias, dados_profissionais_mensagens from public, anon, authenticated;
create index if not exists idx_solicitacoes_dados_profissionais on solicitacoes_nota(medico_id)
  where aguardando_dados_profissionais and status='pendente';
-- Somente pendentes sem tentativa, lock, nota ou investigação. Casos incertos
-- ficam fora do backfill e serão bloqueados na verificação do emissor.
update solicitacoes_nota s set aguardando_dados_profissionais=true, fila=null,
  datas_consulta_texto=coalesce(s.datas_consulta_texto, substring(s.xdesc_serv from '(?i)NAS DATAS\s+(.+)$')),
  atualizado_em=now()
from medicos m
where m.id=s.medico_id and s.status='pendente' and s.tentativas=0
  and s.bloqueada_em is null and s.bloqueada_por_worker is null
  and not exists(select 1 from notas_fiscais n where n.solicitacao_id=s.id)
  and not exists(select 1 from investigacoes_emissao i where i.solicitacao_id=s.id)
  and (
    m.nome_completo is null or length(trim(m.nome_completo))>200
    or regexp_replace(trim(m.nome_completo),'(?i)^dr(a)?\.?\s+','') !~ '^[[:alpha:]][[:alpha:]’'' -]+ [[:alpha:]’'' -]+$'
    or lower(m.nome_completo) ~ '\m(médico|medico|nome|completo|null|undefined|teste|test|paciente|emitir|emita|preciso|nota|cpf|consulta|cadastro|sem|não|nao|informado|informar|obrigado|bom|dia|boa|tarde|noite)\M'
    or m.crm is null
    or upper(trim(m.crm)) !~ '^(CRM\s*:?\s*)?[0-9]{1,12}(\s*[/-]?\s*(AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO))?$'
    or m.crm !~ '[1-9]'
  );
