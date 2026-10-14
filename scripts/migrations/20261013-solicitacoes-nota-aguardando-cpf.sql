-- Adiciona flag indicando que a solicitação de nota está aguardando o médico informar o CPF
alter table solicitacoes_nota add column if not exists aguardando_cpf_medico boolean not null default false;
