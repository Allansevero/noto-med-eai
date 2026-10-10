# Ajustes fiscais pelo WhatsApp oficial — proposta

Esta extensão ainda não foi implementada. A correção da conta salva nome,
CRM e RQE em `medicos` e sincroniza o nome em `usuarios`, na mesma transação.
A confirmação fiscal deixa de substituir o nome profissional pela razão social.
O fluxo existente monta `solicitacoes_nota.xdesc_serv` com esses dados e o
emissor leva essa descrição ao XML e ao PDF. Alterações no cadastro valem para
novas solicitações; não reescrevem notas nem solicitações anteriores.

## O que aproveitar

- Evolution, instância oficial configurada, webhook e envio de mensagens.
- NVIDIA, com saída estruturada e ferramentas limitadas como no agente de exceções.
- `usuarios`, `contadores` e `contador_medico` para identificar o responsável e
  delimitar quais médicos ele pode representar. O vínculo existe no esquema;
  ainda precisa ser usado e validado no novo fluxo de conversa.
- Política por serviço em `medico_servicos_fiscais.parametros_emissao`, validação
  de `parametrosEmissaoSchema`, preparação da emissão e registro em `auditoria`.

## Menor fluxo útil

1. Receber mensagem nova na instância oficial e verificar o remetente cadastrado,
   seu vínculo e permissão para o médico alvo. Não confiar em IDs escritos no texto.
   Criar uma rota para atendimento administrativo antes do fluxo de paciente;
   hoje a conversa oficial não oferece um assistente de configuração fiscal.
2. Consultar apenas configuração, serviço e vigência necessários ao pedido.
   A IA converte a instrução em uma proposta estruturada com campo, valor anterior,
   novo valor, escopo, vigência, justificativa e referência apresentada.
3. Validar com regras da aplicação se a mudança é suportada. Pedir os dados que
   faltam. Uma declaração de que "a reforma mudou" não determina sozinha o regime,
   a classificação nem o valor correto para aquele emitente.
4. Para uma decisão fiscal, apresentar a alteração concreta ao responsável
   autorizado e registrar sua confirmação vinculada à versão da proposta.
   A confirmação vale somente para aquele médico, serviço e vigência.
5. Uma ferramenta aplica a política permitida em transação, verifica a versão
   anterior para evitar sobrescrever uma revisão concorrente, registra antes/depois
   e consulta o resultado. Não oferecer SQL, nomes arbitrários de colunas ou edição
   de código ao modelo. Sucesso só após confirmar a persistência.
6. Deduplicar por instância e ID da mensagem. Persistir a proposta e o resultado
   para que um webhook repetido ou um reinício não reaplique a alteração.

Ferramentas mínimas: consultar configuração autorizada, validar proposta,
registrar proposta, aplicar proposta confirmada e consultar resultado. Reaproveitar
a validação da política; adaptar a persistência para origem WhatsApp, ator,
confirmação, versão e auditoria, sem simular uma revisão de onboarding.

O número do WhatsApp é um canal de acesso, não uma permissão irrestrita. A API
atual da conta recebe IDs enviados pelo navegador; isso não é um modelo de
autorização para copiar no novo assistente. Identidade verificada, vínculo e
permissão precisam ser checados no servidor a cada ferramenta de escrita.

## Configuração suportada versus mudança de layout

Alterar um parâmetro já suportado tem complexidade moderada: a conversa, as
permissões e a confirmação persistente são os principais componentes novos.
Não exige reconstruir a emissão normal.

Um novo campo legal pode exigir schema, serialização XML, regras de cálculo e
homologação. Gravar um valor no banco não garante que ele seja enviado nem aceito
pela SEFIN. Atualmente a preparação rejeita classificações IBS/CBS cujo grupo XML
ainda não foi implementado, assim como cenários de retenção não suportados.
Nesses casos a conversa deve registrar a necessidade e explicar a limitação;
o assistente não pode afirmar que uma atualização de cadastro implementou a reforma.

Exemplo de conversa: "Para este serviço, o contador orientou usar o parâmetro
X com valor Y a partir de determinada competência." O assistente verifica se X
existe e se Y é compatível, consulta o cadastro, apresenta a alteração e, após a
confirmação autorizada, aplica e verifica. Uma regra com vigência futura precisa
preservar a política anterior para competências anteriores; a primeira versão
não deve sobrescrever a política atual fingindo que existe histórico de vigências.

A extensão é distinta do agente que investiga rejeições: ela altera uma
configuração explicitamente revisada; a emissão permanece determinística e
o agente de exceções continua limitado às ferramentas e evidências de cada caso.
