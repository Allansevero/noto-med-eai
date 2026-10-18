import { readFileSync } from 'node:fs';

/** Fake limitado às tabelas/queries deste adaptador; query desconhecida falha. */
export class BancoHistoricoFalso {
  historicos = new Map<string, Record<string, any>>();
  tentativas = new Map<string, Record<string, any>>();
  auditorias: Array<Record<string, any>> = [];
  falhar: RegExp | null = null;
  consultas: string[] = [];
  private fila = Promise.resolve();
  async connect() {
    const anterior = this.fila; let liberar!: () => void;
    this.fila = new Promise<void>(resolve => { liberar = resolve; }); await anterior;
    let snapshot: any;
    return { release: liberar, query: async (texto: string, params: any[] = []): Promise<{ rows: any[] }> => {
      const sql = texto.replace(/\s+/g, ' ').trim().toLowerCase(); this.consultas.push(sql);
      if (this.falhar?.test(sql)) throw new Error('BANCO_FALSO_FALHOU_DADO_PRIVADO');
      const [medico, modo] = params; const chave = JSON.stringify([medico, modo]);
      if (sql === 'begin') { snapshot = structuredClone([this.historicos, this.tentativas, this.auditorias]); return { rows: [] }; }
      if (sql === 'rollback') { [this.historicos, this.tentativas, this.auditorias] = snapshot; return { rows: [] }; }
      if (sql === 'commit' || sql.includes('pg_advisory_xact_lock')) return { rows: [] };
      if (sql.startsWith('insert into public.noto_historico_comunicacao_medico')) {
        if (!this.historicos.has(chave)) this.historicos.set(chave, { medico_id: medico, modo, boas_vindas_em: null,
          pergunta_nota_em: null, pergunta_nota_repeticoes: 0, resposta_nota: null, resposta_recebida_em: null,
          pergunta_agenda_em: null, pergunta_agenda_repeticoes: 0, problema_fiscal_em: null, problema_fiscal_repeticoes: 0,
          agendas_nao_atendidas: [], consultas_listadas: false, aguardando_comprovante: false });
        return { rows: [] };
      }
      if (sql.startsWith('select * from public.noto_historico_comunicacao_medico')) return { rows: structuredClone([this.historicos.get(chave)]) };
      if (sql.startsWith('update public.noto_historico_comunicacao_medico')) {
        Object.assign(this.historicos.get(chave)!, JSON.parse(params[2])); return { rows: [] };
      }
      if (sql.startsWith('select * from public.noto_comunicacao_tentativas')) return { rows: structuredClone([...this.tentativas.values()].filter(t => t.medico_id === medico && t.modo === modo)) };
      if (sql.startsWith('insert into public.noto_comunicacao_tentativas')) {
        const t = JSON.parse(params[2]);
        const schema = readFileSync('scripts/migrations/20261018-historico-comunicacao-medico.sql', 'utf8');
        if (t.acao !== null && !schema.includes("'" + t.acao + "'")) throw new Error('ACAO_FORA_DO_SQL');
        if ((t.acao === 'reperguntar') !== (t.pergunta !== null) || (t.acao === 'agenda_nao_atendida') !== (t.agenda !== null)) throw new Error('CHECK_SQL');
        const acao = t.acao === 'reperguntar' ? t.acao + ':' + t.pergunta : t.acao === 'agenda_nao_atendida' ? t.acao + ':' + t.agenda.trim().toLowerCase() : t.acao;
        if (acao && acao !== 'nenhuma' && [...this.tentativas.values()].some(a => a.medico_id === medico && a.modo === modo && a.chave_acao === acao && a.chave_processamento !== t.chave_processamento)) throw new Error('UNIQUE_ACAO_SQL');
        this.tentativas.set(JSON.stringify([medico, modo, t.chave_processamento]), { ...t, medico_id: medico, modo, chave_acao: acao }); return { rows: [] };
      }
      if (sql.startsWith('select id, dados_novos from public.auditoria')) return { rows: structuredClone(this.auditorias.filter(a => a.entidade_id === params[0] && a.acao === params[1] && a.entidade === params[2])) };
      if (sql.startsWith('insert into public.auditoria')) {
        const row = { id: String(this.auditorias.length + 1), acao: params[0], entidade: params[1], entidade_id: params[2], dados_novos: JSON.parse(params[3]) };
        this.auditorias.push(row); return { rows: [{ id: row.id }] };
      }
      if (sql.startsWith('update public.auditoria')) {
        this.auditorias.find(a => a.id === params[0])!.dados_novos = JSON.parse(params[1]); return { rows: [] };
      }
      throw new Error('QUERY_NAO_SUPORTADA_NO_FAKE: ' + sql);
    } };
  }
}
