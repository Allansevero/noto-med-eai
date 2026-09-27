# Plano complementar — Onboarding do médico e extração de parâmetros fiscais

> Complementa `plano_mvp_nf_whatsapp.md` (fluxo de emissão) e
> `CONVENCOES-DE-CODIGO.md` (padrão de código). Cobre o intervalo entre
> "cadastro concluído" (login por WhatsApp+OTP, seção 4.6 do plano principal)
> e "liberado para emitir nota de verdade".
>
> Baseado na análise de um XML real de NFS-e padrão nacional (leiaute
> `sped.fazenda.gov.br/nfse` versão 1.01), fornecido como referência. Todo
> valor de exemplo citado aqui vem **desse** XML, só para ilustrar — o
> código nunca deve fixar nenhum desses valores; ele lê o que estiver no
> XML que o médico enviar, seja ele qual for.

## 0. Princípio do sistema: invisível depois do onboarding

O médico passa por um cadastro guiado uma única vez. Depois disso, ele só
interage por respostas rápidas do WhatsApp (`/agendado`, `/emissao`, já
descritas no plano principal) — nunca mais precisa abrir um painel.
Onboarding é, portanto, a única janela em que pedimos dado explícito a ele;
tudo que puder ser inferido automaticamente (do XML, do CNAE, do
histórico) deve ser.

## 1. Passo a passo do onboarding (visão do usuário)

Cada passo libera o próximo — não dá pra pular etapa.

1. **Nome e sobrenome.** Grava em `usuarios.nome`. Mínimo indispensável
   pra identificar quem está cadastrando.
2. **Upload do XML da última NFS-e emitida** (a mais recente que o médico
   tiver à mão, autorizada). O sistema extrai os **parâmetros fiscais**
   (nunca os dados daquela nota específica — ver seção 3) e pré-preenche
   `medico_perfil_fiscal` + uma linha inicial em `medico_servicos_fiscais`.
   Fica marcado `extraido_automaticamente = true`,
   `confirmado_pelo_medico = false` — ele revisa e confirma antes da
   primeira emissão real (tela simples, poucos campos, já preenchidos).
3. **Certificado digital A1 (.pfx/.p12) + senha.** Arquivo sobe pro bucket
   privado do Storage (`medico_certificados.arquivo_storage_path`); a
   senha nunca toca uma coluna comum — vai direto pro Supabase Vault
   (pgsodium), e só o `senha_secret_id` fica na tabela (já assim no
   schema).
4. **Conectar o WhatsApp do consultório.** QR code se o médico estiver no
   computador, código de pareamento por número se estiver só no celular —
   os dois já são a forma nativa da Evolution API de conectar sem número
   próprio da plataforma. Cria a instância em `whatsapp_instancias`
   (`medico_id` preenchido, `oficial = false`), webhook configurado.
5. **Liberado.** Com perfil fiscal confirmado + certificado válido +
   WhatsApp conectado, o médico já pode configurar as respostas rápidas
   (`medico_respostas_rapidas`) — inclusive *usando o próprio bot* para
   isso, já que a instância dele está conectada e os dados fiscais prontos.

## 2. Regra de ouro da extração: parâmetro vs. dado

Duas categorias, e só duas:

- **Parâmetro fiscal** — descreve *quem é o médico* ou *que tipo de
  serviço ele presta*. Se muda de médico pra médico mas é igual em toda
  nota do mesmo médico, é parâmetro. Vai pra `medico_perfil_fiscal` ou
  `medico_servicos_fiscais`, uma vez, no onboarding.
- **Dado da nota** — descreve *aquela emissão específica*: quem foi o
  paciente, quanto custou, quando foi, qual o número sequencial daquela
  nota. Nunca é copiado do XML de referência pro código nem pro perfil —
  é gerado de novo em cada `/emissao`.

Regra prática pra não errar: se o valor aparece de novo, igual, em
qualquer outra nota do mesmo médico → parâmetro. Se ele muda toda vez →
dado da nota, descarta depois de ler.

