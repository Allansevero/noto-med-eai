# Limpeza e unificação da base Noto

Data: 17/10/2026. Branch: `refactor/noto-base-unificada`.
Base anterior: `8f8ce67`; o leitor TribeMD funcional está incluído em `4979e98`.

## Escopo autorizado

Preservar os fluxos confirmados pelo usuário: OTP/Supabase, cadastro e login,
certificado A1, pesquisa profissional, confirmação e gravação de dados, conexão
WhatsApp, API de emissão e PDF. Remover testes, caminhos antigos e duplicados.
Manter o TribeMD validado como ponto de partida dos próximos conectores.

## Resultado

- Um único ponto de entrada: `src/server.ts`, com worker fiscal embutido.
- Removido `src/worker-runner.ts` e o comando `npm run worker` duplicado.
- Removidos os motores de casos, candidatos, pedidos de nota e suas integrações
  Gemini/Groq/IA conversacional sem uso na base preservada.
- Webhook mantém autenticação, conexão, histórico e persistência de mensagens;
  não interpreta aprovações, não pede CPF/data e não inicia emissão por conversa.
- Conectar WhatsApp sincroniza histórico sem disparar aprovação ou varredura.
- A1 sempre agenda enriquecimento cadastral para revisão no painel; o modo
  conversacional antigo e suas opções de ambiente foram retirados.
- Fila consome somente `origem='api'`. Pedidos antigos de outras origens ficam no
  banco, sem emissão por esse worker. Alterar o perfil não autoriza pedidos antigos
  pendentes de aprovação. Não houve limpeza ou migração executada no banco.
- Retomada de dados profissionais usa apenas perfil do painel, sem coletor de chat.
- Removidos 166 arquivos de testes/scripts de teste e 89 módulos TS
  de produção. Inclui a implementação duplicada do worker.
- Removida dependência Stripe sem consumidor, opções antigas de ambiente,
  prompt conversacional e binários Poppler/ImageMagick sem consumidor restante.
- Preservados geração/transmissão fiscal, conversão Meu DANFE, gerador PDF nativo,
  OpenSerp, extrator cadastral NVIDIA, migrações SQL, assets e rotas usadas pelo painel.
- O instalador de schema agora exige `DATABASE_URL`, sem credencial fixa ou
  desativação explícita da verificação TLS. A credencial anterior permanece no
  histórico Git e precisa ser rotacionada no provedor.

## Verificação realizada

`npm run typecheck` passou com `noUnusedLocals=true`. O mapa estático de imports,
a partir de `src/server.ts` e scripts operacionais restantes, alcançou
160 arquivos, sem import local faltante nem módulo TS fora do grafo.
O lockfile foi atualizado offline. A comparação de rotas remove somente a rota
avulsa `/api/ia/extrair-dados`; rotas do painel, webhook, cadastro e API fiscal
foram preservadas. `node --check scripts/migrar.js` e `git diff --check` passaram.

Nenhuma suíte foi executada ou adicionada. Não houve acesso ao banco, envio de
mensagens, emissão real, login TribeMD nem deploy. O funcionamento em produção
informado pelo usuário é o marco de referência, não uma nova validação desta branch.
O grafo estático e a checagem de tipos não comprovam integração com provedores reais.

## Implantação

Revisar o diff e publicar este branch no app Noto, usando `npm start`.
Se houver apps antigos Noto Fiscal/IA ou worker separado no Easypanel, interromper
seus processos durante a troca: o código local não desativa serviços remotos.
Não subir dois consumidores de versões diferentes sobre a mesma fila.
Preservar banco, certificados, segredos e volume/chave do TribeMD.
Migrações históricas são mantidas para instalação/recuperação; não são executadas
nem exigidas novamente por esta limpeza.

## Arquivos TS de produção retirados

