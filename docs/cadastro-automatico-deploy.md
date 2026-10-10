# Deploy do cadastro automático pelo A1

## Comportamento

`NOTO_CADASTRO_MODO=confirmacao` é o padrão quando a variável está ausente. Suspende apresentação, perguntas de onboarding e recuperação de turnos antigos. O assistente só atende uma pendência cadastral aberta. OTP oficial, integrações, parâmetros fiscais e emissão conservam seus fluxos.

Ao salvar o A1, o upload agenda enriquecimento sem esperar consultas externas. O processo web recupera a fila a cada cinco segundos e agenda certificados ativos ainda sem trabalho. Certificados anteriores ficam obsoletos; alterações em nome/CRM invalidam perguntas antigas. A versão mantém histórico e não apaga cadastros.

**Fontes atualmente disponíveis:** Hub como fonte CNPJ principal quando `HUB_DESENVOLVEDOR_TOKEN` está configurado; BrasilAPI como fonte secundária se o Hub estiver indisponível ou o token ausente. Um candidato deve ser confirmado como médico responsável. O nome do secretário não é promovido ao do médico nem sobrescrito pelo nome encontrado. Para e-CPF, a consulta de CPF já existente do Hub pode fornecer um candidato com o mesmo token configurado.

**Limitações externas:** o acesso/saldo do token ao CNPJ do Hub não foi testado com consulta real. Pesquisa de CRM automática não habilitada: página pública do CFM exige reCAPTCHA. Por enquanto, depois de identificar o médico, o Noto pede CRM com UF como dado declarado, sem RQE e sem retomar o roteiro antigo. Consulte [fontes](cadastro-automatico-fontes.md).

O Hub pode levar até 300 segundos; a reserva do trabalho dura seis minutos. Isso ocorre depois do upload, sem esperar a consulta na requisição de envio do A1. A chamada padrão pode consumir um crédito na base ou dois na Receita; não forçamos a Receita nem consultamos inscrições estaduais adicionais. Configurar o token no ambiente do backend, sem incluí-lo no código ou em URLs de logs. Trabalhos que já possuem empresa válida reutilizam seus dados, sem forçar nova consulta paga após esse deploy.

A empresa é armazenada nos dados do trabalho cadastral; os parâmetros fiscais continuam vindo da referência ADN. Nenhum enquadramento fiscal é sobrescrito pela consulta secundária.

## Ordem de aplicação

1. Antes de publicar o novo código, executar `npm run migrate:assistente` caso a memória antiga ainda não tenha sido criada.
2. Executar `npm run migrate:cadastro` com o `DATABASE_URL` do backend. A migração é idempotente, não envia mensagens e cria tabelas protegidas por RLS, sem acesso público/anon/authenticated.
3. Publicar o código incorporado a `feat/nvidia-only` e reiniciar o serviço web no Easypanel. O worker fiscal separado também recebe a configuração para não iniciar coleta legada.
4. Manter `NOTO_CADASTRO_MODO=confirmacao`, `NVIDIA_API_KEY`, `NVIDIA_MODEL` e a configuração da instância do assistente. A flag `ASSISTENTE_CONTEXTUAL_ATIVO` controla apenas o fluxo conversacional anterior; não habilita apresentações no novo modo.
5. Verificar com uma conta controlada: A1 é aceito/importado independentemente do enriquecimento; conexão do WhatsApp não gera apresentação; só aparece confirmação de candidato ou pedido cadastral indispensável.

Não reiniciar turnos antigos por SQL: eles pertencem ao fluxo suspenso. Dados já confirmados em trabalhos anteriores e na memória legada são preservados. Alterações de preferências/período continuam pelo painel; o enriquecimento não inicia uma busca por comprovantes ou cria novas notas.

## Diagnóstico

- `cadastro_certificado_trabalhos`: estado, tentativas, próxima tentativa e diagnóstico técnico. Empresa/candidatos estão em `dados`, restritos ao backend.
- `cadastro_certificado_avisos`: pergunta/conclusão, estado de envio e diagnóstico sanitizado.
- `cadastro_certificado_respostas`: mensagens recebidas e processamento idempotente.
- Falhas de consulta fazem três tentativas (30/120 segundos entre tentativas) antes da coleta mínima. Falhas de geração/interpretação também têm três tentativas; consulte códigos `IA_*` e a configuração NVIDIA.
- Perguntas aguardam a conexão do WhatsApp do médico e a prontidão da instância do assistente. Uma rejeição HTTP explícita (400/401/403/404/422/429) mantém a mensagem preparada para nova tentativa limitada.
- Envio iniciado sem confirmação ou falha de conexão de resultado desconhecido fica `incerto`; não é reenviado automaticamente para evitar duplicatas. Investigar a confirmação na Evolution antes de qualquer retomada manual.
- Apenas perguntas com envio confirmado aceitam alterações por resposta. O reconhecimento usa o contexto da pergunta; não exige respostas literais de sim/não.

Não incluir documentos, conteúdo das respostas, chave privada, senha ou credenciais nos logs técnicos. Não usar produção para rodar testes.

## Testes locais e rollback

`npm run typecheck`, `npm test` e `NOTO_TEST_DATABASE_URL=<PostgreSQL local dedicado de teste> npm run test:cadastro-db`. A suíte de banco recusa URLs sem host local ou sem `test` no nome; cria e remove seu próprio schema.

Rollback de comportamento: definir `NOTO_CADASTRO_MODO=conversacional` e reiniciar web/worker. A fila cadastral fica parada e a lógica antiga pode voltar a processar seu histórico se `ASSISTENTE_CONTEXTUAL_ATIVO=true`; avaliar as pendências antigas antes de reativar. Não remover tabelas nem apagar dados para rollback.

Código no GitHub não significa deploy aplicado no Easypanel. Nenhuma migração, consulta com documentos reais ou mensagem de teste foi executada em produção durante esta implementação.
