import type { PostgresCasosRepositorio } from './repositorio.js';
import type { CasoFiscal, EventoAgente } from './modelo.js';
import type { LocalizadorCandidatos } from './localizar-candidatos.js';
import type { ServicoEmissaoCasos } from './servico-emissao.js';
import { interpretarRespostaCaso, type InterpretadorCaso } from '../regras/interpretar-resposta-caso.js';

/** Único executor de intenções. A IA interpreta; este serviço autoriza transições. */
export class OrquestradorCasos {
  constructor(private repo: PostgresCasosRepositorio, private localizador: LocalizadorCandidatos,
    private emissao: ServicoEmissaoCasos, private interpretador: InterpretadorCaso) {}

  async processar(evento: EventoAgente): Promise<void> {
    const p = evento.payload as { texto?: string; telefone?: string; mensagemCitadaId?: string; tarefa?: string; casoRecebidoId?: string | null; perguntaRecebidaId?: string | null; instanteMensagem?: number };
    if (!p.telefone) throw new Error('DESTINATARIO_AUSENTE');
    let caso = await this.repo.obterAtivo(evento.medicoId);
    // Retomada após crash: efeitos e resposta já persistidos juntos.
    if (caso?.dados.ultimoEventoId === evento.id) return;
    if (p.tarefa === 'avancar') { if (caso && !caso.perguntaPendente) await this.preparar(caso, evento); return; }
    if (p.tarefa === 'continuar_busca') { await this.buscar(evento, true); return; }
    if (p.tarefa === 'varrer') {
      if (!caso) await this.buscar(evento);
      else if (!caso.perguntaPendente) await this.preparar(caso, evento);
      return;
    }
    const texto = p.texto?.trim() || '';
    if (caso && /^reenviar pergunta[.!]?$/i.test(texto)) {
      await this.preparar(caso, evento); return;
    }
    if (caso?.perguntaPendente?.enviadaEm && p.instanteMensagem !== undefined &&
      (!Number.isFinite(p.instanteMensagem) || p.instanteMensagem < Math.floor(Date.parse(caso.perguntaPendente.enviadaEm) / 1000))) {
      await this.responder(evento, 'Essa mensagem é anterior à pergunta atual. Responda novamente à pergunta mais recente.'); return;
    }
    if (caso && (p.casoRecebidoId !== caso.id || p.perguntaRecebidaId !== (caso.perguntaPendente?.mensagemId ?? null))) {
      await this.responder(evento, 'A tarefa mudou desde o recebimento desta mensagem. Responda à pergunta mais recente para confirmar o caso correto.');
      return;
    }
    if (caso?.perguntaPendente && !caso.perguntaPendente.mensagemId) {
      await this.responder(evento, 'A entrega da pergunta anterior não foi confirmada. Se não a recebeu, diga “reenviar pergunta”. Nenhuma emissão foi autorizada.');
      return;
    }
    const decisao = await interpretarRespostaCaso({
      casoId: caso?.id ?? 'sem_caso', estado: caso?.estado ?? 'sem_caso',
      campoSolicitado: caso?.perguntaPendente?.campo,
      perguntaMensagemId: caso?.perguntaPendente?.mensagemId,
      mensagemCitadaId: p.mensagemCitadaId, pacienteNome: caso?.candidato.pacienteNome ?? ''
    }, texto, this.interpretador);
    if (!caso) {
      if (decisao.intencao === 'consultar') {
        const casos = await this.repo.listar(evento.medicoId, 5);
        await this.responder(evento, casos.length ? casos.map(c => `${c.candidato.pacienteNome}: ${c.estado.replace(/_/g, ' ')}.`).join('\n') :
          'Ainda não há casos registrados. Diga “buscar notas” para analisar os comprovantes.');
      } else if (decisao.intencao === 'buscar_candidatos') await this.buscar(evento);
      else await this.responder(evento, 'Posso buscar comprovantes dos últimos 15 dias e ajudar nas notas pendentes. Diga “buscar notas” para começar.');
      return;
    }
    if (p.mensagemCitadaId && p.mensagemCitadaId !== caso.perguntaPendente?.mensagemId) {
      await this.responder(evento, 'Essa resposta cita outra mensagem. Responda à pergunta mais recente sobre a nota pendente.');
      return;
    }
    if (decisao.intencao === 'recusar' || decisao.intencao === 'adiar' || decisao.intencao === 'ja_emitida') {
      const estado = decisao.intencao === 'recusar' ? 'recusado' : decisao.intencao === 'adiar' ? 'adiado' : 'em_revisao';
      await this.transicionar(caso, evento, { estado, perguntaPendente: null,
        adiadoAte: estado === 'adiado' ? new Date(Date.now() + 86400000) : null,
        dados: { ...caso.dados, revisaoManual: decisao.intencao === 'ja_emitida', motivo: decisao.evidencia } },
        estado === 'recusado' ? 'Certo, essa nota foi recusada e não será encaminhada para emissão.' :
          estado === 'adiado' ? 'Adiei esse caso por um dia. Nenhuma emissão foi autorizada.' :
            'Registrei que essa nota já foi emitida. O caso ficou em revisão, sem nova emissão.');
      return;
    }
    if (decisao.intencao === 'informar_dados' && caso.estado === 'aguardando_dados') {
      if (!caso.perguntaPendente?.mensagemId) {
        await this.responder(evento, 'A pergunta anterior ainda não tem entrega confirmada. Aguarde antes de informar dados.'); return;
      }
      const campo = caso.perguntaPendente.campo;
      const dados = decisao.dados || {};
      if (!['cpf', 'nome', 'dataConsulta'].includes(campo) || !dados[campo as keyof typeof dados]) {
        await this.responder(evento, `Preciso do campo ${campo} do paciente ${caso.candidato.pacienteNome}.`); return;
      }
      const somenteSolicitado = { [campo]: dados[campo as keyof typeof dados] };
      await this.emissao.salvarDados({ medicoId: caso.medicoId, pacienteId: String(caso.dados.pacienteId), dados: somenteSolicitado });
      const candidato = { ...caso.candidato };
      if (campo === 'nome') candidato.pacienteNome = dados.nome!;
      if (campo === 'dataConsulta') {
        const d = dados.dataConsulta!;
        candidato.dataConsultaIso = d.includes('/') ? d.split('/').reverse().map((v, i) => i ? v.padStart(2, '0') : v).join('-') : d;
        candidato.dataConsulta = candidato.dataConsultaIso.split('-').reverse().join('/');
      }
      // Não guardar CPF em JSON de estado, somente no cadastro criptografado.
      caso = { ...caso, candidato };
      await this.preparar(caso, evento);
      return;
    }
    if (decisao.intencao === 'aprovar' && caso.estado === 'aguardando_aprovacao' && caso.perguntaPendente?.mensagemId) {
      const preparada = await this.emissao.preparar(caso.medicoId, caso.candidato);
      if (preparada.camposFaltantes.length || preparada.impressaoDados !== caso.dados.impressaoDados) { await this.preparar(caso, evento); return; }
      const resultado = await this.emissao.enfileirar({ medicoId: caso.medicoId, pacienteId: preparada.pacienteId,
        casoId: caso.id, candidato: caso.candidato, solicitacaoId: caso.solicitacaoId, impressaoDados: preparada.impressaoDados });
      await this.transicionar(caso, evento, { estado: 'enfileirado', solicitacaoId: resultado.solicitacaoId,
        perguntaPendente: null, dados: { ...caso.dados, aprovacao: { mensagemId: evento.mensagemId, evidencia: decisao.evidencia } } },
      'Aprovação registrada. Essa nota foi encaminhada para a fila de emissão. A autorização fiscal será informada quando concluída.');
      return;
    }
    if (!caso.perguntaPendente && !caso.dados.revisaoManual) { await this.preparar(caso, evento); return; }
    await this.responder(evento, caso.perguntaPendente?.texto || 'Esse caso está em revisão. Nenhuma nova emissão foi autorizada.');
  }

