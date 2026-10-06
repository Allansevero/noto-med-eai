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

A busca percorre os lotes por NSU sem pular o meio do histórico. Quando existe
um total explícito, usa esse limite; no contrato sem total, continua até o retorno
sem documentos. Nunca interpreta o maior NSU do primeiro lote como o fim do
histórico. Filtra notas emitidas pelo titular e escolhe pela data de emissão
`DPS/infDPS/dhEmi`, com data do envelope como fallback apenas quando a data do XML
não pode ser lida. A ordem de redistribuição não substitui a data de emissão. Falhas, paginação sem avanço ou limites
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

O leitor reconhece referências NFS-e nacionais 1.00 e 1.01 com DPS original.
Isso não converte a versão do XML nem adiciona suporte aos campos fiscais que
ainda não são representados pelo emissor. A nova DPS continua na versão 1.01. A preparação
continua conservadora: MEI, ME/EPP e não optante pelo Simples, em operação
tributável sem retenção de ISS e com os grupos tributários descritos abaixo.
Retenções, deduções, cálculos sem uma regra comprovada e extensões sem suporte
ficam pendentes. Não há afirmação de suporte integral a todas as operações IBS/CBS.

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

## Diagnóstico da importação

A rejeição antiga usava uma mensagem única e exigia versão exatamente 1.01.
Desde a correção, erros de versão, namespace/layout e ausência da DPS têm códigos
separados. Os logs de importação registram etapa, código, versão da NFS-e, versão
da DPS, presença da DPS e se o namespace nacional foi reconhecido. Não registram
XML, CPF/CNPJ, dados do paciente, certificado ou senha.

A compatibilidade 1.00 foi reproduzida com fixtures sintéticas. Exemplos de
referência comunitária também usam essa versão:
https://github.com/nfse-nacional/nfse-php/blob/main/tests/Unit/Service/ContribuinteServiceTest.php
A verificação realizada é de leitura e preservação dos campos suportados, não
homologação completa de XSD nem confirmação da causa de um certificado real.

## Preservação no Storage

O upload utiliza o bucket privado `xmls_referencia`. Se o Storage responder
explicitamente que o bucket não existe, o servidor tenta criá-lo privado,
permitindo `application/xml` e `text/xml`, com limite de 10 MiB, e repete o upload
uma única vez. Conflito de criação concorrente permite essa mesma tentativa; não
há loop nem mudança das políticas de um bucket existente.

Erros de acesso, MIME, limite de tamanho e bucket ausente têm códigos próprios.
O diagnóstico registra bucket, etapa (`upload` ou `criacao_bucket`) e status HTTP.
Não registra a mensagem bruta do Storage nem conteúdo do XML ou credenciais.
Nenhum perfil fiscal é atualizado se a preservação falhar. A chave de serviço do
servidor precisa estar configurada e autorizada para esse Storage; a correção
não contorna permissões nem torna o XML público.

## Verificação da nota mais recente

Os logs de busca concluída incluem quantidade de lotes e documentos consultados,
quantidade de notas do titular e data de emissão selecionada. Não incluem os
XMLs, identificadores do contribuinte ou do paciente. Essa data é a mais recente
dentre as notas devolvidas pela fonte consultada; não prova que a nota mais
recente de um portal municipal está disponível no ADN.

A paginação foi conferida com o contrato de distribuição publicado no espelho:
https://github.com/nfse-nacional/nfse-php/blob/main/references/api-specs/production/prod-API-NFS-e-ADN-Contribuinte-(v1).json
Esse contrato não declara `MaxNSU`. O cliente mantém compatibilidade com totais
explícitos de outras respostas e trata fim de distribuição com status próprio,
inclusive quando acompanhado de HTTP 404. Outros erros HTTP continuam bloqueando
a adoção de uma referência parcial.

## Consentimento e confirmação

Encontrar e reconhecer a nota não é equivalente a liberar a emissão. Marcar o
consentimento habilita a tentativa de confirmação sempre que existe uma
referência identificada. O servidor valida os parâmetros e só libera o avanço
quando essa confirmação termina com sucesso. Pendências deixaram de produzir
um botão inerte: retornam uma explicação em linguagem simples (por exemplo,
alíquota de ISS ainda sem suporte ou preparação fiscal inativa no servidor).

A confirmação fica bloqueada enquanto a solicitação está em andamento, inclusive
se o usuário alterar a caixa de consentimento. Nenhum campo tributário é enviado
pelo navegador nem modificado para contornar um bloqueio. Os logs conservam o
código e as pendências técnicas da referência para investigação. Essa mudança
não amplia o suporte do emissor para outras operações tributárias.

## Referência fora do Simples Nacional

O regime `opSimpNac=1` é extraído, confirmado e transmitido sem conversão para
ME/EPP. Não envia `regApTribSN` ou `pTotTribSN`. A alíquota de ISS (`pAliq`),
quando declarada na DPS de origem, é preservada na mesma posição do layout;
quando ausente, não recebe um padrão. O ISS calculado pelo autorizador não é copiado.

A totalização mantém `indTotTrib=0` ou os percentuais federal, estadual e
municipal de `pTotTrib`, incluindo zeros. Montantes de `vTotTrib` não são
transformados em percentuais por inferência: essa referência fica pendente.

PIS/COFINS permite ausência do grupo ou CST 00, 04, 06, 07, 08 e 09 sem campos
de cálculo adicionais. Para CST 01/02, exige base igual ao valor integral do
serviço da referência, alíquotas explícitas e valores que comprovem o cálculo
com arredondamento ao centavo. Na nova consulta calcula uma nova base e novos
valores usando essas alíquotas; os montantes antigos não são persistidos na
política. Preserva a ausência do tipo de retenção ou os indicadores 0/2
quando declarados. Outros indicadores de retenção, IRRF/CP/CSLL, base reduzida,
descontos e campos desconhecidos continuam bloqueados.

Os novos parâmetros ficam no JSON da política existente e participam da
comparação com a referência e da auditoria. Não há migração nova. Após implantar,
use **Buscar nota pelo certificado** para reanalisar referências importadas
antes deste suporte e depois confirme **Usar nota como padrão**. Não é necessário
upload de XML nem recadastro do A1. A busca usa a última nota disponível como antes.

Testes usam referências sintéticas e transmissão simulada. Suporte estrutural
não comprova autorização de uma nota real ou cobertura de todos os municípios
e tratamentos tributários.

Na verificação desta entrega, seis grupos tributários gerados passaram na
validação dos tipos do XSD nacional 1.01 de referência. A validação da DPS
inteira com libxml2 encontrou incompatibilidade no padrão ancorado da série
(`^0{0,4}\d{1,5}$`) do XSD usado; não foi alterado o XML nem o schema para
contornar isso. Não afirmamos validação integral da DPS por esse teste.
