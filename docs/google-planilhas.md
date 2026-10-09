# Google Planilhas na Conta

Conta → Google Planilhas → Conectar Google → selecionar planilha no Google Picker → Buscar abas →
Ler pacientes → conferir prévia → Confirmar importação.

A conexão é pessoal por médico e usa sessão Supabase validada. O usuário não
informa senha Google ao Noto. OAuth com PKCE, cookie HttpOnly e estado de uso único;
Google concede `drive.file`, que permite acesso apenas aos arquivos autorizados
para este aplicativo. O Noto usa somente operações de leitura na planilha escolhida
no Picker. Informar o link manualmente não concede acesso a um arquivo novo.

A IA mapeia cabeçalhos reconhecíveis (nome, CPF, e-mail, telefone e seus aliases),
sem receber valores de pacientes. Colunas sem rótulos claros ou cabeçalho fora das
primeiras dez linhas precisam de ajuste na planilha. Os dados vêm das células
originais e passam por validação; não completamos CPF ou número por suposição.
Máximo de 1001 linhas e 52 colunas por leitura; a prévia informa leitura parcial.
Uma planilha maior deve ser dividida em abas menores nesta versão.

Telefone brasileiro é obrigatório no cadastro atual. Campos inválidos e conflitos
não são importados. Deduplicação por médico e telefone/CPF, sem fusão automática
entre telefones diferentes. Importação preenche campos vazios compatíveis, não
substitui valores existentes ou nomes já validados. A prévia fica congelada no
momento da leitura; alterações posteriores da planilha exigem nova leitura.
Confirmações repetidas da mesma prévia retornam o mesmo resultado. Importar não
libera notas pendentes, cria agendas, registra pagamentos ou emite notas.

Tokens, verificador OAuth e prévias são cifrados com a chave atual da aplicação.
CPF importado usa cifra/hash existentes; pacientes vindos da planilha não ganham
nome_validado. RLS/permissões públicas bloqueiam acesso direto às novas tabelas.
Prévias expiram após 24 horas; limpeza de expiradas ocorre na próxima extração.
Desconectar elimina tokens/estados/prévias, tenta revogar acesso Google e mantém
pacientes importados. A interface informa se a revogação externa falhou.
O segredo OAuth e o refresh token não são entregues ao navegador. O Picker
recebe o access token temporário pela rota autenticada `/picker-token` (sem cache).
Não copie URLs do Picker para logs ou suporte: elas contêm esse token.

## Ativação

1. No Google Cloud, selecionar projeto, habilitar Google Sheets API e Google Picker API e configurar
   a tela de consentimento OAuth. Em modo de teste, cadastrar os e-mails de teste;
   para uso público, cumprir a verificação exigida pelo Google para esse escopo.
2. Criar credencial OAuth **Aplicativo Web** e cadastrar exatamente o redirect:
   `https://notomed-web.6t32my.easypanel.host/api/integracoes/google-planilhas/callback`.
3. No Easypanel `notomed` → `web`, configurar `GOOGLE_CLIENT_ID`,
   `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` (o endereço acima), além de
   `GOOGLE_API_KEY` para o Picker, `GOOGLE_APP_ID` com o **número numérico do
   projeto**, e `NVIDIA_API_KEY` e `NVIDIA_MODEL` já usados pelo Noto. OAuth, chave e
   número devem pertencer ao mesmo projeto. O nome/ID textual do projeto, como
   `noto-integrations`, não serve como `GOOGLE_APP_ID`. Não usar URL HTTP em produção.
4. Implantar código, executar `npm run migrate:planilhas` e reiniciar `web`.
5. Sair e entrar novamente pelo código WhatsApp: sessões antigas usavam um hash de
   link mágico; agora o login troca esse hash por JWT Supabase válido em cliente
   separado, sem alterar o cliente administrativo. Depois entrar na Conta e testar com uma planilha pequena. Se a sessão Noto estiver
   expirada, entrar novamente; a integração não confia no medicoId do navegador.

