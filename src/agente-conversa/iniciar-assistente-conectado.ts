import type pg from 'pg';
import type { EnviarMensagemPaciente } from '../whatsapp/enviar-mensagem-paciente.js';
import type { GerenciadorConversaOnboarding, EstadoAssistenteMedico } from './gerenciador-conversa-onboarding.js';

/** A mesma reserva atende webhook, consulta de status e recuperação ao iniciar.
 * Reservas sem confirmação de entrega nunca são reenviadas automaticamente.
 * A auditoria existente permite instalar a correção sem migração adicional.
 */
export async function iniciarAssistenteConectado(deps: {
  pool: pg.Pool;
  gerenciador: GerenciadorConversaOnboarding;
  salvarEstado: (medicoId: string, estado: EstadoAssistenteMedico) => Promise<void>;
  enviar: EnviarMensagemPaciente;
  instanciaNome: string;
  aoConfirmarApresentacao?: (medicoId:string, estado:EstadoAssistenteMedico, mensagens:string[], chave:string) => Promise<void>;
}, medicoId: string): Promise<void> {
  const client = await deps.pool.connect();
  let medico: { nome_completo?: string; telefone: string; conectado: boolean };
  let reservaId: string;
  try {
    await client.query('begin');
    const { rows } = await client.query(`select m.nome_completo, u.telefone,
      exists (select 1 from whatsapp_instancias w where w.medico_id = m.id
        and w.oficial = false and w.status = 'conectado') as conectado
      from medicos m join usuarios u on u.id = m.usuario_id
      where m.id = $1 and u.ativo = true for update of m`, [medicoId]);
    medico = rows[0];
    if (!medico?.conectado || !medico.telefone) {
      await client.query('commit');
      return;
    }
    const anterior = await client.query(`select id from auditoria a
      where entidade = 'medicos' and entidade_id = $1
        and acao in ('estado_onboarding_assistente', 'reserva_apresentacao_assistente')
        and (acao = 'estado_onboarding_assistente' or not (
          coalesce((select r.dados_novos->>'estado' = 'falha_preparacao' and r.criado_em < now()-interval '1 minute'
            from auditoria r where r.entidade_id=$1 and r.acao='resultado_apresentacao_assistente'
              and r.dados_novos->>'reservaId'=a.id::text order by r.criado_em desc limit 1),false)
          and (select count(*) from auditoria r where r.entidade_id=$1 and r.acao='reserva_apresentacao_assistente') < 3
        ))
      limit 1`, [medicoId]);
    if (anterior.rows.length) {
      await client.query('commit');
      return;
    }
    reservaId = (await client.query(`insert into auditoria (acao, entidade, entidade_id, dados_novos)
      values ('reserva_apresentacao_assistente', 'medicos', $1, $2::jsonb) returning id`,
    [medicoId, JSON.stringify({ estado: 'reservado', instancia: deps.instanciaNome })])).rows[0].id;
    await client.query('commit');
  } catch (erro) {
    await client.query('rollback');
    throw erro;
  } finally {
    client.release();
  }

  let mensagensConfirmadas = 0;
  let envioIniciado = false;
  const registrar = async (estado: string) => deps.pool.query(
    `insert into auditoria (acao, entidade, entidade_id, dados_novos)
     values ('resultado_apresentacao_assistente', 'medicos', $1, $2::jsonb)`,
    [medicoId, JSON.stringify({ reservaId, estado, mensagensConfirmadas })]
  );
  try {
    const resposta = await deps.gerenciador.iniciarAoConectar(medicoId, medico.nome_completo,
      undefined, { persistirEstado: false });
    for (const texto of resposta.mensagensEnviar) {
      envioIniciado = true;
      const resultado = await deps.enviar.enviarTexto({ instanciaNome: deps.instanciaNome,
        contatoTelefone: medico.telefone, texto });
      if (!resultado.sucesso) {
        // O cliente atual também retorna false em timeouts: entrega é incerta.
        await registrar('incerto');
        const statusHttp = /^HTTP (\d{3})\b/.exec(resultado.erro || '')?.[1];
        console.warn('[Onboarding Assistente]', { medicoId, etapa: 'envio', estado: 'incerto',
          mensagensConfirmadas, ...(statusHttp ? { statusHttp: Number(statusHttp) } : {}) });
        return;
      }
      mensagensConfirmadas++;
    }
    await deps.salvarEstado(medicoId, resposta.novoEstado);
    await registrar('enviado');
    await deps.aoConfirmarApresentacao?.(medicoId, resposta.novoEstado, resposta.mensagensEnviar, reservaId);
    console.info('[Onboarding Assistente]', { medicoId, estado: 'enviado', mensagensConfirmadas });
  } catch (erro) {
    await registrar(envioIniciado ? 'incerto' : 'falha_preparacao');
    throw erro;
  }
}

export function criarDisparadorAssistente(deps: Parameters<typeof iniciarAssistenteConectado>[0]) {
  return (medicoId: string): void => {
    void iniciarAssistenteConectado(deps, medicoId).catch(() => {
      console.warn('[Onboarding Assistente]', { medicoId, etapa: 'inicio', estado: 'falha' });
    });
  };
}
