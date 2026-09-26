/**
 * Implementação PostgreSQL da porta `OtpRepositorio`.
 * Executa queries 100% parametrizadas na tabela `otp_verificacoes`,
 * garantindo atomicidade e persistência segura no banco do Supabase na VPS.
 */

import type pg from 'pg';
import type {
  OtpRepositorio,
  OtpRegistro,
  CriarOtpParams
} from '../../otp/otp-repositorio.js';

export class PostgresOtpRepositorio implements OtpRepositorio {
  constructor(private readonly pool: pg.Pool) {}

  async salvar(params: CriarOtpParams): Promise<OtpRegistro> {
    const sql = `
      insert into otp_verificacoes (telefone, codigo_hash, expira_em, criado_em)
      values ($1, $2, $3, coalesce($4, now()))
      returning id, telefone, codigo_hash, tentativas, expira_em, verificado_em, criado_em
    `;
    const values = [params.telefone, params.codigoHash, params.expiraEm, params.criadoEm];
    const { rows } = await this.pool.query(sql, values);
    const row = rows[0];

    return {
      id: row.id,
      telefone: row.telefone,
      codigoHash: row.codigo_hash,
      tentativas: row.tentativas,
      expiraEm: new Date(row.expira_em),
      verificadoEm: row.verificado_em ? new Date(row.verificado_em) : null,
      criadoEm: new Date(row.criado_em)
    };
  }

  async buscarUltimoPorTelefone(telefone: string): Promise<OtpRegistro | null> {
    const sql = `
      select id, telefone, codigo_hash, tentativas, expira_em, verificado_em, criado_em
      from otp_verificacoes
      where telefone = $1
      order by criado_em desc
      limit 1
    `;
    const { rows } = await this.pool.query(sql, [telefone]);
    if (rows.length === 0) return null;

    const row = rows[0];
    return {
      id: row.id,
      telefone: row.telefone,
      codigoHash: row.codigo_hash,
      tentativas: row.tentativas,
      expiraEm: new Date(row.expira_em),
      verificadoEm: row.verificado_em ? new Date(row.verificado_em) : null,
      criadoEm: new Date(row.criado_em)
    };
  }

  async incrementarTentativas(id: string): Promise<void> {
    const sql = `
      update otp_verificacoes
      set tentativas = tentativas + 1
      where id = $1
    `;
    await this.pool.query(sql, [id]);
  }

  async marcarVerificado(id: string, verificadoEm: Date = new Date()): Promise<void> {
    const sql = `
      update otp_verificacoes
      set verificado_em = $2
      where id = $1
    `;
    await this.pool.query(sql, [id, verificadoEm]);
  }
}
