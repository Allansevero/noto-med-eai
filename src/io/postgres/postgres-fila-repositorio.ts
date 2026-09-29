/**
 * Implementação PostgreSQL da porta `FilaRepositorio` com lock otimista.
 * Consome solicitações de NFS-e prontas para emissão, garante exclusão mútua
 * entre workers e grava resultados na tabela `notas_fiscais` (seção 1 e 3.2 do plano).
 */

import type pg from 'pg';
import type {
  FilaRepositorio,
  ItemFilaComTentativas,
  RegistrarSucessoEmissaoParams,
  ContextoEnvioNota
} from '../../worker/fila-repositorio.js';

export class PostgresFilaRepositorio implements FilaRepositorio {
  constructor(private readonly pool: pg.Pool) {}

  async buscarETravarProximoItem(workerId: string): Promise<ItemFilaComTentativas | null> {
    const sql = `
      with proximo as (
        select id
        from solicitacoes_nota
        where fila = 'pronta'
          and status not in ('simulada', 'emitida')
          and (proxima_tentativa_em is null or proxima_tentativa_em <= now())
          and (bloqueada_em is null or bloqueada_em < now() - interval '5 minutes')
        order by criado_em asc
        limit 1
        for update skip locked
      )
      update solicitacoes_nota sn
      set bloqueada_por_worker = $1,
          bloqueada_em = now()
      from proximo
      where sn.id = proximo.id
      returning sn.id, sn.medico_id, sn.paciente_id, sn.xdesc_serv, sn.valor_servico_centavos,
                sn.ctrib_nac, sn.cnbs, sn.cclass_trib, sn.cind_op, sn.tentativas
    `;
    const { rows } = await this.pool.query(sql, [workerId]);
    if (rows.length === 0) return null;

    const r = rows[0];
    return {
      id: r.id,
      medicoId: r.medico_id,
      pacienteId: r.paciente_id,
      xdescServ: r.xdesc_serv,
      valorServicoCentavos: r.valor_servico_centavos,
      ctribNac: r.ctrib_nac,
      cnbs: r.cnbs,
      cclassTrib: r.cclass_trib,
      cindOp: r.cind_op,
      tentativas: r.tentativas
    };
  }

  async buscarContextoEnvio(solicitacaoId: string): Promise<ContextoEnvioNota | null> {
    const sql = `
      select coalesce(wi.nome_instancia, (
               select w2.nome_instancia 
               from whatsapp_instancias w2 
               where w2.medico_id = m.id and w2.status = 'conectado' 
               order by w2.criado_em desc limit 1
             ), 'notomed_oficial') as nome_instancia,
             p.telefone as contato_telefone,
             u.telefone as telefone_medico, p.nome as nome_paciente
      from solicitacoes_nota sn
      join pacientes p on p.id = sn.paciente_id
      join medicos m on m.id = sn.medico_id
      join usuarios u on u.id = m.usuario_id
      left join whatsapp_conversas wc on wc.medico_id = m.id and wc.paciente_id = p.id
      left join whatsapp_instancias wi on wi.id = wc.instancia_id
      where sn.id = $1
      limit 1
    `;
    const { rows } = await this.pool.query(sql, [solicitacaoId]);
    if (rows.length === 0) return null;

    return {
      instanciaNome: rows[0].nome_instancia,
      contatoTelefone: rows[0].contato_telefone,
      telefoneMedico: rows[0].telefone_medico,
      nomePaciente: rows[0].nome_paciente
    };
  }

  async registrarSucesso(params: RegistrarSucessoEmissaoParams): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('begin');
      const sqlNota = `
        insert into notas_fiscais (
          medico_id, solicitacao_id, chave_acesso, ndps, serie, competencia,
          data_emissao, status, valor_servicos_centavos, xml_storage_path, pdf_storage_path, resposta_sefin_raw
        ) values ($1, $2, $3, $4, $5, $6, $7, 'autorizada', $8, $9, $10, $11)
      `;
      await client.query(sqlNota, [
        params.medicoId,
        params.solicitacaoId,
        params.chaveAcesso,
        params.ndps,
        params.serie,
        params.competencia,
        params.dataEmissao,
        params.valorServicosCentavos,
        params.xmlStoragePath,
        params.pdfStoragePath,
        params.respostaSefinRaw ? JSON.stringify(params.respostaSefinRaw) : null
      ]);

      const sqlAtualizaSolicitacao = `
        update solicitacoes_nota
        set status = 'emitida',
            fila = null,
            bloqueada_por_worker = null,
            bloqueada_em = null
        where id = $1
      `;
      await client.query(sqlAtualizaSolicitacao, [params.solicitacaoId]);
      await client.query(
        `update medico_perfil_fiscal
         set proximo_numero_dps = greatest(coalesce(proximo_numero_dps, 1), $2 + 1),
             atualizado_em = now()
         where medico_id = $1`,
        [params.medicoId, params.ndps]
      );
      await client.query('commit');
    } catch (err) {
      await client.query('rollback');
      throw err;
    } finally {
      client.release();
    }
  }

  async reagendarTentativa(params: {
    solicitacaoId: string;
    tentativas: number;
    proximaTentativaEm: Date;
    erro: string;
  }): Promise<void> {
    const sql = `
      update solicitacoes_nota
      set tentativas = $2,
          proxima_tentativa_em = $3,
          erro = $4,
          bloqueada_por_worker = null,
          bloqueada_em = null
      where id = $1
    `;
    await this.pool.query(sql, [params.solicitacaoId, params.tentativas, params.proximaTentativaEm, params.erro]);
  }

  async marcarFalhaDefinitiva(params: {
    solicitacaoId: string;
    tentativas: number;
    erro: string;
  }): Promise<void> {
    const sql = `
      update solicitacoes_nota
      set status = 'erro',
          fila = null,
          tentativas = $2,
          erro = $3,
          bloqueada_por_worker = null,
          bloqueada_em = null
      where id = $1
    `;
    await this.pool.query(sql, [params.solicitacaoId, params.tentativas, params.erro]);
  }
}
