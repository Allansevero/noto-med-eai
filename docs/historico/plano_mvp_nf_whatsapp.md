# Plano de implementação — MVP Emissão de NF por WhatsApp (médicos)

> Documento para ser colado como instrução inicial a uma LLM de codificação
> (ex.: Claude Code). Descreve o comportamento esperado, não a UI final.
> Sempre que um ponto depender de decisão de negócio ainda em aberto, está
> marcado em **[DECIDIR]** — pare e pergunte antes de assumir um valor.

## 0. Objetivo do MVP

Um médico autônomo conecta o WhatsApp do consultório ao sistema. A partir daí,
duas ações via comando de texto dentro da conversa com cada paciente bastam
para (a) registrar a consulta na agenda e (b) emitir e enviar a NFS-e ao
paciente — sem o médico sair do WhatsApp.

Fora de escopo neste MVP: emissão automática disparada por Open Finance,
painel web completo, contratos recorrentes, múltiplos médicos por conta
(clínica) — a base de dados já suporta isso, mas a lógica de produto não
precisa cobrir agora.

## 1. Peças da infraestrutura (tudo na mesma VPS, via Easypanel)

| Serviço | Papel |
|---|---|
| Supabase (self-hosted, container Easypanel) | Postgres + Auth (`auth.users`) + Storage; RLS por `medico_id` reforçando o isolamento (ver `schema_nf_saude.sql`, seção 10) |
| Evolution API — instância do médico | Ponte com o WhatsApp do consultório (coexistência), uma por médico |
| Evolution API — instância oficial da plataforma | Número próprio da plataforma; usado para avisar médicos e para enviar o código OTP de login/cadastro (ver seção 4.7) — nunca fala com pacientes |
| App principal (Node/TS) | Webhooks da Evolution, reconhecimento de resposta rápida, fila, fluxo de OTP + sessão Supabase |
| Fork do `kursku/emissor-nfse` (https://github.com/kursku/emissor-nfse.git) | Montagem/assinatura da DPS e envio à SEFIN Nacional, adaptado para ler `medico_perfil_fiscal` e `medico_certificados` do Supabase em vez de `.env`/arquivo local |
| Worker de fila | Processo separado (ou cron) que consome `solicitacoes_nota` com `fila = 'pronta'` |

Decisão: **Supabase** (self-hosted na mesma VPS), não Postgres puro — o
schema (`schema_nf_saude.sql`) já assume `auth.users`, RLS via `auth.uid()`
e Storage do Supabase; manter os dois documentos consistentes evita
reescrever a camada de auth e upload do zero. Segredos (CPF/CNPJ, senha do
certificado A1) continuam via `pgcrypto`, à parte do Supabase Auth (ver
seção 4.1). O login em si **não** usa o fluxo nativo de e-mail/senha ou SMS
do Supabase Auth — ver seção 4.7.

## 2. Fluxo A — dados do paciente (só uma mensagem automática existe, e é natural)

Regra geral do produto: **nenhuma mensagem — nossa ou do médico — pode
parecer automação**. A única exceção é o pedido de reenvio de CPF na
emissão (seção 2.3), porque essa frase soa exatamente como algo que a
recepção perguntaria de qualquer forma. Fora isso, o sistema nunca inicia
pergunta nenhuma; só extrai o que já foi dito naturalmente.

### 2.1 Paciente com histórico anterior à conexão do sistema

No momento em que o médico conecta o WhatsApp pela primeira vez (onboarding),
a Evolution API sincroniza o histórico de conversas já existente naquele
número. Para cada conversa antiga:
1. Varre as mensagens em busca de um CPF que o paciente já tenha mandado
   antes (por qualquer motivo — convênio, outro atendimento, etc.).
2. Se encontrar → consulta o provedor de CPF (plugável) para obter nome
   completo e data de nascimento, e já cria o `paciente` preenchido
   (`origem_cadastro = 'historico_whatsapp'`).
3. Se não encontrar → a conversa fica sem paciente vinculado; segue para o
   fluxo 2.2 na próxima interação.

### 2.2 `/agendado` sem paciente cadastrado → registro mínimo

Quando o `/agendado` dispara e não existe `paciente` pra aquele número, o
sistema cria a linha na hora com só o essencial: `telefone` + o
`agendamento` (data/hora extraídas da conversa). Não é preciso ter nome,
CPF, endereço ou e-mail ainda — nenhum desses bloqueia o agendamento.

- Se nome, endereço ou e-mail apareceram naturalmente na conversa (o
  médico/secretária pode ou não ter perguntado), o sistema aproveita e já
  preenche — é oportunista, não obrigatório.
- Nome completo e CPF, quando ainda faltarem, são resolvidos depois, na
  emissão (seção 2.3).

### 2.3 CPF ausente na emissão

Quando o `/emissao` dispara e o paciente vinculado àquele número não tem
CPF salvo — porque o histórico (2.1) não achou nada e o paciente não
mandou o CPF no primeiro contato (2.2) — o sistema envia, pela conversa do
paciente, exatamente esta mensagem:

> "poderia por favor me reenviar o seu CPF para emissão da nota fiscal?"

Marca `whatsapp_conversas.aguardando_cpf_desde = now()`. A próxima mensagem
do paciente nessa conversa é lida como resposta a esse pedido:
1. Valida formato e dígito verificador do CPF.
2. Salva `cpf_cnpj_hash`/`cpf_cnpj_encriptado` em `pacientes`.
3. Consulta o provedor de CPF com esse valor pra obter o nome completo (e
   data de nascimento, se disponível) e atualiza o registro.
4. Limpa `aguardando_cpf_desde` e segue a emissão normalmente.

Se a mensagem seguinte não parecer um CPF válido, mantém o estado (não
processa como comando) e deixa o médico perceber via aviso de "faltam
dados" (seção 3.2, item 5).

**[DECIDIR]** Qual provedor de consulta CPF→nome/nascimento usar — fica
plugável por trás de uma interface (`ConsultaCpfProvider.consultar(cpf):
Promise<{nome, data_nascimento} | null>`), você escolhe quando quiser sem
mexer no resto do sistema.

## 3. Fluxo B — comandos rápidos

**Importante**: `/agendado` e `/emissao` não são texto de comando literal.
São **respostas rápidas do próprio WhatsApp** — o médico/secretária cadastra
um atalho no app, digita `/algumacoisa` na conversa do paciente, e o próprio
WhatsApp substitui isso por uma frase natural completa *antes* de enviar
(pode editar/completar antes de mandar). O paciente nunca vê um comando —
vê uma frase normal, do jeito que o médico já escreveria.

Consequência para o sistema: nada de parsing de comando com `/`. O
reconhecimento é por **casamento com a frase cadastrada por aquele médico**
(tabela `medico_respostas_rapidas`), em mensagens **enviadas pelo próprio
número conectado** (`fromMe: true` no payload da Evolution API), dentro da
conversa de um paciente específico.

### 3.1 `/agendado`

Texto-modelo cadastrado: `"Consulta agendada!"`. Sozinho ele não carrega
data/hora/valor — é só o sinal de "capture o que foi combinado nesta
conversa agora". O sistema lê a janela recente da conversa (não só a
mensagem do gatilho) e extrai:
- Data e hora da consulta (sempre).
- Valor combinado, se foi mencionado (senão fica pendente até o `/emissao`).
- Nome completo/endereço/e-mail, só se apareceram naturalmente na conversa
  (oportunista — ver seção 2.2, não é obrigatório pra criar o agendamento).

