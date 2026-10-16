# Regras para Agentes Autônomos e Desenvolvedores — Monorepo Noto

Este repositório é composto por 3 serviços isolados em um monorepo: `/noto`, `/fiscal` e `/ia`, além do diretório compartilhado `/contratos`.

## 1. Confinamento Estrito de Pasta
- Trabalhe EXCLUSIVAMENTE dentro da pasta indicada na tarefa atual (`/noto`, `/fiscal` ou `/ia`).
- É TERMINANTEMENTE PROIBIDO editar, criar ou remover arquivos de outra pasta de serviço sem autorização prévia explícita do usuário.
- Se uma tarefa demandar alterações em múltiplos serviços, ela deve ser obrigatoriamente dividida em etapas separadas:
  1. Primeiro a alteração e aprovação do contrato em `/contratos`.
  2. Depois a implementação no serviço produtor (ex.: `/fiscal`).
  3. Por fim a implementação no serviço consumidor (ex.: `/noto`).

## 2. Governança da Pasta `/contratos`
- O diretório `/contratos` pode ser lido livremente por todos os serviços e agentes.
- Alterar `/contratos` requer aprovação prévia do usuário, pois impacta múltiplos serviços e define as fronteiras da API.
- Todo contrato deve ser versionado (ex.: `/v1/...`) para garantir retrocompatibilidade.

## 3. Proibição Absoluta de Importação Direta (Zero Cross-Import)
- NENHUM arquivo de `/noto`, `/fiscal` ou `/ia` pode importar código de outro serviço via importação direta (ex.: `import ... from '../fiscal'` é proibido).
- Toda comunicação interserviços ocorre exclusivamente via chamadas de rede HTTP (REST/JSON) na rede interna do Easypanel, seguindo as especificações de `/contratos`.
- O único compartilhamento de código permitido são as interfaces e tipos puros contidos em `/contratos`.

## 4. Isolamento de Dados e Segredos
- O `/fiscal` é o ÚNICO serviço autorizado a acessar o certificado digital A1 e suas chaves de criptografia.
- O `/noto` e a `/ia` NUNCA devem armazenar, ler ou manipular o arquivo do certificado A1 em disco ou banco.
- Cada serviço deve utilizar sua própria role e credenciais de banco de dados no PostgreSQL/Supabase.
- Nenhum serviço deve consultar diretamente tabelas pertencentes ao domínio de outro serviço.

## 5. Convenções de Código (Todas as Pastas)
- Teto de ~300 linhas por arquivo.
- Teto de ~25 linhas por função; máximo de 3 parâmetros posicionais (acima disso, use objeto).
- Guard clauses obrigatórias; proibido `if` aninhado.
- Uma função ou orquestra ou decide regra pura — nunca as duas coisas no mesmo corpo.
- Lógica de negócio pura isolada de I/O (rede, banco, `process.env`).
- Nomenclatura em português no padrão `camelCase` (verbo + substantivo) para funções e `PascalCase` para tipos.
- Import de módulo local sempre com extensão `.js` (ESM/NodeNext).
- Testes unitários com `node:test` nativo ao lado de cada arquivo (`modulo.ts` + `modulo.test.ts`).
- Proibido uso de arquivos barris (`index.ts` reexportando tudo).
