# Pesquisa de CRM e RQE no CFM

A RPA usa Chromium e Playwright já disponíveis na imagem do Noto. Abre https://portal.cfm.org.br/busca-medicos/, preenche o nome completo e aciona o formulário normal. Quando a página entrega resultados, lê os cartões renderizados, filtrando pelo nome completo exato e extraindo CRM/UF e RQE.

A pesquisa começa após o Hub encontrar um único candidato a responsável, antes de sua confirmação. Com vários sócios, aguarda a identificação do responsável. O onboarding até o painel continua exigindo a conexão inicial do WhatsApp. A aprovação em “Dados da Conta” também exige conexão ativa, validada no backend. Os parâmetros fiscais continuam vindo da referência ADN.

Os resultados ficam como sugestões com link do CFM. Não são gravados automaticamente como identidade confirmada. Homônimos e múltiplos CRMs precisam ser revisados. Um único RQE pode preencher a sugestão; múltiplos RQEs ficam visíveis para escolha manual, sem selecionar uma especialidade arbitrariamente.

## Configuração

- `CFM_PESQUISA_ATIVA=true` é o padrão. `false` suspende a RPA e permite preenchimento manual.
- `CHROMIUM_EXECUTABLE_PATH` usa o caminho já configurado no Noto, com padrão `/usr/bin/chromium-browser` para sua imagem Alpine. O executável precisa existir.
- Permitir acesso HTTPS ao portal CFM e aos recursos que sua página carrega, inclusive Google reCAPTCHA, preservando a validação TLS.
- Não exige SearXNG ou um novo serviço externo. Não há migração adicional além das tabelas cadastrais existentes.

## Limites e diagnóstico

A página do CFM exige reCAPTCHA. A RPA opera o formulário, mas não resolve desafios nem contorna bloqueios. Por isso, não se pode garantir pesquisa automática em todas as tentativas. Se o portal não entregar resultados, o painel permite conferir no CFM e informar CRM/RQE manualmente.

Códigos: `CFM_NAVEGACAO_INDISPONIVEL` (navegador, rede ou layout inicial), `CFM_CAPTCHA_OU_TIMEOUT` (nenhum resultado entregue, com reCAPTCHA na página), `CFM_RESULTADO_INDISPONIVEL` (resultado não entregue), `CFM_NAO_ENCONTRADO` (nenhum cartão compatível com o nome completo). Nenhum código comprova que a pessoa não possui registro.

Consultas concluídas ficam armazenadas na fila cadastral. Ao habilitar a fonte, trabalhos antigos sem fonte configurada podem ser pesquisados novamente, reutilizando os dados da empresa já obtidos no Hub. Logs não incluem nome, documento, conteúdo de conversa ou credenciais.

Testes locais exercitam o formulário real do robô com transporte sintético, cartões CRM/RQE, nomes diferentes e falhas de navegador. Esses testes não comprovam que o CFM aceitará a automação em produção.

Na validação deste ambiente, a página foi obtida por HTTPS com curl, mas o Chromium não confiou no certificado do proxy. A alteração persistente do trust store foi rejeitada pela revisão automática de permissões. A execução online completa permanece sem validação; a suíte local usa transporte sintético e mantém TLS ativo.
