# Emissão automática a partir de comprovantes e agenda TribeMD

Data: 2026-10-17. Base inspecionada: `4979e98`.
Estado: especificação para revisão; não habilita emissão nem altera produção.
Substitui, neste novo fluxo, a aprovação obrigatória de toda nota descrita em
`docs/implementation/agente-whatsapp-casos.md`. Preserva as proteções fiscais,
a fila de emissão e a reconciliação com o provedor.

## 1. Objetivo e limites

O médico conecta WhatsApp, certificado e cofre TribeMD. O Noto sincroniza suas
consultas e emite automaticamente quando um pagamento documental corresponde
inequivocamente a uma consulta elegível. Perguntas ocorrem em exceções.
A IA extrai campos e seus trechos de origem; não escolhe paciente, consulta,
regra, valor fiscal, autorização, SQL, ferramentas ou próxima ação.
Decisões são funções determinísticas versionadas, com entradas identificáveis.

TribeMD é somente leitura: autenticação e GETs necessários; nenhuma escrita em
agenda, cadastro, prontuário, cobranças ou notas. O resultado do piloto permanece
isolado até existir o conector de produção descrito aqui.
Não se emite nota, envia WhatsApp nem executa migração ao preparar esta especificação.

## 2. Isolamento e reconexão

- O dono do cofre vem da conta autenticada do Noto, nunca de identificador livre
  enviado pelo navegador. Toda consulta, trabalho, regra e arquivo tem esse dono.
- Cada vínculo Noto/conta/instituição TribeMD tem credenciais e cookies próprios,
  criptografados com contexto do proprietário e versão de chave.
- Uma sessão ativa por vínculo; fila persistente com lease renovável e limite
  global de navegadores. Não manter um processo Chromium ocioso para cada médico.
- Uma expiração/HTTP401 inicia automaticamente uma autenticação com a credencial
  salva e uma repetição da leitura original, após confirmar o login.
- Persistir o novo estado criptografado somente após confirmação. Uma falha não
  sobrescreve credenciais válidas. Backoff e limite impedem loop de login.
- Senha recusada, conta bloqueada, CAPTCHA/MFA ou cofre indisponível suspendem a
  integração e geram exceção. Não pedir novamente senha por mera expiração e não
  contornar desafios. Solicitar intervenção apenas quando não houver recuperação
  automática possível. Nenhuma credencial entra no contexto da IA.
- Confirmar instituição e profissional do TribeMD associados ao emissor Noto.
  Credencial de recepção que enxerga vários profissionais não autoriza usar a
  agenda de todos como se fosse de um único médico. Ambiguidade exige confirmação.

## 3. Agenda e consultas em aberto

Sincronização diária com dia civil em `America/Sao_Paulo`, sem depender do fuso
do processo. O calendário atual do piloto é semanal: o conector deve solicitar
ou filtrar explicitamente o dia e registrar intervalo e completude.

Considerar Atendido (8) e Finalizado (10), conforme escolha expressa do usuário.
Upsert por `(proprietario, instituicao, atendimentoId)`, preservando pacienteId,
data/hora/fuso de origem, status e versão do cadastro/preço. Guardar apenas dados
necessários, criptografados quando pessoais. Não mesclar por nome.
Consultas em aberto persistem entre dias; não desaparecem ao mudar a data.
Uma consulta tem no máximo um vínculo fiscal ativo. Reservada/emissão incerta
não é disponível para outro pagamento.

Ausência na página, falha de sincronização ou recorte truncado não significa
consulta cancelada nem ausência de consultas. Sincronização incompleta impede
casamento automático até completar a visão necessária.
Antes da primeira emissão automática, importar e reconciliar as consultas em
aberto anteriores ao dia atual. O conector precisa demonstrar completude desse
histórico por paginação/intervalos e conciliar notas já conhecidas. Só ler o dia
ou uma janela arbitrária não permite afirmar qual é a consulta aberta mais antiga.
Se o portal não permitir demonstrar completude, o bootstrap fica pendente e pede
uma confirmação excepcional do saldo/marco inicial ao médico, sem habilitar FIFO
silenciosamente. Depois dessa conciliação, os incrementos diários preservam o saldo.
A capacidade de importar esse histórico completo ainda precisa ser implementada
e verificada; o calendário semanal do piloto não satisfaz esse requisito.