Sem credenciais Google completas, a Conta mostra integração indisponível e os
outros fluxos seguem funcionando. Testes simulam Google/NVIDIA e usam PostgreSQL
local isolado; não demonstram consentimento, permissões ou importação em produção.

## Diagnóstico de seleção da planilha

O Picker usa o número do projeto em `setAppId`, e a origem atual da página em
`setOrigin`. Ajuste `GOOGLE_APP_ID` no Easypanel e implante novamente antes
de selecionar a planilha outra vez. Não é necessário ampliar os escopos para
ler todas as planilhas da conta.

Falhas da API registram `[Google Planilhas]` com etapa, código, status HTTP do
Google e duração. Nenhum corpo de erro, token, CPF ou conteúdo da planilha é
registrado. `API_DESATIVADA` exige habilitar a API no projeto; `RECONECTAR`
exige nova autorização; `ACESSO_RECUSADO` exige conferir a conta e a seleção
do arquivo. Esses diagnósticos são distintos de um `502` HTML retornado pelo
proxy: nesse caso, confira os logs do serviço e sua disponibilidade.

Quando o retorno da autorização mostra “A conexão com o Google não foi concluída”,
procure o log `[Google Planilhas]` com `rota: '/callback'`. Ele identifica a etapa
sem registrar URL, código de autorização, cookie ou tokens:

- `COOKIE_AUSENTE`: o navegador não devolveu o cookie da conexão. Confira se o
  usuário iniciou a autorização no mesmo domínio do `GOOGLE_REDIRECT_URI` e
  concluiu no mesmo navegador, sem apagar os cookies.
- `ESTADO_INVALIDO`: o retorno não corresponde à tentativa aberta nesse navegador;
  recomece a conexão em uma única aba.
- `ESTADO_EXPIRADO_OU_UTILIZADO`: o prazo de dez minutos terminou ou o retorno já
  foi consumido; inicie outra conexão.
- `AUTORIZACAO_RECUSADA` ou `AUTORIZACAO_FALHOU`: o Google devolveu um erro de
  autorização. Confira a tela de consentimento, os usuários de teste e as
  políticas da conta Google antes de tentar novamente.
- `RECONECTAR`, `CONEXAO_FALHOU` ou `HTTP_ERRO` em `trocar_codigo`: confira o
  status HTTP e a configuração OAuth do serviço.
- `REFRESH_TOKEN_AUSENTE`: o Google não entregou o token de renovação exigido
  pela integração; confira a autorização offline da conta.
- `CONEXAO_SUPERADA`: outra conexão ou desconexão alterou a tentativa; use a mais
  recente.
- `BANCO_ERRO`: a gravação ou leitura falhou; `codigoBanco` contém apenas um
  SQLSTATE conhecido, para investigação da equipe.

Esses logs distinguem falhas para investigação; não demonstram que uma conexão
real com erro foi corrigida. Não compartilhe a URL completa do retorno OAuth.

Referência: https://developers.google.com/workspace/drive/picker/guides/web-picker

## NVIDIA no mapeamento das colunas

Configure `NVIDIA_API_KEY` no ambiente do serviço web e `NVIDIA_MODEL=moonshotai/kimi-k3`.
Todos os fluxos de IA usam NVIDIA. Sem a chave, o mapeamento de colunas fica
indisponível. Uma falha da NVIDIA não troca de provedor silenciosamente.

O servidor chama o endpoint fixo `https://integrate.api.nvidia.com/v1/chat/completions`
com `stream: false`, usando somente cabeçalhos reconhecidos e sanitizados. Nenhum
valor de paciente, imagem ou planilha completa é enviado à IA. A resposta é
validada antes de ler os campos das linhas. A requisição tem prazo de 30 segundos;
respostas incompletas, índices inválidos e colunas incompatíveis são recusados.
O modelo indicado precisa estar disponível para a conta NVIDIA configurada.

Use uma chave nova se a anterior tiver sido compartilhada em mensagens. Chaves
ficam somente no ambiente; nunca em código, navegador ou logs. Após configurar,
implante o serviço. Não há migração de banco para a troca do provedor.
