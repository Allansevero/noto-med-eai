# Teste TribemD na área de desenvolvedor

**Objetivo:** login em navegador temporário no servidor, agente com ferramentas de leitura e JSON de pacientes/agendamentos para revisão.
**Especificação:** ../specs/2026-10-07-tribemd-desenvolvedor-design.md
**Execução:** nesta sessão, autorizada pelo usuário. Em 07/10/2026 o usuário autorizou fazer a inspeção do layout no servidor implantado, sem depender do acesso do Codex ao portal. Portanto o piloto deve reconhecer estruturas semânticas, recusar ambiguidades e expor diagnóstico quando o layout real não for reconhecido. Não afirmar integração real validada por testes locais.

1. Extrator determinístico (`src/desenvolvedor/tribemd-dados.ts`): campos rotulados e tabelas, validação CPF/telefone, fonte por valor e intervalo de agenda, sem inferência de dados ausentes. Testar tabelas de pacientes, agenda, dados inválidos e campos clínicos ignorados.
2. Navegador (`src/desenvolvedor/tribemd-navegador.ts`): Playwright Core + Chromium instalado no Dockerfile; host fixo; login com campos semânticos únicos; confirmação de saída do login; ferramentas limitadas a menus de pacientes/agenda, cadastro observado e paginação identificada. Testar em Chromium real com páginas controladas, inclusive senha errada, desafio e links não permitidos.
3. Agente (`src/desenvolvedor/tribemd-agente.ts`): reutilizar Groq, escolher somente IDs de ferramentas já autorizadas, nunca enviar credenciais/valores cadastrais ao modelo, impedir ciclos, máximo de 30 ações e 20 cadastros. Testar ação inventada, repetição e ausência de dados.
4. Router (`src/desenvolvedor/tribemd-router.ts`): chave existente, uma sessão por processo, prazo 20 minutos, HTTP 202, cancelamento com fechamento, JSON autenticado e diagnóstico estruturado sem dados pessoais no log. Testar autenticação, validação, concorrência, resultado, cancelamento e falha de login.
5. Interface (`src/ui/desenvolvedor-tribemd.html`): chave, e-mail, senha, filtro de datas, progresso, diagnóstico, JSON e encerramento; limpar campos após envio, usar textContent, não persistir segredos. Integrar link e rotas no server.ts. Verificar handlers reais e viewport mobile/desktop.
6. Executar npm test e npm run typecheck, revisar isolamento e ausência de persistência. Publicar somente os arquivos desta entrega em árvore GitHub baseada no main atual. Usuário implanta no Easypanel e testa com a própria conta.

**Limitações explícitas:** sem inspeção autenticada real, MFA/CAPTCHA interrompem; estruturas não reconhecidas resultam em pendência; cobertura limitada e datas com fuso não declarado permanecem explícitas. Não altera registros do TribemD, não grava pacientes nem emite notas.
