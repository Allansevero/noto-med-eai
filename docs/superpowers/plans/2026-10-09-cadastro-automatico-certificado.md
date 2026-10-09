# Cadastro automático pelo A1 — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Substituir o onboarding conversacional por enriquecimento cadastral automático e confirmação apenas das pendências, sem bloquear a importação fiscal.

**Architecture:** Trabalho persistente por certificado, com consultas externas isoladas e resultados candidatos separados dos dados confirmados. Um modo de confirmação limita o assistente às pendências desse trabalho e impede apresentações e recuperação de turnos antigos.

**Tech Stack:** TypeScript, Node.js, PostgreSQL, Express, Supabase e clientes HTTP existentes; testes com `node --import tsx --test`.

**Spec:** `docs/superpowers/specs/2026-10-09-cadastro-automatico-certificado-design.md`

## Global Constraints

- Suspender todo o onboarding conversacional.
- Preservar autenticação por OTP, integração WhatsApp, importação de pacientes e emissão de notas existentes.
- Não modificar parâmetros fiscais provenientes da referência.
- Não sobrescrever informações já confirmadas pelo usuário.
- Não enviar certificado, senha ou XML aos provedores cadastrais.
- Não presumir contratos de APIs externas nem configurar uma pesquisa fictícia de CRM.
- Usar o checkout existente; antes de implementar, atualizar a referência remota de `feat/nvidia-only` explicitamente e preservar este desenho e plano.

## Review Focus

- Certificado substituído enquanto uma consulta está em andamento: resultado antigo não altera cadastro atual (tarefa 3).
- Alteração manual simultânea: resultado da consulta não sobrescreve informação confirmada (tarefa 3).
- Reinício com turnos antigos na fila: nenhuma apresentação ou pergunta antiga é enviada (tarefa 1).
- CNPJ com sócios que não são médicos ou nomes iguais: nenhuma pessoa é promovida por suposição (tarefas 2 e 4).
- Confirmação recebida antes da conexão ou mensagens duplicadas: pendência permanece rastreável e não gera envios/aplicações duplicados (tarefa 4).

## Tarefa 1: Suspender o onboarding sem interromper a operação

**Files:** modificar `src/config.ts`, `src/server.ts`, `src/agente-conversa/agente-assistente.ts`, `src/agente-conversa/postgres-assistente.ts`, `src/fluxos/processar-mensagem-webhook.ts`; criar `src/agente-conversa/politica-cadastro.ts` e seu teste; ampliar testes do webhook e integração de `PostgresAssistente`.

**Interfaces:** criar `ModoCadastroNoto = 'conversacional' | 'confirmacao'` e `podeProcessarCadastro(modo: ModoCadastroNoto, possuiPendencia: boolean): boolean`. `NOTO_CADASTRO_MODO` assume `confirmacao` quando ausente; `conversacional` reativa explicitamente o comportamento anterior. O modo será passado aos serviços de conversa, nunca inferido apenas de `ASSISTENTE_CONTEXTUAL_ATIVO`.

- [ ] Escrever testes: modo de confirmação não apresenta Noto ao conectar, não recupera turnos antigos e não captura mensagens sem pendência; OTP e encaminhamento para emissão continuam operando.
- [ ] Rodar testes relevantes e verificar falha pelo comportamento antigo.
- [ ] Implementar a política nos disparadores de conexão/status/inicialização e recuperação. Não marcar turnos antigos como confirmados, apagar histórico ou reenviar mensagens já confirmadas; filtrar processamento pelo modo e vínculo de pendência.
- [ ] Rodar testes ampliados, incluindo reinício com fila antiga, e `npm run typecheck`.
- [ ] Commit da suspensão, sem anunciar enriquecimento completo ainda.

## Tarefa 2: Verificar fontes e implementar consultas cadastrais