**Nunca hardcode o valor lido de um XML de exemplo.** A extração lê a
*estrutura* (quais tags existem, o que cada uma significa) uma vez, aqui
neste documento — o código lê o *valor* de cada tag em tempo real, de
qualquer XML que chegar. Testar com um XML novo de outro médico não deve
exigir tocar em nenhum arquivo de regra.

## 3. Dicionário de parâmetros — campo a campo do XML de referência

Convenção da tabela: `Onde persiste` vazio = não persiste em lugar nenhum
(dado técnico ou redundante, descartado após a leitura).

### 3.1 `infNFSe` — gerado pelo Ambiente Nacional/prefeitura (não construímos isso)

| Campo XML | Exemplo no XML | Categoria | Onde persiste | Por quê |
|---|---|---|---|---|
| `emit.CNPJ` | 54969416000141 | Parâmetro | `medico_perfil_fiscal.cpf_cnpj_encriptado`/`_hash` | Identifica o prestador em toda nota futura |
| `emit.IM` | 104467 | Parâmetro | `medico_perfil_fiscal.inscricao_municipal` | Exigida pelo cadastro nacional (CNC); sem ela a SEFIN rejeita |
| `emit.xNome` | MARTINA BECKER | Parâmetro | `medicos.nome_completo` / `medico_perfil_fiscal.razao_social` | Nome/razão social do prestador |
| `emit.xFant` | MB SERVICOS MEDICOS | Parâmetro | `medico_perfil_fiscal.nome_fantasia` | — |
| `emit.enderNac.*`, `emit.fone`, `emit.email` | — | **Não persistir daqui** | — | Ver nota abaixo — vem do cadastro nacional (CNC), não é algo que nossa DPS precisa carregar |
| `xLocEmi`, `xLocPrestacao`, `xLocIncid`, `xTribNac`, `xTribMun` | "Alegrete", descrições | — | — | Só o *nome* do que os códigos (`cLocEmi`, `cTribNac`...) já dizem — redundante, a UI pode buscar o nome pelo código quando precisar exibir |
| `nNFSe` / `nDFSe` | 215 | Dado da nota\* | — | Número dado pelo *governo*, não pelo nosso sequencial (`notas_fiscais.ndps`) |
| `cLocIncid` | 4300406 | Parâmetro | `medico_perfil_fiscal.cod_municipio_ibge` | Município de incidência do ISS — no MVP, igual ao município de emissão |
| `ambGer` | 1 | Confere com parâmetro | `medico_perfil_fiscal.ambiente` | 1=produção — usar só pra validar consistência, não pra sobrescrever o que o médico já configurou |
| `verAplic`, `tpEmis` | — | — | — | Metadado técnico do software de quem emitiu aquela nota (não é o nosso emissor) |
| `cStat`, `dhProc` | 100, timestamp | Dado da nota | — | Resultado do processamento daquela nota específica |
| `valores.vBC/vISSQN/vLiq` (nível infNFSe) | 380.00 / 10.34 / 380.00 | Dado da nota, **calculado pelo governo** | — | Nunca reaproveitar — são o resultado, não uma regra |

\* `nNFSe`/`nDPS` do XML de referência servem só para **inicializar** o
próximo número sequencial do médico no nosso sistema (bootstrap único no
onboarding) — não para reutilizar o valor em si depois.

**Nota importante sobre `enderNac`/`fone`/`email` do prestador:** eles
aparecem na NFS-e final porque o Ambiente Nacional os busca no Cadastro
Nacional de Contribuintes (CNC) a partir do CNPJ+IM — **não** porque
alguém os enviou na DPS daquela nota. Confirma isso o fato de `infDPS.prest`
(seção 3.2) só ter `CNPJ` e `regTrib`, nada de nome/endereço. Por isso o
schema não guarda endereço do prestador: não é um parâmetro que a *nossa*
DPS precisa carregar, evita campo que nunca é lido em lugar nenhum do
fluxo de emissão.

### 3.2 `DPS.infDPS` — isto sim é o que o *nosso* sistema monta e assina

