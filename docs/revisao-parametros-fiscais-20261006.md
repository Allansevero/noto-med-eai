# Revisão dos parâmetros fiscais — 06/10/2026

## Resultado e limite da verificação

O código oferece suporte parcial ao leiaute nacional e a IBS/CBS. Não é possível afirmar que todos os parâmetros da reforma estão implementados. Armazenar uma chave em JSONB não significa conseguir validar, extrair ou enviar esse campo corretamente na DPS.

O banco em produção **não foi consultado**. Nesta sessão não havia MCP Supabase conectado. O servidor foi configurado no Codex para o projeto `gvriqdvahxhsqjtqkcqk`, em modo somente leitura, mas a conexão a `mcp.supabase.com` recebeu `403` do proxy antes da autenticação OAuth. Nenhuma tabela ou configuração fiscal foi modificada. As conclusões abaixo são da leitura do repositório, não da estrutura efetivamente implantada.

## Estrutura encontrada no repositório

| Local | O que representa | Resultado |
| --- | --- | --- |
| `medico_perfil_fiscal` | Identificação do emitente, município, regime, ambiente e série | Previsto em `schema_nf_saude.sql`; implantação não confirmada |
| `medico_perfil_fiscal.dados_reforma_tributaria` | Metadados da referência, parâmetros extraídos e pendências | JSONB; o importador controla o subconjunto aceito |
| `medico_perfil_fiscal.cclass_trib_padrao` / `cind_op_padrao` | Campos legados de classificação/operação | Não substituem a política validada por serviço |
| `medico_servicos_fiscais` | Código nacional do serviço, NBS, descrição e serviço padrão | Previsto no SQL base |
| `medico_servicos_fiscais.ctrib_mun` | Código municipal utilizado pela importação e emissão | O código usa a coluna, mas ela não aparece no SQL base nem nas migrações SQL revisadas; verificar existência no banco antes de propor migração |
| `medico_servicos_fiscais.parametros_emissao` | Política validada, vigência, referência, ambiente e parâmetros tributários | Migração `20261005-preparacao-fiscal.sql`; implantação não confirmada |
| `solicitacoes_nota.competencia_emissao` | Competência de cada emissão | Mesma migração; dado operacional, não imposto fixo |
| `auditoria` | Registro de alterações da política | O salvamento existente registra valores anteriores e novos em transação |

## Cobertura real da aplicação

- IBS/CBS: `finNFSe`, `indFinal`, `cIndOp`, `indDest`, `CST`, `cClassTrib`.
- O contrato atual restringe `finNFSe` a `0` e `indDest` a `0`: emissão regular e destinatário igual ao tomador.
- ISS: tributação, retenção e alíquota. O contrato atual aceita apenas `tribISSQN=1` e `tpRetISSQN=1`; outras situações são bloqueadas.
- Regimes: não optante, MEI e ME/EPP, com validações específicas.
- PIS/COFINS: CST e, nos casos suportados de não optante, cálculo sobre o valor integral do serviço, alíquotas e tipo de retenção.
- Totalização: percentual do Simples ou formas suportadas para não optante.
- Vigência e ambiente são registrados na política. Paciente, valor e competência permanecem próprios de cada emissão.

Os schemas usam validação estrita. O importador registra grupos não suportados como pendência, em vez de descartá-los silenciosamente. Não há suporte geral a todos os grupos de IBS/CBS, ajustes de débito/crédito, destinatário diferente, reduções/deduções e retenções.

A tela de edição permite modificar os campos já existentes na política ou referência; não é um formulário completo para adicionar qualquer grupo opcional. Alterar a classificação IBS/CBS sem comprovação compatível na referência continua bloqueado pela validação.

## Comparação com documentação oficial

Fontes consultadas:

- [Documentação RTC](https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/rtc), que lista a NT 009 v1.01 e os anexos correspondentes.
- [NT 009 v1.01](https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/rtc/nota-tecnica-009-se-cgnfs-e-v-1-01.pdf), que descreve novos grupos, mudanças de posição de campos e suporte a CNPJ alfanumérico. A própria nota remete a cronograma de implantação; publicação não comprova vigência em cada endpoint.

Lacunas concretas:

1. **CNPJ alfanumérico:** a importação, leitura do certificado e geração de XML usam `replace(/\D/g, '')`. Letras seriam removidas; não há suporte integral a esse formato.
2. **Notas de ajuste:** o schema aceita somente finalidade regular e não serializa os novos grupos de ajustes de IBS/CBS.
3. **Evolução dos caminhos XML:** o extrator e serializador usam os caminhos do subconjunto DPS nacional 1.01 implementado. A NT 009 descreve reposicionamentos; é necessário mapear versões e datas de implantação, validar contra os XSDs aplicáveis e testar em homologação antes de mudar os caminhos existentes.
4. **Domínios de classificação:** o schema confere formato e consistência com a referência; isso não equivale a validar todos os códigos e enquadramentos tributários contra tabelas oficiais atualizadas.
5. **Referências mais complexas:** grupos fora do subconjunto suportado exigem implementação explícita, mesmo que o JSONB comporte seus dados.

Essas lacunas não demonstram que toda emissão regular suportada esteja incorreta. Demonstram que não é adequado declarar cobertura integral de toda a reforma.

## Consultas somente de leitura para concluir a revisão no banco

Executar pelo MCP autenticado. Começar pelo catálogo; as próximas consultas dependem das colunas existentes.

```sql
select table_name, column_name, data_type, udt_name, is_nullable, column_default
from information_schema.columns
where table_schema = 'public'
  and table_name in ('medico_perfil_fiscal', 'medico_servicos_fiscais', 'solicitacoes_nota', 'auditoria')
order by table_name, ordinal_position;
```

```sql
select count(*) as servicos,
       count(*) filter (where parametros_emissao is not null) as com_politica,
       count(*) filter (where jsonb_typeof(parametros_emissao->'parametros'->'ibscbs') = 'object') as com_ibscbs
from public.medico_servicos_fiscais;
```

```sql
select campo, count(*) as ocorrencias
from public.medico_servicos_fiscais s
cross join lateral jsonb_object_keys(
  case when jsonb_typeof(s.parametros_emissao->'parametros'->'ibscbs') = 'object'
       then s.parametros_emissao->'parametros'->'ibscbs' else '{}'::jsonb end
) as campos(campo)
group by campo order by campo;
```

```sql
select tab.relname as tabela, c.conname, pg_get_constraintdef(c.oid) as definicao
from pg_constraint c
join pg_class tab on tab.oid = c.conrelid
join pg_namespace ns on ns.oid = tab.relnamespace
where ns.nspname = 'public'
  and tab.relname in ('medico_perfil_fiscal', 'medico_servicos_fiscais', 'solicitacoes_nota')
order by tab.relname, c.conname;
```

Essas consultas retornam estrutura e contagens, sem XML, certificados, documentos ou identificação de pacientes. Ainda falta executá-las e confrontar o resultado com as migrações do repositório.
