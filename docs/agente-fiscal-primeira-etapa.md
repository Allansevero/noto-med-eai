# Agente de exceções de emissão — primeira etapa

## Arquitetura encontrada

1. **Solicitação e emissão.** `processar-comando-emissao.ts` consolida consultas,
   valor, paciente e descrição, verifica limite do plano e cria a solicitação.
   Falta de CPF vai para `pendente_cadastro`; falta de data impede enfileiramento.
   Respostas de CPF/data liberam a fila. A IA existente extrai dados de conversas;
   ela não transmite DPS. `PostgresFilaRepositorio` consome `fila = pronta`
   com `FOR UPDATE SKIP LOCKED` e lock lógico por worker.
2. **Provedor.** `PostgresEmissorDpsService` lê perfil e paciente, valida nome,
   recupera certificado A1 do Supabase, gera/assina XML e envia à SEFIN Nacional
   por mTLS, gzip/base64. Gera DANFSe e usa MeuDanfe opcionalmente. Sem as
   integrações configuradas, o caminho legado permite simulação.
3. **Erros.** O cliente retorna mensagem, código e resposta bruta; o worker
   anteriormente conservava só a mensagem. O emissor possui correções internas
   para E0014 (avanço de DPS), E0676/E0710 e E0160 (mudança de Simples Nacional).
   Essas correções são bloqueadas no modo agente; continuam no modo legado.
4. **Status e banco.** `solicitacoes_nota` armazena snapshot da solicitação,
   fila, status, último erro, tentativas e lock. `notas_fiscais` guarda autorização,
   chave, DPS, documentos e resposta SEFIN. O sucesso é transacional com a
   atualização do sequencial no perfil. Há unicidade de chave e médico/nDPS,
   mas não existe uma reserva durável de DPS antes do envio nem histórico de
   tentativas. Perfil, serviços, certificados, pacientes e vínculos com consultas
   completam o contexto. `auditoria` existe, mas não coordena investigações.
5. **Retentativas.** Até três tentativas do worker, com backoff de 60/120 segundos;
   adicionalmente há até seis transmissões internas no emissor legado. Locks
   antigos eram reaproveitados após cinco minutos, mesmo sem resultado conhecido.
6. **Comunicação.** Evolution entrega PDF ao paciente e notifica o médico na
   falha final. A mensagem antiga inclui o erro bruto. O suposto alerta por e-mail
   atualmente apenas escreve no console quando configurado. Uma falha de entrega
   podia cair no mesmo catch que reagenda a emissão.
7. **Webhooks/eventos.** Evolution trata mensagens/histórico; Stripe trata billing.
   Não há webhook de autorização fiscal nem barramento de eventos fiscal.
   O cliente ADN recupera a nota mais recente para onboarding: isso não permite
   concluir com segurança que uma solicitação específica foi autorizada.
8. **Ponto de extensão.** O retorno de falha do emissor, antes do retry genérico,
   permite adicionar um coordenador pequeno preservando o caminho normal.

## Recorte implementado

`AGENTE_FISCAL_ATIVO=true` conecta o agente nos workers embutido e independente.
O sucesso normal não abre caso nem chama o modelo. O modo habilitado exige
integração fiscal real, impedindo interpretar uma simulação como recuperação.

Uma falha abre `investigacoes_emissao`, única por solicitação, e remove a fila na
mesma transação. A solicitação permanece pendente: marcar `erro`/`excecao` faria
as consultas voltarem a ser elegíveis para outra solicitação, arriscando duplicação.
A tabela possui RLS sem acesso direto de clientes; somente o backend deve ter
privilégios. Todas as ferramentas usam solicitação e médico vinculados pelo worker,
sem aceitar identificadores vindos do modelo.

Ferramentas mínimas:

- `consultar`: status local, autorização, contagem, configuração fiscal selecionada
  e eventos do caso. Não faz consulta de status remoto: essa capacidade não existe
  hoje para uma DPS específica.