| Campo XML | Exemplo | Categoria | Onde persiste | Por quê |
|---|---|---|---|---|
| `tpAmb` | 1 | Confere com parâmetro | `medico_perfil_fiscal.ambiente` | — |
| `serie` | 49999 | Parâmetro, com ressalva\*\* | `medico_perfil_fiscal.serie_dps` | Série usada pelo emissor anterior do médico |
| `nDPS` | 215 | Dado da nota (bootstrap) | — | Ver nota acima sobre `nNFSe` |
| `dhEmi`, `dCompet` | timestamps | Dado da nota | — | Momento daquela emissão específica |
| `tpEmit` | 1 | Constante do produto | — | Sempre "prestador emite" nesse MVP — não varia por médico, não precisa virar coluna |
| `cLocEmi` | 4300406 | Parâmetro | `medico_perfil_fiscal.cod_municipio_ibge` | Município onde o prestador está estabelecido |
| `prest.CNPJ` | 54969416000141 | Parâmetro | `medico_perfil_fiscal.cpf_cnpj_*` | Mesmo do `emit.CNPJ` |
| `prest.regTrib.opSimpNac` | 3 | Parâmetro | `medico_perfil_fiscal.opcao_simples_nacional` | Regime tributário do prestador |
| `prest.regTrib.regApTribSN` | 1 | Parâmetro | `medico_perfil_fiscal.regime_apuracao_sn` | Só existe se optante Simples Nacional |
| `prest.regTrib.regEspTrib` | 0 | Parâmetro | `medico_perfil_fiscal.regime_especial_tributacao` | — |
| `toma.*` (CPF, nome, endereço) | João Gabriel Vieira... | **Dado da nota** | — | É o paciente — nunca vira parâmetro do médico, sempre veio/vem de `pacientes` |
| `serv.locPrest.cLocPrestacao` | 4300406 | Parâmetro, **[DECIDIR]** | `medico_perfil_fiscal.cod_municipio_ibge` (assumido igual ao de emissão) | Só muda se o médico atender fisicamente em outro município |
| `serv.cServ.cTribNac` | 040303 | Parâmetro **por serviço** | `medico_servicos_fiscais.ctrib_nac` | Depende da especialidade, não só do médico |
| `serv.cServ.cTribMun` | 004 | Parâmetro **por serviço + município** | *(sem coluna própria hoje — ver seção 5.1)* | Código municipal, varia por prefeitura mesmo com o mesmo `cTribNac` |
| `serv.cServ.cIntContrib` | 8630503 | Parâmetro | `medico_perfil_fiscal.cnae` | CNAE do prestador — útil pra inferir `cTribNac` certo em onboardings futuros |
| `serv.cServ.xDescServ` | "REFERENTE 1 CONSULTA EM PSIQUIATRA..." | **Híbrido — ver nota** | — | O texto literal é dado da nota; só a *pista* da especialidade é aproveitável |
| `infoCompl.xInfComp` | Texto Lei 12.741/2012 | Dado da nota, calculado | — | Recalcular na hora (tabela IBPT), nunca copiar valor antigo |
| `valores.vServPrest.vServ` | 380.00 | Dado da nota | — | Valor daquela consulta |
| `trib.tribMun.tribISSQN` | 1 | Parâmetro por serviço | `medico_servicos_fiscais` (nova coluna, se necessário) | Indica incidência normal de ISS |
| `trib.tribMun.tpRetISSQN` | 1 | Parâmetro do produto | — | Paciente pessoa física nunca retém ISS — constante para este MVP, não precisa virar coluna |
| `trib.tribMun.pAliq` | 2.72 | Parâmetro **instável — ver seção 5.2** | `medico_servicos_fiscais` ou `medico_perfil_fiscal` | Alíquota efetiva do Simples Nacional muda com o faturamento acumulado — não é fixa como as outras |
| `trib.totTrib.vTotTrib*` | valores | Dado da nota, calculado | — | Idem `infoCompl.xInfComp` |

\*\* Sobre `serie` = 49999: é a série que o **emissor anterior** do médico
usava, não necessariamente a que devemos adotar. Ver seção 5.3.

