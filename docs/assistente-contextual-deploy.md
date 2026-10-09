# Ativar o Noto Assistente contextual

Branch de entrega: `fix/assistente-guia-conversa`, PR #3 para `feat/nvidia-only`.

O agente interpreta a intenção com NVIDIA, valida ações explícitas e redige a resposta com o histórico e `docs/prompts/noto-conversa.md`. O cadastro é uma tarefa pendente: dúvidas, pausas e conversas após concluí-lo continuam recebendo respostas. O nome inicial do cadastro não identifica o médico; ele informa nome real, CRM e, opcionalmente, RQE. Não há pesquisa online.

## Deploy no Easypanel

1. Usar a branch de entrega ou incorporar o PR #3 na branch configurada no Easypanel.
2. No console do aplicativo com a nova versão e `DATABASE_URL` do ambiente, executar `npm run migrate:assistente`. A migração é transacional e repetível; cria duas tabelas com RLS, acessíveis apenas pelo backend. Ela não envia mensagens nem altera cadastros existentes.
3. Configurar `ASSISTENTE_CONTEXTUAL_ATIVO=true` e reiniciar/reimplantar o aplicativo. A flag é desligada por padrão: sem ela permanece o fluxo anterior.
4. Manter `NVIDIA_API_KEY` e `NVIDIA_MODEL`, a instância `EVOLUTION_ASSISTANT_INSTANCE_NAME` e URL/chave da Evolution. O webhook precisa de segredo configurado, via `EVOLUTION_ASSISTANT_WEBHOOK_SECRET` ou `EVOLUTION_WEBHOOK_SECRET`, conforme a configuração atual de autenticação. Não colocar chaves no GitHub.
5. Com um cadastro de teste e WhatsApp conectado, testar nome e CRM juntos; dúvida sobre CRM; RQE dispensado; período não informado; dúvida sobre data do comprovante; pausa/retomada e conversa depois de concluir.

A apresentação já enviada não se repete ao ativar a flag. O estado anterior e a preferência registrada em auditoria são aproveitados; o novo histórico registra as mensagens recebidas a partir da ativação. Boas-vindas enviadas antes disso não são reconstruídas como se o transporte tivesse sido confirmado.

## Comportamento e recuperação

Cada turno usa no máximo duas chamadas de IA por tentativa: decisão e redação após a gravação confirmada. O contexto contém até 20 mensagens, o cadastro confirmado e um panorama parcial das últimas cinco solicitações do próprio médico. Período e preferência não recebem padrões automáticos.

A fila ordena por médico e deduplica por instância/ID da mensagem. Uma reserva expira após cinco minutos e é verificada antes das gravações e do envio. Processos retomam preparação com até três tentativas e intervalo mínimo de um minuto. Após salvar dados, a retomada repete somente a redação. O servidor verifica a fila a cada cinco segundos. A apresentação inicial que falhou antes do transporte pode ser tentada novamente por conexão/status, com o mesmo limite de três tentativas e intervalo de um minuto.

Mensagens aceitas pela Evolution são registradas como confirmadas; isso não comprova leitura no celular. Timeout, interrupção ou falha de transporte tornam a entrega incerta e impedem reenvio automático. O histórico inclui só as mensagens confirmadas, inclusive em uma sequência parcialmente enviada. Novas mensagens do médico podem continuar a conversa.

Este agente consulta solicitações e altera somente nome, CRM, RQE, período, preferência e pausa. Ele não varre comprovantes, solicita CPF nem emite/reprocessa notas. A redação recebe essa restrição e os resultados reais para não prometer ações inexistentes.

Para desativar, definir `ASSISTENTE_CONTEXTUAL_ATIVO=false`; não apagar tabelas ou auditoria. O fluxo antigo não lê o novo histórico, então a desativação é uma reversão operacional, não uma sincronização de conversas.

## Verificação local

`npm run typecheck` e `npm test`. A suíte de banco usa PostgreSQL local dedicado, com URL em `NOTO_TEST_DATABASE_URL` e nome de banco contendo `test`: `npm run test:assistente-db`. Ela cria e apaga apenas um schema temporário desse banco. Serviços NVIDIA/Evolution são simulados nos testes; nenhum teste exige credenciais de produção.