- `src/agente-fiscal/agendador/agendador-fechamento-fiscal.ts`
- `src/agente-fiscal/agendador/calcular-proximo-disparo.ts`
- `src/agente-fiscal/casos/localizar-candidatos.ts`
- `src/agente-fiscal/casos/modelo.ts`
- `src/agente-fiscal/casos/orquestrador.ts`
- `src/agente-fiscal/casos/repositorio.ts`
- `src/agente-fiscal/casos/servico-emissao.ts`
- `src/agente-fiscal/casos/worker.ts`
- `src/agente-fiscal/decidir-responsabilidade-falha.ts`
- `src/agente-fiscal/fluxos/iniciar-onboarding-pos-conexao.ts`
- `src/agente-fiscal/fluxos/processar-comando-fiscal-medico.ts`
- `src/agente-fiscal/fluxos/processar-resposta-aprovacao-medico.ts`
- `src/agente-fiscal/fluxos/varrer-e-solicitar-aprovacao.ts`
- `src/agente-fiscal/investigar-falha.ts`
- `src/agente-fiscal/io/postgres-candidatos-nota-repositorio.ts`
- `src/agente-fiscal/io/preparar-midia-fiscal.ts`
- `src/agente-fiscal/regras/correlacionar-consulta-pagamento.ts`
- `src/agente-fiscal/regras/evidencias-documentais.ts`
- `src/agente-fiscal/regras/interpretar-resposta-caso.ts`
- `src/agente-fiscal/regras/redigir-mensagem-boas-vindas-conexao.ts`
- `src/agente-fiscal/regras/redigir-solicitacao-aprovacao.ts`
- `src/cadastro/nvidia-decisor-cadastro.ts`
- `src/cadastro/prontidao-evolution.ts`
- `src/candidatos/fluxos/processar-midia-comprovante.ts`
- `src/candidatos/fluxos/processar-resposta-medico-candidato.ts`
- `src/candidatos/fluxos/rotear-midia-webhook.ts`
- `src/candidatos/io/candidatos-repositorio.ts`
- `src/candidatos/io/gemini-comprovante-client.ts`
- `src/candidatos/io/postgres-candidatos-repositorio.ts`
- `src/candidatos/regras/interpretar-resposta-medico.ts`
- `src/candidatos/regras/redigir-notificacao-candidato.ts`
- `src/candidatos/regras/validar-comprovante.ts`
- `src/candidatos/tipos.ts`
- `src/conta/confirmar-retomada.ts`
- `src/conversa/comunicador-noto.ts`
- `src/conversa/gerenciador-rascunho.ts`
- `src/conversa/prompt-noto.ts`
- `src/conversa/rascunho-conversa-repositorio.ts`
- `src/emissao/calcular-valor-emissao.ts`
- `src/emissao/regras/extrair-datas-consulta.ts`
- `src/fluxos/analisar-comprovante-mensagem.ts`
- `src/fluxos/processar-resposta-cpf.ts`
- `src/fluxos/processar-resposta-data-consulta.ts`
- `src/fluxos/transmitir-nfse.ts`
- `src/ia/adaptador-resposta-ia.ts`
- `src/ia/criar-servicos-ia.ts`
- `src/ia/extrator-ia-service.ts`
- `src/ia/regras/montar-prompt-extracao.ts`
- `src/ia/regras/parsear-resposta-extracao.ts`
- `src/io/evolution/enviar-mensagem-treino.ts`
- `src/io/groq/groq-api-client.ts`
- `src/io/groq/groq-decisor-fiscal.ts`
- `src/io/groq/groq-gerador-mensagem-noto.ts`
- `src/io/nvidia/adaptadores.ts`
- `src/io/nvidia/interpretador-caso.ts`
- `src/io/nvidia/paligemma-comprovante-client.ts`
- `src/io/postgres/postgres-treino-repositorio.ts`
- `src/onboarding/fluxos/disparar-treino-onboarding.ts`
- `src/onboarding/regras/extrair-nome-medica-resposta.ts`
- `src/onboarding/regras/identificar-interlocutor.ts`
- `src/onboarding/treino/enviar-treino.ts`
- `src/onboarding/treino/mensagens-treino.ts`
- `src/paciente/normalizar-telefone.ts`
- `src/pedido-nota/fluxos/iniciar-pedido-nota.ts`
- `src/pedido-nota/fluxos/responder-pedido-nota.ts`
- `src/pedido-nota/io/conversa-fonte-pacientes.ts`
- `src/pedido-nota/io/fonte-pacientes.ts`
- `src/pedido-nota/io/gemini-pedido-client.ts`
- `src/pedido-nota/io/pedidos-repositorio.ts`
- `src/pedido-nota/io/postgres-pedidos-repositorio.ts`
- `src/pedido-nota/io/sheets-fonte-pacientes.ts`
- `src/pedido-nota/io/supabase-fonte-pacientes.ts`
- `src/pedido-nota/regras/detectar-pedido-nota.ts`
- `src/pedido-nota/regras/escolher-data-consulta.ts`
- `src/pedido-nota/regras/escolher-valor-sugerido.ts`
- `src/pedido-nota/regras/interpretar-resposta-pedido.ts`
- `src/pedido-nota/regras/redigir-mensagens-pedido.ts`
- `src/pedido-nota/regras/resolver-cascata-fontes.ts`
- `src/pedido-nota/tipos.ts`
- `src/regras/medir-etapas.ts`
- `src/regras/validar-protecao-fiscal.ts`
- `src/types/database.types.ts`
- `src/whatsapp/enviador-conversas-noto.ts`
- `src/whatsapp/extrair-valor-moeda.ts`
- `src/whatsapp/fila-envio-mensagens.ts`
- `src/whatsapp/regras/eh-mensagem-automatica.ts`
- `src/whatsapp/whatsapp-config.ts`
- `src/worker-runner.ts`
- `src/worker/formatar-motivo-falha-emissao.ts`
