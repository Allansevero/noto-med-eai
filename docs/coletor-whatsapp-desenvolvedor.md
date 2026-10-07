# Coletor WhatsApp na área de desenvolvedor

Primeira versão: conectar WhatsApp de teste, consultar o histórico textual disponível na Evolution e revisar CPF, e-mail e número da conversa em JSON. Não usa LLM, não cadastra pacientes, não consulta titulares de CPF, não envia mensagens e não cria solicitações de nota.

## Acesso e uso

1. Com o código instalado no serviço, habilitar a área existente com `DESENVOLVEDOR_FISCAL_ATIVO=true` e `DESENVOLVEDOR_FISCAL_TOKEN` de 32 a 256 caracteres.
2. Configurar `EVOLUTION_API_URL` e `EVOLUTION_GLOBAL_API_KEY` já utilizados pelo Noto.
3. Abrir `/desenvolvedor` e seguir o link **Abrir coletor de dados do WhatsApp**, ou abrir `/desenvolvedor/whatsapp` diretamente.
4. Informar a chave de desenvolvedor. A chave fica apenas em memória no navegador e é enviada no header Bearer, nunca na URL ou em armazenamento local.
5. Clicar **Conectar WhatsApp de teste**, escanear o QR em Dispositivos conectados e aguardar a conexão. É uma conexão real ao WhatsApp, não um sandbox do provedor.
6. A primeira varredura inicia após detectar a conexão. O histórico pode continuar sincronizando; se estiver vazio ou incompleto, aguardar e clicar **Varrer novamente**. O QR pode ser renovado enquanto aguarda pareamento.
7. Revisar o JSON e, se desejado, clicar **Baixar JSON**.
8. Clicar **Encerrar sessão e desconectar** para remover a instância de teste da Evolution e os dados da memória do servidor.

Não requer migração de banco. A conexão real depende da versão e disponibilidade da Evolution. O botão de encerramento não remove instâncias de médicos.

A criação responde imediatamente com HTTP 202 e `estado=preparando`. A preparação da Evolution ocorre em segundo plano; a tela consulta a sessão até receber o QR. Cada chamada ao provedor tem limite de 15 segundos. Durante a preparação, renovar QR, varrer e encerrar ficam bloqueados para evitar ações concorrentes. Uma falha libera o encerramento e preserva `diagnostico` (etapa, código e status HTTP quando disponível). Os logs do web usam o prefixo `[Coletor WhatsApp] Operação pendente`, sem corpo da resposta, chave ou conteúdo das conversas. Respostas HTML do proxy são tratadas pela tela como indisponibilidade do servidor, sem expor erro de parsing.

## Isolamento

O router `/api/desenvolvedor/whatsapp` exige a mesma chave da área fiscal e está desativado quando a área de desenvolvedor está desativada. Não recebe nome de instância, telefone, URL de provedor ou parâmetros de emissão do cliente.

Cada sessão cria uma instância aleatória `noto_dev_coletor_<uuid_sem_hifens>`. O cliente de integração recusa nomes fora desse formato. Não há registro dessa instância em `whatsapp_instancias`. O webhook local é desativado antes do pareamento e a sessão nunca passa pelos repositórios de pacientes ou pelo worker de notas. Caso a Evolution tenha webhooks globais, eventos desta instância desconhecida continuam sujeitos à identificação da instância no fluxo existente.

A configuração do webhook enviada na criação e na desativação é completa, com `enabled=false`, `events=[]`, `byEvents=false`, `base64=false` e uma URL estrutural local (`http://127.0.0.1/noto-dev-coletor-desativado`). Não se deve enviar somente `{enabled:false}` nem URL vazia: o [schema do webhook da Evolution](https://github.com/evolution-foundation/evolution-api/blob/main/src/api/integrations/event/webhook/webhook.schema.ts) exige URL, e o [controlador](https://github.com/evolution-foundation/evolution-api/blob/main/src/api/integrations/event/webhook/webhook.controller.ts) persiste a configuração também quando desativada. A URL local não é acionada por esse webhook desativado e não aponta para o endpoint de emissão.

Até três sessões simultâneas, com prazo de 30 minutos a partir da criação. Não há banco nem persistência durável: resultado e sessão vivem na memória do processo web. O ID da sessão, sem dados pessoais ou chave, fica no sessionStorage para retomar a tela após recarregar. Instâncias não são compartilhadas entre réplicas do web; usar uma réplica ou afinidade de sessão neste piloto.

A limpeza de sessões expiradas é verificada a cada minuto. Se uma leitura ainda está em andamento, a limpeza espera a operação terminar. Falha de remoção permite nova tentativa pelo botão e pelo monitor de expiração. Reiniciar o processo elimina resultados e controle em memória, mas pode deixar o dispositivo conectado na Evolution: conferir o nome de teste informado no JSON e remover a instância pelo administrador da Evolution, ou revogar o dispositivo no WhatsApp. Não se deve apagar instâncias de produção para fazer essa limpeza.

## Dados e limites

- O número do WhatsApp vem de JID telefônico da conversa ou de JID alternativo. Identificadores `@lid` não são convertidos em telefone. Grupos e status são ignorados.
- Todos os candidatos de CPF no texto são validados pelos dígitos verificadores. Isso não comprova titularidade nem autorização para usar o documento em uma nota.
- E-mails são extraídos e verificados quanto ao formato; não há verificação de existência da caixa postal.
- Conversas com dois CPFs ou e-mails mantêm todos os candidatos. `associacaoPendente=true` evita apresentar coleta como cadastro confirmado, inclusive com um único candidato.
- Cada ocorrência guarda mensagem, conversa, data disponível e direção do envio. O conteúdo integral da conversa não aparece no JSON.
- Dados repetidos são agrupados; há até 20 evidências por dado, com contador de ocorrências. Reenvio do mesmo evento com mesma identidade de conversa/mensagem não aumenta a coleta.
- Até 50 páginas, até 5.000 mensagens analisadas e até 10.000 caracteres de texto por mensagem. Imagens, PDF, áudio e OCR não são analisados nesta versão.
- A saída informa páginas lidas, registros inválidos, mensagens ignoradas/repetidas, textos limitados e motivos de interrupção. Metadados ausentes, página repetida, limite ou erro não são apresentados como histórico completo.
- `paginacaoConcluida=true` significa conclusão da paginação informada pela Evolution nessa execução, não acesso a todas as mensagens que já existiram no telefone.

Campos principais: `sessaoId`, `instanciaTeste`, `expiraEm`, `estado`, `cobertura`, contadores e `contatos`. Cada contato contém `conversaIds`, `whatsapp`, `cpfs`, `emails`, `mensagensAnalisadas` e `associacaoPendente`. CPF/e-mail têm `valor`, `ocorrencias` e `origens`.

## Verificação

Testes locais cobrem extração, ambiguidades, LID, exclusão de grupos, deduplicação, autenticação, isolamento, expiração, paginação parcial, falhas, reserva de varredura, limpeza e os handlers reais da interface. Evolution e WhatsApp são fronteiras simuladas nesses testes. É necessário concluir o teste de conexão e sincronização com uma conta real no ambiente de desenvolvimento antes de considerar a integração validada.
