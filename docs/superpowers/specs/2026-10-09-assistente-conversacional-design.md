# Noto Assistente: conversa com contexto e ações verificadas

## Objetivo

Ajudar o médico em uma conversa natural pelo WhatsApp. O onboarding é uma tarefa que o agente acompanha, respeitando dúvidas, pausas, correções e o ritmo do usuário. Não é uma sequência de perguntas que transforma qualquer mensagem na resposta esperada da etapa.

Requisitos definidos pelo usuário: pedir o nome real, ignorando o cadastro provisório; pedir CRM declarado para a descrição da nota; oferecer RQE opcional; não pesquisar registros online; usar `docs/prompts/noto-conversa.md` como guia de conversa; entender o contexto antes de responder e continuar ajudando após concluir o onboarding.

## Diagnóstico confirmado

O PR #3 ainda está aberto, e `feat/nvidia-only` permanece no commit `aa431e5`; portanto, mudanças daquele PR não estão nessa branch de produção. Isso não comprova qual imagem o Easypanel executa.

Mesmo no PR, o gerenciador envia `historico: []` e decide as etapas por expressões e respostas fixas. Um período não reconhecido vira 60 dias; uma preferência não reconhecida vira `perguntar_uma_a_uma`; a etapa `concluido` retorna nenhuma resposta. Usar o guia apenas para redigir não resolve essas limitações. As mudanças anteriores não entregam o comportamento conversacional solicitado.

## Funcionamento proposto

1. Receber e registrar a mensagem autenticada, vinculada ao médico e à instância. Descartar grupos, mensagens próprias e duplicadas.
2. Carregar o histórico recente, os dados efetivamente salvos, o progresso, eventual pausa e o resultado das ações anteriores. Dados e resultados do sistema têm precedência sobre frases antigas da conversa.
3. A NVIDIA interpreta a intenção e propõe uma decisão estruturada: conversar, esclarecer, pausar, retomar, consultar informações ou registrar dados explícitos. O próximo dado faltante é contexto da missão, não uma obrigação de perguntar em toda mensagem.
4. O backend valida e executa exclusivamente ferramentas oferecidas. Uma dúvida ou pausa não altera dados profissionais, período ou preferência. Ações não comprovadas não são apresentadas como concluídas.
5. Com os resultados reais, a NVIDIA redige a resposta usando o guia e o histórico. Pode responder primeiro à dúvida e adiar a pergunta do onboarding. No máximo uma pergunta por resposta; zero perguntas quando uma pausa ou explicação for suficiente.
6. Registrar separadamente a resposta planejada e o resultado do transporte. Só mensagens aceitas pela Evolution entram no histórico como enviadas; aceite não comprova leitura no celular.

São no máximo duas chamadas de IA por turno: decisão contextual e resposta após validação/ações. Não há loop livre de ferramentas. Não basta alterar uma opção de “thinking” para entregar esse comportamento: são necessários memória, interpretação e resultados verificáveis.

## Memória e ritmo

Persistir o histórico recente e o resumo estruturado por médico. Usar até 20 mensagens recentes, limitadas em tamanho, junto aos dados e à tarefa pendente. O nome provisório do cadastro não é a identidade conversacional.

Uma pausa preserva a tarefa pendente e impede insistência ou lembretes automáticos de onboarding. O médico pode retomar quando quiser. Correções explícitas atualizam dados validados; dúvida, ironia ou afirmação ambígua pedem esclarecimento. Após o onboarding, o agente continua respondendo e pode consultar o cadastro e o estado das solicitações daquele médico.

Não selecionar um período padrão nem escolher uma preferência quando a resposta não expressa essa decisão. Quando o usuário não souber o período, conversar e esclarecer antes de registrar. O RQE pode ser omitido. Informações explicitamente fornecidas juntas podem ser aproveitadas sem repetir perguntas já respondidas.

## Ferramentas e validações

Ferramentas delimitadas: consultar cadastro e panorama de pacientes/solicitações; registrar nome, CRM e RQE declarados; registrar período explícito e preferência explícita de data; pausar ou retomar o acompanhamento. Consulta de solicitações é de leitura e restrita ao médico identificado.

O agente propõe argumentos, nunca SQL, URLs, destinatários arbitrários ou emissão de nota. O backend valida os dados com os validadores existentes e verifica que novos valores vieram de informação explícita do usuário. Propostas ambíguas não são aplicadas. Resultados distinguem dado salvo, inválido, não alterado e falha. Só uma gravação confirmada autoriza afirmar que salvou.

A data da consulta pertence à descrição; a data da nota é o dia da emissão. Este trabalho não conecta varredura de comprovantes nem autoriza novas emissões: o agente não promete essas ações se o sistema não as executou.

## Persistência e concorrência

Adicionar uma migração explícita para turnos do Assistente, com chave única de instância/mensagem, médico, sequência, versão de contexto, decisão, resultados e estado de entrega. Acesso apenas pelo backend; não expor o histórico entre contas.

Processar turnos em ordem por médico. Reservar o turno no banco, liberar a transação antes de chamar NVIDIA/Evolution e verificar novamente a versão antes de aplicar efeitos. Ações são idempotentes por turno. Mensagens simultâneas não sobrescrevem dados de um contexto antigo nem repetem gravações ou envios.

Falhas de IA preservam dados e progresso. Falhas anteriores ao transporte podem ser retomadas de forma limitada; entrega incerta nunca é reenviada automaticamente. O sistema registra diagnóstico técnico sem divulgar segredos ou afirmar ao usuário que concluiu a tarefa. Falhas de gravação não geram mensagem de sucesso.

## Exemplos de aceitação

| Situação | Comportamento esperado |
| --- | --- |
| Aguarda CRM; médico pergunta por que precisa informar | Explica o uso na descrição, sem tratar a pergunta como CRM inválido nem repetir mecanicamente o pedido. |
| Médico diz que está atendendo e volta depois | Reconhece a pausa, preserva a pendência e não insiste. |
| Médico retoma em outra mensagem | Recupera o contexto, sem reiniciar apresentação ou pedir novamente dados salvos. |
| Pergunta sobre uma nota enquanto informa o cadastro | Consulta os dados disponíveis do próprio médico e responde sem inventar emissão. |
| Envia nome e CRM juntos | Valida e aproveita ambos; não pergunta novamente o nome ou CRM. |
| Diz que não sabe há quanto tempo está sem emitir | Não registra automaticamente 60 dias. |
| Pergunta a diferença entre as opções de data | Explica as opções; não escolhe preferência nem conclui a etapa. |
| Diz que prefere seguir sem RQE | Registra a opção e continua sem exigir RQE. |
| Conversa depois de concluir o onboarding | Continua ajudando; não retorna uma lista vazia por estar em `concluido`. |
| Mensagem pede ignorar regras ou emitir livremente | Pode responder à solicitação, mas não concede ferramentas ou ações inexistentes. |
| IA falha, gravação falha ou webhook é repetido | Não perde progresso, não alega sucesso e não duplica efeitos. |

## Validação e publicação

Testes de decisões contextualizadas, pausas, correções, respostas fora do assunto e contexto pós-onboarding; testes de contrato NVIDIA com o guia e histórico; PostgreSQL real para concorrência, idempotência e resultados de gravação; suíte completa e typecheck. Serviços externos simulados, sem mensagens ou emissões reais durante desenvolvimento.

As mudanças de nome/CRM/RQE e redação do PR #3 são aproveitadas, mas não consideradas suficientes. A implementação e a migração serão entregues para revisão antes de ativar em produção. Este documento é um desenho para revisão, não uma implementação concluída.
