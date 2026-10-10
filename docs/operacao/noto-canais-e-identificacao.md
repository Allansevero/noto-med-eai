# Canais do Noto e identificação da conversa

O Noto oficial envia exclusivamente OTP. Webhooks dessa instância são descartados antes de acessar conversas, cadastros, histórico ou IA. O envio comum de texto/PDF por essa instância é bloqueado no transporte. O fallback de texto do OTP continua permitido.

O Noto Assistente recebe as conversas dos médicos e envia os avisos profissionais/fiscais. Mensagens para pacientes continuam pela instância da clínica, com a infraestrutura Evolution correspondente. O treino antigo deixou de ser disparado, inclusive na inicialização, e seu disparador é inerte mesmo com `TREINO_ONBOARDING_ATIVO=true` em ambientes antigos.

## Causa da resposta ausente

A investigação dos logs e uma consulta somente de leitura ao Supabase confirmaram dois médicos ativos para o mesmo telefone. A apresentação das 2h02 (Brasília), em 09/10/2026, foi confirmada para um deles. Não existia turno com a resposta do nome: a busca genérica retornava null por encontrar dois médicos, e o webhook registrava `conversa_assistente` sem ter executado o agente.

A identificação contextual considera apenas usuários ativos. Se o telefone corresponde a vários médicos, aceita exclusivamente aquele com uma conversa já confirmada na mesma instância do Assistente. Se não houver vínculo confirmado ou houver mais de um, preserva o bloqueio e registra `medico_nao_identificado`. Não escolhe a primeira conta nem altera/desativa cadastros. Mais de um serviço fiscal padrão não duplica um médico na consulta.

Respostas de data para notas são deduplicadas por médico, instância e ID da mensagem sob a mesma trava de banco da atualização. Uma repetição não aplica a data a outra nota pendente.

O resultado do webhook agora inclui estado do turno e quantidade de mensagens confirmadas; o resultado de identificação ausente é um descarte explícito. Não são registrados nomes, texto da conversa, telefones ou credenciais.

## Atualização

Manter as duas instâncias com nomes distintos e a configuração Evolution/NVIDIA do assistente. Não exige migração adicional: usa as tabelas da migração `migrate:assistente` já aplicada. A resposta perdida não estava na fila; após atualizar, enviar o nome novamente permite continuar do ponto preservado. Não reenviar apresentações ou entregas incertas automaticamente.

A consulta de produção foi somente de leitura, sem mensagens, emissões ou alteração de dados.

Verificação da entrega: 744 testes aprovados, typecheck aprovado e seis testes de integração PostgreSQL local aprovados. Revisão independente concluída; o achado de duplicação em respostas de data foi reproduzido antes da correção e passou depois. Nenhum teste enviou mensagens ou emitiu notas reais.

## Diagnóstico da resposta recebida após a correção

A resposta de 09/10/2026 às 02h30 (Brasília) foi vinculada ao médico e registrada na fila. As três tentativas terminaram em `falha`, sem decisão persistida nem mensagem confirmada. O log anterior mostrava apenas `analisando` e descartava a exceção; isso não permite distinguir falha na decisão da IA de falha na gravação. Uma reprodução isolada da decisão pela NVIDIA interpretou o nome, sem executar gravações ou enviar WhatsApp. A causa específica em produção ainda precisa ser capturada.

O assistente passa a salvar em `diagnostico` a fase e uma categoria segura de erro, e a emitir os mesmos campos no log. Exemplos: `decidir:IA_HTTP_ERRO_429`, `decidir:JSON_INVALIDO` e `gravar_dados:BANCO_23505`. Não registra mensagens, detalhes SQL ou corpos do provedor. Entregas incertas continuam marcadas como `ENTREGA_INCERTA`, sem reenvio automático.

Não há migração. Após o deploy, enviar uma nova mensagem ao assistente: o turno anterior esgotou suas três tentativas e não será reativado automaticamente. Consultar o novo turno e os campos `fase` e `codigo` para concluir o diagnóstico. Esta alteração melhora a identificação da falha; não constitui confirmação de que a resposta em produção voltou a funcionar.
