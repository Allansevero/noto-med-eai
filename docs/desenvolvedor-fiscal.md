# Área de desenvolvedor fiscal

A página `/desenvolvedor` fica no mesmo serviço `web` do Noto. A API é separada
em `/api/desenvolvedor/fiscal` e exige uma chave própria de desenvolvedor em
cada ação. O login dos médicos não dá acesso às ações de teste. A área fica
indisponível por padrão e não aparece na navegação normal dos médicos.

## Ativar no Easypanel

1. No serviço `notomed / web`, configure as duas variáveis abaixo em Ambiente:

   ```env
   DESENVOLVEDOR_FISCAL_ATIVO=true
   DESENVOLVEDOR_FISCAL_TOKEN=<chave-aleatoria-de-32-a-256-caracteres>
   ```

   Para gerar uma chave no terminal, execute:

   ```bash
   node -e 'console.log(require("node:crypto").randomBytes(32).toString("hex"))'
   ```

   Coloque o resultado na variável e use a mesma chave para entrar na página.
   A chave não é enviada pela API de disponibilidade e não fica no código ou
   no armazenamento local do navegador.

2. Salve e implante `main`. Sem uma chave válida, a configuração recusa a
   ativação. Não há migração de banco nem nova dependência nesta entrega.
3. Abra o endereço HTTPS do Noto com `/desenvolvedor` no final.
4. Informe a chave de desenvolvedor, selecione o A1 e informe a senha.
5. Confira os parâmetros da referência. Preencha os dados de uma nova consulta,
   gere a DPS e marque a confirmação para transmitir em homologação.

Desativar `DESENVOLVEDOR_FISCAL_ATIVO` e implantar novamente remove a página e
as ações de teste. Não reutilize chaves do Supabase, Groq ou Evolution como
chave desta área. Os certificados dos médicos cadastrados não são acessados.

## O que o fluxo faz

- A consulta da referência é uma leitura do ADN de produção com o A1 informado,
  usando a busca existente pela nota mais recente do próprio titular. Não é
  exigido XML enviado manualmente. A nota precisa estar disponível no ADN
  nacional e conter a DPS original em layout reconhecido.
- A leitura, extração, análise dos campos, validação dos parâmetros, geração
  da DPS e assinatura são os componentes já usados pelo Noto. Não cria uma
  segunda tabela de regras fiscais nem permite editar impostos arbitrariamente.
- A política temporária preserva as regras da origem e muda somente o ambiente
  de emissão para homologação. A alteração de ambiente fica explícita na tela.
- A preparação recebe somente os dados da nova consulta, série e número de teste.
  O navegador não pode enviar ambiente, regime ou parâmetros fiscais.
- Gerar/assinar não transmite. O envio exige confirmação explícita e sempre usa
  `ambiente=2`, `tpAmb=2` e o cliente SEFIN de produção restrita.
- A nota de substituição pode servir de referência. A chave e o motivo de
  substituição da operação antiga não entram na nova DPS.
- Não dispara WhatsApp, e-mail, cobrança, fila, investigação de agente ou
  alterações do perfil de produção. Não chama o banco, Vault ou Storage.

## Resultado e limites

A DPS assinada pode ser baixada antes do envio. A autorização/rejeição é mostrada
com o retorno da SEFIN. O XML de NFS-e só é disponibilizado quando uma NFS-e foi
realmente retornada: a DPS usada como fallback pelo cliente não recebe esse nome.

A numeração é própria do teste e editável. A tela sugere uma série de teste e
um número baseado no relógio do navegador; não reserva nem altera números no
cadastro de produção. Se houver rejeição por duplicidade, confira a numeração
no ambiente de homologação. Não há retentativa ou alteração de regime automática.

Cada tentativa preparada só é transmitida uma vez. Repetir a solicitação de
um resultado concluído devolve o resultado armazenado; um envio concorrente
retorna conflito. Falha de comunicação sem confirmação produz
`resultado_incerto`, sem retransmissão. Consultar resultado/histórico lê o estado
registrado nesta sessão: não é uma consulta independente de status à SEFIN.
Antes de qualquer novo envio em caso incerto, confira o resultado no ambiente
de homologação. Encerrar uma sessão não cancela uma nota já transmitida.

O A1, a senha e o histórico ficam somente na memória do processo por até
15 minutos. Há limites de cinco sessões simultâneas, cinco DPS por sessão e
A1 de 2 MB. Encerrar ou expirar a sessão remove os dados e sobrescreve o Buffer
local do A1; não há garantia de apagamento físico de strings já gerenciadas pelo
runtime ou de dados internos da conexão TLS. A senha não é persistida. Reiniciar
ou implantar o servidor encerra as sessões e perde esse histórico temporário.
Em instalações com várias réplicas, esta primeira versão exige afinidade de
sessão ou uma única réplica `web` para as ações de desenvolvedor.

Logs estruturados guardam identificadores aleatórios de sessão/tentativa,
etapas, estados e códigos. Não registram A1, senha, token, XML ou CPF/CNPJ. O
histórico detalhado fica disponível somente pela API protegida durante a sessão.
As regras fiscais ainda sem suporte continuam bloqueadas, inclusive neste teste.
A autorização depende do certificado, do emitente, do município e das regras
habilitadas pela SEFIN no ambiente de homologação.

## Verificação desta entrega

Os testes usam A1 sintético, referência nacional sintética e respostas de ADN/SEFIN
simuladas. Exercitam a API HTTP real, autenticação, extração, titular, assinatura,
bloqueios, expiração, descarte do A1, concorrência e resultado de homologação. A
interface é exercitada com o script real, DOM e HTTP simulados. Isso não comprova
uma autorização real com certificado de usuário.
