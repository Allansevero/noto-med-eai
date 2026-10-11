# Sugestões públicas de CRM e RQE

A pesquisa de registros profissionais usa o Google via Serper e a NVIDIA para extrair sugestões dos títulos, trechos e links orgânicos. Não consulta a Infosimples e não trata resultados Google como validação do CFM.

## Fluxo

- O fluxo do certificado A1 reutiliza o CNPJ e os candidatos já obtidos pelo Hub do Desenvolvedor. Um único candidato pode ser pesquisado pelo nome completo; com vários candidatos, a pesquisa aguarda a identificação do responsável.
- A consulta envia `"NOME COMPLETO" CRM RQE`, com `gl=br`, `hl=pt-br` e até dez resultados orgânicos. Não consulta a pesquisa fiscal/ADN nem interfere nos parâmetros fiscais ou na emissão.
- A NVIDIA só pode extrair dados com citações literais dos resultados. O backend valida CRM, UF e RQE no texto original, rejeita números inventados/truncados, UF não explicitada, perfis ambíguos e situação transferida, cancelada, inativa, suspensa ou cassada. Um RQE precisa estar na mesma evidência que o nome e o CRM correspondente. Dados de páginas diferentes não são combinados sem essa evidência.
- Sugestões têm `verificado=false`, mantêm fontes e links por RQE e só aparecem para confirmação em Dados da Conta. Divergências permanecem para escolha humana; quando há vários RQEs, nenhum é selecionado automaticamente.
- O backend só salva os dados após a confirmação do profissional e exige WhatsApp conectado. A confirmação ocorre no painel. O onboarding continua certificado A1 → conexão do WhatsApp → painel, e o WhatsApp oficial permanece reservado ao OTP.

## Configuração e uso

Configure `SERPER_API_KEY`, `NVIDIA_API_KEY` e `NVIDIA_MODEL` no backend do Easypanel. Os valores não devem ser incluídos no Git nem em logs. Sem qualquer uma das duas chaves de API, a pesquisa fica indisponível e o cadastro continua permitindo revisão manual.

Para uma consulta manual sem gravação no banco, no terminal do contêiner Easypanel execute:

```sh
npm run consultar:registro -- "Nome completo do médico"
```

Esse comando usa o mesmo adaptador da aplicação e imprime as sugestões estruturadas e suas fontes. A chamada ao Serper pode consumir créditos. Não executamos consultas externas durante o desenvolvimento.

Falhas de rede, timeout, resposta HTTP e JSON inválido viram códigos sanitizados. A consulta paga não tem retentativa HTTP interna; a fila existente limita o processamento a três tentativas. Resultado vazio e falha ficam registrados e não reiniciam a cada ciclo de recuperação.

Ao ativar a integração, trabalhos pendentes de confirmação que ainda contenham resultado ou erro antigo da Infosimples/CFM são reagendados uma vez. O reagendamento preserva a consulta CNPJ do Hub, remove apenas o resultado profissional antigo e reinicia o orçamento de tentativas. Cadastros concluídos não são reabertos. Resultados novos do Serper não satisfazem o filtro legado.

## Testes

Os testes unitários usam respostas sintéticas e validam evidências, limites numéricos, UF, homônimos, RQEs divergentes, fontes ambíguas e falhas de integração sem chamar serviços pagos. O teste PostgreSQL usa exclusivamente `NOTO_TEST_DATABASE_URL`, que deve apontar para um banco local dedicado; nunca use a URL de produção.
