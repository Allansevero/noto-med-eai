/**
 * Implementação PostgreSQL da fonte de pacientes cadastrados na clínica (tabela pacientes).
 * Busca por nome parcial sem acento, variações de telefone brasileiro ou hash de CPF,
 * descriptografando o CPF de forma segura com chave simétrica (pgp_sym_decrypt).
 */

import type pg from 'pg';
import { gerarHashCpf } from '../../paciente/hash-cpf.js';
import { gerarVariantesTelefoneBrasileiro } from '../../whatsapp/variantes-telefone-brasileiro.js';
import type { PacienteEncontrado, TermoBuscaPaciente } from '../tipos.js';
import type { FontePacientes } from './fonte-pacientes.js';

export class SupabaseFontePacientes implements FontePacientes {
  readonly nomeFonte = 'supabase';

  constructor(
    private readonly pool: pg.Pool,
    private readonly pepper: string,
    private readonly chaveCriptografia?: string
  ) {}

  async buscar(medicoId: string, termo: TermoBuscaPaciente): Promise<PacienteEncontrado[]> {
    if (!termo.nome && !termo.telefone && !termo.cpf) {
      return [];
    }

    // 1. Busca por CPF se fornecido
    if (termo.cpf) {
      const limpo = termo.cpf.replace(/\D/g, '');
      const hash = gerarHashCpf(limpo, this.pepper);
      const sqlCpf = `
        select id, nome, telefone,
               case
                 when $3::text is not null and cpf_cnpj_encriptado is not null then
                   pgp_sym_decrypt(cpf_cnpj_encriptado, $3::text)
                 else null
               end as cpf_limpo
        from pacientes
        where medico_id = $1 and cpf_cnpj_hash = $2
        limit 5
      `;
      const { rows } = await this.pool.query(sqlCpf, [medicoId, hash, this.chaveCriptografia ?? null]);
      if (rows.length > 0) {
        return this.enriquecerResultados(medicoId, rows);
      }
    }

    // 2. Busca por Telefone se fornecido
    if (termo.telefone) {
      const variantes = gerarVariantesTelefoneBrasileiro(termo.telefone);
      const sqlTel = `
        select id, nome, telefone,
               case
                 when $3::text is not null and cpf_cnpj_encriptado is not null then
                   pgp_sym_decrypt(cpf_cnpj_encriptado, $3::text)
                 else null
               end as cpf_limpo
        from pacientes
        where medico_id = $1 and telefone = any($2)
        limit 5
      `;
      const { rows } = await this.pool.query(sqlTel, [medicoId, variantes, this.chaveCriptografia ?? null]);
      if (rows.length > 0) {
        return this.enriquecerResultados(medicoId, rows);
      }
    }

    // 3. Busca por Nome parcial (case-insensitive)
    if (termo.nome && termo.nome.trim().length >= 2) {
      const partes = termo.nome.trim().split(/\s+/).filter(p => p.length >= 2);
      const condicoes = partes.map((_, idx) => `nome ilike '%' || $${idx + 3} || '%'`).join(' and ');

      const sqlNome = `
        select id, nome, telefone,
               case
                 when $2::text is not null and cpf_cnpj_encriptado is not null then
                   pgp_sym_decrypt(cpf_cnpj_encriptado, $2::text)
                 else null
               end as cpf_limpo
        from pacientes
        where medico_id = $1 ${condicoes ? 'and ' + condicoes : ''}
        order by atualizado_em desc
        limit 5
      `;
      const params = [medicoId, this.chaveCriptografia ?? null, ...partes];
      const { rows } = await this.pool.query(sqlNome, params);
      if (rows.length > 0) {
        return this.enriquecerResultados(medicoId, rows);
      }
    }

    return [];
  }

  private async enriquecerResultados(medicoId: string, rows: any[]): Promise<PacienteEncontrado[]> {
    const lista: PacienteEncontrado[] = [];

    for (const r of rows) {
      // Busca última nota emitida para sugerir o valor habitual
      const { rows: notas } = await this.pool.query(
        `select valor_servico_centavos
         from solicitacoes_nota
         where medico_id = $1 and paciente_id = $2
         order by criado_em desc
         limit 1`,
        [medicoId, r.id]
      ).catch(() => ({ rows: [] }));

      const valorSugerido = notas[0]?.valor_servico_centavos ?? null;

      lista.push({
        pacienteId: r.id,
        nome: r.nome || 'Paciente sem nome',
        cpfLimpo: r.cpf_limpo || null,
        telefone: r.telefone || null,
        origem: 'supabase',
        valorSugeridoCentavos: valorSugerido
      });
    }

    return lista;
  }
}
