# Nota padrão obtida automaticamente

O cadastro do A1 consulta a distribuição de DF-e do ADN usando o certificado do
emitente. O município não é uma configuração global: vem do XML de cada usuário,
assim como os códigos de serviço e os parâmetros tributários declarados.

A tela solicita apenas confirmar que a nota encontrada representa o serviço e o
tipo de operação que o usuário pretende emitir. Não solicita XML nem edição de
campos tributários. O botão de nova busca utiliza o A1 já armazenado no Storage e
Vault, sem pedir seu reenvio. A API antiga de upload continua disponível por
compatibilidade; não é uma etapa do cadastro.

## Busca e adoção

A busca percorre os lotes por NSU até o máximo informado na primeira consulta,
sem pular o meio do histórico. Filtra notas emitidas pelo titular e escolhe a mais
recente entre os documentos recebidos. Falhas, paginação sem avanço ou limites
operacionais (100 consultas ou 45 segundos entre consultas, além do tempo da
requisição em andamento) impedem a adoção de uma referência parcial. Não há loop
infinito nem nova busca automática em sequência. Uma nova consulta é iniciada
pelo usuário; históricos muito extensos precisarão de processamento em segundo
plano em uma etapa posterior.

Na confirmação, o servidor lê os parâmetros da referência persistida, sob os
mesmos bloqueios transacionais do perfil e serviço. O navegador envia somente
`medicoId`, `referenciaHash` e `usarReferencia: true`. A vigência de adoção inicia
no dia da confirmação em São Paulo; isso não representa a data legal de vigência
de uma norma nem autoriza aplicar os parâmetros a competências anteriores.

A política guarda `fidelidadeReferencia: true`, o hash e os códigos do serviço.
Antes da emissão, a preparação confere se regime, município da prestação, ISS,
PIS/COFINS, totalização, IBS/CBS e códigos do serviço correspondem à referência.
Alterações ou campos declarados ainda sem suporte geram bloqueio. Paciente,
valor, competência, numeração e demais dados próprios da nova operação não são
copiados da nota anterior. Os tributos calculados pelo autorizador também não são
copiados. O LLM não escolhe nem preenche parâmetros fiscais.

## Disponibilidade e limites

O caminho comum implementado é o ADN nacional. Isso não prova que toda prefeitura
disponibiliza suas notas nesse serviço, nem adiciona conectores para portais
municipais legados. Quando a referência não pode ser obtida, a interface informa
a pendência sem pedir upload; os detalhes técnicos ficam nos logs. O município
continua individual por emitente, podendo orientar um conector futuro.

O leitor ainda suporta apenas NFS-e nacional 1.01 com DPS original. A preparação
continua conservadora: MEI ou ME/EPP, operação tributável sem retenção de ISS e
somente os grupos tributários já suportados. Não optante pelo Simples, alíquota
ISS declarada, retenções, cálculos adicionais e extensões sem suporte ficam
pendentes. Não há afirmação de suporte integral a todas as operações IBS/CBS.

A nota mais recente não é identificada automaticamente como uma emissão manual
pelo portal; por isso o usuário precisa reconhecer e confirmar a referência.
Para operações diferentes, uma única nota anterior não determina a tributação.

## Ativação e verificação

Implantar `main` no serviço `web`. Requer a migração existente
`npm run migrate:preparacao`, `PREPARACAO_FISCAL_ATIVA=true` e
`AGENTE_FISCAL_ATIVO=true`. Não há tabela ou migração nova nesta entrega.
Referências importadas antes desta entrega precisam de nova busca para incluir
a vinculação dos códigos de serviço à nota de origem.

Testes usam HTTP, Storage e banco simulados, com os componentes reais de leitura,
extração, confirmação, preparação e geração de DPS. Conferem paginação, dados de
municípios diferentes, fidelidade dos grupos tributários e bloqueio de alterações.
Não substituem um teste com A1 real, acesso ao ADN e autorização pela SEFIN.
