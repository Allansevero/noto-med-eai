-- Colunas já consumidas pela importação do XML de referência.
-- Sem backfill ou valor fiscal presumido; colunas existentes são preservadas.
begin;

alter table medico_perfil_fiscal add column if not exists proximo_numero_dps bigint;
alter table medico_perfil_fiscal add column if not exists cnae text;
alter table medico_servicos_fiscais add column if not exists aliquota_iss numeric;
alter table medico_servicos_fiscais add column if not exists ctrib_mun text;

commit;
