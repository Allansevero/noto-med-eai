> Histórico: os motores descritos neste documento foram retirados na base unificada. Consulte `docs/implementation/base-unificada.md`.

# Agente WhatsApp por casos

Base: fcb4488. Desenho autorizado em 14/10/2026.

Objetivo: localizar pagamentos realizados nos últimos 15 dias sem nota correspondente,
resolver dados faltantes, solicitar aprovação e encaminhar somente o caso aprovado à
fila fiscal existente. Cadastro, certificado, conexão e importação de pacientes permanecem.

Arquitetura: entrada autenticada → inbox persistida → processamento serial por médico →
caso por pagamento → interpretação limitada por estado → transição e outbox atômicas →
envio confirmado. Agendamento e pós-conexão usam a mesma inbox. A emissão é idempotente
pela referência do caso e continua passando pelo worker fiscal existente.

Uma pergunta ativa por médico. Respostas citadas precisam corresponder à pergunta.
Perguntas/negações não autorizam emissão. Dados recebidos são validados e associados ao
paciente do caso. A análise de documentos é persistida por versão, inclusive resultados
negativos. Falha de análise não significa ausência de pagamento.

Implementação: persistência e migração aditiva; extrator e correlação; interpretação
estruturada; ponte fiscal; orquestrador; integração e revisão estática. Não executar
migrações contra produção, chamadas pagas nem enviar mensagens durante desenvolvimento.

## Operação e migração

1. Publicar os arquivos e reconstruir a imagem Docker. Ela inclui Poppler para PDF de
   uma página e ImageMagick para reduzir imagens ao limite do provedor.
2. Antes de reiniciar a aplicação, executar `npm run migrate:casos` usando a conexão
   PostgreSQL do ambiente. A migração cria tabelas e importa solicitações legadas
   aguardando aprovação/CPF, sem excluir tabelas existentes.
3. Definir `AGENTE_FISCAL_CASOS_ATIVO=true` e iniciar com `npm start`. Sem essa opção, o fluxo de comprovantes e pedidos de nota já existente continua ativo, evitando motores concorrentes. O worker dos casos roda no serviço web.
   `AGENTE_FISCAL_ATIVO=true` habilita somente os disparos periódicos; mensagens
   recebidas e retomadas pós-conexão usam o mesmo fluxo.

`NVIDIA_API_KEY` e `SERPER_API_KEY` seguem necessárias para a pesquisa profissional.
A interpretação livre e visão usam NVIDIA; respostas exatas à pergunta pendente
(sim, aprovar, recusar, adiar, CPF e data) são tratadas sem uma chamada ao modelo.
Não existem chaves embutidas no cliente de visão.

O serviço precisa de PostgreSQL com pgcrypto e das migrações fiscais/cadastro já
usadas na versão fcb4488, incluindo a referência externa e flags de aprovação/CPF.
A migração nova não foi executada no banco de produção durante o desenvolvimento.

## Comportamento e limites

- A janela é de 15 dias civis em Brasília: hoje e os 14 anteriores. A data vem do
  documento do pagamento. O histórico de contexto lido tem até 45 dias.
- Cada lote analisa até 20 documentos com orçamento de 90 segundos; a inbox agenda
  a continuação. Resultados e tentativas são persistidos por mensagem e versão.
- Pagamento precisa ter status realizado, valor e data. Favorecido deve corresponder
  ao documento ou nome fiscal cadastrado. Imagem, valor padrão, promessa de pagar e
  agendamento bancário não bastam. Isso é evidência documental, não validação bancária.
- NFS-e posterior precisa ser reconhecida e relacionada ao pagamento. PDF arbitrário
  ou texto prometendo uma nota não encerram o caso. Associação ambígua fica em revisão.
- PDF com várias páginas, mídia inacessível, extração inconclusiva ou favorecido não
  identificado ficam para revisão. Esses casos podem ser consultados no banco e não
  bloqueiam os demais; não há uma nova tela de revisão documental nesta entrega.
- Aprovação vale para um caso e uma pergunta confirmada. Alterar nome/CPF depois da
  pergunta exige nova aprovação. Dados informados só alteram o paciente desse caso.
- Inbox deduplica instância + ID da mensagem. Casos deduplicam mensagem de pagamento
  e identidade documental/transação. A fila fiscal usa referência `caso:<id>`.
- Entrega incerta não é reenviada automaticamente. O médico pode dizer
  `reenviar pergunta`; a nova pergunta precisa de entrega confirmada antes de avançar.
- Falhas da inbox têm retentativa com intervalo crescente, até cinco tentativas.
  Eventos com `estado='falha'` ou `estado='incerto'` permanecem disponíveis para diagnóstico.
- Caminhos antigos foram conservados para compatibilidade com ferramentas existentes;
  servidor, inicialização, agendamento e pós-conexão acionam o orquestrador por casos.

## Pesquisa de CRM/RQE

O painel permite `Pesquisar CRM e RQE novamente` inclusive após uma consulta concluída,
exibe `pesquisaCodigo` e conserva os campos profissionais aprovados. Só a pesquisa
explícita reinicia tentativas; a recuperação automática não redefine esse limite a cada
ciclo. O cadastro automático passa a recuperar independentemente do antigo modo de
conversa. A leitura de perfil inclui RQE e não depende da tabela de sessões do bot antigo.
Resultados públicos seguem sugestões para revisão, sem validação oficial presumida.

## Verificação da implementação

A suíte automatizada completa passou com 738 testes, sem falhas nem skips, e
`npm run typecheck` passou. Os cenários incluem aprovação/recusa, respostas atrasadas,
CPF inválido, cadastro alterado após a pergunta, cache documental, favorecido divergente,
NFS-e ambígua, pesquisa profissional explícita e apresentação do titular PF no painel.
Os testes usam provedores simulados; não comprovam disponibilidade dos serviços pagos.
A migração e os locks PostgreSQL ainda precisam de validação no banco de homologação.

Integração com a branch remota 205c37c: preservados o modelo NVIDIA atualizado,
JSON estruturado, importação de histórico em lote e os módulos de candidatos/pedidos.
A opção AGENTE_FISCAL_CASOS_ATIVO escolhe um único motor de atendimento e detecção.
