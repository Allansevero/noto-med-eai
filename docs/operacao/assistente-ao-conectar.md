# Apresentação do Noto Assistente ao conectar

O cadastro do médico e uma instância do consultório conectada iniciam a apresentação e a primeira pergunta do roteiro existente. Não depende da conclusão fiscal, certificado A1 ou recuperação de histórico.

O disparo ocorre pelo webhook `CONNECTION_UPDATE`, pela consulta de status que confirma `open`, pela conexão que já retorna `open` e pela recuperação das instâncias conectadas ao iniciar o servidor. Esses caminhos compartilham uma reserva no PostgreSQL para não repetir a apresentação. Uma conversa já iniciada conserva seu estado na reconexão.

## Configuração no Easypanel

Confira `EVOLUTION_ASSISTANT_URL`, `EVOLUTION_ASSISTANT_API_KEY` (ou `EVOLUTION_ASSISTANT_GLOBAL_API_KEY`), `EVOLUTION_ASSISTANT_INSTANCE_NAME` e `EVOLUTION_ASSISTANT_WEBHOOK_SECRET`. O nome deve coincidir exatamente com o cadastrado na Evolution; o padrão do código é `notomed_assistente`. A instância do Assistente deve estar conectada e enviar `MESSAGES_UPSERT` para `/webhook/evolution` da aplicação, com o segredo configurado. O consultório envia também `CONNECTION_UPDATE`.

Os valores ausentes de URL e chave usam a configuração da Evolution oficial. Isso só funciona se a instância do Assistente estiver nesse mesmo container. Não coloque segredos no repositório.

Esta correção usa a tabela `auditoria` existente e não exige nova migração. Após publicar o código, o servidor também verifica médicos cujos consultórios já estavam conectados e ainda não possuem estado ou reserva de apresentação.

## Confirmação e diagnóstico

O log `[Onboarding Assistente]` informa `estado: enviado` e `mensagensConfirmadas` quando a Evolution aceita os envios. Isso não comprova leitura no celular. O estado inicial da conversa é gravado após a confirmação dos envios.

As ações `reserva_apresentacao_assistente`, `resultado_apresentacao_assistente` e `estado_onboarding_assistente` na auditoria permitem acompanhar o início. O resultado contém a reserva, o estado e a quantidade de mensagens confirmadas, sem texto clínico, telefone ou chaves.

Uma falha de transporte registra `incerto` e impede reenvio automático: timeouts podem ocorrer após a entrega. Verifique o histórico da instância antes de liberar qualquer nova tentativa. Uma reserva deixada por interrupção do processo também exige essa verificação. Falhas anteriores ao transporte registram `falha_preparacao`; devem ser investigadas antes de liberar a reserva. A correção não reinicia conversas que já possuem estado.

As respostas do Assistente também passam a conferir o resultado do transporte, interromper a sequência em caso de falha e retornar `detalhe.envio` no webhook. A lógica existente das etapas seguintes permanece a mesma.

## Redação das mensagens e nome provisório

O gerenciador controla as etapas e fornece objetivos e fatos ao gerador NVIDIA compartilhado, que lê `docs/prompts/noto-conversa.md`. Não há mensagens fixas como alternativa quando a geração falha. A falha anterior ao transporte fica registrada como `falha_preparacao`, para investigação antes de liberar a reserva.

Toda nova apresentação pede o nome real, mesmo se houver um nome no cadastro. Esse valor cadastrado não entra no contexto da IA. O nome informado na conversa é validado, salvo no cadastro e carregado como `nomeConfirmado` no estado das etapas seguintes. Nomes provisórios e respostas inválidas mantêm a pergunta de nome.

A mudança não reinicia conversas existentes nem altera a execução das ferramentas de comprovantes.


## CRM declarado e RQE opcional

Depois do nome real, o Assistente pede o CRM com UF para a descrição da nota. Não pesquisa CRM/RQE online nem confirma registros em conselho. O médico pode informar CRM e RQE juntos; se informar apenas o CRM, a etapa seguinte oferece o RQE como opcional. Informar um número válido ou responder “não”, “sem RQE” ou “pular” permite continuar ao panorama de pacientes e período sem emitir.

O CRM é normalizado pelo validador já usado na emissão. O RQE, quando informado, é um número válido de até 12 dígitos. A opção de seguir sem RQE remove esse campo do cadastro para ele não aparecer na descrição, preservando CRM e demais dados. A descrição usa os campos persistidos em `medicos.crm` e `medicos.rqe`.

O estado antigo `confirmacao_crm_rqe` é aceito para compatibilidade, mas passa a solicitar o CRM diretamente. Responder apenas “sim” nessa etapa não salva sugestões antigas. Nenhuma migração é necessária, pois as novas etapas ficam no JSON de auditoria.
