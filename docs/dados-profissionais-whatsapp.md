# Dados profissionais antes da emissão

O Noto exige o nome completo real do médico e o CRM antes de emitir. RQE é opcional.
`Médico 9886`, nomes de uma palavra, números no nome e CRM sem número são
incompletos. CRM com UF exige uma UF brasileira; `12345 - rs` vira `12345/RS`.
Esta validação de formato não consulta nem comprova inscrição no conselho.

Quando uma emissão fica retida, o serviço reserva um pedido no banco antes de
usar a instância oficial do Noto para escrever ao telefone do usuário vinculado
ao médico. Nunca usa o telefone do paciente. A mensagem orienta a responder:

```text
Nome completo: Ana Maria Silva
CRM: 12345/RS
RQE: 9876
```

Também aceita nome completo em uma mensagem e CRM na seguinte. A resposta só é
interpretada após o webhook autenticar o remetente como médico na instância
oficial e encontrar uma coleta pendente. Não há LLM, execução de comandos nem
SQL fornecido pela conversa. Dados válidos existentes de nome e CRM são
preservados. RQE só muda se informado explicitamente.

A pendência é única por médico. Se a Conta remover um dado obrigatório depois
da conclusão, a próxima solicitação inicia um novo período de coleta, com
apenas um pedido nesse período e o histórico de mensagens preservado. Os estados `reservado`, `enviado` e `incerto`
aceitam respostas; `concluido` não coleta novas mensagens. Uma queda ou timeout
no envio preserva a reserva, impedindo pedidos repetidos. Um resultado incerto
não é reenviado automaticamente; o médico pode concluir pela Conta. IDs de
mensagem são deduplicados por médico. Nenhum texto bruto da conversa é gravado
no histórico de deduplicação.

Após o commit, cada resposta nova recebe uma orientação com os campos que
ainda faltam, ou a confirmação de que os dados profissionais foram salvos. A
confirmação informa que a emissão ainda depende do paciente, da data e da
validação fiscal. IDs repetidos e conversas sem coleta pendente não geram
respostas. O envio não mantém a transação ou seus locks abertos.

O salvamento trava a linha do médico e atualiza seu usuário na mesma transação.
Quando completo, `retomar` reconstrói a descrição a partir do perfil salvo,
preferindo `datas_consulta_texto`, depois o sufixo legado `NAS DATAS`, depois os
agendamentos vinculados. Libera somente solicitações retidas, pendentes, sem
qualquer tentativa, nota ou investigação. Preserva status, dados fiscais e
locks de worker. A fila continua nula enquanto falta a data; com a data fica
`pronta` quando o paciente tem CPF/CNPJ, ou `pendente_cadastro` caso contrário.
A Conta também chama `retomar` após salvar o perfil. Respostas sobre a data usam o perfil atual sob lock e não restauram um nome provisório. A chegada do CPF não libera solicitações com tentativa, nota, investigação ou worker ativo. Antes do envio fiscal, a descrição padrão do Noto é reconstruída com o perfil atual e as datas preservadas.

Antes de ativar o código, aplicar a migração de investigações e depois:

```sh
node scripts/migrar-dados-profissionais.mjs
```

Ela acrescenta as duas colunas e as tabelas com RLS e sem permissões anônimas.
O backfill bloqueia somente pendentes sem tentativa, worker, nota ou
investigação cujo perfil falha na validação conservadora de SQL. Casos já
transmitidos, com erro ou com resultado incerto não são liberados nem
retransmitidos. A verificação atual do perfil no emissor cobre solicitações
legadas independentemente desse backfill.

Testes locais usam o serviço real com fronteiras externas de PostgreSQL e
WhatsApp simuladas. Solicitações antigas com tentativas anteriores permanecem retidas e exigem
revisão; não são reenviadas automaticamente. A migração precisa de revisão/aplicação no banco do ambiente;
os testes locais não enviam mensagens e não usam o banco de produção.