Comportamento:
- Sem paciente cadastrado ainda → cria o registro mínimo (seção 2.2),
  depois cria/atualiza `agendamentos` (status `agendado`), vinculado a
  `paciente_id` e à `whatsapp_conversas.id` de origem.

### 3.2 `/emissao`

Texto-modelo cadastrado: `"Vou enviar em instantes sua NF no valor de R$"`.
O médico completa à mão. O valor pode ser digitado — quando não, o sistema
soma o valor de todas as consultas em aberto (ver abaixo).

Descrição impressa na nota (`xdesc_serv`), montada pela aplicação a partir
do texto que você definiu:

```
REFERENTE A CONSULTAS {ESPECIALIDADE} COM DR.(A) {NOME COMPLETO} VINCULADO {CRM/RQE} NAS DATAS {TODAS DATAS EM ABERTO}
```

- `{ESPECIALIDADE}` e `{NOME COMPLETO}` vêm de `medicos`.
- `{CRM/RQE}` vem de `medicos.crm`/`medicos.rqe` — usa o que estiver
  preenchido (mostra os dois se os dois existirem).
- `{TODAS DATAS EM ABERTO}` é a lista de datas de `agendamentos` com
  `status = 'realizado'` que ainda não estão cobertas por nenhuma
  solicitação bem-sucedida em `solicitacao_nota_agendamentos` (ver schema,
  seção 7) — é assim que um pagamento de pacote (várias consultas, um valor
  só) sai numa nota só, listando todas as datas cobertas.

Comportamento:
1. A frase em si já é a confirmação — nenhuma resposta extra é enviada ao
   paciente nesse momento.
2. App busca as consultas em aberto do paciente e soma o valor (se não veio
   no texto).
