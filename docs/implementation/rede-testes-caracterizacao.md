# Rede de testes de caracterização

Base: commit `16a2046`, código vivo. Sem alterações em `src/` ou comportamento de
produção. Dados de pacientes e credenciais dos testes são fictícios.

## Plano

1. Instalar Vitest e adicionar script, configuração e conferência detipos dos testes.
2. Travar API de emissão, valores, CPF, descrição e DPS/XML com repositório fake na borda.
3. Travar recebimento atual de mídia e respostas no webhook; registrar o que não existe.
4. Travar OTP/login com repositório em memória e serviço de identidade fake.
5. Travar preferências e regras fiscais (ISS, IBS/CBS, referência e confirmação).
6. Caracterizar a ausência de exclusão de conta pelo HTTP/UI atual.
7. Travar criptografia real e isolamento do cofre em diretório temporário.
8. Executar suíte completa e typecheck, revisar diff e registrar evidências e lacunas.

Um commit por fluxo. Sem helpers genéricos, transmissão fiscal, WhatsApp real,
Supabase real ou login real no TribeMD. Bugs encontrados serão documentados, sem correção.

## Evidência inicial

Ambiente: Node `v24.19.0`, npm `11.9.0`.

```text
$ npm run typecheck
> notomed-whats@0.1.0 typecheck
> tsc --noEmit
[exit 0]

$ npm test
npm error Missing script: "test"
[exit 1]
```

Não existia suíte executável para comparar antes da instalação do runner.

## Runner e emissão

Vitest `4.1.12` fixado como dependência de desenvolvimento. `npm test` confere os
tipos dos testes com `tsconfig.test.json` e executa o runner. `npm run typecheck`
continua inalterado. Setup usa credenciais fictícias e bloqueia `fetch` externo;
fakes de banco/identidade substituem somente fronteiras explícitas.

Após instalar o runner, antes de criar testes:

```text
$ npm test
> tsc --noEmit -p tsconfig.test.json && vitest run
RUN v4.1.12
No test files found, exiting with code 1
[exit 1]
```

Primeiro fluxo:

```text
$ npm test
> tsc --noEmit -p tsconfig.test.json && vitest run
RUN v4.1.12
Test Files  1 passed (1)
Tests       23 passed (23)
Duration    260ms
[exit 0]
```

Verificado: normalização, CPF, valores, descrição, fila, referência repetida em
chamadas sequenciais, perfil incompleto, retorno de autorização/erro já existentes,
tomador e XML da DPS/MEI. Sem assinatura, prefeitura ou emissão real.

Achados deste fluxo, não corrigidos:

- `validarPayloadEmissao` aceita `Infinity` (entrada JavaScript direta, indisponível
  em JSON literal normal) e valores como `0.001`, arredondados para zero centavos.
  A preparação fiscal possui validação posterior; o teste de entrada não prova
  que esses valores seriam transmitidos.
- Campo `pagador` não é modelado/processado e não acrescenta observação. A
  discriminação manual é preservada, com CPF do paciente. Não há regra de pacote
  ou comparação com valor de consulta nesta API.

## Webhook/comprovantes

```text
$ npm test
> tsc --noEmit -p tsconfig.test.json && vitest run
RUN v4.1.12
Test Files  2 passed (2)
Tests       32 passed (32)
Duration    267ms
[exit 0]
```

Verificado com o orquestrador real: imagem/PDF e legenda são persistidos; nome do
WhatsApp não vira nome civil; segredo inválido bloqueia; canal oficial é só OTP;
respostas de aprovação/reprovação no canal assistente são descartadas.

Lacuna confirmada por leitura do código e caminhos exercitados: não há verificador
ativo de comprovantes, encaminhamento de dúvida, decisão estruturada nem regra
aprendida/reutilizada. No canal da clínica, repetir a mesma mensagem chega duas
vezes à porta de persistência; este teste não prova duplicidade no PostgreSQL,
cujo tratamento de conflito é uma fronteira não executada aqui. O comentário sobre
um localizador em segundo plano não corresponde a um acionamento nesse fluxo.

## OTP/login

```text
$ npm test
> tsc --noEmit -p tsconfig.test.json && vitest run
RUN v4.1.12
Test Files  3 passed (3)
Tests       48 passed (48)
Duration    424ms
[exit 0]
```

Verificados: seis dígitos e hash real, cinco minutos de TTL, cooldown de 60s,
cinco tentativas, uso único, normalização do telefone, cadastro versus conta
existente e sessão separada do cliente administrativo. A identidade retornada
pelo provedor precisa coincidir com a identidade solicitada.

