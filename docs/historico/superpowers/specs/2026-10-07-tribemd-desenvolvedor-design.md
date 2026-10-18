# Primeiro teste de coleta no TribemD

## Objetivo aprovado na conversa

Na área de desenvolvedor do Noto, o usuário informa seu e-mail e senha do TribemD. Um navegador controlado acessa `https://app.tribemd.com/login?continue=/inicio`, consulta dados cadastrais dos pacientes e agendamentos e apresenta um JSON para revisão. A finalidade posterior é relacionar a consulta e o paciente ao contato do WhatsApp.

Este teste não altera o TribemD, não importa pacientes para o banco do Noto, não envia mensagens e não emite notas. Não presume que um agendamento comprova atendimento ou pagamento. O vínculo definitivo com WhatsApp pertence a uma etapa posterior; o JSON já contém o telefone normalizado quando encontrado.

## Arquitetura proposta

Reutilizar a flag `DESENVOLVEDOR_FISCAL_ATIVO`, a chave de desenvolvedor, o padrão de API autenticada por Bearer e as sessões temporárias existentes. Acrescentar `/desenvolvedor/tribemd` e `/api/desenvolvedor/tribemd`. A tela fiscal de desenvolvedor recebe um link para o teste.

O serviço web executa um Chromium com Playwright, iniciado somente ao começar uma sessão desse teste. Cada sessão usa um contexto separado, sem perfil persistente. A imagem Alpine atual ainda não contém navegador; a implementação inclui a dependência de automação, o Chromium e suas bibliotecas na imagem. Não trocar o sistema de emissão nem criar uma plataforma geral de computadores virtuais.

O login é uma ferramenta determinística: recebe e-mail e senha, preenche os campos observados no portal e submete o formulário. As credenciais não são enviadas ao modelo, incluídas no JSON, salvas no banco, no armazenamento do navegador do Noto, em arquivos de configuração ou em logs. Desabilitar gravação de vídeo, tracing e screenshots durante a autenticação. Depois do login, remover referências às credenciais da sessão; o contexto mantém somente a autenticação necessária até ser encerrado.

A IA pode escolher o próximo passo entre ferramentas de leitura previamente implementadas para o TribemD: consultar as opções de navegação, abrir a lista de pacientes, ler um cadastro, consultar agendamentos e avançar uma página conhecida. Reutilizar o provedor Groq configurado no Noto, com respostas validadas. Não oferecer shell, URL livre, execução de JavaScript pelo modelo, clique genérico, edição de cadastro, anamnese, pagamentos ou prontuário. A aplicação verifica a ação, a página e os limites antes de executá-la.

Atualização autorizada pelo usuário: o teste será implementado e publicado para inspecionar o portal pelo servidor do Noto, sem depender da rede do Codex. O adaptador reconhece apenas estruturas semânticas de login, menus de leitura, tabelas e campos rotulados; quando faltar evidência ou o layout não for compatível, registra intervenção, em vez de assumir uma estrutura. O modelo recebe somente a descrição mínima das opções de leitura necessárias para escolher ferramentas; a extração dos valores disponíveis nos campos observados é feita pelo adaptador. Não enviar páginas inteiras, cookies, senhas ou prontuários ao modelo. Conteúdo das páginas é evidência não confiável, nunca instrução para mudar permissões.

## Fluxo da tela

1. Autenticar o acesso de desenvolvedor com a chave já existente.
2. Informar e-mail e senha do TribemD e clicar em conectar.
3. A API retorna uma sessão imediatamente; a tela acompanha o login e a coleta em segundo plano, seguindo a solução de HTTP 202 do coletor de WhatsApp.
4. Confirmar autenticação antes de iniciar qualquer coleta. Erro de senha ou ausência de campos esperados não deve parecer login bem-sucedido. Se aparecer CAPTCHA, MFA ou um desafio não tratado pelo primeiro teste, interromper e informar a etapa, sem tentar contornar a proteção.
5. Consultar primeiro um lote limitado de cadastros e agendamentos, apresentando progresso e a cobertura efetiva. Usar como proposta inicial os próximos sete dias da agenda e até vinte cadastros relacionados, com filtro de datas visível e informado no resultado.
6. Mostrar e permitir baixar o JSON. Campos ausentes ficam nulos; dados ambíguos mantêm pendência. Não completar CPF, telefone ou data por inferência.
7. Encerrar sessão fecha o contexto e remove os resultados do servidor e da tela. Expiração faz a mesma limpeza.

