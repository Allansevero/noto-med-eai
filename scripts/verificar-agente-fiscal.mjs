/** Checagem de ativação sem consumir a fila, emitir notas ou imprimir segredos. */
import 'dotenv/config';
import pg from 'pg';
const obrigatorias = ['DATABASE_URL', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'GROQ_API_KEY', 'ENCRYPTION_KEY'];
const ausentes = obrigatorias.filter(nome => !process.env[nome]);
if (process.env.AGENTE_FISCAL_ATIVO !== 'true') ausentes.push('AGENTE_FISCAL_ATIVO=true');
if (ausentes.length) {
  console.error('Configuração pendente:', ausentes.join(', '));
  process.exitCode = 1;
} else {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 5000 });
  try {
    const { rows } = await pool.query(`select
      c.relrowsecurity as rls,
      (r.rolsuper or r.rolbypassrls or c.relowner = r.oid) as acesso_backend,
      (has_table_privilege(current_user, c.oid, 'SELECT')
        and has_table_privilege(current_user, c.oid, 'INSERT')
        and has_table_privilege(current_user, c.oid, 'UPDATE')) as permissoes
      from pg_class c join pg_roles r on r.rolname = current_user
      where c.oid = to_regclass('public.investigacoes_emissao')`);
    if (!rows[0]?.rls || !rows[0]?.acesso_backend || !rows[0]?.permissoes) {
      throw new Error('MIGRACAO_OU_PERMISSOES_PENDENTES');
    }
    await pool.query('select solicitacao_id, medico_id, estado, problema, eventos, retentativas from investigacoes_emissao limit 0');
    if (process.env.PREPARACAO_FISCAL_ATIVA === 'true') {
      await pool.query('select parametros_emissao from medico_servicos_fiscais limit 0');
      await pool.query('select competencia_emissao from solicitacoes_nota limit 0');
      console.log('Preparação fiscal habilitada; colunas verificadas. A revisão dos cadastros é validada por emissão.');
    }
    console.log('Flag, variáveis obrigatórias e tabela verificadas. Não testa APIs externas nem confirma workers em execução.');
  } catch (erro) {
    console.error('Checagem não concluída:', erro.code || 'BANCO_OU_MIGRACAO_INDISPONIVEL');
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}
