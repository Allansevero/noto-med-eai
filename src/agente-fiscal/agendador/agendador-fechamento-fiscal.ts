/**
 * Agendador em background para fechamento fiscal periódico (1 a 2 vezes ao dia).
 * Realiza a varredura automática de comprovantes para todos os médicos ativos
 * nos horários programados (ex: 12:00 e 18:00) e solicita aprovação no WhatsApp.
 */

import type pg from 'pg';
import { parsearHorariosConfigurados, calcularProximoDisparoMs, type HorarioDisparo } from './calcular-proximo-disparo.js';
import { varrerESolicitarAprovacao } from '../fluxos/varrer-e-solicitar-aprovacao.js';
import { PostgresCandidatosNotaRepositorio } from '../io/postgres-candidatos-nota-repositorio.js';
import type { EnviarMensagemPaciente } from '../../whatsapp/enviar-mensagem-paciente.js';

export interface AgendadorFechamentoFiscalConfig {
  pool: pg.Pool;
  pepper: string;
  enviarMensagem: EnviarMensagemPaciente;
  instanciaNome: string;
  horariosTexto?: string;
  ativo?: boolean;
}

export class AgendadorFechamentoFiscal {
  private timer: NodeJS.Timeout | null = null;
  private readonly horarios: HorarioDisparo[];
  private readonly repositorio: PostgresCandidatosNotaRepositorio;
  private rodando: boolean = false;

  constructor(private readonly config: AgendadorFechamentoFiscalConfig) {
    this.horarios = parsearHorariosConfigurados(config.horariosTexto || '12:00,18:00');
    this.repositorio = new PostgresCandidatosNotaRepositorio(config.pool, config.pepper);
  }

  iniciar(): void {
    if (this.config.ativo === false) {
      console.info('[Agendador Fechamento Fiscal] Desativado por configuração.');
      return;
    }
    this.agendarProximoCiclo();
  }

  parar(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.rodando = false;
  }

  async executarCicloVarredura(): Promise<{ medicosProcessados: number; candidatosNotificados: number }> {
    if (this.rodando) return { medicosProcessados: 0, candidatosNotificados: 0 };
    this.rodando = true;

    let medicosProcessados = 0;
    let candidatosNotificados = 0;

    try {
      // Buscar todos os médicos com perfil fiscal ativo e cadastrado
      const { rows: medicos } = await this.config.pool.query(`
        select m.id, m.nome_completo
        from medicos m
        join medico_perfil_fiscal p on p.medico_id = m.id
        where p.confirmado_pelo_medico = true
      `);

      for (const med of medicos) {
        medicosProcessados += 1;
        try {
          const resultado = await varrerESolicitarAprovacao(med.id, {
            repositorio: this.repositorio,
            enviarMensagem: this.config.enviarMensagem,
            instanciaNome: this.config.instanciaNome
          });

          if (resultado.ok && (resultado.status === 'candidato_encontrado_e_notificado' || resultado.status === 'candidato_encontrado_pendente_conexao_whatsapp')) {
            candidatosNotificados += 1;
            console.info('[Agendador Fechamento Fiscal] Candidato notificado:', {
              medicoId: med.id,
              paciente: resultado.candidato.pacienteNome,
              valor: resultado.candidato.valorFormatado,
              consulta: resultado.candidato.dataConsulta
            });
          }
        } catch (erroMed: any) {
          console.warn('[Agendador Fechamento Fiscal] Erro ao varrer médico:', med.id, erroMed?.message || erroMed);
        }
      }
    } catch (err: any) {
      console.error('[Agendador Fechamento Fiscal] Falha geral no ciclo:', err?.message || err);
    } finally {
      this.rodando = false;
    }

    return { medicosProcessados, candidatosNotificados };
  }

  private agendarProximoCiclo(): void {
    const { proximoHorario, msRestantes } = calcularProximoDisparoMs(this.horarios);
    console.info(`[Agendador Fechamento Fiscal] Próximo ciclo agendado para ${proximoHorario.toISOString()} (em ${Math.round(msRestantes / 1000 / 60)} minutos).`);

    this.timer = setTimeout(async () => {
      console.info('[Agendador Fechamento Fiscal] Iniciando ciclo programado...');
      await this.executarCicloVarredura();
      this.agendarProximoCiclo();
    }, msRestantes);

    this.timer.unref();
  }
}
