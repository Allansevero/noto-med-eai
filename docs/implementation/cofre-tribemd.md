# Cofre TribeMD por conta

O card TribeMD ocupa o lugar da antiga integração de planilhas. Usa o logo enviado
pelo proprietário, sem modificação, e abre um formulário com e-mail, senha e
autorização explícita para ler agenda e dados dos pacientes. A seção **Cofre**
permite atualizar a leitura, alterar credenciais, desconectar ou excluir o acesso.

## Proteção e isolamento

- A API valida o token Supabase e resolve o médico pela conta ativa no banco.
  Não aceita identificador de clínica enviado pelo navegador nem token como UUID.
- Cada conta tem seu próprio envelope AES-256-GCM com e-mail, senha e estado de
  autenticação do navegador. Consentimento, versão e data ficam nesse envelope.
  Chave somente no ambiente; arquivos com permissão 0600 e diretório 0700.
- O parser de credenciais fica antes do parser geral que captura `rawBody`.
  Corpo limitado a 4 KB, schemas estritos, respostas sem credenciais e sem cache.
  Alterações exigem a origem configurada e cabeçalho próprio, além da autenticação.
- Campos do formulário são limpos após envio/fechamento. Não há armazenamento de
  senha no navegador, envio de credenciais à IA ou registro de pacientes em log.
- Reutiliza o leitor TribeMD existente: navegador Chromium com Xvfb, política de
  leitura, sem gravação de sessão. Só o login autorizado pode escrever no portal.
  Não expõe tela ou controle interativo do navegador ao usuário do painel.

## Ciclo da conexão

Salvar inicia login e leitura em segundo plano; o painel acompanha o estado.
Cookies válidos são reutilizados. Sessão expirada permite uma nova tentativa com
a credencial criptografada, sem pedir a senha novamente. CAPTCHA, MFA, senha
incorreta ou alteração de layout podem exigir intervenção; não são contornados.

Se o login funcionar e a agenda falhar, a sessão autenticada é preservada e o
painel informa a falha de atualização. Cada trabalho tem limite de 120 segundos.
As consultas atendidas/finalizadas e seus detalhes vêm do leitor existente e
respeitam o intervalo carregado e as pendências reconhecidas pelo portal.

Desconectar cancela a leitura, remove cookies e o resultado transitório e marca
o cofre inativo, conservando a credencial criptografada. Nova leitura exige
reconexão explícita. Excluir remove também o envelope com as credenciais.
Alterar credenciais descarta a sessão anterior e exige novo consentimento.

Resultados pessoais ficam somente em memória por até cinco minutos. Não são
gravados no banco ou em arquivos. O endpoint autenticado de resultados é reservado
à conta proprietária; o painel mostra apenas estado e quantidade de consultas.

## Implantação no mesmo app

Sem novo serviço ou migração de banco. A imagem atual já inclui Chromium e Xvfb.
Configurar no ambiente do serviço, nunca no repositório:

| Variável | Uso |
| --- | --- |
| `COFRE_ORIGEM` | Origem HTTPS exata do painel, sem caminho; usa `TRIBEMD_TESTE_ORIGEM` se vazia. |
| `COFRE_CHAVE` | Chave estável de 32 bytes em base64; usa `TRIBEMD_TESTE_CHAVE` se vazia. |
| `COFRE_DIRETORIO` | Raiz de volume persistente; usa `TRIBEMD_TESTE_DIRETORIO` se vazia. |

Os perfis das contas ficam no subdiretório `cofres-contas-v1`, separado dos perfis
administrativos. O cofre do painel não exige habilitar a área de teste nem seu
token Basic. Configuração inválida indisponibiliza apenas o cofre.

Manter **uma réplica do aplicativo**, volume persistente e a mesma chave entre
implantações. Há no máximo dois navegadores simultâneos, um trabalho por conta;
excedentes recebem erro para tentar novamente. Não há fila distribuída nem
cancelamento entre réplicas. Encerramento normal fecha navegadores e libera locks.
Após encerramento forçado, um diretório `.lock` pode exigir remoção administrativa,
somente depois de confirmar que não existe trabalho ativo para aquele perfil.
Não trocar a chave de perfis existentes sem migrar os envelopes.

## Escopo e conferência

Esta conexão não executa emissão automática, cruzamento com WhatsApp ou coleta
diária agendada. Esses fluxos e iClinic continuam como etapas seguintes.

Conferências desta entrega: TypeScript sem emissão, sintaxe JavaScript do módulo e
do script inline, revisão estática de autenticação, isolamento, cancelamento e
persistência. Nenhum teste automatizado foi adicionado ou executado. Login real,
isolamento com duas contas reais e implantação ainda precisam ser conferidos no
ambiente publicado; não foram usados pacientes nem credenciais de produção aqui.