**Nota sobre `xDescServ`:** não extrair o texto literal. Usar só como
pista de texto livre — se `medicos.especialidade` ainda estiver vazio e a
palavra "PSIQUIATRA" aparecer aqui, sugerir isso ao médico pra confirmar,
nunca gravar automaticamente sem confirmação. O texto que vai em cada nota
futura é o template já definido na seção 3.2 do plano principal
(`REFERENTE A CONSULTAS {ESPECIALIDADE} COM DR.(A) {NOME} ...`), nunca uma
cópia do XML de referência.

### 3.3 Assinatura digital (`Signature`, `X509Certificate`)

Ignorar por completo na extração. É a assinatura do **software do
município/emissor anterior** sobre aquela nota — não tem nenhuma relação
com o certificado A1 que o médico vai subir no passo 3 do onboarding.

## 4. Regras de extração (estrutura de código)

Seguindo `CONVENCOES-DE-CODIGO.md`:

```
onboarding/
├── regras/
│   ├── mapear-parametros-fiscais-do-xml.ts   # pura — Tabela 3.1+3.2 → objeto tipado
│   ├── mapear-servico-fiscal-do-xml.ts       # pura — cTribNac/cTribMun/cnae/pAliq
│   ├── inferir-especialidade-de-xdescserv.ts # pura — só sugestão, nunca grava sozinha
│   └── *.test.ts
├── io/
│   ├── ler-xml-nota-referencia.ts     # parser XML namespace-aware (ex.: fast-xml-parser)
│   ├── salvar-parametros-fiscais.ts   # upsert em medico_perfil_fiscal
│   ├── salvar-servico-fiscal-padrao.ts # insert em medico_servicos_fiscais
│   └── armazenar-xml-referencia.ts    # sobe o XML bruto pro Storage, preenche xml_nota_referencia_url
└── fluxos/
    └── processar-onboarding-xml.ts     # orquestra: ler → mapear → salvar → marcar pendente de confirmação
```

`mapear-parametros-fiscais-do-xml.ts` recebe o XML já parseado (objeto,
não string) e devolve um tipo explícito — nunca um objeto solto:

```ts
export type ParametrosFiscaisExtraidos = {
  cnpj: string;
  inscricaoMunicipal: string;
  razaoSocial: string;
  nomeFantasia: string | null;
  codMunicipioIbge: string;
  serieDps: string;
  opcaoSimplesNacional: '1' | '2' | '3';
  regimeApuracaoSn: '1' | '2' | '3' | null;
  regimeEspecialTributacao: number;
  cnae: string;
  proximoNumeroSequencialSugerido: number; // nNFSe + 1, só pra bootstrap
};
```

Função pura, sem acessar banco — só transforma o objeto parseado. Testa
com pelo menos dois XMLs de exemplo reais (o fornecido + um de outro
município, quando disponível) pra garantir que nada ficou hardcoded do
primeiro caso.

## 5. Pendências e riscos identificados nesta extração

### 5.1 `cTribMun` não tem coluna hoje

`medico_servicos_fiscais` guarda `ctrib_nac` e `cnbs`, mas não
`cTribMun` — que é obrigatório na DPS e varia por município mesmo com o
mesmo `cTribNac`. **[DECIDIR]**: adicionar coluna `ctrib_mun` nessa tabela
(mesmo padrão de `ctrib_nac`) antes de implementar a extração de fato.

### 5.2 `pAliq` (alíquota do ISS) muda com o faturamento — não é parâmetro fixo

Empresas do Simples Nacional têm alíquota efetiva recalculada conforme o
faturamento acumulado dos últimos 12 meses (RBT12, Anexo III/V da LC
123/2006). O valor do XML de referência (2,72% neste exemplo) vale só
*naquele momento* — pode já estar desatualizado quando o médico emitir a
próxima nota.

Para o MVP: usar o valor extraído como ponto de partida, mas
`confirmado_pelo_medico = false` força revisão manual antes da primeira
emissão real (mecanismo que já existe no schema). **[DECIDIR]**: se/quando
vale a pena recalcular automaticamente a cada emissão (exigiria guardar
faturamento acumulado, o que este MVP não cobre).

