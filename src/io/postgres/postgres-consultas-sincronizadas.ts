import type pg from 'pg';
import type { ConsultaSincronizada, RepositorioConsultasSincronizadas } from '../../agenda/fonte-agenda.js';

export class PostgresConsultasSincronizadas implements RepositorioConsultasSincronizadas {
  constructor(private readonly pool: Pick<pg.Pool, 'query'>) {}

  async salvar(medicoId: string, fonte: string, consultas: ConsultaSincronizada[]): Promise<void> {
    if (!consultas.length) return;
    const registros = consultas.map(consulta => ({ paciente_id: consulta.pacienteId, id_externo: consulta.idExterno,
      data_hora: consulta.dataHora, status: consulta.status, valor_consulta_centavos: consulta.valorConsultaCentavos }));
    await this.pool.query(`insert into public.noto_consultas_sincronizadas
      (medico_id, fonte, id_externo, paciente_id, data_hora, status, valor_consulta_centavos)
      select $1, $2, c.id_externo, c.paciente_id, c.data_hora, c.status, c.valor_consulta_centavos
      from jsonb_to_recordset($3::jsonb) as c(id_externo text, paciente_id uuid, data_hora timestamptz, status text, valor_consulta_centavos integer)
      on conflict (medico_id, fonte, id_externo) do update set paciente_id=excluded.paciente_id,
      data_hora=excluded.data_hora, status=excluded.status, valor_consulta_centavos=excluded.valor_consulta_centavos`,
      [medicoId, fonte, JSON.stringify(registros)]);
  }
}
