# Nota manual como referência tributária

O usuário pode emitir uma nota do serviço no portal municipal com os parâmetros
revisados e depois cadastrar o A1 no Noto. O certificado autentica a busca no ADN;
os dados vêm do XML da nota encontrada. A tela mostra número e data para conferir
se essa é a referência pretendida. Se a nota ainda não estiver no ADN, é possível
importar seu XML no padrão nacional pela opção “Importar outra nota de referência”.

Não há consulta contínua de legislação nem garantia de que o último documento
disponível no ADN represente todas as operações futuras. O usuário confirma os
parâmetros e sua vigência para o serviço cadastrado.

## Mudanças

- Corrigido o caminho de IBS/CBS: `NFSe/infNFSe/DPS/infDPS/IBSCBS`, com CST e
  classificação em `valores/trib/gIBSCBS`. O grupo calculado diretamente em
  `infNFSe/IBSCBS` não é reutilizado como parâmetro de uma nova nota.
- Persistência das sugestões, identificação da referência, hash SHA-256 e
  pendências em `medico_perfil_fiscal.dados_reforma_tributaria`, já existente.
- Perfil e serviço importados na mesma transação. Campos ausentes deixam de
  herdar valores antigos silenciosamente; a política anterior é invalidada.
- Confirmação vinculada ao hash do XML apresentado. A preparação verifica o
  mesmo hash e a correspondência dos parâmetros IBS/CBS antes da transmissão.
- Grupo IBS/CBS suportado é gerado na nova DPS. Paciente, valor, data e identificação
  vêm da nova emissão. Bases, totais calculados, referências a outras notas e
  informações de terceiros da nota anterior não são copiados.
- Upload manual exige o A1 cadastrado e verifica o titular. Uma falha em preservar
  o XML no Storage impede a atualização do perfil, em vez de registrar caminho inexistente.

## Suporte delimitado

Nesta entrega, IBS/CBS cobre a declaração de operação regular (`finNFSe=0`),
destinatário igual ao tomador (`indDest=0`), `indFinal` quando presente, `cIndOp`,
`CST` e `cClassTrib`, com preservação de zeros à esquerda. Valores não são escolhidos
pelo LLM. Os códigos vêm da referência e precisam ser confirmados.

Grupos adicionais, como destinatário diferente, ente governamental, crédito
presumido, diferimento e tributação regular específica, geram pendência antes
da confirmação. As restrições anteriores para não optante, retenção, tributos
federais com cálculo e outras operações continuam valendo. Um `pAliq` de ISS
declarado na DPS também exige suporte específico; não é descartado para liberar
a emissão. O relatório indica esses campos para revisão.

O sistema não garante suporte a qualquer XML municipal: esta integração é para
NFS-e nacional 1.01. Validar namespace, estrutura XML e tipos não equivale à
validação completa por XSD, à verificação da assinatura da nota importada ou à
homologação de todas as regras fiscais do município.

## Referência técnica consultada em 05/10/2026

- [Documentação atual de produção](https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/documentacao-atual).
- [NT 004 v2.0, descrição dos grupos declarados na DPS e calculados na NFS-e](https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/producao-restrita/nt-004-se-cgnfse-novo-layout-rtc-v2-00-20251210.pdf/@@download/file).
- [Portal RTC e atualizações](https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/rtc).

A implementação usa o subconjunto declarativo descrito acima. Não implementa
automaticamente todos os grupos de notas técnicas mais novas, nem infere suas
datas de entrada em produção.

## Implantação e verificação

1. Garantir que `npm run migrate:preparacao` já foi executado.
2. Implantar o código em `web` e no worker, se ele for separado.
3. Manter `AGENTE_FISCAL_ATIVO=true` e `PREPARACAO_FISCAL_ATIVA=true` nos processos
   de emissão. Referências importadas nesta versão exigem preparação ativa;
   com a flag desligada, o envio é bloqueado, não usa os defaults antigos.
4. Importar novamente o XML desejado, revisar a referência, preencher a vigência
   e confirmar as regras. Cadastros já existentes não são migrados automaticamente.
5. Conferir o resultado em homologação com certificado e referência compatíveis.

Não há nova migração além da preparação fiscal já existente. O teste de regressão
usa XML sintético para verificar importação → persistência → confirmação → nova DPS,
incluindo códigos com zeros à esquerda, percentual zero, rejeição de campos
extras, referência alterada, titular divergente e falhas de armazenamento/transação.
Nesta entrega não foi executada transmissão real ao ADN/SEFIN nem validação em
banco ou certificado de produção.
