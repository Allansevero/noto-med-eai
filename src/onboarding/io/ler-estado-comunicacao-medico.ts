import type pg from 'pg';
import type { EstadoComunicacaoMedico } from '../processar-comunicacao-medico.js';
import { consultarStatusOnboarding } from './consultar-status-onboarding.js';

export async function lerEstadoComunicacaoMedico(
  pool: pg.Pool, medicoId: string, agora: Date,
  agenda: EstadoComunicacaoMedico['estado']['agenda'], preparacaoFiscalAtiva: boolean
): Promise<EstadoComunicacaoMedico | null> {
  const status = await consultarStatusOnboarding(pool, medicoId, preparacaoFiscalAtiva);
  if (!status.passos.passo4WhatsappVinculado || !status.passos.passoProfissionalAprovado) return null;
  const { rows } = await pool.query(`select n.data_emissao, n.valor_servicos_centavos, p.nome as paciente
    from notas_fiscais n
    left join solicitacoes_nota s on s.id = n.solicitacao_id and s.medico_id = n.medico_id
    left join pacientes p on p.id = s.paciente_id and p.medico_id = n.medico_id
    where n.medico_id = $1 and n.status = 'autorizada'
    order by n.data_emissao desc, n.id desc limit 1`, [medicoId]);
  const nota = rows[0];
  const dataEmissao = nota ? new Date(nota.data_emissao) : null;
  return { nomeMedico: status.nomeUsuario, estado: { agora, agenda,
    fiscal: { certificado: status.passos.passo3CertificadoValido ? 'ok' : 'problema',
      dadosFiscais: status.passos.passo2FiscalConfirmado ? 'ok' : 'problema' },
    ultimaNota: nota && dataEmissao ? { dataEmissao: dataEmissao.toISOString(), valorCentavos: nota.valor_servicos_centavos,
      diasDesdeEmissao: Math.floor((agora.getTime() - dataEmissao.getTime()) / 86400000), paciente: nota.paciente } : null
  } };
}
