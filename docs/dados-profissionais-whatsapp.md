# Dados profissionais e notas anteriores

O Noto exige nome completo real e CRM antes de transmitir uma nota; RQE é
opcional. Nome nulo, provisório (`Médico 9886`), de uma palavra ou CRM sem número
não libera emissão. Esta validação não consulta nem comprova inscrição no conselho.

O pedido usa o Noto Oficial e o telefone do usuário do médico, nunca o paciente.
Pergunta apenas o dado que falta: primeiro nome, depois CRM. Aceita respostas
separadas, ou campos explícitos `Nome completo:`, `CRM:` e `RQE:`. Dados válidos
existentes não são substituídos pela conversa; RQE só muda se informado.
As mensagens seguem o guia integral em [noto-conversa.md](prompts/noto-conversa.md).
O guia orienta comunicação, não concede poderes para alterar tributação ou emitir
fora das ferramentas. As respostas são geradas pela IA configurada na NVIDIA, usando o guia v2 completo,
o perfil, o caso e as últimas oito comunicações do médico. Também responde às
mensagens de texto do médico reconhecido no WhatsApp Oficial. Perguntas sobre
CPF ao paciente usam contexto separado, sem histórico privado do médico.
A IA escreve o texto; validação, gravação e autorização continuam determinísticas.
Não habilita áudio, reações ou alteração fiscal livre por IA.

## Notas que já estavam pendentes

`npm run migrate:perfil` aplica as três migrações em uma única transação. Na
primeira inclusão de `aguardando_confirmacao_medico`, captura todas as solicitações
`pendente` sem nota fiscal registrada, mesmo com cadastro profissional completo.
Marca também `aguardando_dados_profissionais` e retira essas solicitações da fila.
Não apaga tentativas, erros, locks nem investigação. Cria uma confirmação por médico
em `emissoes_pendentes_confirmacoes`, com captura, estado e ID da confirmação.
Reexecutar não captura novas solicitações nem bloqueia novamente as já autorizadas.
Não adicionar a coluna manualmente antes da migração: ela é o marcador transacional
que garante execução única do backfill. Uma instalação nova com o schema completo
não possui solicitações anteriores a capturar.

Os workers verificam essas pendências ao iniciar e a cada minuto, em lotes de até
20 médicos. Cadastros sem telefone ficam retidos e não ocupam o lote. Um cursor
em memória permite passar por falhas de casos individuais; reiniciar só reinicia
o percurso, enquanto a reserva persistente impede mensagens repetidas.

Se falta nome/CRM, coleta primeiro. Após salvar, as notas anteriores continuam
pausadas e o Noto pede confirmação: `pode emitir`, `pode emitir as notas` ou
`autorizo a emissão das notas`. Um cumprimento, `sim`, pergunta, negação, comando
misto, áudio ou imagem não libera o lote. A mensagem precisa chegar pelo webhook
autenticado do Noto Oficial, do médico identificado pelo telefone cadastrado,
com ID único e timestamp posterior à captura. Timestamp ausente, inválido, anterior
ou muito futuro não autoriza. Quando só há precisão de segundos e o horário fica
anterior à captura, pede nova confirmação em vez de presumir consentimento.

A confirmação libera somente solicitações sem tentativa, nota, investigação ou
worker ativo, e reconstrói a descrição com o perfil salvo e as datas preservadas.
A fila continua nula se falta a data, ou `pendente_cadastro` se falta CPF. Nome/CRM
preenchidos pela Conta, chegada do CPF e resposta da data não substituem a
confirmação do lote anterior. O emissor e a reserva de tentativa do agente também
verificam esse bloqueio antes de qualquer transmissão.

Casos com tentativas ou investigações anteriores ficam retidos para conferência;
a confirmação não os reenvia nem reinicia seu histórico. Casos em worker ativo
ficam retidos para conferência também, sem reaproveitar locks antigos. Notas
já autorizadas/emitidas não são alteradas. Solicitações novas continuam no fluxo
normal, exigindo o cadastro profissional, sem confirmação extra do lote anterior.

## Persistência e segurança

`noto_comunicacoes` guarda evento, contexto utilizado, textos gerados, estado e
resultado de cada envio. A chave por médico e evento impede duplicação. A história
usa apenas mensagens aceitas pelo provedor; envio aceito não prova entrega.

Coleta e confirmação reservam o envio no banco antes da chamada à Evolution.
Timeout, erro ou queda deixam estado incerto/reservado e não geram reenvio
automático. Falha conhecida de geração antes de qualquer envio não usa texto fixo;
os pedidos iniciais podem ser gerados novamente pelo monitor de pendências.
IDs de resposta são deduplicados por médico. A confirmação guarda
ID e horário, sem registrar texto bruto nessa tabela. As tabelas têm RLS e
permissões públicas, anônimas e de clientes revogadas.

Nome, usuário vinculado e liberação são salvos sob transação. Médico é travado
antes das solicitações; nenhuma chamada HTTP mantém esses locks abertos.
Descrição usa `datas_consulta_texto`, sufixo legado `NAS DATAS` ou agendamentos
vinculados. CPF/data não liberam casos com tentativa, nota, investigação ou
bloqueio. O emissor verifica o cadastro atual e reconstrói a descrição padrão
antes de gerar DPS/XML, preservando a configuração fiscal.

## Aplicação em produção

A migração de investigações anterior deve existir. Pausar todas as instâncias
antigas do worker/web antes da atualização, implantar o código novo, executar:

```sh
npm run migrate:perfil
```

Depois reiniciar `web` e eventual worker separado. Não misturar workers antigos
e novos durante a atualização. O worker novo não consome a fila enquanto falta
a coluna da migração. Uma transmissão já iniciada antes da pausa não pode ser
cancelada por essa alteração; conferir seu resultado antes de qualquer nova ação.

Configurar `NVIDIA_API_KEY` e `NVIDIA_MODEL` válidos. O container inclui o guia em
`docs/prompts/noto-conversa.md`; o treino mantém as mensagens literais existentes.
Sem IA disponível, não há fallback de comunicação fixa.

Conferir a instância oficial e autenticação do webhook, e validar com conta de
teste. O envio aceito pela Evolution não prova entrega no aparelho. Produção não
foi acessada nesta implementação. Testes locais usam PostgreSQL isolado e fronteira
WhatsApp simulada; nenhuma nota real ou mensagem de produção foi enviada.
