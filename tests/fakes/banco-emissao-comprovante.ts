import type pg from 'pg';

/** Somente as queries deste fluxo; serialização, rollback e unicidades são do banco. */
export class BancoEmissaoComprovante {
  ambiente: string | null = 'homologacao';
  paciente = { nome: 'Ana', cpf: '52998224725' };
  consultas = [{ medico_id: 'medico', paciente_id: 'paciente', fonte: 'agenda', id_externo: 'consulta', status: 'realizada', valor_consulta_centavos: 20000, data_hora: '2026-10-18T10:00:00Z' }];
  auditorias: Array<Record<string, any>> = [];
  emissoes: Array<Record<string, any>> = [];
  solicitacoes: Array<Record<string, any>> = [];
  comandos: string[] = [];
  falhar: RegExp | null = null;
  perfilCompleto = true;
  private fila = Promise.resolve();
  pool = { connect: () => this.connect(), query: () => { throw new Error('QUERY_FORA_TRANSACAO'); } } as unknown as pg.Pool;
  async connect() {
    const anterior = this.fila; let liberar!: () => void;
    this.fila = new Promise<void>(resolve => { liberar = resolve; }); await anterior;
    let snapshot: any; let transacao = false;
    return { release: liberar, query: async (texto: string, p: any[] = []) => {
      const sql = texto.replace(/\s+/g, ' ').trim().toLowerCase(); this.comandos.push(sql);
      if (this.falhar?.test(sql)) throw new Error('FALHA_COM_DADO_PRIVADO');
      if (sql === 'begin') { if (transacao) throw new Error('BEGIN_ANINHADO'); transacao = true; snapshot = structuredClone([this.emissoes, this.solicitacoes]); return { rows: [] }; }
      if (sql === 'rollback') { [this.emissoes, this.solicitacoes] = snapshot; return { rows: [] }; }
      if (sql === 'commit' || sql.startsWith('select pg_advisory_xact_lock')) return { rows: [] };
      if (sql.startsWith('select ambiente from medico_perfil_fiscal')) return { rows: [{ ambiente: this.ambiente }] };
      if (sql.includes('from medicos m') && sql.includes('cclass_trib_padrao')) return { rows: [{ medico_id: p[0], nome_completo: 'Medico', confirmado_pelo_medico: this.perfilCompleto, ctrib_nac: '040101', cnbs: '123', crm: '123' }] };
      if (sql.includes('from pacientes p')) return { rows: p[0] === 'medico' && p[1] === 'paciente' ? [this.paciente] : [] };
      if (sql.includes('from public.noto_consultas_sincronizadas')) {
        if (!sql.includes("status = 'realizada'") || !sql.includes('order by data_hora desc')) throw new Error('CONSULTA_SEM_FILTRO');
        return { rows: this.consultas.filter(c => c.medico_id === p[0] && c.paciente_id === p[1] && c.status === 'realizada').sort((a,b) => b.data_hora.localeCompare(a.data_hora)).slice(0,1) };
      }
      if (sql.includes('from public.noto_auditoria_comprovantes')) {
        return { rows: structuredClone(this.auditorias.filter(a => a.medico_id === p[0] && a.lido?.tipo === 'extraido' && a.lido.campos.valorCentavos === p[1] && a.lido.campos.dataPagamento === p[2] && a.lido.campos.nomePagador === p[3] && a.decisao.tipo === 'pedido_nota_pronto').slice(-1)) };
      }
      if (sql.startsWith('select') && sql.includes('from public.noto_emissoes_comprovantes')) return { rows: structuredClone(this.emissoes.filter(e => e.medico_id === p[0] && (e.comprovante_chave === p[1] || (e.fonte === p[2] && e.consulta_id_externo === p[3])))) };
      if (sql.startsWith('insert into public.noto_emissoes_comprovantes')) {
        const [medico_id, fonte, consulta_id_externo, comprovante_chave, auditoria_comprovante_id, estado, erro_codigo] = p;
        if (this.emissoes.some(e => e.medico_id === medico_id && (e.comprovante_chave === comprovante_chave || (e.fonte === fonte && e.consulta_id_externo === consulta_id_externo)))) throw new Error('UNIQUE_EMISSAO');
        const linha = { id: `emissao-${this.emissoes.length}`, medico_id, fonte, consulta_id_externo, comprovante_chave, auditoria_comprovante_id, estado, erro_codigo, solicitacao_id: null };
        this.emissoes.push(linha); return { rows: [{ id: linha.id }] };
      }
      if (sql.startsWith('insert into solicitacoes_nota')) {
        this.solicitacoes.push({ id: `solicitacao-${this.solicitacoes.length}`, ref: p[0], medico_id: p[1], paciente_id: p[2], valor: p[3], descricao: p[4], origem: p[10] });
        return { rows: [{ id: this.solicitacoes.at(-1)!.id }] };
      }
      if (sql.startsWith('update solicitacoes_nota s set servico_fiscal_id')) return { rows: [] };
      if (sql.startsWith('update public.noto_emissoes_comprovantes set solicitacao_id')) { const e = this.emissoes.find(e => e.id === p[0])!; e.solicitacao_id = p[1]; return { rows: [] }; }
      throw new Error(`QUERY_NAO_MODELOU: ${sql}`);
    } };
  }
}
