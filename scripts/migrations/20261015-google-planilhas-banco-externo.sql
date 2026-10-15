-- Adiciona colunas para suportar o Google Sheets como banco de dados externo em tempo real
alter table google_planilhas_conexoes
  add column if not exists planilha_id text,
  add column if not exists planilha_nome text,
  add column if not exists aba_nome text,
  add column if not exists mapeamento_colunas jsonb;
