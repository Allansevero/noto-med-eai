-- Adiciona preferência de destino para solicitação de CPF quando ausente
alter table medicos add column if not exists solicitar_cpf_direto_paciente boolean not null default false;
