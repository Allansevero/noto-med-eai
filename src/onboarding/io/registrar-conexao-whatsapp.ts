/**
 * Persiste eventos autenticados da instância do consultório. Permite concluir
 * o onboarding mesmo quando a tela do QR Code já foi fechada.
 */
import type pg from 'pg';

export async function registrarConexaoWhatsapp(pool: pg.Pool, evento: { instancia: string; state: 'open' | 'close' | 'connecting' }) {
  if (evento.state === 'connecting') return null;
  const { rows } = await pool.query(`update whatsapp_instancias
    set status = $2::status_conexao_whatsapp,
        conectado_em = case when $2::status_conexao_whatsapp = 'conectado' then coalesce(conectado_em, now()) else conectado_em end
    where nome_instancia = $1 and oficial = false and medico_id is not null
    returning medico_id`, [evento.instancia, evento.state === 'open' ? 'conectado' : 'desconectado']);
  return evento.state === 'open' ? rows[0]?.medico_id ?? null : null;
}
