# CRM/RQE com OpenSerp no Easypanel

A aplicação consulta o Google pelo OpenSerp próprio e usa a NVIDIA para extrair
os registros. Nome, CRM, UF e RQE continuam sujeitos à comprovação literal nas
fontes e à aprovação do usuário. A busca não representa consulta oficial ao CFM.

O servidor e o comando `consultar:registro` usam OpenSerp. `SERPER_API_KEY` não é
necessária e não há chamada automática ao Serper quando o OpenSerp falha.

## 1. Criar o serviço

No mesmo projeto Easypanel da aplicação:

1. Crie um serviço **App** chamado `openserp`.
2. Em **Source / Docker Image**, informe `karust/openserp:0.8.12`.
   A versão foi escolhida pelo contrato JSON 2.1 documentado no código da tag
   `v0.8.12`; a imagem Docker usa a versão **sem** o prefixo `v`.
3. Em **Avançado → Comando**, configure
   `/usr/local/bin/openserp serve -a 0.0.0.0 -p 7000`.
   O Easypanel executa esse campo pelo shell e substitui o entrypoint da imagem;
   por isso, o comando precisa incluir o executável. Habilite **Tini Init** e salve.
4. Reserve inicialmente 1 CPU e 2 GiB de memória. Ajuste conforme o uso real.
   Se sua versão do painel permitir, configure `/dev/shm` com 2 GiB e habilite
   init/reaping de processos. A imagem usa um navegador Chromium.
5. Configure as variáveis abaixo e implante o serviço:

```dotenv
OPENSERP_SERVER_INSECURE=false
OPENSERP_APP_MAX_PROCESSES=2
OPENSERP_APP_TIMEOUT=15
OPENSERP_RESILIENCE_MAX_RETRIES=1
OPENSERP_RESILIENCE_ALLOW_ENDPOINT_FALLBACK=false
OPENSERP_PROXIES_ALLOW_REQUEST_PROXY_URL=false
OPENSERP_EXTRACT_ENABLED=false
OPENSERP_GOOGLE_RATE_REQUESTS=6
OPENSERP_GOOGLE_RATE_BURST=1
```

Mantenha o serviço acessível pela rede interna, na porta 7000. Não crie domínio
público nem publique a porta do host: esta integração não envia autenticação ao
OpenSerp. Copie o hostname interno que o Easypanel mostrar; não use `localhost`
para conectar dois serviços diferentes. Os dois serviços precisam compartilhar
uma rede em que esse hostname resolva.

O limite de buscas e o cache nativo reduzem tráfego. O prazo de cada tentativa
do navegador é 15 s, com uma retentativa interna. A aplicação aguarda até 45 s
por consulta e mantém o orçamento limitado de tentativas do cadastro.

## 2. Configurar a aplicação Notomed

Nas variáveis do serviço **Notomed**, adicione:

```dotenv
OPENSERP_BASE_URL=http://SEU_HOST_INTERNO_OPENSERP:7000
NVIDIA_API_KEY=SUA_CHAVE_NVIDIA_EXISTENTE
# Opcional: esse já é o padrão para CRM/RQE.
NVIDIA_REGISTRO_MODEL=mistralai/mistral-7b-instruct-v0.3
```

Substitua o hostname pelo valor real do painel e preserve a chave NVIDIA já
configurada. Remova `SERPER_API_KEY` desse serviço se não houver outro uso.
Reconstrua e implante a aplicação com o código atualizado.

A extração de CRM/RQE usa um modelo de texto independente de `NVIDIA_MODEL`
e `NVIDIA_VISION_MODEL`. O padrão é o Mistral 7B listado no catálogo NVIDIA;
isso permite reservar os modelos das demais funções para suas tarefas.
Cada chamada de extração tem prazo de 120 s, saída de até 2048 tokens e uma
tentativa HTTP. As novas tentativas ficam sob o orçamento do trabalho de
cadastro. `IA_TEMPO_ESGOTADO` identifica o prazo expirado; a disponibilidade e a
latência reais do novo modelo precisam ser conferidas após a implantação.
Quando houver resposta de erro HTTP, o diagnóstico `nvidia_http` informa apenas
o status, sem registrar a chave nem o corpo retornado pelo provedor.
Se um cadastro já esgotou suas tentativas, solicite nova pesquisa no painel
após implantar a atualização.