**Files:** criar `src/cadastro/consultas.ts`, `src/io/hubdodesenvolvedor/hub-desenvolvedor-cnpj-client.ts`, testes correspondentes e `docs/cadastro-automatico-fontes.md`; modificar `src/medico/io/buscar-medico-online.ts` somente após verificar o mecanismo oficial de pesquisa.

**Interfaces:** `CandidatoResponsavel { nome: string; origem: string }`; `EmpresaConsultada { cnpj: string; razaoSocial: string; candidatos: CandidatoResponsavel[]; origem: string }`; `ResultadoConsulta<T> = { estado: 'consultado'; dados: T } | { estado: 'indisponivel' | 'nao_encontrado'; codigo: string }`; `ConsultaEmpresa.consultar(cnpj: string): Promise<ResultadoConsulta<EmpresaConsultada>>`; `ConsultaRegistro.buscar(nome: string, uf?: string): Promise<ResultadoConsulta<DadosMedicoOnline[]>>`.

- [ ] Consultar documentação pública do Hub para confirmar acesso CNPJ, quadro societário e contrato real; registrar URL, autenticação e campos. Verificar consulta oficial CFM/CRM e eventuais requisitos de acesso. Não usar dados reais de pacientes ou efetuar consultas pagas de teste sem necessidade.
- [ ] Se alguma fonte não estiver utilizável, documentar o bloqueio e informar o usuário antes de habilitar essa parte. Uma configuração vazia não constitui pesquisa funcional.
- [ ] Escrever testes com fixtures do contrato documentado: documento divergente, sócios múltiplos, CPF mascarado, nomes ausentes, HTTP inválido e timeout. Pesquisa retorna todos os candidatos, sem UF/situação inventadas.
- [ ] Rodar testes e confirmar falhas antes de implementar os adaptadores com timeout, validação e diagnóstico sanitizado. Reutilizar a credencial existente do Hub quando o contrato permitir.
- [ ] Rodar os testes e commit dos adaptadores e documentação de disponibilidade.

## Tarefa 3: Trabalho persistente isolado da importação fiscal

**Files:** criar `src/cadastro/enriquecer-cadastro.ts`, `src/cadastro/postgres-cadastro.ts`, seus testes e integração local, `scripts/migrations/20261009-cadastro-certificado.sql`, `scripts/migrar-cadastro-certificado.mjs`; modificar `src/server.ts` e `package.json` para migração/teste.

**Interfaces:** `CadastroCertificado.agendar({ medicoId, certificadoId, documentoTitular }): Promise<void>`; `CadastroCertificado.recuperar(): Promise<void>`. Estado do trabalho: `pendente | consultando | aguardando_confirmacao | concluido | falha | obsoleto`. Tabela `cadastro_certificado_trabalhos` com UUID, médico, certificado único, documento, estado, candidatos em JSONB, origem, snapshot dos campos, tentativas, lease e próxima tentativa. Acesso exclusivo do backend; não expor documentos ou candidatos por uma rota pública.

- [ ] Escrever testes da migração e serviço: agenda duplicada cria um trabalho; concorrência reserva uma vez; falha externa não muda resultado fiscal; certificado substituído vira obsoleto; alteração manual impede sobrescrita.
- [ ] Rodar testes em banco local e verificar falhas antes da implementação.
- [ ] Implementar reserva transacional com lease recuperável e aplicar dados com verificação do certificado ativo e snapshot. Guardar candidatos antes de confirmar pessoa; só preencher CRM ausente com resultado único correspondente à pessoa confirmada. Não escrever parâmetros fiscais.
- [ ] Agendar após salvar A1 e antes da consulta ADN; capturar falha de agendamento sem falhar upload/importação, registrar diagnóstico técnico e recuperar agendamentos ausentes a partir dos certificados ativos. Recuperação agenda certificados preexistentes somente com modo de confirmação ativo, sem reimportar notas ou iniciar uma varredura fiscal.
- [ ] Definir tentativas externas limitadas a três, com intervalos de 30 e 120 segundos; depois abrir uma única pendência pelo dado necessário, sem perguntar em toda recuperação. Caso documento titular não esteja disponível, registrar necessidade de identificação sem enviar A1 ao provedor.
- [ ] Verificar integração, isolamento fiscal, reinício e retomada de lease; commit da fila e migração.