3. Se o paciente não tem CPF salvo: cria a `solicitacoes_nota` mesmo assim,
   com `fila = 'pendente_cadastro'`, e dispara o pedido de reenvio de CPF
   (seção 2.3) — a solicitação já fica esperando; quando o CPF chegar, o
   próprio fluxo 2.3 muda a `fila` para `'pronta'` e o worker pega dali.
4. Com CPF em mãos: cria `solicitacoes_nota` (`fila = 'pronta'`) + uma
   linha em `solicitacao_nota_agendamentos` para cada consulta incluída.
5. Worker processa a fila de forma assíncrona (ver seção 1). Até 3
   tentativas, com limite de taxa entre elas (rate limit) e backoff.
6. Ao autorizar a nota: envia o PDF (DANFSe) na mesma conversa do paciente.
7. Se as 3 tentativas falharem, ou se um campo obrigatório não puder ser
   completado automaticamente: **não** notifica o paciente. Envia um aviso
   ao médico pela instância oficial da plataforma (nunca pela conversa do
   paciente), para o `usuarios.telefone` cadastrado.
8. Erro interno inesperado (bug, exceção não tratada): notifica o
   desenvolvedor por e-mail via Resend (mesma integração que o
   `emissor-nfse` já usa para mandar a nota por e-mail) — evita subir uma
   peça nova de infraestrutura só para alertas.

## 4. Segurança

### 4.1 Segredos e criptografia
- **Um único mecanismo para tudo que é segredo**: `pgcrypto` dentro do
  Postgres (`pgp_sym_encrypt`/`pgp_sym_decrypt`), com a chave simétrica só
  como variável de ambiente da aplicação (Easypanel), nunca no banco nem no
  repositório. Cobre: senha do certificado A1 (`medico_certificados.senha_encriptada`)
  e CPF/CNPJ (`pacientes`/`medico_perfil_fiscal`).
- **CPF/CNPJ**: já ajustado no schema — `cpf_cnpj_hash` (HMAC-SHA256 com
  pepper próprio da aplicação, indexado, usado para busca por telefone/CPF)
  + `cpf_cnpj_encriptado` (bytea, decriptado só na hora de montar a DPS).
- **Arquivos (certificado, XML, PDF)**: ficam num volume/disco privado da VPS
  fora do webroot, com permissão restrita ao usuário do processo da
  aplicação — não em bucket público, não versionado no git.
- **Backups**: se o backup do Postgres sair da VPS (ex.: para outro storage),
  garantir que saia criptografado — senão a criptografia em coluna perde o
  sentido.

### 4.2 Isolamento entre médicos
Por filtro `medico_id` na aplicação, extraído da sessão autenticada
(`auth.uid()` do Supabase, resolvido via `usuarios.auth_user_id`) — nunca de
um ID enviado pelo cliente (nenhuma rota confia em `medico_id`/`paciente_id`
do corpo da requisição sem checar que pertence à sessão autenticada). RLS
(seção 10 do schema) reforça o mesmo filtro no próprio banco.

### 4.3 Contra injeção de dados
- **Só consultas parametrizadas** — nunca concatenar string SQL. Usar um
  query builder que faz isso por padrão (ex.: Kysely, Drizzle) em vez de
  montar SQL na mão, pra não depender de disciplina manual.
- **Validar todo dado de entrada antes de tocar o banco** — schema de
  validação (ex.: Zod) em cada rota e em cada payload de webhook, incluindo
  o texto extraído das mensagens do WhatsApp (nunca confiar em texto livre
  de terceiros indo direto pra uma query ou pro comando que monta a DPS).
- O mesmo vale pro texto que o LLM de extração devolve: tratar como dado
  não confiável até validar formato (datas, valores, CPF) antes de gravar.

### 4.4 Contra força bruta e abuso
- Rate limit por IP e por conta nas rotas de login e nos webhooks públicos.
- Bloqueio temporário de conta após N tentativas de login erradas
  (`usuarios.tentativas_login_falhas`/`bloqueado_ate`, já no schema).
- JWT de vida curta, com refresh — não emitir sessão de longa duração.

### 4.5 Contra forjar webhook/mensagem
- O webhook da Evolution API só aceita requisições com o segredo
  compartilhado configurado na própria Evolution (nunca aberto sem
  autenticação) — sem isso, qualquer um poderia forjar uma mensagem
  `fromMe: true` e disparar uma emissão falsa.
- Toda comunicação (login, webhooks, integrações) em HTTPS — o Easypanel já
  emite certificado automático via Traefik, é só garantir que nada aceita
  HTTP puro.

### 4.6 Login/cadastro — WhatsApp + OTP (sem SMS nativo, sem senha)

Tela única de entrada, para médico/secretária/contador. Não existe cadastro
separado de login: o número decide.