Cadastros ainda aguardando confirmação com erro `SERPER_*` recebem uma nova
rodada limitada de busca no OpenSerp, inclusive se as tentativas do provedor
anterior acabaram. Isso acontece uma vez: o resultado antigo é removido ao
agendar, e os resultados novos passam a ter códigos `OPENSERP_*`. Dados
explicitamente aprovados não são reabertos. Resultados anteriores válidos
podem ser atualizados pelo botão de nova pesquisa no painel.

## 3. Conferir após a implantação

No terminal do serviço Notomed, confira a saúde e a resolução do hostname:

```sh
node --input-type=module -e 'const r = await fetch(new URL("/health", process.env.OPENSERP_BASE_URL)); console.log("OpenSerp HTTP", r.status); process.exitCode = r.ok ? 0 : 1;'
```

Em seguida, consulte um nome sem gravar no banco:

```sh
npm run consultar:registro -- "Bruna Botter" --diagnostico
```

Um resultado útil contém `etapa: "openserp"`, fontes utilizáveis, validação de
CRM e origem `Google via OpenSerp (sugestão não oficial)`. O RQE só é sugerido
quando uma fonte permite associá-lo ao mesmo nome e CRM/UF. A aprovação dos
dados continua sendo uma etapa entre o certificado e o WhatsApp.

### Falhas

| Código | Ação |
| --- | --- |
| `CRM_FONTE_NAO_CONFIGURADA` | Conferir `OPENSERP_BASE_URL` e a chave NVIDIA. |
| `OPENSERP_URL_INVALIDA` | Usar URL HTTP/HTTPS sem credenciais, query ou fragmento. |
| `OPENSERP_CONSULTA_INDISPONIVEL` | Conferir DNS interno, rede, porta, logs e prazo da busca. |
| `OPENSERP_HTTP_403` / `OPENSERP_HTTP_429` | Conferir bloqueio, CAPTCHA ou limite do Google nos logs do OpenSerp. |
| `OPENSERP_HTTP_502` / `OPENSERP_HTTP_503` / `OPENSERP_HTTP_504` | Conferir parser, navegador, memória e disponibilidade do motor. |
| `OPENSERP_RESPOSTA_INVALIDA` | Confirmar imagem 0.8.12 e resposta JSON com `results`; o corpo é limitado a 1 MiB. |
| `OPENSERP_MOTOR_INDISPONIVEL` | O envelope informa falha no Google. Conferir logs do serviço. |
| `OPENSERP_SEM_RESULTADOS_UTILIZAVEIS` | A busca respondeu sem fontes orgânicas HTTPS utilizáveis. Permitir preenchimento manual. |

O OpenSerp não cobra créditos de busca no serviço próprio. Permanecem os custos
de hospedagem e extração NVIDIA; disponibilidade e cobertura dos resultados
dependem do Google e podem diferir do Serper. O usuário pode preencher os dados
manualmente caso a busca não esteja disponível.

## Desenvolvimento local

```sh
docker compose -f deploy/openserp.compose.yaml up -d
```

Use `OPENSERP_BASE_URL=http://127.0.0.1:7000` se o Node estiver rodando no host.
Esse arquivo publica a porta somente no loopback; para Node em outro container,
use uma rede compartilhada e o hostname `openserp`.

## Referências do contrato

- [OpenSerp v0.8.12 — documentação](https://github.com/karust/openserp/blob/v0.8.12/README.md)
- [Envelope JSON](https://github.com/karust/openserp/blob/v0.8.12/core/response.go)
- [Resultados e tipos orgânicos](https://github.com/karust/openserp/blob/v0.8.12/core/result.go)
- [Erros HTTP](https://github.com/karust/openserp/blob/v0.8.12/core/server.go)
- [Docker Compose oficial](https://github.com/karust/openserp/blob/v0.8.12/docker-compose.yaml)