## 4. WhatsApp e processamento diário

Dois gatilhos alimentam o mesmo processamento idempotente: agenda sincronizada e
mensagem de mídia recebida. A varredura diária reconcilia o dia e o último cursor
confirmado. Mensagens atrasadas são recuperadas pelo cursor, sem perder eventos
no fechamento nem reabrir automaticamente decisões concluídas.

1. Localizar consultas realizadas ainda sem nota/vínculo ativo.
2. Normalizar o telefone da conversa recebida e localizar o paciente dentro do
   mesmo proprietário. Telefone compartilhado ou ausente é exceção.
3. Procurar imagens/PDFs recebidos naquele dia civil. Data de recebimento e data
   do pagamento são campos diferentes. Data ausente, futura, agendada ou diferente
   do dia em conciliação exige revisão; não inferir pagamento pelo dia do envio.
4. Sem comprovante, manter pendente sem perguntar nem emitir.
5. Com comprovante, extrair e validar os fatos documentais.
6. Selecionar a consulta aberta mais antiga do paciente, anterior ou compatível
   com o pagamento. Empate/ausência de horário necessário exige revisão.
7. Reservar pagamento e consulta atomicamente, aplicar regras e encaminhar à fila
   fiscal existente. Revalidar dados e vínculos imediatamente antes de enfileirar.

NFS-e já conhecida no Noto ou identificada com vínculo forte na conversa bloqueia
nova emissão. Documento fiscal suspeito ou associação ambígua exige revisão.
Sem conciliação externa não se afirma ausência de nota emitida fora do Noto e
não registrada em nenhuma fonte acessível.

## 5. Extração e validação do comprovante

Contrato de extração: tipo do documento, status literal da operação, valor,
data/hora/fuso se presentes, pagador, destinatário, documentos/chave de destino
quando legíveis, identificador da transação e evidência de cada campo.
O hash dos bytes e o ID WhatsApp vêm do sistema, nunca do modelo.
Não usar score de IA como autorização nem aceitar instruções dentro da imagem.

Regras exigem campos legíveis, valor positivo em centavos inteiros, data válida,
status realizado e destinatário correspondente ao emissor autorizado. Recibo de
agendamento, operação cancelada, comprovante de despesa ou documento fiscal não
são pagamento elegível. Ausência de extração não é resposta negativa definitiva.

Destinatário é comparado com CPF/CNPJ/chave previamente confirmados do médico
ou sua empresa. Nome sozinho, máscara insuficiente, homônimo ou divergência
exigem confirmação. Aprovar uma exceção não autoriza qualquer destinatário.
A leitura documental não equivale a confirmação de liquidação por uma API bancária.

## 6. Regras financeiras e exceções

Prioridade: identidade/destinatário → duplicidade → paciente/consulta → dados
fiscais → valor/pacote → enfileiramento. Uma regra aprendida não pode dispensar
os bloqueios de prioridade superior.

| Condição | Resultado |
| --- | --- |
| Sem comprovante | Manter consulta em aberto. |
| Comprovante ilegível/incompleto, status ou destinatário incertos | Perguntar sobre os fatos faltantes; não emitir. |
| Paciente não único para telefone/pagador | Perguntar pelo vínculo; nunca deduzir pelo nome. |
| Valor igual ao preço de referência, demais verificações válidas | Emitir automaticamente, sem pergunta de aprovação padrão. |
| Valor maior ou igual a duas vezes o preço de referência, sem regra de pacote aplicável | Perguntar se é pacote e registrar seus termos. |
| Outro valor, desconto, complemento ou divergência | Perguntar; registrar decisão com escopo explícito. |
| Dados fiscais faltantes/CPF inválido | Solicitar somente os dados necessários. |
| Duplicidade ou emissão de resultado desconhecido | Bloquear nova emissão e reconciliar. |

### Preço de referência: decisão de negócio solicitada

A instrução menciona preço da última consulta e casamento com a mais antiga em
aberto. Enquanto não houver resposta sobre preços diferentes, o caminho sem
pergunta só é elegível quando ambos os preços conhecidos coincidem. Se divergirem,
perguntar ao médico; não aplicar silenciosamente uma interpretação.
Ausência de preço ou valor zero sem justificativa não valida pagamento positivo.
Comparar centavos exatos, sem tolerância de ponto flutuante.

