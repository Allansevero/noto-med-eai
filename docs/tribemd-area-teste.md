# TribeMD: área isolada de teste

Branch: `fix/tribemd-login-area-teste`. Base do repositório: `bbe97e2`.
Referência histórica inspecionada: `b3019f8^`, anterior à remoção do piloto.
Somente `tribemd-display.ts` e `tribemd-rede.ts` foram recuperados e adaptados;
o agente antigo e sua ligação com o servidor Noto não foram reativados.

## O que foi alterado

- Login: `https://app.tribemd.com/login?continue=/atendimentos/agenda`.
- Agenda: `/atendimentos/agenda`; pacientes: `/pacientes`.
- Processo Express independente, sem importar configuração, autenticação,
  emissão, parâmetros, IA ou banco do Noto.
- Página protegida por HTTP Basic, inclusive HTML, JavaScript e capturas.
  Usuário da área: `teste`; senha: `TRIBEMD_TESTE_TOKEN`.
  Essa chave administrativa autoriza todas as clínicas desta área de teste;
  não é uma implementação de acesso multiusuário para clientes.
- Chromium com janela em Xvfb; imagem atualizada a cada segundo durante a sessão,
  com inputs, textareas e campos editáveis ocultados. Sem porta VNC/DevTools.
- Uma sessão ativa por processo, com expiração de vinte minutos. Cada clínica tem
  seu próprio envelope e bloqueio de perfil. O botão de encerrar apaga resultados,
  fecha navegador/Xvfb e preserva apenas a autenticação criptografada.
- Chave AES-256-GCM externa ao volume, nonce aleatório, AAD vinculado à clínica,
  escrita atômica e arquivos `0600`. Senha/e-mail são descriptografados apenas
  para uso; não são devolvidos pela API. Strings JS não permitem garantia de
  sobrescrita física da memória, mesmo depois de remover suas referências.
- Persistência de cookies próprios e das chaves de autenticação
  `bipp-user-token` / `bipp-instituicao`, encontradas no bundle público.
  Caches de pacientes, IndexedDB, resultados e capturas não são persistidos.
  Não se usa um diretório Chromium permanente contendo cookies abertos.
- Botão separado para excluir perfil e credenciais, com a sessão já encerrada.

## Iniciar como serviço separado no Easypanel

Não substituir o comando do serviço `web` do Noto. Criar um **outro app de teste**
com este branch, usando o Dockerfile existente, que já instala Chromium e Xvfb.
Não houve alteração nesse Dockerfile nem em `package.json`.

Comando do novo app:

```sh
node --import tsx scripts/tribemd-area-teste.mjs
```

Configuração exclusiva do novo serviço:

| Variável | Valor / requisito |
| --- | --- |
| `TRIBEMD_TESTE_ORIGEM` | Origem HTTPS exata, por exemplo `https://teste-tribemd.seu-dominio.com`, sem caminho ou barra final. |
| `TRIBEMD_TESTE_TOKEN` | Segredo administrativo aleatório de 32–256 caracteres. Inserir no gestor de segredos, nunca no Git/chat. |
| `TRIBEMD_TESTE_CHAVE` | Segredo: 32 bytes aleatórios codificados em base64, estável entre implantações. Não reutilizar token administrativo. |
| `TRIBEMD_TESTE_DIRETORIO` | `/dados/tribemd`, em volume persistente exclusivo. |
| `TRIBEMD_TESTE_HOST` | `0.0.0.0` dentro do container, somente na rede do proxy. Padrão: loopback. |
| `TRIBEMD_TESTE_PORTA` | `3100`; configurar destino do domínio nessa porta, sem publicá-la diretamente no host. |
| `CHROMIUM_EXECUTABLE_PATH` | `/usr/bin/chromium-browser` na imagem Alpine existente. |
| `XVFB_EXECUTABLE_PATH` | Opcional; padrão `Xvfb`. |

Não fornecer variáveis NVIDIA, OpenAI, Supabase, certificado A1 ou Evolution.
A conexão deve passar por **um proxy HTTPS confiável**, que define
`X-Forwarded-Proto` e preserva o Host. O processo confia em um salto de proxy;
por isso sua porta não pode ser acessível diretamente pela Internet.
HTTP sem TLS só é aceito para testes em `localhost`/`127.0.0.1`.
Desativar qualquer logger externo que capture corpo, Authorization ou respostas;
não instalar replay/analytics nesta página. O processo não registra requisições.

Entrar no domínio, autenticar como `teste`, informar o identificador da clínica
e clicar **Abrir navegador**. Acompanhar a tela antes de enviar credenciais.
Digitar e-mail/senha TribeMD e clicar **Entrar e salvar criptografado**.
Depois de entrar, usar **Abrir agenda e ler** ou **Abrir pacientes e ler**.
Na próxima execução, o perfil será restaurado; se expirou, é necessário login.
**Usar credencial salva** é uma ação explícita, sem repetição automática.

A mesma clínica deve ser usada por uma réplica apenas. O bloqueio em disco
impede duas instâncias simultâneas quando compartilham o volume. Se o processo
for morto sem limpeza, pode sobrar um arquivo/diretório `.lock`; só removê-lo
após confirmar que nenhum processo usa aquele perfil. Perder/rotacionar a chave
sem recriptografar os envelopes exige excluir o perfil e autenticar novamente.

