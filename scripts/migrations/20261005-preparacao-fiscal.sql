-- Não confirma nem inventa parâmetros para cadastros existentes.
alter table medico_servicos_fiscais add column if not exists parametros_emissao jsonb;
alter table solicitacoes_nota add column if not exists competencia_emissao date;
