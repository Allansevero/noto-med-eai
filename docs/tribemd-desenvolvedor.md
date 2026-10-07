# Teste de navegador e coleta no TribemD

## Ativação no Noto

Implantar a versão atual do `main` no serviço `notomed/web` pelo Easypanel. A imagem instala Chromium; `playwright-core` é uma dependência de produção. Não requer migração de banco nem um computador externo.

O teste usa a área existente: `DESENVOLVEDOR_FISCAL_ATIVO=true`, `DESENVOLVEDOR_FISCAL_TOKEN` de 32–256 caracteres, `GROQ_API_KEY` e `GROQ_MODEL` (padrão já existente `openai/gpt-oss-120b`). O caminho padrão do Chromium na imagem Alpine é `/usr/bin/chromium-browser`; `CHROMIUM_EXECUTABLE_PATH` permite selecionar outro executável instalado no servidor. Uma sessão de navegador por processo; usar uma réplica do web ou afinidade de sessão. A imagem e a memória do web precisam acomodar Chromium, iniciado somente durante o teste.

Abrir `/desenvolvedor` → **Abrir teste de coleta do TribemD**, ou `/desenvolvedor/tribemd`. Informar a chave de desenvolvedor e depois e-mail, senha e intervalo de agenda. A conexão retorna HTTP 202 e a tela acompanha o trabalho em segundo plano. A primeira coleta mostra até vinte registros de pacientes e cem agendamentos, em no máximo trinta ações. O intervalo padrão é hoje até sete dias depois, em datas de Brasília; a tela permite escolher até 31 dias.

Resultados ficam na memória do processo por até vinte minutos, disponíveis na sessão autenticada para revisão e download. **Encerrar e remover os dados** solicita cancelamento, fecha o navegador e apaga resultados. A limpeza pode ainda estar em andamento quando a tela libera o botão; uma nova sessão só é aceita quando a reserva anterior foi liberada. Reiniciar o serviço perde a sessão. Não há gravação de cookies, credenciais ou resultados em banco ou perfil persistente de navegador.

## Funcionamento e limites do primeiro teste

O servidor abre o endereço fixo `https://app.tribemd.com/login?continue=/inicio`. O login preenche campos semânticos de e-mail/senha e um botão de autenticação reconhecido. Um redirecionamento sozinho não comprova login: é preciso reconhecer os menus de pacientes ou agenda e verificar que o formulário de senha desapareceu. CAPTCHA, MFA, login não confirmado ou layout desconhecido resultam em `necessita_intervencao`; nenhuma senha é reenviada automaticamente.

O navegador oferece apenas menus de leitura encontrados na página, links de cadastro encontrados em tabelas e paginação reconhecida. A IA escolhe entre IDs dessas ferramentas. Não recebe senha, CPF, nome, e-mail ou prontuário: seu contexto contém tipos/IDs de ferramentas, passo e contagens. Valores são extraídos por código de campos rotulados e colunas conhecidas. Não há clique genérico, URL fornecida pelo usuário/modelo, shell ou JavaScript fornecido pelo modelo. Menus em botões de navegação são permitidos; botões de formulários não são oferecidos. URLs de edição, criação, prontuário, anamnese, pagamentos e exclusão são descartadas. O piloto não altera cadastros, envia mensagens, cadastra pacientes no Noto ou emite notas.

O resultado identifica o campo e a página que sustentam cada valor, normaliza telefones brasileiros e valida dígitos de CPF. Cadastros observados com o mesmo ID explícito podem ser completados pela ficha correspondente. Nome ou telefone iguais não comprovam identidade e não são usados para mesclar pessoas. Agendamentos fora do intervalo são descartados quando a data é reconhecida; datas não reconhecidas permanecem pendentes, sem supor atendimento, pagamento ou fuso. O vínculo com WhatsApp ainda não é executado.

A cobertura sempre declara o escopo parcial do piloto. A coleta não promete todos os pacientes nem todos os agendamentos do intervalo. Até cem linhas por tabela são observadas; calendários sem tabelas e fichas sem campos rotulados podem exigir adaptação. Paginação por links reconhecidos funciona; controles JS não reconhecidos não são acionados por tentativa. Zero resultados não é apresentado como sucesso de extração.

## Diagnóstico

O JSON autenticado contém `estado`, `eventos`, `resultado`, `diagnostico` e `detalhe`. Eventos informam início do navegador, autenticação, confirmação de login, leitura de tela, decisão, ferramenta concluída e motivo de intervenção. O diagnóstico de leitura informa caminho, contagens, tipos de campos e limites, sem expor conteúdo clínico. Os logs operacionais usam `[TribemD desenvolvedor]`, com ID de sessão, etapa, código de erro, ferramenta e contagens; não incluem credenciais nem dados dos pacientes.

Se falhar no teste real, compartilhar somente o código e a última etapa/diagnóstico de estrutura, sem senha ou resultados pessoais. `NAVEGADOR_INDISPONIVEL` aponta imagem/caminho; `LOGIN_LAYOUT_NAO_RECONHECIDO`, `POS_LOGIN_LAYOUT_NAO_RECONHECIDO` e `DADOS_NAO_RECONHECIDOS` apontam necessidade de adaptar as telas observadas; `LOGIN_NAO_CONFIRMADO` exige conferir autenticação; `VALIDACAO_ADICIONAL` indica desafio; códigos `IA_*` indicam configuração ou disponibilidade do provedor.

## Verificação real pendente

O usuário autorizou preparar e publicar o teste para executar no servidor do Noto, pois o domínio do TribemD está bloqueado pela política de rede do Codex. Testes locais usam Chromium real com páginas controladas e exercitam login, navegação, extração e coordenação; não comprovam o layout ou a autenticação da conta real do TribemD. O primeiro uso no Noto precisa confirmar os seletores e a leitura com a conta do usuário. Nenhum dado é simulado na execução do produto.