- `reservarTentativa`: no máximo uma ação por caso, consumida atomicamente antes
  de chamar o emissor determinístico. A própria query revalida estado, limite,
  ausência de nota e evidência de falha antes do envio.
- `corrigirRejeicao`: remove somente o bloco federal automático explicitamente rejeitado por E0676 e transmite a DPS corrigida. Revalida evidências e igualdade do XML original antes de editar.
- `emitir`: a mesma porta existente, em modo conservador, sem correções fiscais
  ou avanço automático por duplicidade.
- `registrar`: eventos, resultado da verificação e motivo de intervenção.

O Groq recebe um JSON selecionado, diagnósticos conhecidos e descrições de rejeição com minimização de identificadores, e retorna proposta validada por Zod. Não recebe
SQL, CPF, nome, descrição clínica, certificado, XML ou resposta bruta do provedor.
A resposta técnica completa e o XML original da DPS ficam restritos ao caso no banco. As descrições selecionadas não incluem o campo Complemento; números longos, e-mails e valores entre aspas são ocultados antes do envio ao modelo. Mensagens técnicas
não são enviadas como explicação ao usuário. A decisão registra hipótese,
justificativa resumida e ação necessária, não raciocínio interno do modelo.

**Recuperação de conexão:** uma nova tentativa após `EAI_AGAIN` ou `ECONNREFUSED`,
identificados pelo transporte, sem conexão estabelecida. Não classifica mensagens
por texto e não repete timeout, reset, HTTP 5xx ou rejeição fiscal. A tentativa
ocorre no próprio ciclo, uma única vez; não há uma segunda fila/backoff do agente.
Se continuar indisponível, exige intervenção. O limite total de três tentativas
continua sendo uma barreira adicional.

**Correção da rejeição E0676:** quando há HTTP 422, exatamente uma rejeição
E0676 e o XML original contém o bloco automático
`<tribFed><piscofins><CST>08</CST></piscofins></tribFed>`, a ferramenta pode retirar
somente esse bloco proibido. Essa regra usa a descrição de rejeição já presente
no projeto; não escolhe um novo regime nem altera o cadastro. O número da DPS e
instante de geração são mantidos. A ferramenta reconstrói o XML com os dados
atuais e exige igualdade com o original antes de editar: qualquer diferença
interrompe o envio. XMLs com valores de impostos ou CST diferentes não são
abrangidos. A DPS corrigida é assinada novamente com o certificado do emitente.

O agente recebe a ferramenta disponível, escolhe se a aplica e registra a
hipótese. A reserva de tentativa no banco antecede a execução. O histórico guarda
regra, campo, antes/depois e resultado. Outra rejeição depois da correção recebe
novo diagnóstico e encerra a automação pelo limite de uma ação por caso. Resolver
E0676 não garante autorização se também houver outras inconsistências fiscais;
a conclusão depende do retorno e da verificação, não do fato de ter editado XML.
E0710 e E0160 ainda não têm ferramentas corretivas: não alternamos regime nem
presumimos o tratamento correto a partir de um código sozinho.

Após sucesso, usa a persistência/entrega existentes e consulta o banco novamente:
exige nota autorizada e solicitação emitida para declarar resolvido. Se gravação
ou entrega falhar, não retransmite. Nota já autorizada com pendência de entrega
fica para revisão, mantendo o registro de autorização.

Escalam obrigatoriamente: rejeição sem correção verificada, necessidade de mudar regime, alíquota,
classificação ou dados do documento; duplicidade; cadastro/certificado ausente;
resultado incerto; limite; indisponibilidade/saída inválida do LLM; falha da
retentativa; inconsistência de persistência e entrega pendente. A notificação
é simples e não promete uma integração com contador que ainda não existe.

