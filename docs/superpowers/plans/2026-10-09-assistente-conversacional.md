# Noto Assistente Conversacional Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Interpretar conversas com memória, acompanhar o ritmo do médico e aplicar somente ações verificadas.
**Architecture:** Decisor NVIDIA estruturado, executor de ações validado, repositório PostgreSQL de sessões e turnos e gerador de respostas com o guia e os resultados reais. Webhook e recuperação processam a mesma fila persistida por médico.
**Tech Stack:** Node/TypeScript, PostgreSQL, Zod, NVIDIA e Evolution existentes, sem novas dependências.
**Spec:** docs/superpowers/specs/2026-10-09-assistente-conversacional-design.md

## Global Constraints

- Nome real informado na conversa; CRM declarado e RQE opcional; nenhuma pesquisa online.
- Guia noto-conversa.md; até 20 mensagens recentes; até duas chamadas de IA por turno.
- Perguntas, pausas e respostas ambíguas não viram dados; sem período ou preferência padrão.
- Nenhuma emissão, mensagem ou migração real durante desenvolvimento.
- Entrega incerta não é repetida automaticamente; ações e mensagens são idempotentes por turno.

## Review Focus

- Mensagens simultâneas: preservar ordem e não repetir efeitos.
- Pergunta contendo números: não registrar como decisão profissional ou período.
- Falha depois de salvar dados: repetir só redação, sem repetir gravação.
- Processo interrompido no envio: preservar mensagens confirmadas sem reenvio incerto.
- Conversa concluída ou pausada: continuar ajudando sem reiniciar nem pressionar.

### Task 1: Decisão contextual e validação de ações
**Files:** src/agente-conversa/decisao-assistente.ts, src/io/nvidia/decisor-assistente.ts, testes correspondentes.
**Interfaces:** DecisorAssistente.decidir(contexto) → DecisaoAssistente; validarAcoes(decisao, texto, estado) → patch validado/resultados.
- [x] Escrever e observar testes RED para dúvida, pausa, registro múltiplo, dados inventados, período/preferência ambíguos e guia/histórico NVIDIA.
- [x] Implementar schema fechado de intenções e ações, evidência explícita e validadores existentes.
- [x] Rodar testes GREEN e typecheck; commit.

### Task 2: Persistência e processamento seguro
**Files:** src/agente-conversa/postgres-assistente.ts, scripts/migrations/20261009-assistente-contextual.sql, scripts/migrar-assistente-contextual.mjs, teste com PostgreSQL real.
**Interfaces:** enfileirar, reservar, aplicar, prepararResposta, registrarEnvio, falhar, liberar, historico, panorama; reservas com token e versão.
- [x] Escrever testes RED em PostgreSQL local para concorrência, duplicação, ordenação, expiração e falhas.
- [x] Implementar migração idempotente/RLS e reserva sem transação aberta durante HTTP; efeitos e estado no mesmo commit.
- [x] Rodar testes GREEN em PostgreSQL local; commit.

### Task 3: Agente, webhook, memória e recuperação
**Files:** src/agente-conversa/agente-assistente.ts, src/server.ts, src/config.ts, src/fluxos/processar-mensagem-webhook.ts, composição IA, prompt/guia, documentação de deploy e testes.
**Interfaces:** AgenteAssistente.receber(entrada) e recuperar(); bootstrap confirma histórico de apresentação; resultados confirmados alimentam o gerador.
- [x] Escrever testes RED para casos da especificação, pós-onboarding, erro de IA/gravação, idempotência e transporte parcial.
- [x] Implementar duas chamadas limitadas, histórico, respostas guiadas e recuperação; flag explícita para ativar após migração.
- [x] Rodar suíte completa, typecheck e testes PostgreSQL; revisar branch em contexto novo; corrigir achados importantes com RED→GREEN.
- [x] Atualizar PR #3 e publicar branch para deploy, sem incorporar ou executar migração em produção.