O intervalo de sete dias e o limite de vinte cadastros são escolhas propostas para este piloto, não requisitos pedidos pelo usuário. Não apresentar cobertura parcial como coleta de todos os pacientes.

## Saída e vínculo futuro

Metadados: origem `tribemd`, estado, intervalo consultado, início e término, páginas e cadastros consultados, limites, motivo de interrupção e cobertura completa ou parcial.

Paciente: identificador estável observado no portal, nome, CPF, e-mail, telefone original, telefone normalizado quando possível, origem de cada campo e pendências de validação. Validar CPF com a regra já existente e normalizar telefones brasileiros sem inventar números.

Agendamento: identificador observado, identificador do paciente quando explícito, data e horário com fuso informado pelo portal, situação, profissional e valor somente se disponíveis na tela autorizada. Não adivinhar fuso, atendimento realizado, pagamento ou vínculo com paciente quando faltar evidência.

Log de ações: horário, ferramenta, identificador da etapa, resultado, contagem, duração e código de falha. Logs operacionais não incluem credenciais ou dados pessoais. Evidências de campos ficam apenas no JSON autenticado da sessão. Uma associação por telefone é candidata; números compartilhados ou divergência de CPF impedem associação automática.

## Limites e limpeza

Começar com uma sessão de navegador por processo web, duração máxima de vinte minutos e operações com timeout. Reservar a sessão antes de iniciar o navegador e bloquear operações concorrentes. Encerramento e expiração cancelam a coleta, fecham o contexto e o navegador e liberam a reserva mesmo após falha. Reinício do processo elimina a sessão. Este piloto requer uma réplica web ou afinidade de sessão, como o coletor atual.

As ferramentas permitem apenas menus semânticos de leitura e URLs observadas nas páginas da sessão do TribemD, além do formulário de login; o modelo nunca fornece uma URL ou seletor livre. Domínios necessários para autenticação e recursos são documentados depois da inspeção; não aceitar destinos fornecidos pelo usuário ou modelo. Não adivinhar ou explorar endpoints privados. Só acessar as páginas disponíveis à conta fornecida.

## Inspeção feita e bloqueio atual

O código existente confirma a área de desenvolvedor autenticada, sessões em memória, APIs de acompanhamento, provedor Groq e servidor `node:22-alpine` sem Chromium.

Em 07/10/2026, a tentativa de carregar a página pública do TribemD neste ambiente recebeu `Tunnel connection failed: 403 Forbidden`. A política de rede atual é restrita, aplicada e permite apenas o conjunto de domínios de gerenciadores de pacotes, sem `app.tribemd.com`. A ferramenta de leitura web também não conseguiu acessar a página. Não foi possível inspecionar campos, menus ou páginas autenticadas. Isso não demonstra bloqueio pelo TribemD.

Para inspecionar aqui seria necessária a liberação de `app.tribemd.com` na configuração de rede do ambiente Codex. O usuário autorizou seguir com o piloto no servidor e validar a integração por lá. Se a página depender de outros domínios, identificar e autorizar esses destinos pelo fluxo de configuração suportado, sem contornar o proxy. Não solicitar credenciais neste chat: o usuário as fornecerá na tela do Noto durante o teste real.

## Critérios de aceitação e verificação

- Acesso incorreto ou área desativada não inicia navegador nem chama o modelo.
- Pedido de conexão retorna antes do trabalho demorado; falhas mostram a etapa correta.
- Credenciais não aparecem em logs, decisões de IA, exportação ou armazenamento persistente.
- Um login confirmado permite a leitura de campos realmente presentes em uma conta de teste.
- CPF e telefone são validados; campos ausentes, ambiguidades e limites permanecem explícitos.
- Um pedido de editar, enviar mensagem, acessar prontuário ou navegar a um destino não autorizado é rejeitado pela ferramenta, independentemente da resposta do modelo.
- Timeout, expiração, cancelamento e erro fecham os recursos e permitem iniciar outra sessão.
- Testes locais exercitam o navegador contra páginas controladas e a interface e API reais do Noto. A conta real do TribemD continua necessária para validar seus seletores, autenticação e extração; testes simulados não comprovam essa integração.

## Próxima etapa

Especificação aprovada. O usuário autorizou a implementação direta no Noto, publicação no GitHub e posterior teste no navegador do servidor. O plano e os testes locais registram a diferença entre validar estruturas controladas e validar a conta real do TribemD. Não publicar um coletor supostamente funcional com seletores inventados ou retornar dados simulados como dados do TribemD.
