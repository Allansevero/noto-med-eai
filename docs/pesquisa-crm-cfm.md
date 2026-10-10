# Pesquisa de CRM e RQE com Infosimples

A fonte é a API Infosimples v2 CFM/Cadastro, conforme documentação da conta fornecida em 10/10/2026. Endpoint: `POST https://api.infosimples.com/api/v2/consultas/cfm/cadastro`, corpo `application/x-www-form-urlencoded`, com `token`, `nome` completo e `timeout=90`. Não usa mais RPA no Chromium nem tem fallback para automação do portal.

## Fluxo e confirmação

Após encontrar um único candidato no Hub, pesquisa por nome completo antes de pedir a confirmação. Com vários sócios, aguarda a identificação do responsável. O provedor informa que pesquisa por nome devolve apenas o primeiro resultado exatamente igual; isso não elimina homônimos. Exigimos correspondência exata do nome e confirmação do usuário.

A inscrição retornada pode não conter UF. A UF do endereço nunca é usada como UF do CRM. Quando necessário, a UF da primeira inscrição serve apenas para restringir uma segunda consulta ao mesmo nome e àquela UF. Só o resultado dessa consulta restrita é apresentado. Se não for possível confirmar a associação, permite preenchimento manual. Esse método não enumera todas as inscrições do médico.

Os RQEs são extraídos de `especialidade_lista` ou `especialidade`. Um único RQE preenche a sugestão; múltiplos RQEs são exibidos para revisão, sem escolher uma especialidade automaticamente. Nome, CRM e RQE só são cadastrados após confirmação. O onboarding continua A1 → conexão inicial do WhatsApp → painel. O backend exige WhatsApp conectado para confirmar. A referência ADN e os requisitos fiscais permanecem independentes.

## Configuração e custos

- Configure `INFOSIMPLES_TOKEN` somente no backend do Easypanel, sem incluir a chave no Git ou em logs.
- `CFM_PESQUISA_ATIVA=true` é o padrão; `false` suspende a consulta. Sem token, o painel permite preenchimento manual e não faz consulta paga.
- Reinicie o serviço web após configurar o token e publicar o código. Não há nova migração de banco.
- Cada tentativa usa uma ou duas chamadas. A documentação informa adicional de R$ 0,04 por chamada, além do preço base. Falhas podem resultar em retentativas limitadas pela fila existente; o valor efetivo depende da cobrança Infosimples. Consultas externas podem levar até 90 segundos por chamada, fora da requisição de upload. A reserva do trabalho dura nove minutos para cobrir Hub (até 300 segundos) e duas chamadas Infosimples, evitando recuperação concorrente durante a consulta.
- Resultados concluídos são reutilizados. Trabalhos pendentes de confirmação com falha antiga `CFM_*` ou sem fonte configurada são recuperados uma vez ao ativar a API, reutilizando a empresa consultada no Hub. Falhas Infosimples não são reagendadas a cada ciclo apenas por abrir o painel.

## Diagnóstico e validação

`INFOSIMPLES_API_<código>` e `INFOSIMPLES_HTTP_<status>` identificam erros sanitizados. `INFOSIMPLES_UF_NAO_CONFIRMADA` impede associação sem fonte suficiente; `INFOSIMPLES_RESULTADO_AMBIGUO` indica nome divergente ou quantidade inesperada; `INFOSIMPLES_NAO_ENCONTRADO` indica consulta vazia. Nenhum código comprova ausência de habilitação profissional.

Logs não incluem token, documentos, nomes, respostas brutas ou dados de contato. Testes usam transporte sintético e PostgreSQL local. Nenhuma consulta paga ou teste com dados pessoais reais foi executado durante o desenvolvimento; acesso, saldo e resultado real do provedor devem ser validados após configurar o token.
