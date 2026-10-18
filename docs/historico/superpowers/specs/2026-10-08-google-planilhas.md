# Google Planilhas na Conta

Objetivo: conectar Google na Conta, ler uma planilha privada sem upload, reconhecer
colunas de pacientes por IA e importar após prévia. Apenas leitura no Google.
Não cria consultas, emissões nem presume pagamento.

OAuth Google com PKCE e estado de uso único, callback em URL configurada,
identidade vinculada ao médico da sessão Supabase validada. Nunca confiar em
medicoId enviado pelo cliente. Tokens e prévia cifrados no PostgreSQL, acesso
somente backend. Desconectar revoga token e elimina vínculo/prévias.

Primeira versão recebe link da planilha após autorização e lista suas abas;
sem acesso ao Drive nem necessidade de Google Picker. Google Sheets readonly
permite leitura das planilhas autorizadas na conta; Noto só lê o link escolhido.
IA mapeia cabeçalho em nome/CPF/email/telefone; valores vêm das células originais,
sem invenção. CPFs e emails não precisam ser enviados ao modelo para mapear colunas.
Leitura limitada declara cobertura; nunca diz que leu tudo quando há truncamento.

Prévia com origem aba/linha e pendências; usuário confirma antes de salvar.
CPF válido é cifrado e hash usa pepper atual. Telefone obrigatório no schema.
Dados inválidos/incompletos/conflitos ficam fora da importação com motivo explícito.
Deduplicar por médico+telefone e CPF; não fundir CPF de uma pessoa com telefone de
outra, não atualizar nome validado ou substituir campo não vazio divergente.
Importação transacional idempotente por prévia, sem acionar liberação de notas.

Setup externo necessário: OAuth client web no Google Cloud, Sheets API habilitada,
redirect exato do Noto e consent screen; testing exige usuários de teste. Sem
credenciais, UI mostra integração indisponível e resto do sistema continua.
