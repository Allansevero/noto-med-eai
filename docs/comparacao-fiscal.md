# Comparar consultas com a nota padrão

Esta etapa é consultiva: combina consultas cadastrais/municipais com a referência
importada e exibe os parâmetros salvos ou sugeridos pelo Noto. Não transmite DPS,
não altera classificação, não confirma política e não libera operações que o
emissor ainda não suporta. A emissão normal permanece no fluxo determinístico.

## Fontes e limites

- BrasilAPI CNPJ v1, que utiliza Minha Receita: consulta pública secundária, sem
  contrato pago ou envio do certificado. Envia somente o CNPJ. Pode estar defasada;
  campos ausentes não são presumidos. O cadastro atual não comprova o enquadramento
  histórico na competência do XML. Não representa uma consulta direta à Receita.
- ADN Parâmetros Municipais: GET de convênio do município emitente e alíquota
  municipal geral para código completo do serviço, município de incidência e
  competência presentes no XML. Usa A1 via mTLS somente nos hosts oficiais do
  ambiente do perfil. Ausência, ambiguidade, erro ou falta de autorização não
  autorizam um valor padrão. A alíquota geral fica informativa e não substitui a
  alíquota efetiva do Simples, benefício ou regime específico.
- XML original no Storage: leitura conferida com SHA-256 e titular do A1. O
  relatório identifica número, competência e origem. Não usa dados do paciente.
- Política salva, quando existente, ou sugestões persistidas na importação:
  são apresentadas como “Noto: salvo ou sugerido”. Campos ainda não serializados
  podem diferir do XML e continuam sujeitos aos bloqueios da preparação fiscal.

Não há validação independente de IBS/CBS nesta versão. O relatório preserva seus
códigos e informa que vêm da referência, sem declarar que foram confirmados por
uma API. Uma referência repetida só é aplicável ao mesmo tipo de operação e à
vigência revisada. Não é criada classificação tributária a partir de CNAE.

Sem XML, o cadastro e o convênio podem ser consultados; faltam os parâmetros do
serviço para formar e confirmar uma política. A integração contábil/Serpro não
está implementada. Empresas não optantes pelo Simples podem ser comparadas, mas
a limitação de emissão existente continua explícita.

## Uso

1. Implantar o código no serviço `web`.
2. Executar `npm run migrate:comparacao` no terminal do serviço.
3. Configurar `COMPARACAO_FISCAL_ATIVA=true` e reiniciar/implantar o serviço.
4. Abrir **Revisar dados fiscais** ou cadastrar o A1. A conferência roda após a
   importação e também quando a busca do XML falha. Importar uma referência
   manualmente atualiza a comparação.
5. Conferir cada coluna, fontes, pendências e a competência. “Comparação parcial”
   não significa validação fiscal completa nem autorização para emissão.

As flags de agente/preparação e suas migrações continuam necessárias para emissão
com uma referência revisada. A comparação isolada não exige ativá-las.

## Persistência e falhas

`consultas_fiscais_onboarding` guarda evidências selecionadas por médico,
certificado, referência, competência e ambiente. Usa cache de cinco minutos,
inclusive para falhas, evitando repetição imediata de chamadas. Uma troca de A1
ou de referência cria outro contexto. Evidências antigas não são aplicadas a
uma referência nova. O relatório é reconstruído com os parâmetros atuais.

Não grava certificado, senha, CNPJ completo, XML bruto ou dados do paciente na
tabela de evidências. RLS é ativada; o backend usa a conexão PostgreSQL existente.
APIs têm prazo de oito segundos por requisição. O endpoint de comparação retorna
indisponibilidade sem interromper o cadastro do A1 ou a importação do XML.

## Contratos consultados e validação

- [BrasilAPI](https://brasilapi.com.br/docs), [implementação do provedor cadastral](https://github.com/BrasilAPI/BrasilAPI/blob/main/services/cnpj.js).
- [Documentação oficial NFS-e](https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/documentacao-atual) e [endereços oficiais das APIs](https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/apis-prod-restrita-e-producao/apis-prod-restrita-e-producao).
- O Swagger oficial não pôde ser acessado deste ambiente. O contrato detalhado
  de parametrização foi conferido em uma [cópia pública do OpenAPI](https://github.com/nfse-nacional/nfse-php/blob/main/references/api-specs/production/prod-API-NFS-e-ADN-Parametros-Municipais-%28v1%29.json).
  O cliente rejeita respostas não reconhecidas. Homologação com o A1 e a nota
  reais continua pendente; não foi validada conectividade com esses serviços.

Os testes usam respostas simuladas e verificam ausência de defaults, igualdade
parcial, divergências, CNPJ incorreto, alíquota ambígua, falhas HTTP, cache,
mudança de certificado, hash do XML e separação dos parâmetros de emissão.