### Pacotes

Uma confirmação genérica de pacote registra apenas esse fato. Não define sozinha
quantidade, total, competência, datas nem quais consultas consome. Sem esses
termos, o caso permanece em revisão para emissão; não dividir valores por suposição.
A pergunta de negócio enviada solicita quantidade, valor total e validade.
Registrar vínculo de um comprovante e uma única NFS-e aos atendimentos abrangidos,
com rateio explícito e saldo, quando houver vários. Não emitir uma nota por parcela
de consulta usando o mesmo comprovante. Consultas futuras ou serviço antecipado
exigem política fiscal específica validada antes de automatizar.

### CPF do tomador e pagador diferente

Intenção do produto: CPF do paciente no tomador e indicação do pagador na descrição.
A aplicabilidade por município/provedor ainda está pendente de confirmação contábil,
conforme o próprio pedido. Não assumir que toda prefeitura aceita esse tratamento.
Reutilizar a preparação e validações fiscais existentes. Sem política validada,
reter o caso para revisão fiscal; não substituir silenciosamente CPF do paciente
pelo CPF do pagador. Uma resposta operacional do médico não valida regra tributária.

## 7. Reutilização de decisões do médico

Respostas viram registros tipados, nunca código/prompt ou regra livre executável.
Tipos iniciais: vínculo de responsável/pagador, destinatário confirmado, preço
excepcional e pacote. Cada registro inclui dono, paciente e documentos/IDs a que
se aplica, condições exatas, validade, origem da resposta e versão/revogação.
Uma decisão deste caso só vira regra recorrente quando sua abrangência estiver
explícita. Não generalizar um desconto de um paciente para toda a clínica.

Um comprovante ilegível continua exigindo obtenção dos dados faltantes. Reutilizar
um vínculo conhecido de responsável não preenche valor/data ausentes em nova mídia.
Quando condições mudarem, voltar a perguntar.

A IA pode extrair literalmente campos da resposta, mas não autorizar a transição.
Confirmação usa opções/códigos objetivos de uma pergunta ativa, vinculada ao caso e
à revisão. Texto ambíguo gera esclarecimento, sem aprovação por inferência de IA.
Uma pergunta ativa por médico, com outbox e confirmação de entrega existentes.
Antes de consumir uma resposta, validar a origem do webhook, a instância vinculada
ao proprietário e o remetente com permissão para decidir, por telefone verificado
no cadastro do médico. Mensagens de pacientes/responsáveis fornecem evidências,
mas não autorizam exceções, emissão ou regras recorrentes. `fromMe`, nome de perfil
e conhecer o código da pergunta não bastam como autenticação. Não aceitar decisões
em grupos. Respostas de remetente não autorizado não alteram o caso nem recebem
seus dados pessoais. Uma decisão consome a pergunta uma única vez, com validade,
revisão e autoria auditadas.

## 8. Duplicidade, concorrência e resultado incerto

- Inbox única para evento WhatsApp; análise documental cacheada por hash/versão.
- Identidade de pagamento prioriza ID bancário/transação qualificado pela origem;
  hash evita reenvio dos mesmos bytes. Sem identidade forte, semelhança gera dúvida,
  não uma garantia de detecção de imagens recortadas ou reexportadas.
- Mesmo comprovante reenviado reaproveita o caso e não gera uma segunda nota.
- Comprovantes diferentes para uma mesma consulta travam o conflito. Agrupar
  pagamentos do mesmo paciente/dia antes de atribuir. Um segundo comprovante tardio,
  após vínculo anterior, não migra silenciosamente para outra consulta aberta;
  perguntar se é duplicata, complemento ou outro atendimento.
- Restrição única de vínculo ativo por consulta e de emissão por comprovante no
  banco, com transação e locks. Reexecutar após crash não contorna essas restrições.
- Reserva de consulta, decisão, auditoria e outbox fiscal são gravadas juntas.
- A referência idempotente persiste da reserva à fila/provedor. Timeout de emissão
  vira resultado incerto: consultar situação antes de qualquer nova chamada.
