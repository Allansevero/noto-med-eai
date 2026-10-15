/**
 * Implementação da busca de pacientes a partir das conversas de WhatsApp da clínica.
 * Localiza contatos por nome ou telefone em whatsapp_conversas e enriquece
 * com dados de comprovantes recentes ou mensagens da conversa.
 */

import type pg from 'pg';
import { gerarVariantesTelefoneBrasileiro } from '../../whatsapp/variantes-telefone-brasileiro.js';
import type { PacienteEncontrado, TermoBuscaPaciente } from '../tipos.js';
import type { FontePacientes } from './fonte-pacientes.js';

export class ConversaFontePacientes implements FontePacientes {
  readonly nomeFonte = 'conversa';

  constructor(
    private readonly pool: pg.Pool,
    private readonly chaveCriptografia?: string
  ) {}

  async buscar(medicoId: string, termo: TermoBuscaPaciente): Promise<PacienteEncontrado[]> {
    if (!termo.nome && !termo.telefone) {
      return [];
    }

    // 1. Busca por Telefone nas conversas
    if (termo.telefone) {
      const variantes = gerarVariantesTelefoneBrasileiro(termo.telefone);
      const sqlTel = `
        select wc.id as conversa_id, wc.contato_nome, wc.contato_telefone, wc.paciente_id,
               p.nome as paciente_nome,
               case
                 when $3::text is not null and p.cpf_cnpj_encriptado is not null then
                   pgp_sym_decrypt(p.cpf_cnpj_encriptado, $3::text)
                 else null
               end as cpf_limpo
        from whatsapp_conversas wc
        left join pacientes p on p.id = wc.paciente_id
        where wc.medico_id = $1 and wc.contato_telefone = any($2)
        order by wc.ultima_mensagem_em desc nulls last
        limit 5
      `;
      const { rows } = await this.pool.query(sqlTel, [medicoId, variantes, this.chaveCriptografia ?? null]);
      if (rows.length > 0) {
        return this.enriquecerComComprovantes(medicoId, rows);
      }
    }

    // 2. Busca por Nome nas conversas
    if (termo.nome && termo.nome.trim().length >= 2) {
      const partes = termo.nome.trim().split(/\s+/).filter(p => p.length >= 2);
      const condicoes = partes.map((_, idx) => `wc.contato_nome ilike '%' || $${idx + 3} || '%'`).join(' and ');

      const sqlNome = `
        select wc.id as conversa_id, wc.contato_nome, wc.contato_telefone, wc.paciente_id,
               p.nome as paciente_nome,
               case
                 when $2::text is not null and p.cpf_cnpj_encriptado is not null then
                   pgp_sym_decrypt(p.cpf_cnpj_encriptado, $2::text)
                 else null
               end as cpf_limpo
        from whatsapp_conversas wc
        left join pacientes p on p.id = wc.paciente_id
        where wc.medico_id = $1 and ${condicoes}
        order by wc.ultima_mensagem_em desc nulls last
        limit 5
      `;
      const { rows } = await this.pool.query(sqlNome, [medicoId, this.chaveCriptografia ?? null, ...partes]);
      if (rows.length > 0) {
        return this.enriquecerComComprovantes(medicoId, rows);
      }
    }

    return [];
  }

  private async enriquecerComComprovantes(medicoId: string, rows: any[]): Promise<PacienteEncontrado[]> {
    const lista: PacienteEncontrado[] = [];

    for (const r of rows) {
      // Busca valor e data de candidato de emissão recente dessa conversa
      const { rows: candidatos } = await this.pool.query(
        `select valor_centavos, data_pagamento
         from candidatos_emissao
         where medico_id = $1 and (conversa_id = $2 or telefone_paciente = $3)
         order by criado_em desc
         limit 1`,
        [medicoId, r.conversa_id, r.contato_telefone]
      ).catch(() => ({ rows: [] }));

      const cand = candidatos[0];
      const nomeFinal = r.paciente_nome || r.contato_nome || 'Paciente';

      lista.push({
        pacienteId: r.paciente_id || undefined,
        nome: nomeFinal,
        cpfLimpo: r.cpf_limpo || null,
        telefone: r.contato_telefone || null,
        origem: 'conversa',
        detalheOrigem: `Conversa no WhatsApp (${r.contato_telefone})`,
        dataConsultaSugerida: cand?.data_pagamento ? cand.data_pagamento.toISOString().split('T')[0] : null,
        valorSugeridoCentavos: cand?.valor_centavos ?? null
      });
    }

    return lista;
  }
}
