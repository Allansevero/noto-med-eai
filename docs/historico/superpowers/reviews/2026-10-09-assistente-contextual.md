# Verificação do Assistente contextual

Revisão independente da branch inteira desde `aa431e5`, executada por um agente com contexto novo. Cinco achados importantes corrigidos numa rodada, cada reprodução observada falhando antes da correção:

- Valores negados e perguntas sem pontuação não podem passar como escolhas afirmativas. A validação agora verifica a frase de origem e o campo, sem bloquear declarações explícitas separadas de uma dúvida.
- Recusar RQE é uma escolha válida; recusar outro dado não dispensa RQE por engano.
- O progresso legado concluído é preservado, mesmo sem identidade com proveniência. O nome inicial continua provisório e fica pendente de confirmação, sem reiniciar o fluxo.
- A apresentação usa a mesma sessão, fila e transporte dos turnos. Uma conversa existente não recebe nova introdução; a primeira mensagem recebida e a conexão disputam a mesma criação atômica da sessão.
- O perfil profissional atual é lido do banco; alterações feitas no cadastro aparecem no contexto. O nome só identifica a conversa depois de confirmado.

A ausência de fragmentos confirmados da apresentação no histórico, originalmente classificada como menor, foi tratada como importante pelo impacto na continuidade e corrigida junto com o transporte compartilhado. Nenhum achado ficou adiado. A revisão não encontrou duplicação/reenvio no caminho contextual nem vazamento entre médicos. O fluxo legado com a flag desligada permanece deliberadamente disponível como reversão operacional.

Validação final: `npm test` 747/747, `npm run typecheck`, PostgreSQL local real 4/4 (`npm run test:assistente-db` com `NOTO_TEST_DATABASE_URL`) e `git diff --check`. NVIDIA e Evolution simulados. Nenhuma mensagem, emissão ou migração de produção executada.

Decisões de execução:

1. Seguir o plano diretamente após a autorização para implementar e publicar. Uma restrição não expressa poderia exigir ajuste posterior.
2. Reaproveitar o checkout isolado e o PR #3. Isso reúne o ajuste anterior e o novo agente na mesma entrega; ambos pertencem ao fluxo pedido.

Ativação: consultar `docs/assistente-contextual-deploy.md`.