## Tarefa 4: Confirmação contextual das pendências

**Files:** criar `src/cadastro/confirmar-pendencia.ts` e testes; modificar `src/agente-conversa/agente-assistente.ts`, `src/agente-conversa/decisao-assistente.ts`, `src/agente-conversa/postgres-assistente.ts`, `src/conversa/comunicador-noto.ts`, `src/io/nvidia` nos adaptadores de decisão/redação existentes, `docs/prompts/noto-conversa.md` e testes pertinentes.

**Interfaces:** `PendenciaCadastro { id: string; trabalhoId: string; tipo: 'responsavel' | 'nome' | 'crm'; candidatos: Array<{ id: string; nome: string; crm?: string; uf?: string }>; perguntaConfirmada: string | null }`; `ConfirmadorCadastro.receber({ medicoId, mensagemId, texto }): Promise<{ processado: boolean }>`; persistir mensagens de saída com chave única por pendência/etapa e confirmação de envio pela Evolution.

- [ ] Escrever testes: um sócio exige confirmar vínculo, dois sócios exigem escolha, homônimo exige desambiguação, resposta “sou eu” reconhece a pergunta efetivamente enviada, referência ambígua não salva dados, CRM já confirmado permanece intacto.
- [ ] Acrescentar testes para usuário secretário, resposta duplicada, mudança do certificado e pendência criada antes da conexão. Asserções: nenhuma troca entre nome do interlocutor e do médico; nenhuma apresentação; uma aplicação por mensagem.
- [ ] Rodar testes e verificar falhas; implementar confirmação vinculada ao trabalho. Limitar ferramentas aos campos da pendência, validar escolhas e salvar atomicamente antes de redigir confirmação.
- [ ] Remover objetivos de pacientes/período/preferências do modo de confirmação no prompt. Fora de uma pendência, não invocar o decisor antigo nem avançar suas etapas. RQE não é incluído automaticamente na descrição.
- [ ] Rodar testes e integração local, verificar que a mensagem só é enviada depois de disponível a instância correta e commit do fluxo.

## Tarefa 5: Verificação e entrega em `feat/nvidia-only`

**Files:** criar `docs/cadastro-automatico-deploy.md`; atualizar documentação de deploy do assistente quando aplicável.

**Interfaces:** migração nova `npm run migrate:cadastro`; configuração `NOTO_CADASTRO_MODO=confirmacao`; provedores novos só habilitados com contratos validados na tarefa 2.

- [ ] Executar `npm run typecheck`, `npm test`, `npm run test:assistente-db` e integração local do cadastro. Confirmar quantidades, saída e testes realmente executados.
- [ ] Documentar ordem de migração/deploy, disponibilidades reais de Hub e CRM, rollback de modo e preservação dos turnos antigos. Sem alterações em produção nem mensagens reais durante validação.
- [ ] Fazer revisão do diff completo e corrigir falhas demonstradas. Criar PR para `feat/nvidia-only`, anexá-lo à tarefa, incorporar conforme autorização persistente e conferir SHA remoto.
- [ ] Relatar o que foi verificado, limitações externas e o commit a implantar no Easypanel. Não afirmar que deploy ou pesquisa estão funcionando sem evidência.

## Execução proposta

Executar diretamente nesta sessão, tarefa por tarefa, com revisão final. As tarefas dependem das mesmas interfaces e do estado do cadastro; a execução sequencial evita divergências entre a suspensão e o fluxo de confirmação.

Este plano aguarda revisão do usuário e escolha do método de execução. Aprovação do desenho já recebida; nenhum código de produto foi modificado até aqui.