  private async buscar(evento: EventoAgente, silencioso = false) {
    const resultado = await this.localizador.localizar(evento.medicoId);
    for (const candidato of resultado.candidatos) await this.repo.criarOuObter(evento.medicoId, candidato);
    if (resultado.incompleto) await this.repo.enfileirarEvento({ medicoId: evento.medicoId,
      instanciaNome: evento.instanciaNome, mensagemId: `continuacao:${evento.id}`,
      payload: { tarefa: 'continuar_busca', telefone: evento.payload.telefone } });
    const caso = await this.repo.obterAtivo(evento.medicoId);
    if (caso) {
      if (!caso.perguntaPendente) await this.preparar(caso, evento);
      return;
    }
    if (silencioso) return;
    await this.responder(evento, resultado.incompleto || resultado.revisoes
      ? 'A busca ainda tem documentos pendentes de análise ou revisão. Não posso afirmar que não existem notas pendentes.'
      : 'Não encontrei novos pagamentos elegíveis para emissão nos últimos 15 dias. Casos já encaminhados ou recusados não são reapresentados.');
  }

  private async preparar(caso: CasoFiscal, evento: EventoAgente) {
    const motivos = (caso.candidato.motivosRevisao || []).filter(m => !['Data da consulta não confirmada na conversa.', 'Nome do paciente não confirmado.'].includes(m));
    if (caso.dados.revisaoManual || motivos.length) {
      await this.transicionar(caso, evento, { estado: 'em_revisao', perguntaPendente: null,
        dados: { ...caso.dados, revisaoManual: true, motivos } },
        'Há dúvida na associação entre pagamento e nota fiscal. Separei esse caso para revisão, sem autorizar emissão.');
      return;
    }
    const preparado = await this.emissao.preparar(caso.medicoId, caso.candidato);
    if (preparado.pacienteNome) caso.candidato = { ...caso.candidato, pacienteNome: preparado.pacienteNome };
    const campo: string = preparado.camposFaltantes.length ? preparado.camposFaltantes[0] : 'aprovacao';
    const texto = campo === 'aprovacao'
      ? `Posso emitir a nota de ${caso.candidato.pacienteNome}, R$ ${caso.candidato.valorFormatado}, consulta em ${caso.candidato.dataConsulta}? Responda aprovar, recusar ou adiar.`
      : `Para preparar a nota de ${caso.candidato.pacienteNome}, informe ${campo === 'cpf' ? 'o CPF' : campo === 'nome' ? 'o nome completo do paciente' : 'a data da consulta (DD/MM/AAAA)'}.`;
    await this.transicionar(caso, evento, {
      candidato: caso.candidato, estado: campo === 'aprovacao' ? 'aguardando_aprovacao' : 'aguardando_dados',
      perguntaPendente: { campo, mensagemId: null, texto }, adiadoAte: null,
      dados: { ...caso.dados, pacienteId: preparado.pacienteId, impressaoDados: preparado.impressaoDados }
    }, texto, true);
  }

  private async responder(evento: EventoAgente, texto: string) {
    await this.repo.enfileirarEvento({ medicoId: evento.medicoId, instanciaNome: evento.instanciaNome,
      mensagemId: `resposta:${evento.id}`, tipo: 'saida', payload: { texto, telefone: evento.payload.telefone } });
  }

  private async transicionar(caso: CasoFiscal, evento: EventoAgente,
    patch: Parameters<PostgresCasosRepositorio['atualizar']>[2], texto: string, pergunta = false) {
    const atualizado = await this.repo.transicionarComSaida(caso.id, caso.revisao,
      { ...patch, dados: { ...caso.dados, ...patch.dados, ultimoEventoId: evento.id } },
      { instanciaNome: evento.instanciaNome, mensagemId: `resposta:${evento.id}`, payload: {
        texto, telefone: evento.payload.telefone, casoId: caso.id, pergunta,
        revisaoPergunta: caso.revisao + 1
      } });
    if (!atualizado) throw new Error('CASO_CONCORRENTE');
  }
}
