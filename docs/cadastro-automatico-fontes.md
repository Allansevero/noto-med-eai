# Fontes do cadastro automático

Verificação em 09/10/2026, sem consultas com documentos de pessoas reais.

- Hub: https://www.hubdodesenvolvedor.com.br/detalhes/cnpj/ publica exemplos JSON com `status`, `result.numero_de_inscricao`, `result.nome` e `result.quadro_socios` (lista de nomes com qualificação). O parser está preparado para esse contrato. A página não apresenta o endpoint e a autenticação da API; documentação da conta foi solicitada. A credencial `HUB_DESENVOLVEDOR_TOKEN` não está disponível no ambiente de desenvolvimento. Não há chamada CNPJ do Hub habilitada nem presunção de acesso com a credencial CPF.
- Fonte secundária: https://brasilapi.com.br/docs#tag/CNPJ e https://github.com/BrasilAPI/BrasilAPI/blob/main/pages/api/cnpj/v1/%5Bcnpj%5D.js. A consulta CNPJ já é usada no sistema. O enriquecimento aproveita `qsa[].nome_socio` e separa candidatos de pessoas dos dados empresariais. Não importa regimes ou parâmetros fiscais a partir dessa consulta.
- CRM: https://portal.cfm.org.br/busca-medicos/ e o JavaScript público da página usam reCAPTCHA no mecanismo de busca. Nenhum desafio foi contornado. A pesquisa automática retorna indisponibilidade explícita até existir uma fonte oficial utilizável e validada; nesse caso, o Noto pede CRM com UF como dado declarado.

Sócios, razão social e resultados por nome não comprovam quem é o médico responsável. O cadastro requer confirmação do vínculo; resultados sem origem nunca são apresentados como verificados no conselho.
