# Convenções de código — app principal (sistema de NF por WhatsApp)

> Complementa a seção 5 do `plano_mvp_nf_whatsapp.md`. Alinhado ao estilo já
> usado no fork de `kursku/emissor-nfse` (https://github.com/kursku/emissor-nfse),
> pra ficar tudo com a mesma "cara" entre o fork e o app principal.

## 1. Um arquivo, uma responsabilidade

Nome do arquivo = o que ele faz, em kebab-case, verbo quando fizer sentido:
`gerar-codigo-otp.ts`, `verificar-otp.ts`, `enviar-otp-whatsapp.ts`. Nunca um
`utils.ts` ou `helpers.ts` genérico — se duas coisas não têm o mesmo motivo
de mudar, viram dois arquivos.

**Teto de ~300 linhas por arquivo.** Não é regra rígida de compilador, é
sinal: se um arquivo cresce perto disso, ele já teria mais de uma
responsabilidade — quebre antes de crescer, não depois. Os exemplos deste
projeto (seção 4) ficam entre 10 e 35 linhas cada.

## 2. Cabeçalho explica o *porquê*, não o *quê*

Todo arquivo abre com um bloco `/** ... */` de 2 a 5 linhas dizendo por que
esse módulo existe separado dos outros — normalmente porque um módulo vizinho
puxa alguma dependência pesada (config lido do ambiente, cliente de banco,
API externa) que tornaria este módulo difícil de testar se importasse ela
junto. Comentário de linha, quando existe, explica uma decisão não óbvia —
nunca descreve o que o código já deixa claro sozinho.

```ts
/**
 * Hash/verificação do código OTP. Nunca guardar nem comparar o código em
 * texto puro — só o HMAC. `pepper` é sempre injetado pelo chamador, nunca
 * lido direto do ambiente aqui, pra este módulo continuar testável sem
 * process.env.
 */
```

## 3. Lógica pura separada de I/O

Regra de negócio (decide o quê fazer) e I/O (banco, rede, `process.env`,
`process.exit`) nunca no mesmo arquivo. A lógica pura não recebe cliente de
banco nem faz `fetch` — recebe os dados já prontos e devolve um resultado.
Isso é o que permite testar sem subir banco/API nenhum.

Quando uma integração externa ainda não foi decidida (qual provedor, qual
query builder), a lógica de negócio depende só de uma **interface pequena**
("porta"), e a implementação concreta fica pra depois — trocar o provedor
não deve exigir tocar a lógica de novo. Já usado em `ConsultaCpfProvider`
(seção 2.1 do plano); os mesmos moldes valem para `OtpRepositorio` e
`EnviarMensagemOficial` (seção 4 abaixo).

## 4. Nomenclatura

- Funções e variáveis: `camelCase`, em português, verbo primeiro quando a
  função faz uma ação (`gerarCodigoOtp`, `verificarOtp`, `excedeuTentativas`).
- Tipos/interfaces: `PascalCase` (`OtpRepositorio`, `ResultadoVerificarOtp`).
- Constantes de configuração/negócio: `UPPER_SNAKE_CASE`, isoladas num
  arquivo `*-config.ts` que não lê `process.env` (isso fica no `config.ts`
  real, quando existir, só pra segredo/ambiente — não pra regra de negócio
  como TTL ou limite de tentativas).
- Import de módulo local sempre com extensão `.js`, mesmo vindo de um
  arquivo `.ts` (ESM/NodeNext, igual ao fork do emissor-nfse).
- Erros: mensagem sempre com o dado que ajuda a investigar (o telefone, o
  id da entidade) — nunca só "erro" ou "inválido" sem contexto.

## 5. Testes

`node --test` nativo (sem Jest/Vitest), arquivo de teste ao lado do módulo:
`nome.ts` + `nome.test.ts`. Cobrir o que for puro direto; módulo com I/O
real é testado através de uma implementação falsa (em memória) da porta que
ele usa — nunca subindo banco/API de verdade no teste.

## 6. Exemplo completo — módulo de OTP (login/cadastro, seção 4.6 do plano)

```
otp/
├── otp-config.ts            # constantes (TTL, limite de tentativas/pedidos)
├── gerar-codigo-otp.ts       # gera o código de 6 dígitos
├── hash-otp.ts                # hash + comparação em tempo constante
├── limite-otp.ts              # regras puras de expiração/limite
├── otp-repositorio.ts         # porta: acesso a `otp_verificacoes`
├── enviar-otp-whatsapp.ts     # porta: envio pela instância oficial do Evolution
├── solicitar-otp.ts           # caso de uso: pedir código
├── verificar-otp.ts           # caso de uso: conferir código
└── *.test.ts                  # um teste por módulo puro/caso de uso
```

Nenhum arquivo depende de qual banco ou qual API de WhatsApp vai ser usada
de fato — só das interfaces `OtpRepositorio` e `EnviarMensagemOficial`.
Escolher Kysely/Drizzle e a integração real do Evolution é implementar essas
duas portas; a lógica de `solicitar-otp.ts`/`verificar-otp.ts` não muda.

## 7. Contra código espaguete

As regras acima evitam arquivo gigante; estas evitam função gigante ou
fluxo emaranhado *dentro* de um arquivo pequeno:

- **Guard clause, nunca `if` aninhado.** Trate o caso inválido primeiro e
  retorne — o caminho feliz fica sem indentação extra.

  ```ts
  // ruim
  function verificar(codigo: string, registro?: Registro) {
    if (registro) {
      if (!registro.expirado) {
        if (registro.hash === hash(codigo)) { /* ... */ }
      }
    }
  }

  // bom
  function verificar(codigo: string, registro?: Registro) {
    if (!registro) return { ok: false, motivo: 'nao_encontrado' };
    if (registro.expirado) return { ok: false, motivo: 'expirado' };
    if (registro.hash !== hash(codigo)) return { ok: false, motivo: 'incorreto' };
    return { ok: true };
  }
  ```

- **Uma função, um nível de abstração.** Uma função ou orquestra (chama
  outras funções, sem decidir regra) ou decide (regra pura, sem chamar
  I/O) — nunca as duas coisas misturadas no mesmo corpo.
- **Teto por função, não só por arquivo:** ~25 linhas. Passou disso, quase
  sempre há uma sub-regra que merece seu próprio arquivo em `regras/`.
- **Máx. 3 parâmetros posicionais.** A partir do 4º, agrupar num objeto
  nomeado — parâmetro por posição além disso é ilegível na chamada.
- **Dependência de mão única entre camadas:** `regras/` nunca importa
  `io/` nem `fluxos/`; `io/` nunca importa `fluxos/`; só `fluxos/` importa
  os dois. Import na direção contrária é sinal de responsabilidade no
  lugar errado, não motivo pra criar exceção.
- **Sem estado mutável compartilhado entre módulos** (variável de módulo
  que outro arquivo lê ou altera). Tudo que uma função precisa entra por
  parâmetro; tudo que ela produz sai no retorno.
- **Sem `index.ts` reexportando tudo de uma pasta.** Import direto do
  arquivo (`import { validarCpf } from '../regras/validar-cpf.js'`) deixa
  visível de onde cada peça vem; um barrel esconde isso e convida a
  dependência circular.
