# Treino de emissão pelo Noto Oficial

Após validar o certificado A1 e conectar o WhatsApp por pareamento ou QR Code,
o médico recebe cinco mensagens no telefone
cadastrado em `usuarios.telefone`, enviadas pela instância
`EVOLUTION_OFFICIAL_INSTANCE_NAME` (padrão `notomed_oficial`).

O roteiro reproduz literalmente as cinco mensagens aprovadas pelo usuário,
inclusive a grafia. A terceira mensagem contém o modelo e o botão que copia
a frase inteira:

> Vou enviar em instantes a sua nota fiscal no valor de R$ [valor] referente à consulta de [data].

O atalho sugerido é `/nota`; o nome é livre. O texto preenchido continua sendo reconhecido pelo
fluxo determinístico existente. O envio ao paciente solicita uma nota real;
o treino não cria nota fictícia nem faz uma transmissão à SEFIN.

## Gatilho e persistência

O treino exige somente `consultarStatusOnboarding.passos.passo3CertificadoValido`
e `passo4WhatsappConectado`: certificado ativo e WhatsApp conectado. Nome
profissional, perfil fiscal confirmado e política fiscal revisada não bloqueiam
as boas-vindas, mesmo com a preparação fiscal ativa. A liberação para emitir notas
continua sujeita às validações fiscais existentes.

O disparo é verificado após confirmação fiscal, conexão/polling do WhatsApp e
consulta do status do onboarding. Também aceita `connection.update` autenticado
da Evolution para concluir o fluxo com a tela fechada. A instância precisa estar
cadastrada e vinculada ao médico. Eventos do Noto Oficial não alteram a conexão
do consultório. Webhooks precisam usar a chave da Evolution ou o segredo configurado;
o valor literal de exemplo anteriormente aceito pelo servidor foi removido.

`onboarding_treinos_whatsapp` mantém uma linha por médico, versão do roteiro,
próxima etapa e eventos com reserva, resultado, horário, formato e ID de mensagem
quando retornado pela Evolution. RLS bloqueia leitura/escrita dos clientes;
somente o backend opera a tabela. A versão 1 da estrutura da tabela é mantida. Novos registros guardam uma cópia
do roteiro em um evento `roteiro`, na coluna JSONB `eventos`. Registros antigos
sem esse evento mantêm as seis mensagens anteriores. O conteúdo está em
`src/onboarding/treino/mensagens-treino.ts`.

Cada etapa passa de `pendente` a `enviando` em um UPDATE condicional antes da
chamada externa. Chamadas simultâneas, reconexões e recargas da página não
reiniciam o roteiro. Após resposta de sucesso, avança a etapa; ao final,
fica `concluido`. A resposta da Evolution confirma aceitação, não leitura ou
entrega final no aparelho. O envio acontece em segundo plano no serviço web.

O botão usa o mesmo contrato `type: copy` já usado pelo OTP. Se a Evolution
rejeitar o formato com 400/404/405/422, envia a terceira mensagem em texto, sem adicionar instruções. A frase inteira
permanece no corpo da terceira mensagem. O suporte visual ao botão
depende da versão da Evolution e do WhatsApp; precisa ser verificado no aparelho.

Timeout, rede e erro 5xx ficam `incerto`, sem novo envio automático. Uma rejeição
definitiva fica `falha`. Se o processo morrer durante o envio ou antes de persistir
o resultado, a linha permanece `enviando` para conferência. Não há garantia de
entrega exatamente uma vez entre banco e WhatsApp; o controle prioriza não repetir
mensagens quando não se sabe se o primeiro envio ocorreu.

Um reinício retoma apenas linhas `pendente`, entre envios confirmados. Para
`falha`, `incerto` ou `enviando`, conferir primeiro os eventos e o histórico da
Evolution antes de qualquer retomada operacional. Não há botão de reenvio nem
retentativa automática desses estados nesta versão.

Mensagens enviadas pelo Noto Oficial (`fromMe`) são descartadas antes do fluxo
de cadastro/solicitação de nota: o modelo e exemplos não podem disparar emissão.
As respostas recebidas do médico, incluindo uma data solicitada por uma emissão
pendente, continuam seguindo o fluxo existente.

## Ativação

1. Implantar o commit no `web`, inicialmente com `TREINO_ONBOARDING_ATIVO=false`.
2. Executar `npm run migrate:treino` no terminal do serviço.
3. Definir `TREINO_ONBOARDING_ATIVO=true` no `web` e reiniciar/implantar o serviço.
4. Executar `npm run check:treino`; essa verificação não envia mensagens nem
   acessa a Evolution.
5. Validar o A1 e conectar o WhatsApp de uma conta de teste e conferir no telefone a ordem,
   o botão e o modelo. Atualizar a página e reconectar não deve repetir o treino.

Não é necessário ativar o agente fiscal para este roteiro. Nenhuma migração
envia mensagens ou cadastra toda a base como destinatária. Contas existentes
com A1 válido e WhatsApp conectado também recebem o treino na próxima consulta de status
ou reconexão, se ainda não houver um registro para elas. A inicialização do web
retoma só os treinos já pendentes; não faz disparo para todos os usuários.

## Limites desta versão

É uma sequência guiada fixa. O texto é o solicitado pelo usuário; a alteração
editorial não adiciona conversa livre com IA, atendimento tributário nem muda
limites de plano, prazo de autorização ou disponibilidade do histórico.
Não reinicia treinos concluídos e não exige nova migração.

A continuação do treino após essas explicações não foi definida nesta entrega.