### 5.3 Série da DPS: continuar a antiga ou abrir uma nova?

Reaproveitar a `serie` do emissor anterior (49999, neste exemplo) e
continuar o `nDPS` de onde parou evita duplicidade, mas depende de nunca
mais nenhum sistema antigo emitir na mesma série+CNPJ. Mais seguro:
adotar uma série própria da plataforma (constante do sistema, igual pra
todo médico) e nunca reaproveitar `nDPS` de fora. **[DECIDIR]** antes da
implementação do worker de emissão — não bloqueia o onboarding em si.

## 6. Reforma tributária (IBS/CBS) — por que este XML não tem esses campos, e o que fazer

O XML de referência (emitido em 23/07/2026) **não tem** o grupo `gIBSCBS`
— e isso é esperado, não um problema de parsing: as Notas Técnicas do
Comitê Gestor da NFS-e Nacional que trazem esse grupo (NT 007/2026,
fev/2026; NT 009/2026, jun/2026) tornam o preenchimento **obrigatório em
ondas por regime**, e a onda que afeta o Simples Nacional/ME-EPP — o
regime de praticamente todo médico autônomo — começa em **1º de janeiro
de 2027**. Até lá, o grupo é opcional e pode vir vazio.

Isso muda em breve, então a extração precisa estar pronta sem depender de
reescrever nada:

- O schema já reserva `medico_perfil_fiscal.cclass_trib_padrao`,
  `cind_op_padrao` e um `dados_reforma_tributaria jsonb` de extensão —
  exatamente para não travar quando novos campos aparecerem.
- Quando um XML de onboarding **já vier com** `gIBSCBS`, a extração deve
  ler dali (nunca usar o valor default do schema): pelo menos `CST`
  (situação tributária do IBS/CBS) e `cClassTrib` (classificação
  tributária) — e, se presente, `cIndOp` (Anexo VII) e `cNBS` (esse
  último já cabe em `medico_servicos_fiscais.cnbs`).
- Para quem é Simples Nacional, o grupo de composição (`gTribSN`, com as
  alíquotas/valores de IBS e CBS dentro do próprio DAS) tende a ser
  **calculado pelo Ambiente Nacional**, não declarado por nós na DPS — na
  prática, o mesmo padrão já visto com o ISS: nós declaramos a
  classificação, o governo calcula o valor.
- **[ATENÇÃO]** O leiaute exato desse grupo mudou pelo menos três vezes só
  em 2026 (NT 007, 008, 009) e ainda pode mudar antes de 2027. Antes de
  implementar a leitura desse grupo de verdade, validar contra o XSD
  oficial mais recente em nfse.gov.br — não contra este documento, que
  descreve o estado de agosto/2026.

## 7. Ordem sugerida de implementação (encaixa na seção 6 do plano principal)

1. Adicionar `ctrib_mun` a `medico_servicos_fiscais` (seção 5.1 acima).
2. `io/ler-xml-nota-referencia.ts` — parser + validação de que é NFS-e
   padrão nacional (`versao="1.01"` ou superior no namespace
   `sped.fazenda.gov.br/nfse`); rejeitar com mensagem clara qualquer XML
   fora desse padrão (leiaute municipal ABRASF antigo, por exemplo).
3. `regras/mapear-parametros-fiscais-do-xml.ts` +
   `regras/mapear-servico-fiscal-do-xml.ts`, com teste usando o XML real
   fornecido como fixture (anonimizar CPF do paciente antes de versionar).
4. `fluxos/processar-onboarding-xml.ts` + telas de confirmação (passo 2 do
   onboarding).
5. Upload de certificado (passo 3) — já coberto pela seção 4.1 do plano
   principal (Vault/pgcrypto), sem novidade de schema aqui.
6. Conexão WhatsApp via QR/pareamento (passo 4) — endpoint que chama a
   Evolution API para criar a instância e devolver o QR/código; grava em
   `whatsapp_instancias`.