Achados/limites: o instante exato da expiração ainda é aceito (`>` em vez de
`>=`); falha no envio mantém o OTP persistido e o cooldown; erro ao gerar sessão
consome o OTP já validado. Não corrigidos. O teste do adaptador substitui somente
métodos do SDK externo; não comprova disponibilidade real do Supabase/Evolution.

## Preferências e parâmetros fiscais

```text
$ npm test
> tsc --noEmit -p tsconfig.test.json && vitest run
RUN v4.1.12
Test Files  4 passed (4)
Tests       76 passed (76)
Duration    503ms
[exit 0]
```

Verificados: gravação da preferência por médico e falhas de cadastro; schema fiscal
ME/EPP, limites/retenção ISS, vigência, município, grupo IBS/CBS, consumidor final
CPF, cálculo PIS/COFINS sobre valor novo, bloqueios da preparação e extração de
identidade/regime/serviço de referência fictícia. Confirmação solicita transação,
auditoria e rollback na referência alterada. O fake SQL registra comandos e dados;
não emula garantias transacionais ou constraints de PostgreSQL.

Achado não corrigido: a confirmação pelo caminho legado, sem `parametrosEmissao`,
encaminha alíquota negativa para persistência sem validar. O schema moderno rejeita
essa alíquota. Aceitação definitiva pelo banco não foi exercitada.

## Exclusão da conta

```text
$ npm test
> tsc --noEmit -p tsconfig.test.json && vitest run
RUN v4.1.12
Test Files  5 passed (5)
Tests       79 passed (79)
[exit 0]
```

Aplicativo Express real com banco substituído na borda e chamadas HTTP em loopback.
Verificados: seção de exclusão contém aviso futuro sem formulário/botão de ação;
`DELETE /api/conta` e `POST /api/conta/excluir` retornam 404. A inspeção das rotas
não encontrou uma operação de exclusão de conta. Não há como testar remoção,
confirmação, revogação Supabase ou limpeza de dados enquanto não houver esse fluxo.
Isso não se confunde com excluir um perfil/credencial do cofre, que existe.

## Cofre TribeMD

```text
$ npm test
> tsc --noEmit -p tsconfig.test.json && vitest run
RUN v4.1.12
Test Files  8 passed (8)
Tests       108 passed (108)
Duration    1.93s
[exit 0]
```

Verificados com AES-GCM e arquivos reais em diretório temporário: roundtrip,
credenciais/cookies sem texto claro, IV novo, permissões, chave errada, ciphertext
adulterado, troca de envelope entre contas (AAD), bloqueio por conta e exclusão
isolada. Captura do console não recebeu mensagens em sucesso/erro exercitados.

Orquestração real com fake somente no navegador do portal: reutiliza cookies,
reconecta uma vez na sessão expirada, preserva login após erro de leitura, exige
consentimento versionado, cancela leitura ao desconectar, mantém credencial na
desconexão e a apaga na exclusão. HTTP real com identidade/banco fake verifica
sessão, vínculo, origem, ausência de fallback UUID e rejeição de dono injetado.

Não comprova: sigilo em logs do proxy/plataforma, memória/heap, login real no portal,
MFA/CAPTCHA, expiração real de cookies, timeout, TTL de resultados, máximo global
de navegadores ou cancelamento entre réplicas. Nenhuma conta real foi usada.


## Complementos da revisão

A revisão identificou falta de cobertura depois de enfileirar e uma asserção
incompleta da confirmação fiscal. Foram completadas sem alterar produção:

- Worker: autorização, ordem de persistência/entrega PDF, backoff de 60/120s,
  terceira falha definitiva, aviso ao médico e suspensão por dados profissionais.
- Adaptador de emissão: montagem e PDF reais no modo local, CPF do paciente,
  observação manual do pagador, sequência e bloqueios de perfil/CPF/integração.
- Confirmação: consulta por médico com lock, dados do UPDATE do perfil e filtro
  de médico/serviço no UPDATE da política. Fake rejeita comandos SQL desconhecidos.

A revisão posterior não identificou novos P1/P2 nesses incrementos. Não houve
falha de asserção na suíte criada nem alteração de produção para fazê-la passar.
Os erros iniciais foram ausência de script e ausência de arquivos, descritos acima.

Achados adicionais não corrigidos:

1. O worker trata `pendenciasFiscais` como falha genérica, reagendando em vez de
   devolver `necessita_intervencao` nesse caminho.
2. Se a entrega PDF retorna `{ sucesso: false }`, o processamento ainda retorna
   `emitida`; o resultado de entrega não é examinado.
3. Se a entrega PDF lança exceção depois de registrar a autorização, o worker
   avisa o desenvolvedor e chama reagendamento. Isso **não comprova nova emissão**:
   o adaptador SQL mantém `status=emitida`/`fila=null` após sucesso e o consumidor
   exclui emitidas; essa consequência foi inspecionada, sem banco real.
