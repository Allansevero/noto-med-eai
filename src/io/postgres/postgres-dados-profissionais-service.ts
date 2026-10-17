import type pg from 'pg';
import type { DadosProfissionaisService } from '../../conta/dados-profissionais-service.js';
import { dadosProfissionaisCompletos } from '../../conta/validar-dados-emissao.js';
import { montarDescricaoServico } from '../../emissao/montar-descricao-servico.js';

type Medico = {id:string;usuario_id:string;nome_completo:string;crm:string|null;rqe:string|null;especialidade:string|null;telefone:string|null};
/** Retomada fiscal da API após atualização do perfil pelo painel. Não conversa por WhatsApp. */
export class PostgresDadosProfissionaisService implements DadosProfissionaisService {
  private ultimoMedicoNotificado:string|null=null;
  constructor(private readonly pool:pg.Pool) {}
  private async transacao<T>(acao:(client:pg.PoolClient)=>Promise<T>):Promise<T> {
    const client = await this.pool.connect();
    try { await client.query('begin'); const resultado=await acao(client); await client.query('commit'); return resultado; }
    catch(erro){await client.query('rollback');throw erro;} finally{client.release();}
  }
  private async medico(client:pg.PoolClient,id:string):Promise<Medico|undefined> {
    const r=await client.query(`select m.id, m.usuario_id, m.nome_completo, m.crm, m.rqe, m.especialidade, u.telefone
      from medicos m join usuarios u on u.id=m.usuario_id where m.id=$1 for update of m`,[id]);
    return r.rows[0];
  }
  async retomar(medicoId:string):Promise<number> {
    const total=await this.transacao(async client=>{const medico=await this.medico(client,medicoId);return medico&&dadosProfissionaisCompletos(medico)?this.liberar(client,medico):0;});
    return total;
  }
  async notificarPendentes():Promise<void> {
    const {rows}=await this.pool.query(`select distinct s.medico_id from solicitacoes_nota s
      join medicos m on m.id=s.medico_id join usuarios u on u.id=m.usuario_id
      where ($1::uuid is null or s.medico_id>$1::uuid)
        and s.origem='api' and s.status='pendente' and s.aguardando_dados_profissionais and not s.aguardando_confirmacao_medico
      order by s.medico_id limit 20`,[this.ultimoMedicoNotificado]);
    this.ultimoMedicoNotificado=rows.length===20?rows[rows.length-1].medico_id:null;
    for(const row of rows){
      try{
        const liberadas=await this.retomar(row.medico_id);
        if(liberadas)console.info('[DadosProfissionais]',{etapa:'retomada_automatica',solicitacoesPreparadas:liberadas});
      }catch{console.warn('[DadosProfissionais] Aviso pendente:',{medicoId:row.medico_id});}
    }
  }
  private async liberar(client:pg.PoolClient,medico:Medico):Promise<number> {
    const resultado=await client.query(`select s.id, s.xdesc_serv, s.datas_consulta_texto,
      to_char(s.competencia_emissao, 'DD/MM/YYYY') as datas_agendamentos
      from solicitacoes_nota s where s.medico_id=$1 and s.origem='api' and s.aguardando_dados_profissionais and not s.aguardando_confirmacao_medico and s.status='pendente' and s.tentativas=0
      and s.bloqueada_em is null and s.bloqueada_por_worker is null
      and not exists(select 1 from notas_fiscais n where n.solicitacao_id=s.id)
      for update of s`,[medico.id]);
    let liberadas=0;
    for(const s of resultado.rows){
      const datas=s.datas_consulta_texto?.trim() || s.xdesc_serv.match(/\bNAS DATAS\s+(.+)$/i)?.[1] || s.datas_agendamentos || 'DATA A CONFIRMAR';
      const descricao=montarDescricaoServico({nomeCompleto:medico.nome_completo,crm:medico.crm,rqe:medico.rqe,especialidade:medico.especialidade},datas);
      const r=await client.query(`update solicitacoes_nota s set xdesc_serv=$3, aguardando_dados_profissionais=false, aguardando_confirmacao_medico=false,
        fila=case when s.aguardando_data_consulta then null
          when exists(select 1 from pacientes p where p.id=s.paciente_id and p.medico_id=s.medico_id and p.cpf_cnpj_encriptado is not null)
          then 'pronta'::fila_solicitacao_nota else 'pendente_cadastro'::fila_solicitacao_nota end,
        atualizado_em=now() where s.id=$1 and s.medico_id=$2 and (s.aguardando_dados_profissionais or s.aguardando_confirmacao_medico) and s.status='pendente'`,[s.id,medico.id,descricao]);
      liberadas+=r.rowCount??0;
    }
    return liberadas;
  }
}
