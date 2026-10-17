# Rede de testes de caracterização

Base: commit `16a2046`, código vivo. Sem alterações em `src/` ou comportamento de
produção. Dados de pacientes e credenciais dos testes são fictícios.

## Plano

1. Instalar Vitest e adicionar script, configuração e conferência de tipos dos testes.
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