4. Sem integrações e com proteções conservadoras desligadas, o adaptador mantém
   um modo local que retorna `sucesso` com chave calculada/PDF, sem autorização
   de prefeitura. O modo conservador bloqueia esse caminho quando faltam integrações.

## Cobertura final e limites

| Fluxo | Testes | Cobertura efetivamente exercitada |
| --- | ---: | --- |
| Emissão | 37 | Entrada/fila (23), worker (8), adaptador local/PDF (6). |
| Comprovante/dúvida | 9 | Recebimento e descarte reais; verificação/decisão não existem. |
| OTP/login | 16 | Regras reais e sessão com identidade externa fake. |
| Preferências/parâmetros | 28 | Preferência, schema, cálculo, referência, preparação e comandos de confirmação. |
| Excluir conta | 3 | Ausência atual de ação na interface e respostas HTTP 404. |
| Cofre | 29 | Criptografia/arquivos (13), orquestração (8), HTTP por conta (8). |
| **Total** | **122** | **10 arquivos; nenhum teste pulado ou marcado como esperado falhar.** |

Não cobertos, com motivo:

- Verificar comprovante válido, decidir pacote, encaminhar dúvida, registrar e
  reutilizar decisão: implementação ativa ausente; inventar regra violaria o escopo.
- Excluir conta e seus dados: implementação ativa ausente; só o aviso atual existe.
- Observação automática do pagador: contrato atual não contém pagador; cobertos o
  descarte desse campo e a preservação da observação informada manualmente.
- Prefeitura real, assinatura/certificado A1, Storage/Supabase/Evolution/TribeMD
  reais: fronteiras isoladas; nenhuma credencial de produção utilizada.
- Correções/retransmissões reais do emissor, geração PDF por provedor externo,
  bloqueio transacional/constraints/migrações/concorrência PostgreSQL: requerem
  caracterização adicional; fakes não demonstram garantias do banco ou do provedor.
- Visual/browser do painel e todas as rotas HTTP de login/preferências/emissão:
  cobertura é dos casos de uso/adaptadores citados; HTTP focado no cofre e exclusão.
- As 185 suítes históricas não foram recuperadas nem comparadas. O número de testes
  desta entrega não é uma medida de cobertura total ou equivalência à rede antiga.

### Verificado versus hipótese

**Verificado:** saídas e efeitos de fronteira nos casos descritos; criptografia e
PDF reais locais; todos os tipos compilam; pacote reinstala pelo lockfile; nenhum
arquivo em `src/`, `scripts/`, `Dockerfile` ou `tsconfig.json` foi alterado. As
versões de todos os pacotes previamente presentes no lockfile foram preservadas.

**Não demonstrado:** conformidade contábil, aceitação fiscal, disponibilidade de
serviços, comportamento em produção e concorrência distribuída. A versão Vite foi
fixada em `6.4.4` porque a resolução inicial Vite 8 exigia Node >=22.12. Vitest e
Vite 6 declaram suporte ao mínimo Node 22.0 do projeto; a execução desta entrega
ocorreu em Node 24.19.0, não em cada versão Node suportada.

## Evidência final (saída capturada dos comandos)

Instalação reprodutível:

```text
$ npm ci --cache /tmp/noto-npm-cache
added 212 packages in 2s
[exit 0]
```

```text
$ npm run typecheck
> notomed-whats@0.1.0 typecheck
> tsc --noEmit

npm notice
npm notice New major version of npm available! 11.9.0 -> 12.2.0
npm notice Changelog: https://github.com/npm/cli/releases/tag/v12.2.0
npm notice To update run: npm install -g npm@12.2.0
npm notice
[exit 0]
```

```text
$ npm test
> notomed-whats@0.1.0 test
> tsc --noEmit -p tsconfig.test.json && vitest run


 RUN  v4.1.12 /workspace/noto-med-eai


 Test Files  10 passed (10)
      Tests  122 passed (122)
   Start at  21:35:16
   Duration  2.54s (transform 845ms, setup 116ms, import 2.29s, tests 700ms, environment 1ms)

npm notice
npm notice New major version of npm available! 11.9.0 -> 12.2.0
npm notice Changelog: https://github.com/npm/cli/releases/tag/v12.2.0
npm notice To update run: npm install -g npm@12.2.0
npm notice
[exit 0]
```

Diff de produção conferido:

```text
$ git diff --exit-code 16a2046 -- src scripts Dockerfile tsconfig.json
[sem saída; exit 0]
```

Arquivos da entrega: dez testes, setup/configuração de testes, `package.json`,
lockfile e este relatório. Nenhum bug de produção foi corrigido.