## Leitura e limites

A coleta só navega para agenda e pacientes. `/inicio` é permitido como destino
intermediário de autenticação, sem extração nessa página. Não são abertos prontuários,
edição, criação, exportação ou fichas individuais. GET/HEAD/OPTIONS próprios
são permitidos; ações reconhecidas em GET são bloqueadas. O único POST permitido
é um envio explícito de `/api/usuarios/login`, durante autenticação. Depois disso,
POST/PUT/PATCH/DELETE, WebSockets e terceiros são bloqueados, inclusive trackers.
Não se contornam bloqueios de borda. MFA e layouts de desafio não reconhecidos
podem exigir parar o teste; não há resolvedor automático nem controle genérico.

A extração lê somente colunas reconhecidas de nome, data e situação, em até
cem linhas visíveis por tabela, no máximo cinco tabelas. Campos clínicos, CPF,
telefone e observações não são coletados. O resultado fica só na sessão protegida.

Uma coluna explícita de “última consulta” é identificada como tal. Uma data de
consulta com status realizado é marcada como **consulta realizada observada**;
não comprova ser a última de todo o histórico. Nesse caso, `ultimaConsulta`
fica nula e a data aparece apenas em `dataConsultaObservada`. Agendado, cancelado, data futura
ou inválida não viram consulta realizada. Homônimos não são mesclados.

O bundle público indica uma **agenda em calendário**. O adaptador conservador
atual reconhece tabelas, não confirma a leitura dos cartões desse calendário.
Sem uma tabela reconhecida, retorna `LEITURA_LAYOUT_NAO_RECONHECIDO`; não tenta
abrir cartões de atendimento nem inventa dados. A captura permite confirmar o
layout com a clínica antes de ampliar seletores. A identificação da última
consulta real de um paciente permanece pendente de validação autenticada.

## Diagnóstico: como ler

`LOGIN_HTTP_ERRO` conserva etapa, status do documento e status de cada chamada
fetch/XHR. Uma página 200 pode conter uma API 404. O observador não publica
corpos, parâmetros, tokens, cookies ou cabeçalhos brutos. `cookiePresente` e
`autorizacaoPresente` são apenas booleanos; presença não comprova sessão válida,
e ausência de cookie pode ser normal numa API com Bearer.

`cf-mitigated: challenge` vira `desafio_cloudflare`;
`x-amzn-waf-action: challenge/captcha` vira sinal fixo correspondente.
Uma infraestrutura Cloudflare ou um 404 isolado não comprova bloqueio de borda.
Diagnósticos ficam apenas no JSON protegido, sem log ou contexto de IA.
Não se inicia trace, HAR, vídeo ou replay de sessão. Capturas são respostas
transitórias, sem arquivos no produto. O navegador pode usar arquivos temporários
próprios durante a execução; Playwright os remove no fechamento normal.

## Resultado verificado neste ambiente — 17/10/2026

| Passo | Resultado |
| --- | --- |
| HTTP público de `/login?continue=/inicio` | 200. |
| HTTP público de `/login?continue=/atendimentos/agenda` | 200. |
| HTTP público de `/atendimentos/agenda` | 200; não comprova acesso autenticado. |
| Rotas no JavaScript público | `/inicio`, `/atendimentos/agenda` e `/pacientes` existem. A hipótese de `/inicio` ser só mock não foi confirmada. |
| Formulário público | Rótulos “E-mail ou CPF” / “Senha”; envio para `/api/usuarios/login`. |
| Chromium com janela e Xvfb | Executado em páginas controladas. |
| Login, leitura, captura e restauração por clínica | Verificados em fixture, sem conta real nem pacientes reais. |
| Chamadas mutantes e isolamento de outra clínica | Verificados em fixture. |
| Diagnóstico 404 + sinais de borda | Verificado em resposta controlada; não é evidência de bloqueio real. |
| Abertura real com Chromium | Falhou em TLS do proxy do ambiente, antes do formulário. Nenhuma credencial enviada. Não foi desativada verificação TLS. |
| Login e última consulta reais | Não confirmados: confiança TLS do navegador e credenciais da clínica ainda necessários. |
| Publicação no Easypanel | Não realizada; não há sessão administrativa autenticada nesta tarefa. |

**Validação direcionada:** dez testes passaram, sem falhas ou testes pulados,
incluindo painel, captura, reabertura do perfil, criptografia e diagnóstico.
O script de inicialização também foi executado: 401 sem chave e 200 em HTML,
JavaScript e API autenticados. `npm run typecheck` passou. A suíte inteira do
Noto não foi executada.

Comandos:

```sh
npm run typecheck
CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium \
XVFB_EXECUTABLE_PATH=/tmp/tribemd-xvfb/usr/bin/Xvfb \
node --import tsx --test src/desenvolvedor/tribemd-teste.test.ts
```

Os caminhos acima são os usados na máquina Debian de desenvolvimento. O Xvfb
foi extraído de pacote Debian verificado pelo apt, sem alterar a imagem do Noto.
Na imagem Alpine, usar os executáveis indicados na tabela de configuração.

As instruções `install_script` e `start_skill` foram salvas como rascunho do
ambiente cloud. Revisar/salvar nas configurações e publicar o ambiente é uma
ação separada; não publica a área no Easypanel nem comprova uma restauração nova.
