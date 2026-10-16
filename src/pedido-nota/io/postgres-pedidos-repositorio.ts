/**
 * Implementação PostgreSQL do repositório de pedidos de notas do médico.
 * Gerencia a persistência do diálogo, expiração em 24h e criptografia de CPF.
 */

import type pg from 'pg';
import { gerarHashCpf } from '../../paciente/hash-cpf.js';
import type { CriarPedidoNotaParams, PedidoNota, StatusPedidoNota } from '../tipos.js';
import type { AtualizarPedidoExtra, PedidosRepositorio } from './pedidos-repositorio.js';

export class PostgresPedidosRepositorio implements PedidosRepositorio {
  constructor(
    private readonly pool: pg.Pool,
    private readonly pepper: string,
    private readonly chaveCriptografia?: string
  ) {}

  async salvarNovoPedido(params: CriarPedidoNotaParams): Promise<PedidoNota> {
    const cpfLimpo = params.cpfLimpo ? params.cpfLimpo.replace(/\D/g, '') : null;
    const cpfHash = cpfLimpo ? gerarHashCpf(cpfLimpo, this.pepper) : null;

    const sql = `
      insert into pedidos_nota_medico (
        medico_id, mensagem_id, status, paciente_id, nome_paciente,
        cpf_paciente_encriptado, cpf_paciente_hash, telefone_paciente,
        data_consulta, valor_centavos, origem_dados, dados_brutos,
        candidatos_multiplos, referencia_externa
      ) values (
        $1, $2, $3, $4, $5,
        case when $6::text is not null and $7::text is not null then pgp_sym_encrypt($6, $7) else null end,
        $8, $9, $10, $11, $12, $13, $14, $15
      )
      returning id, medico_id, mensagem_id, status, paciente_id, nome_paciente,
                case
                  when $7::text is not null and cpf_paciente_encriptado is not null then
                    pgp_sym_decrypt(cpf_paciente_encriptado, $7::text)
                  else null
                end as cpf_limpo,
                telefone_paciente, data_consulta, valor_centavos, origem_dados,
                dados_brutos, candidatos_multiplos, solicitacao_id, referencia_externa,
                expira_em, criado_em, atualizado_em
    `;

    const valores = [
      params.medicoId,
      params.mensagemId,
      params.status,
      params.pacienteId ?? null,
      params.nomePaciente ?? null,
      cpfLimpo,
      this.chaveCriptografia ?? null,
      cpfHash,
      params.telefonePaciente ?? null,
      params.dataConsulta ?? null,
      params.valorCentavos ?? null,
      params.origemDados ?? null,
      params.dadosBrutos ? JSON.stringify(params.dadosBrutos) : null,
      params.candidatosMultiplos ? JSON.stringify(params.candidatosMultiplos) : null,
      params.referenciaExterna
    ];

    const { rows } = await this.pool.query(sql, valores);
    return mapearLinhaPedido(rows[0]);
  }

  async buscarPedidoAtivoPorMedico(medicoId: string): Promise<PedidoNota | null> {
    const sql = `
      select id, medico_id, mensagem_id, status, paciente_id, nome_paciente,
             case
               when $2::text is not null and cpf_paciente_encriptado is not null then
                 pgp_sym_decrypt(cpf_paciente_encriptado, $2::text)
               else null
             end as cpf_limpo,
             telefone_paciente, data_consulta, valor_centavos, origem_dados,
             dados_brutos, candidatos_multiplos, solicitacao_id, referencia_externa,
             expira_em, criado_em, atualizado_em
      from pedidos_nota_medico
      where medico_id = $1
        and status in ('aguardando_confirmacao', 'aguardando_dados_faltantes', 'aguardando_escolha_paciente')
        and expira_em > now()
      order by criado_em desc
      limit 1
    `;
    const { rows } = await this.pool.query(sql, [medicoId, this.chaveCriptografia ?? null]);
    if (rows.length === 0) return null;
    return mapearLinhaPedido(rows[0]);
  }

