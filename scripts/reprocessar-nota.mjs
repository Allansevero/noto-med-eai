/**
 * Reprocessa notas fiscais pendentes ou com erro, recolocando-as na fila do worker.
 * Uso no terminal (Easypanel / VPS):
 *   node scripts/reprocessar-nota.mjs                  -> Lista as últimas notas travadas/com erro
 *   node scripts/reprocessar-nota.mjs <ID_DA_NOTA>     -> Reprocessa uma nota específica imediatamente
 *   node scripts/reprocessar-nota.mjs --todas          -> Reprocessa todas as notas com erro/pendentes
 */
import 'dotenv/config';
import pg from 'pg';

if (!process.env.DATABASE_URL) {
  console.error('ERRO: DATABASE_URL não configurada no ambiente.');
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 5000 });
const param = process.argv[2];

async function main() {
  const client = await pool.connect();
  try {
    if (!param || param === '--listar') {
      console.log('\n--- ÚLTIMAS NOTAS NÃO EMITIDAS ---');
      const { rows } = await client.query(`
        select 
          s.id, 
          s.status, 
          s.fila, 
          s.tentativas, 
          s.erro, 
          s.criado_em,
          p.nome as paciente_nome,
          m.nome_completo as medico_nome
        from solicitacoes_nota s
        left join pacientes p on p.id = s.paciente_id
        left join medicos m on m.id = s.medico_id
        where s.status not in ('emitida', 'simulada')
        order by s.criado_em desc
        limit 10
      `);

      if (rows.length === 0) {
        console.log('Nenhuma nota pendente ou com erro encontrada.');
        return;
      }

      console.table(rows.map(r => ({
        ID: r.id,
        Paciente: r.paciente_nome || '-',
        Médico: r.medico_nome || '-',
        Status: r.status,
        Fila: r.fila || 'nenhuma',
        Tentativas: r.tentativas,
        Erro: (r.erro || '').slice(0, 40)
      })));

      console.log('\nPara reprocessar, execute:');
      console.log('  node scripts/reprocessar-nota.mjs <ID_DA_NOTA>');
      console.log('  node scripts/reprocessar-nota.mjs --todas\n');
      return;
    }

    await client.query('begin');

    let idsParaReprocessar = [];

    if (param === '--todas') {
      const res = await client.query(`
        select id from solicitacoes_nota 
        where status not in ('emitida', 'simulada')
      `);
      idsParaReprocessar = res.rows.map(r => r.id);
    } else {
      idsParaReprocessar = [param.trim()];
    }

    if (idsParaReprocessar.length === 0) {
      console.log('Nenhuma nota selecionada para reprocessamento.');
      await client.query('rollback');
      return;
    }

    // 1. Limpa investigações travadas do agente fiscal
    await client.query(`
      delete from investigacoes_emissao
      where solicitacao_id = any($1::uuid[])
    `, [idsParaReprocessar]);

    // 2. Reseta a solicitação para a fila pegar imediatamente
    const updateRes = await client.query(`
      update solicitacoes_nota
      set 
        fila = 'pronta',
        status = 'pendente',
        tentativas = 0,
        erro = null,
        proxima_tentativa_em = now(),
        bloqueada_por_worker = null,
        bloqueada_em = null,
        aguardando_dados_profissionais = false,
        aguardando_confirmacao_medico = false,
        atualizado_em = now()
      where id = any($1::uuid[])
        and status not in ('emitida', 'simulada')
      returning id
    `, [idsParaReprocessar]);

    await client.query('commit');

    console.log(`\n✅ Sucesso: ${updateRes.rowCount} nota(s) recolocada(s) na fila com status "pronta".`);
    console.log('O worker em background iniciará a emissão automaticamente em poucos segundos.\n');
  } catch (err) {
    await client.query('rollback').catch(() => {});
    console.error('Erro ao reprocessar nota:', err.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main();
