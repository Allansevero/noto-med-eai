# Conversa contextual e confirmação de leitura

A resposta usa o papel declarado por quem fala e a última solicitação efetivamente enviada pelo Noto. A etapa do cadastro continua indicando os dados faltantes. Uma pergunta recente sobre outro assunto prevalece sobre uma etapa antiga.

O validador aceita respostas como `Sim, é Ana Maria Silva`, CRM com UF antes do número (`CRM/RS 37341`) e dispensa contextual de RQE (`Não precisa`, `Siga sem ele`). Perguntas, negações de intenção e dados de outra pessoa continuam sujeitos à validação. A apresentação de uma secretária não confirma o nome da médica.

O servidor registra a entrada antes de chamar `POST /chat/markMessageAsRead/{instancia}` na Evolution. Envia a chave original da mensagem, incluindo o JID original quando for LID. O prazo é de três segundos; a leitura ocorre em paralelo ao processamento e uma falha não interrompe a resposta. Canal oficial de OTP, mensagens próprias, grupos e replays não recebem essa chamada. O log `fase: marcar_lida` registra sucesso ou um código sem conteúdo da conversa.

Se uma nova mensagem chega enquanto a resposta anterior está sendo preparada, a resposta anterior ainda não enviada é encerrada com `RESPOSTA_SUPERADA`. As gravações já confirmadas permanecem e a próxima mensagem é processada. A redação verifica os campos salvos e pode ser corrigida uma vez antes do envio se pedir nome/CRM já informado ou confirmar uma gravação rejeitada.

No primeiro processamento após esta atualização, propostas rejeitadas nos últimos 50 turnos concluídos são revalidadas com sua mensagem original e as perguntas confirmadas naquele histórico. Apenas dados profissionais ausentes ou idênticos ao perfil são recuperados; edições posteriores não são substituídas. A recuperação é transacional, auditada e executada uma vez por sessão. Não reenvia respostas antigas nem retransmite notas. A conversa existente pode continuar com uma mensagem como `Pode continuar`, sem repetir os dados já fornecidos.

Após nome, CRM e decisão de RQE, o assistente orienta sobre pacientes e integrações, coleta o período e depois a preferência da data da consulta na descrição. Essas escolhas não comprovam que uma busca de comprovantes ou emissão já começou. A coleta profissional legada não envia uma segunda pergunta quando a sessão contextual está conduzindo a conversa; a retomada de solicitações elegíveis segue as regras existentes.

## Deploy e validação

Não há nova migração de tabelas nesta correção: os metadados ficam no estado JSON existente. A migração `npm run migrate:assistente` continua sendo pré-requisito para instalações que ainda não possuem a memória e a fila.

Depois do deploy, enviar uma mensagem à instância do assistente e conferir o log `marcar_lida`. Os testes de leitura usam HTTP simulado; a exibição dos dois indicadores azuis precisa ser verificada nos aparelhos após o deploy. A versão pública da Evolution consultada durante a investigação foi 2.4.0.

Verificação local: `npm run typecheck`, `npm test` e `npm run test:assistente-db` com `NOTO_TEST_DATABASE_URL` apontando exclusivamente para PostgreSQL local dedicado a testes. A integração exercita o agente, adaptadores NVIDIA/Evolution com HTTP simulado e PostgreSQL real, incluindo reinício do agente, gravação do nome do usuário e superação de respostas antigas.