  async buscarPedidoPorId(id: string): Promise<PedidoNota | null> {
    const sql = `
      select id, medico_id, mensagem_id, status, paciente_id, nome_paciente,
             case
               when $2::text is not null and cpf_paciente_encriptado is not null then
                 pgp_sym_decrypt(cpf_paciente_encriptado, $2::text)
               else null
             end as cpf_limpo,
             telefone_paciente, data_consulta, valor_centavos, origem_dados,
             dados_brutos, candidatos_multiplos, solicitacao_id, referencia_externa,
             expira_em, criado_em, atualizado_em
      from pedidos_nota_medico
      where id = $1
      limit 1
    `;
    const { rows } = await this.pool.query(sql, [id, this.chaveCriptografia ?? null]);
    if (rows.length === 0) return null;
    return mapearLinhaPedido(rows[0]);
  }

  async atualizarStatusPedido(
    id: string,
    status: StatusPedidoNota,
    extra?: AtualizarPedidoExtra
  ): Promise<void> {
    const cpfLimpo = extra?.cpfLimpo ? extra.cpfLimpo.replace(/\D/g, '') : null;
    const cpfHash = cpfLimpo ? gerarHashCpf(cpfLimpo, this.pepper) : null;

    const sql = `
      update pedidos_nota_medico
      set status = $2,
          solicitacao_id = coalesce($3, solicitacao_id),
          valor_centavos = coalesce($4, valor_centavos),
          telefone_paciente = coalesce($5, telefone_paciente),
          nome_paciente = coalesce($6, nome_paciente),
          cpf_paciente_hash = coalesce($7, cpf_paciente_hash),
          cpf_paciente_encriptado = case
            when $8::text is not null and $9::text is not null then pgp_sym_encrypt($8, $9)
            else cpf_paciente_encriptado
          end,
          atualizado_em = now()
      where id = $1
    `;

    await this.pool.query(sql, [
      id,
      status,
      extra?.solicitacaoId ?? null,
      extra?.valorCentavos ?? null,
      extra?.telefonePaciente ?? null,
      extra?.nomePaciente ?? null,
      cpfHash,
      cpfLimpo,
      this.chaveCriptografia ?? null
    ]);
  }

  async cancelarPedidosAtivosAnteriores(medicoId: string): Promise<void> {
    await this.pool.query(
      `update pedidos_nota_medico
       set status = 'cancelado', atualizado_em = now()
       where medico_id = $1
         and status in ('aguardando_confirmacao', 'aguardando_dados_faltantes', 'aguardando_escolha_paciente')`,
      [medicoId]
    );
  }

  async obterDadosMedico(medicoId: string): Promise<{ id: string; nomeCompleto: string; telefone?: string } | null> {
    const sql = `
      select m.id, m.nome_completo, u.telefone
      from medicos m
      join usuarios u on u.id = m.usuario_id
      where m.id = $1
      limit 1
    `;
    const { rows } = await this.pool.query(sql, [medicoId]);
    if (rows.length === 0) return null;
    return {
      id: rows[0].id,
      nomeCompleto: rows[0].nome_completo,
      telefone: rows[0].telefone
    };
  }
}

function mapearLinhaPedido(row: any): PedidoNota {
  return {
    id: row.id,
    medicoId: row.medico_id,
    mensagemId: row.mensagem_id,
    status: row.status,
    pacienteId: row.paciente_id,
    nomePaciente: row.nome_paciente,
    cpfLimpo: row.cpf_limpo,
    telefonePaciente: row.telefone_paciente,
    dataConsulta: row.data_consulta,
    valorCentavos: row.valor_centavos,
    origemDados: row.origem_dados,
    dadosBrutos: row.dados_brutos,
    candidatosMultiplos: row.candidatos_multiplos,
    solicitacaoId: row.solicitacao_id,
    referenciaExterna: row.referencia_externa,
    expiraEm: row.expira_em,
    criadoEm: row.criado_em,
    atualizadoEm: row.atualizado_em
  };
}