1. Usuário digita o número de WhatsApp.
2. App gera um código OTP (6 dígitos), grava `codigo_hash` (não o código em
   texto puro) + `expira_em` (curto, ex. 5 min) numa tabela de verificação
   por telefone, com rate limit por telefone e por IP (reforça 4.4).
3. Envia o código **pela instância oficial da plataforma no Evolution API**
   (nunca a instância do médico, nunca SMS) — mesma conversa que já avisa
   médicos de erro (seção 3.2, item 7).
4. Usuário digita o código na mesma tela. App valida hash + expiração +
   número de tentativas.
5. Telefone já existe em `usuarios` → login nessa conta. Não existe → fluxo
   de cadastro (cria `conta` + `usuario`, papel inicial conforme contexto —
   ex. quem inicia sozinho vira `medico`).
6. Com o telefone verificado, a aplicação abre uma sessão **do próprio
   Supabase Auth** para aquele usuário — o OTP substitui só a etapa de
   "provar que é o dono do número", nunca a autenticação em si.

Decisão: **Admin API do Supabase (service role)**, nunca JWT próprio. Na
prática: `auth.admin.createUser`/busca por telefone se ainda não existir, e
`auth.admin.generateLink` (ou equivalente) para abrir a sessão depois do
código confirmado. Isso mantém tudo *dentro* do Supabase — `auth.users`
continua existindo normalmente, `auth.uid()` funciona sem nenhum código
extra, e a RLS da seção 10 vale como está, sem exceção.

A alternativa (JWT próprio, validado via Third-Party Auth) ficaria *fora*
do Supabase Auth — a aplicação passaria a ser responsável por assinatura,
expiração, revogação e validação do token, reimplementando à mão o que o
GoTrue já resolve. Mais superfície pra errar, sem ganho aqui: descartada.

O único ponto sensível é a própria service role key — ela pode agir como
qualquer usuário, então fica só em variável de ambiente do backend (nunca
no cliente/app mobile), no mesmo padrão de segredo da seção 4.1.

### 4.7 Prática contínua
- Postgres com um usuário de aplicação sem privilégio de superusuário
  (menor privilégio possível pra cada peça).
- `auditoria` (já no schema) registra quem mudou o quê, quando — útil tanto
  pra investigar incidente quanto pra rastrear erro de operação.
- Manter dependências atualizadas (Node, libs do fork do emissor-nfse,
  imagens Docker) — a maioria dos ataques "sofisticados" começa explorando
  uma dependência desatualizada, não uma falha nova.

## 5. Padrões de código pedidos

Regras completas, com exemplos, em `CONVENCOES-DE-CODIGO.md` (documento
separado). Resumo:

- Teto de ~300 linhas por arquivo — sinal de quebrar responsabilidade antes
  de chegar lá, não depois.
- Um arquivo = uma responsabilidade (uma regra de extração, uma chamada
  externa, um caso de uso); nunca `utils.ts`/`helpers.ts` genérico.
- Lógica pura (decide o quê) separada de I/O (banco, rede, `process.env`);
  integração ainda não decidida (provedor de CPF, envio de WhatsApp) fica
  atrás de uma interface pequena, pra trocar sem tocar a lógica.
- Nomenclatura em português: `camelCase` verbo+substantivo para função,
  `kebab-case` para arquivo, `PascalCase` para tipo/interface.
- Teste `node:test` nativo ao lado de cada módulo puro (`nome.ts` +
  `nome.test.ts`).
- Comentários só de *por quê*, nunca de *o quê*.

## 6. Ordem sugerida de implementação

1. Ajustes de schema (hash/encriptação de CPF, tabela de datas cobertas por
   nota — já aplicados em `schema_nf_saude.sql`).
2. Webhook da Evolution API + casamento de resposta rápida (`/agendado`,
   `/emissao`) com o filtro `fromMe`.
3. Fluxo A (extração de dados da conversa para paciente novo; varredura de
   histórico no onboarding para paciente antigo).
4. Fluxo B completo, gravando `solicitacoes_nota` +
   `solicitacao_nota_agendamentos`.
5. Adaptação do fork do `emissor-nfse` para ler `medico_perfil_fiscal` /
   `medico_certificados` do Postgres.
6. Worker da fila + envio do DANFSe de volta pela Evolution API.
7. Só depois: notificação de erro ao médico, painel de acompanhamento.

## 7. Decisões pendentes

Todas as decisões de negócio deste MVP já foram tomadas. Só continua em
aberto, por escolha sua (não bloqueia o desenvolvimento):

- Provedor de consulta CPF→nome/nascimento — fica plugável por trás de uma
  interface; escolha o fornecedor quando quiser, sem mexer no resto do
  sistema (seção 2.1).
