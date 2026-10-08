# Implementação Google Planilhas

1. Porta Google HTTP com OAuth PKCE, refresh/revogar e APIs readonly de metadata e
values, host fixo, timeout, erros sanitizados, testes de contrato e limites.
2. Mapeamento IA de cabeçalho em colunas restritas, extração das células originais,
validação CPF/email/telefone, origem e cobertura, testes sem dados reais/modelo real.
3. Importador PG que trava médico e prévia, preenche apenas vazios, preserva dados
validados, detecta conflitos/duplicação; nenhum efeito em notas. Testes negativos.
4. Migração com estados OAuth consumíveis, tokens e prévias cifrados/RLS, router
com identidade Supabase autoritativa e callbacks sem tokens no cliente.
5. Conta -> Google Planilhas: conectar, link, aba, extrair, tabela de prévia, confirmar
importação e desconectar. Reutilizar visual atual, escapar células com textContent.
6. Revisão de segurança, PostgreSQL isolado, suíte/TypeScript da release sem Steel,
publicar main com CAS. Documentar setup Google e ausência de validação real.
