# Google Planilhas na Conta

Conta → Google Planilhas → Conectar Google → informar link → Buscar abas →
Ler pacientes → conferir prévia → Confirmar importação.

A conexão é pessoal por médico e usa sessão Supabase validada. O usuário não
informa senha Google ao Noto. OAuth com PKCE, cookie HttpOnly e estado de uso único;
Google concede `spreadsheets.readonly`, que permite ler planilhas acessíveis à conta.
Não solicitamos acesso ao Drive. O Noto lê apenas a planilha/aba escolhida pelo link.

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
Nenhum segredo OAuth ou token Google é entregue ao navegador.

## Ativação

1. No Google Cloud, selecionar projeto, habilitar Google Sheets API e configurar
   a tela de consentimento OAuth. Em modo de teste, cadastrar os e-mails de teste;
   para uso público, cumprir a verificação exigida pelo Google para esse escopo.
2. Criar credencial OAuth **Aplicativo Web** e cadastrar exatamente o redirect:
   `https://notomed-web.6t32my.easypanel.host/api/integracoes/google-planilhas/callback`.
3. No Easypanel `notomed` → `web`, configurar `GOOGLE_CLIENT_ID`,
   `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` (o endereço acima), além de
   `GROQ_API_KEY` e `GROQ_MODEL` já usados pelo Noto. Não usar URL HTTP em produção.
4. Implantar código, executar `npm run migrate:planilhas` e reiniciar `web`.
5. Sair e entrar novamente pelo código WhatsApp: sessões antigas usavam um hash de
   link mágico; agora o login troca esse hash por JWT Supabase válido em cliente
   separado, sem alterar o cliente administrativo. Depois entrar na Conta e testar com uma planilha pequena. Se a sessão Noto estiver
   expirada, entrar novamente; a integração não confia no medicoId do navegador.

Sem credenciais Google completas, a Conta mostra integração indisponível e os
outros fluxos seguem funcionando. Testes simulam Google/Groq e usam PostgreSQL
local isolado; não demonstram consentimento, permissões ou importação em produção.