- Se a primeira nota já estiver emitida quando chegar conflito, manter seu registro,
  bloquear o novo caso e pedir resolução. Não cancelar ou emitir outra automaticamente.

## 9. Auditoria e proteção dos dados

Auditoria durável e restrita: referência/hash do comprovante, ID de mensagem,
consulta(s), vínculo paciente, fatos usados, regra/versão, decisão/resposta,
revisão dos dados fiscais, solicitação fiscal e resultado do provedor.
É dado de negócio protegido, separado dos logs operacionais.

Guardar o comprovante necessário à auditoria em armazenamento privado criptografado,
com acesso pelo proprietário, retenção definida e trilha de acesso. Não guardar
base64, CPF, nome, telefone, imagem, senha ou corpo fiscal em logs de aplicação.
Logs contêm somente códigos, identificadores internos e contagens.
Proibir prompts com cookies, senhas ou tokens, trace/HAR/vídeo e captura persistida.
O mínimo do comprovante vai ao extrator; o modelo não recebe o cofre nem navega.

A introdução de retenção de comprovantes/dados em produção é uma ampliação em relação
à área de teste, cujos resultados continuam apenas na sessão. Exige política de
retenção e controle de acesso do produto antes da ativação em clientes.

## 10. Aderência ao repositório e mudanças necessárias

| Componente atual | Reaproveitamento e mudança |
| --- | --- |
| `src/desenvolvedor/tribemd-*.ts` | Leitura e envelopes demonstrados; extrair conector sem dependência de Basic/ID manual e adicionar recuperação automática da sessão. |
| `src/agente-fiscal/casos/repositorio.ts` | Inbox/outbox, leases e casos por pagamento existem; adicionar consultas persistidas, vínculos únicos e auditoria transacional. |
| `src/agente-fiscal/casos/localizar-candidatos.ts` | Reaproveitar extração/cache documental; substituir associação inferida da conversa pela consulta identificada no TribeMD no novo fluxo. |
| `src/agente-fiscal/casos/orquestrador.ts` | Hoje pergunta aprovação sempre; adicionar avaliação pura que enfileira somente casos completos e pergunta nas exceções. |
| `src/io/nvidia/interpretador-caso.ts` | Hoje classifica intenções; não usar sua classificação como decisão neste novo motor. |
| `src/agente-fiscal/casos/servico-emissao.ts` | Preservar validação de paciente e fila fiscal; inserir associação explícita paciente/consulta/comprovante e política de pagador. |
| `src/agente-fiscal/regras/evidencias-documentais.ts` | Reaproveitar datas, hashes/ID de transação e nota documental; ampliar regras sem enfraquecer conflitos. |
| Worker fiscal existente | Único caminho de emissão e reconciliação; nenhum emissor paralelo. |

Implementar em entregas: (1) cofre/conector por conta e reconexão; (2) sincronização
persistente e vínculo de pacientes/consultas; (3) motor puro e memória de exceções;
(4) reserva transacional, auditoria e ponte fiscal; (5) operação acompanhada antes
da ativação automática. Somente um motor consome cada caso de um médico.

## 11. Critérios de aceitação para futura implementação

- Duas contas não compartilham sessão, paciente, regra, comprovante ou resultado.
- HTTP401 recupera sessão e repete leitura uma vez sem solicitar a senha.
- Sem comprovante, nenhum enfileiramento; IA nunca decide emitir.
- Bootstrap comprova saldo histórico antes de escolher a consulta aberta mais antiga.
- Preço e vínculo inequívocos emitem sem aprovação de rotina.
- Somente remetente autorizado do médico confirma exceção ou cria regra recorrente.
- Pacote novo ou valor diferente pergunta e só reutiliza condições confirmadas.
- Reenvio, concorrência, crash e timeout não duplicam nota nem consumo de consulta.
- Dois comprovantes em conflito geram pergunta, inclusive se um já tiver nota.
- Exceção fiscal não é dispensada por regra operacional aprendida.
- Comprovante tardio e consulta aberta de outro dia não se perdem na virada diária.
- Auditoria identifica fatos/regra/resultado, sem dados pessoais nos logs.

Nenhuma suíte ou emissão real foi executada para elaborar esta especificação.
