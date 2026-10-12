# Sugestões públicas de CRM e RQE

A pesquisa de registros profissionais usa o Google via Serper e a NVIDIA para extrair sugestões dos títulos, trechos e links orgânicos. Não consulta a Infosimples e não trata resultados Google como validação do CFM.

## Fluxo

- O fluxo do certificado A1 reutiliza o CNPJ e os candidatos já obtidos pelo Hub do Desenvolvedor. Um único candidato pode ser pesquisado pelo nome completo; com vários candidatos, a pesquisa aguarda a identificação do responsável.
- A consulta envia `CRM NOME COMPLETO`, com `gl=br`, `hl=pt-br` e até dez resultados orgânicos. Não consulta a pesquisa fiscal/ADN nem interfere nos parâmetros fiscais ou na emissão.
- A NVIDIA só pode extrair dados com citações literais dos resultados. O backend valida CRM, UF e RQE no texto original, rejeita números inventados/truncados, UF do CRM não explicitada, perfis ambíguos e situação transferida, cancelada, inativa, suspensa ou cassada. Um RQE precisa estar na mesma evidência que o nome e o CRM correspondente. Dados de páginas diferentes não são combinados sem essa evidência.
- Sugestões têm `verificado=false`, mantêm fontes e links por RQE e só aparecem para confirmação em Dados da Conta. Divergências permanecem para escolha humana; quando há vários RQEs, nenhum é selecionado automaticamente.
- Nome no título e registro no snippet podem ser citados separadamente quando pertencem ao mesmo resultado. Formatos como `CRM 30858 SC` são inscrições explícitas. Um RQE sem UF repetida pode ser vinculado ao único CRM/UF da mesma fonte, desde que a fonte também identifique literalmente o nome completo; a origem da UF fica registrada em `ufOrigem`. Um handle de rede social sem esse nome não basta para atribuir RQE.
- Se a citação de RQE omitir o nome, o backend pode acrescentar o título literal desse mesmo resultado quando ele contém o nome completo. A evidência final preserva os dois fragmentos e o limite de 500 caracteres. O trecho de RQE ainda precisa citar CRM/UF e o número completo; outra fonte, handle ou URL não substituem o nome.
- O backend só salva os dados após a confirmação do profissional e exige WhatsApp conectado. A confirmação ocorre no painel. O onboarding continua certificado A1 → conexão do WhatsApp → painel, e o WhatsApp oficial permanece reservado ao OTP.

## Configuração e uso

Configure `SERPER_API_KEY`, `NVIDIA_API_KEY` e `NVIDIA_MODEL` no backend do Easypanel. Os valores não devem ser incluídos no Git nem em logs. Sem qualquer uma das duas chaves de API, a pesquisa fica indisponível e o cadastro continua permitindo revisão manual.

Para uma consulta manual sem gravação no banco, no terminal do contêiner Easypanel execute:

```sh
npm run consultar:registro -- "Nome completo do médico"
```

Passe somente o nome; o adaptador acrescenta `CRM`. Para investigar uma rejeição, use:

```sh
npm run consultar:registro -- "Nome completo do médico" --diagnostico
```

Esse modo acrescenta contagens de resultados/candidatos e o motivo de validação de cada candidato. Por exemplo, `NOME_DIVERGENTE`, `EVIDENCIA_CRM_FONTE_INEXISTENTE` ou `EVIDENCIA_CRM_CITACAO_NAO_LITERAL`. Não imprime nomes, registros, links, credenciais ou respostas brutas no diagnóstico, não flexibiliza as regras e executa a mesma consulta única. A saída normal das sugestões permanece disponível. O argumento `--diagnostico` não é incluído no nome pesquisado.

Esse comando usa o mesmo adaptador da aplicação e imprime as sugestões estruturadas e suas fontes. A chamada ao Serper pode consumir créditos. Não executamos consultas externas durante o desenvolvimento.

O diagnóstico também distingue RQE ausente da extração (`NVIDIA_SEM_CANDIDATOS_RQE`) de RQE descartado pela validação, com o motivo de cada descarte. `fontesComMencaoRqe` conta apenas resultados com a palavra RQE, sem afirmar que a evidência identifica o médico. A etapa `fontes_rqe` também conta resultados com nome e CRM/UF correspondentes e menção de RQE; a menção não substitui a validação completa do número e da UF. `candidato` e `indiceRqe` são índices, não números de registro. O nome em maiúsculas vindo do Hub continua válido.

A consulta automática do cadastro salva esses eventos sanitizados junto à pesquisa e os devolve como `revisao.diagnosticoPesquisa` em `/api/conta/cadastro`. Assim é possível inspecionar a execução que originou o cadastro, em vez de comparar com outra consulta manual. Não há respostas brutas ou credenciais nesse campo. Pesquisas anteriores à instrumentação retornam uma lista vazia: os motivos antigos não podem ser reconstruídos, e cadastros concluídos não são reabertos. A pesquisa manual continua sem atualizar o cadastro.

Falhas de rede, timeout, resposta HTTP e JSON inválido viram códigos sanitizados. A consulta paga não tem retentativa HTTP interna; a fila existente limita o processamento a três tentativas. Resultado vazio e falha ficam registrados e não reiniciam a cada ciclo de recuperação.

A extração aceita JSON puro ou um único bloco Markdown envolvendo todo o JSON, mantendo a validação literal de cada registro. Os diagnósticos da NVIDIA distinguem `NVIDIA_JSON_INVALIDO` (conteúdo não parseável), `NVIDIA_FORMATO_INESPERADO` (objeto sem lista `registros`) e `NVIDIA_LIMITE_EXCEDIDO` (resposta ou lista acima do limite). Uma lista `registros` vazia significa ausência de evidência suficiente. Esses códigos não expõem a resposta bruta nem credenciais.

Resultados vazios distinguem `SERPER_SEM_RESULTADOS_UTILIZAVEIS` (nenhum resultado orgânico utilizável), `NVIDIA_SEM_REGISTROS` (o modelo não extraiu candidatos) e `CRM_EVIDENCIA_NAO_CONFIRMADA` (os candidatos extraídos falharam na validação literal). Todos permanecem disponíveis para preenchimento manual, sem repetição automática da busca em cada ciclo.

Ao ativar a integração, trabalhos pendentes de confirmação que ainda contenham resultado ou erro antigo da Infosimples/CFM são reagendados uma vez. O reagendamento preserva a consulta CNPJ do Hub, remove apenas o resultado profissional antigo e reinicia o orçamento de tentativas. Cadastros concluídos não são reabertos. Resultados novos do Serper não satisfazem o filtro legado.

## Testes

Os testes unitários usam respostas sintéticas e validam evidências, limites numéricos, UF, homônimos, RQEs divergentes, fontes ambíguas e falhas de integração sem chamar serviços pagos. O teste PostgreSQL usa exclusivamente `NOTO_TEST_DATABASE_URL`, que deve apontar para um banco local dedicado; nunca use a URL de produção.