Eventos registram problema e tentativa recebida, contexto consultado, contexto
exato enviado ao modelo, decisão, reserva anterior ao efeito externo, resultado,
verificação e escalonamento/notificação. Casos já existentes sem XML original e HTTP da rejeição não recebem autorização retroativa para essa correção.

Tentativas anteriores à ativação não têm
histórico detalhado disponível: somente o contador/erro legado, sem inventar dados.

## Ativação e operação

1. Publicar a imagem com o código e os scripts atualizados. Aplicar `npm run migrate:agente` com a conexão de backend.
   A migração é aditiva e transacional; pressupõe os papéis Supabase existentes.
2. Configurar Groq e integrações fiscais reais. Habilitar a flag em **todos** os
   workers; parar workers antigos antes da troca. Não misturar políticas de lock.
3. Definir `AGENTE_FISCAL_ATIVO=true` no serviço e executar `npm run check:agente`. A checagem confirma configuração e tabela sem consumir a fila; não valida APIs externas nem workers em execução. Reiniciar todos os workers com a nova configuração e conferir os logs. Validar primeiro em homologação. Nenhuma migração ou transmissão real foi
   executada durante esta implementação.
4. Inspecionar `problema`, `eventos`, `estado` e `retentativas` na tabela pelo backend.
   Acesso direto de clientes continua bloqueado; não há nova API pública nem tela.

Casos em `investigando`/`tentando_resolver` após interrupção permanecem fora da
fila. A reserva não é devolvida, pois o processo pode ter morrido depois de enviar.
Antes de qualquer retomada, conciliar a emissão e revisar os eventos. Não apagar
o caso nem recolocar a solicitação na fila para tentar novamente às cegas.
No modo agente, locks de emissão expirados também não são retomados automaticamente:
podem representar transmissão cujo resultado se perdeu. Revisão operacional pode
localizar casos parados e locks com estas consultas de leitura:

```sql
select solicitacao_id, medico_id, estado, atualizado_em
from investigacoes_emissao
where estado <> 'resolvido' order by atualizado_em;

select id, medico_id, bloqueada_em
from solicitacoes_nota
where bloqueada_em < now() - interval '5 minutes' and fila = 'pronta';
```

Desligar a flag restaura o comportamento legado para novas emissões. Casos
assumidos continuam sem fila e não são retomados. A migração pode permanecer.

## Próximos incrementos

1. Exercitar esse único loop em homologação e revisar os casos escalados.
2. Persistir identidade/payload da DPS antes do primeiro envio e implementar
   consulta remota por essa identidade; só então reconciliar timeouts/duplicidades.
3. Reservar sequencial por emitente de forma transacional (limitação já existente
   entre solicitações distintas), sem usar avanço de DPS como reparo de duplicidade.
4. Recuperar casos interrompidos por reconciliação, separar entrega em outbox e
   adicionar monitoramento/alerta dos casos pendentes.
5. Construir aprovação do contador e catálogo de correções previamente aprovadas,
   guiados pelos eventos observados. Sem framework genérico de agentes nesta etapa.

## Validação

Testes em memória cobrem o loop do worker, caminho normal sem LLM, veto a decisões
inseguras, limite, repetição de evento, falha do modelo, autorização sem persistência,
falha após autorização e entrega. Testes do transporte distinguem erros antes do
envio de resultados incertos; fixtures do emissor verificam que o modo conservador
não altera perfil nem avança sequência por rejeição. O contrato Groq rejeita ações
inventadas e respostas inválidas. Não há teste contra PostgreSQL/SEFIN/Groq reais;
concorrência e migração precisam de validação em homologação antes da ativação.

A evolução para E0676 foi validada com transporte simulado: o XML retransmitido
perde somente o bloco proibido, conserva DPS/regime e nenhuma atualização do perfil
é executada. Mudança de valor antes da correção bloqueia a transmissão. Isso
comprova a execução da ferramenta, não aceitação em SEFIN real; homologação
continua necessária antes de ativar.
