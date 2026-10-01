import pg from 'pg';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
  console.log('Verificando coluna nome_validado em pacientes...');
  const res = await pool.query(`
    select column_name
    from information_schema.columns
    where table_name = 'pacientes' and column_name = 'nome_validado'
  `);

  if (res.rows.length === 0) {
    console.log('Adicionando coluna nome_validado em pacientes...');
    await pool.query(`
      alter table pacientes
      add column nome_validado boolean not null default false;
    `);
    console.log('Coluna nome_validado adicionada com sucesso!');
  } else {
    console.log('Coluna nome_validado já existe.');
  }

  // Marca nome_validado = true para pacientes que já possuem nome civil real cadastrado
  const updateRes = await pool.query(`
    update pacientes
    set nome_validado = true
    where nome is not null
      and length(trim(nome)) >= 5
      and upper(trim(nome)) != 'PACIENTE'
      and array_length(regexp_split_to_array(trim(nome), '\\s+'), 1) >= 2;
  `);
  console.log(`Pacientes atualizados com nome_validado = true: ${updateRes.rowCount}`);

  await pool.end();
}

main().catch(err => {
  console.error('Erro na migração:', err);
  process.exit(1);
});
