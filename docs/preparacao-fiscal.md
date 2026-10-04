# Preparação fiscal antes da transmissão

## Problema e comportamento

O emissor usava padrões de NBS, indicador de operação, classificação, UF,
regime de apuração, percentual aproximado de tributos, CST PIS/COFINS e ISS.
A solicitação também podia receber `080201` sem serviço cadastrado; a competência
era a data da emissão, mesmo quando as consultas eram de outro dia. O DANFSe
mostrava códigos/zeros sem uma fonte confirmada.

Com `PREPARACAO_FISCAL_ATIVA=true`, cada tentativa passa por uma preparação antes
de carregar o certificado, assinar ou transmitir. O fluxo de autorização continua
determinístico. O LLM recebe as pendências específicas quando a preparação falha;
não escolhe enquadramento, alíquota ou classificação por conta própria.

## Fontes e precedência

| Dado | Fonte no modo de preparação |
| --- | --- |
| Emitente | Perfil fiscal confirmado e CPF/CNPJ com dígitos verificadores válidos |
| Serviço | Serviço vinculado à solicitação; para registros antigos, um único padrão ativo compatível |
| Classificação nacional/municipal e NBS | Cadastro do serviço revisado; divergência com snapshot bloqueia |
| Ambiente, regime, tributação e local da prestação | Política explicitamente revisada no onboarding |
| Valor e descrição | Solicitação original; não são recalculados nem substituídos por IA |
| Competência | `solicitacoes_nota.competencia_emissao`, quando informada; senão, a única data das consultas vinculadas |
| Número e série | Sequência existente e série revisada; formato inválido não é truncado pela preparação |
| Dados opcionais ausentes | Não recebem código fictício; ausência obrigatória gera pendência |

A política é armazenada por serviço em `medico_servicos_fiscais.parametros_emissao`.
Contém origem, instante da confirmação, intervalo de validade, parâmetros e
snapshot do perfil e classificação. Mudança do perfil, da classificação ou do
XML de referência exige nova revisão. A confirmação do perfil, política e
registro de auditoria ocorre na mesma transação. Notas autorizadas preservam a
origem e os dados aplicados em `resposta_sefin_raw._notoPreparacao`; falhas passam
para a investigação existente com campos/códigos de pendência.

O XML de referência fornece sugestões, não autorização. Não presumimos que
uma nota antiga prove o enquadramento atual. Datas de vigência e valores ausentes
precisam de revisão. A origem registrada é `revisao_onboarding`, e não validação
oficial da Receita ou SEFIN.

## Revisão no produto

No painel, clicar em **Revisar dados fiscais**. Na tela fiscal, expandir **Revisar regras para emissão automática**. Conferir
ambiente, vigência, local da prestação, regime de apuração/especial, ISSQN,
retenção, CST e percentual aproximado do Simples. A confirmação é explícita;
não há preseleção fiscal para substituir informação ausente. Na importação,
os campos encontrados no XML são sugeridos. Reabrir um cadastro mostra a última
política gravada, sem confirmar uma nova revisão automaticamente.

Percentual zero é um valor válido e é preservado. MEI não herda CST, percentual
ou apuração de ME/EPP. Uma nova referência ou alteração de regime invalida a
política anterior. Os endpoints de revisão continuam usando o mecanismo existente
do onboarding; o agente não recebe ferramenta para alterar essa política.

## Escopo e limites

Esta etapa valida estrutura, consistência entre fontes e vigência, não todo o
catálogo de regras municipais nem o XSD nacional completo. Não inclui consulta
automática de enquadramento em fonte oficial ou validação da assinatura da nota
de referência. A ausência de rejeição anterior não comprova correção fiscal.

O serializador atual cobre MEI/ME-EPP, operação tributável sem retenção e CSTs
sem cálculo adicional (04, 06, 07, 08, 09). Não optante, retenção, imunidade,
exportação e CSTs que exigem bases/alíquotas/valores são bloqueados no contrato;
não são substituídos por outro tratamento. A seleção de apuração continua exigindo
revisão; não fazemos enquadramento jurídico automático.

IBS/CBS ainda não tem grupo implementado no XML real. Solicitações que exigem
`cIndOp`/`cClassTrib` são bloqueadas, em vez de anunciar que esses campos foram
transmitidos. Não introduzimos tags de reforma sem um mapeamento validado.

Pacotes de consultas em dias diferentes exigem competência explícita. Esta etapa
adiciona o campo no banco, mas não uma ferramenta de IA ou nova tela para escolher
essa data: o caso fica pendente para revisão operacional. Investigações antigas
não são reenfileiradas automaticamente após corrigir o cadastro.

A correção E0676 anterior só se aplica ao bloco automático legado. Uma divergência
entre SEFIN e uma política fiscal explicitamente revisada exige revisão da política;
a ferramenta não remove silenciosamente uma definição confirmada.

No DANFSe, campos desconhecidos ficam sem valor inventado. Em preparação, a
conversão externa só utiliza o XML devolvido pelo provedor, não um XML sintético
com endereços/alíquotas padrões. Ainda não há extração completa dos tributos do
XML autorizado para o PDF local, que mostra campos desconhecidos com traço.

Reserva concorrente de numeração e reconciliação de autorização continuam sendo
limitações já documentadas na primeira etapa do agente.

## Implantação

1. Publicar esta versão mantendo `PREPARACAO_FISCAL_ATIVA=false`.
2. No container atualizado, executar `npm run migrate:preparacao`.
   Migração aditiva: não altera nem confirma os dados dos emitentes existentes.
3. Revisar as regras fiscais dos serviços no onboarding; cada perfil deve ter
   um único serviço padrão ativo para essa tela de confirmação.
4. Validar emissões em homologação com os parâmetros adequados e depois habilitar
   `PREPARACAO_FISCAL_ATIVA=true` em todos os workers. Requer `AGENTE_FISCAL_ATIVO=true`.
5. Reiniciar, executar `npm run check:agente` e acompanhar as investigações.
   A checagem não transmite nota nem consulta a SEFIN.

A flag permite implantação gradual: o agente já existente continua operando
quando a preparação está desligada. Desligar a flag restaura os padrões legados
na emissão; casos retidos continuam exigindo revisão. Migração, revisão de
cadastros e validação real não foram executadas neste workspace.

## Validação técnica

Testes cobrem origem e precedência, zero sem fallback, política não confirmada,
perfil/classificação alterados, vigência, ambiente, múltiplos serviços/datas,
CPF/CNPJ, bloqueio antes de qualquer acesso ao certificado/SEFIN, formato do XML
com parâmetros revisados e atomicidade/rollback da confirmação fiscal. Não são
testes de validade jurídica nem substituem homologação no provedor.
