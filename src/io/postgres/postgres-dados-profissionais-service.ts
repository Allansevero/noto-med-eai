import type pg from 'pg';
import type { DadosProfissionaisService } from '../../conta/dados-profissionais-service.js';
import { dadosProfissionaisCompletos, interpretarRespostaProfissional, nomeProfissionalValido, normalizarCrm } from '../../conta/validar-dados-emissao.js';
import { perfilProfissionalSchema } from '../../conta/validar-perfil-profissional.js';
import { montarDescricaoServico } from '../../emissao/montar-descricao-servico.js';
import { randomUUID } from 'node:crypto';
import type { ComunicadorNoto, EntradaComunicacaoNoto, ResultadoComunicacaoNoto } from '../../conversa/comunicador-noto.js';
import type { EnviarMensagemPaciente } from '../../whatsapp/enviar-mensagem-paciente.js';

type Medico = {id:string;usuario_id:string;nome_completo:string;crm:string|null;rqe:string|null;especialidade:string|null;telefone:string|null};
/** SQL fixo; destinatário é sempre o usuário do médico, nunca um paciente. */
export class PostgresDadosProfissionaisService implements DadosProfissionaisService {
  private ultimoMedicoNotificado:string|null=null;
  constructor(private readonly pool:pg.Pool, private readonly enviador:EnviarMensagemPaciente, private readonly instanciaOficialNome:string, private readonly comunicador?:ComunicadorNoto, private readonly assistenteContextualAtivo = false) {}
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
  async solicitar(medicoId:string):Promise<void> {
    const pedido=await this.transacao(async client=>{
      const medico=await this.medico(client,medicoId);
      if(!medico || dadosProfissionaisCompletos(medico) || !medico.telefone || !this.instanciaOficialNome) return null;
      if (this.assistenteContextualAtivo && (await client.query(
        'select medico_id from noto_assistente_sessoes where medico_id=$1', [medicoId]
      )).rowCount) return null;
      const reserva=await client.query(`insert into dados_profissionais_pendencias (medico_id, estado)
        values ($1,'reservado') on conflict (medico_id) do update set estado='reservado', atualizado_em=now()
        where dados_profissionais_pendencias.estado='concluido' returning medico_id`,[medicoId]);
      return reserva.rows.length ? {evento:!nomeProfissionalValido(medico.nome_completo)?'pedir_nome' as const:'pedir_crm' as const} : null;
    });
    if(!pedido)return;
    const envio=await this.comunicar({medicoId,chave:`coleta:${randomUUID()}`,evento:pedido.evento});
    if(!envio.envioIniciado){
      await this.pool.query("delete from dados_profissionais_pendencias where medico_id=$1 and estado='reservado'",[medicoId]);
      return;
    }
    await this.pool.query(`update dados_profissionais_pendencias set estado=$2, atualizado_em=now()
      where medico_id=$1 and estado='reservado'`,[medicoId,envio.sucesso?'enviado':'incerto']);
  }
  async processarResposta(entrada:{medicoId:string;texto:string;mensagemId:string;mensagemEm?:Date}):Promise<{tratada:boolean;completo:boolean}> {
    let resposta: EntradaComunicacaoNoto|undefined;
    const resultado=await this.transacao(async client=>{
      const medico=await this.medico(client,entrada.medicoId);
      if(!medico)return {tratada:false,completo:false};
      const completo=dadosProfissionaisCompletos(medico);
      const pendencia=await client.query('select estado from dados_profissionais_pendencias where medico_id=$1 for update',[medico.id]);
      if(!pendencia.rows.length || pendencia.rows[0].estado==='concluido')return {tratada:false,completo};
      if(!entrada.mensagemId)return {tratada:true,completo};
      const mensagem=await client.query(`insert into dados_profissionais_mensagens (medico_id,mensagem_id)
        values ($1,$2) on conflict do nothing returning mensagem_id`,[medico.id,entrada.mensagemId]);
      if(!mensagem.rows.length)return {tratada:true,completo};
      const dados=interpretarRespostaProfissional(entrada.texto,{nomeCompleto:medico.nome_completo,crm:medico.crm});
      if(Object.keys(dados).length){
        // Compartilha a normalização da Conta; o ID autenticado já foi resolvido pelo webhook.
        const normalizado=perfilProfissionalSchema.parse({...dados,medicoId:medico.id});
        await client.query(`update medicos set nome_completo=coalesce($2,nome_completo), crm=coalesce($3,crm),
          rqe=coalesce($4,rqe), atualizado_em=now() where id=$1`,[medico.id,normalizado.nome??null,normalizado.crm??null,normalizado.rqe??null]);
        if(normalizado.nome){
          const usuario=await client.query('update usuarios set nome=$2, atualizado_em=now() where id=$1 returning id',[medico.usuario_id,normalizado.nome]);
          if(usuario.rows.length!==1)throw new Error('Não foi possível salvar o nome do usuário.');
          medico.nome_completo=normalizado.nome;
        }
        medico.crm=normalizado.crm??medico.crm;medico.rqe=normalizado.rqe??medico.rqe;
      }
      const final=dadosProfissionaisCompletos(medico);
      if(final)await this.liberar(client,medico);
      if(medico.telefone && this.instanciaOficialNome){
          resposta={medicoId:medico.id,chave:`resposta:${entrada.mensagemId}`,mensagemRecebida:entrada.texto,
            evento:final?'dados_salvos':!nomeProfissionalValido(medico.nome_completo)?'pedir_nome':'pedir_crm',dados:{dadosSalvos:Object.keys(dados)}};
      }
      return {tratada:true,completo:final};
    });
    // Geração e envio só depois do commit; a IA não escreve dados nem libera fila.
    if(resposta)await this.comunicar(resposta);
    return resultado;
  }
  async retomar(medicoId:string):Promise<number> {
    const total=await this.transacao(async client=>{const medico=await this.medico(client,medicoId);return medico&&dadosProfissionaisCompletos(medico)?this.liberar(client,medico):0;});
    return total;
  }
  private async comunicar(entrada:EntradaComunicacaoNoto):Promise<ResultadoComunicacaoNoto>{
    if(!this.comunicador){console.warn('[NotoConversa] IA não configurada.',{medicoId:entrada.medicoId});return {sucesso:false,envioIniciado:false};}
    try{return await this.comunicador.enviar(entrada);}
    catch{console.warn('[NotoConversa] Geração ou transporte indisponível.',{medicoId:entrada.medicoId});return {sucesso:false,envioIniciado:true};}
  }
  async notificarPendentes():Promise<void> {
    const {rows}=await this.pool.query(`select distinct s.medico_id from solicitacoes_nota s
      join medicos m on m.id=s.medico_id join usuarios u on u.id=m.usuario_id
      where ($1::uuid is null or s.medico_id>$1::uuid)
        and s.status='pendente' and (s.aguardando_dados_profissionais or s.aguardando_confirmacao_medico)
      order by s.medico_id limit 20`,[this.ultimoMedicoNotificado]);
    this.ultimoMedicoNotificado=rows.length===20?rows[rows.length-1].medico_id:null;
    for(const row of rows){
      try{
        const liberadas=await this.retomar(row.medico_id);
        if(liberadas)console.info('[DadosProfissionais]',{etapa:'retomada_automatica',solicitacoesPreparadas:liberadas});
        await this.solicitar(row.medico_id);
      }catch{console.warn('[DadosProfissionais] Aviso pendente:',{medicoId:row.medico_id});}
    }
  }
  private async liberar(client:pg.PoolClient,medico:Medico):Promise<number> {
    const resultado=await client.query(`select s.id, s.xdesc_serv, s.datas_consulta_texto,
      (select string_agg(to_char(a.data_hora,'DD/MM/YYYY'), ', ' order by a.data_hora)
       from solicitacao_nota_agendamentos sa join agendamentos a on a.id=sa.agendamento_id
       where sa.solicitacao_id=s.id and a.medico_id=s.medico_id and a.paciente_id=s.paciente_id) as datas_agendamentos
      from solicitacoes_nota s where s.medico_id=$1 and (s.aguardando_dados_profissionais or s.aguardando_confirmacao_medico) and s.status='pendente' and s.tentativas=0
      and s.bloqueada_em is null and s.bloqueada_por_worker is null
      and not exists(select 1 from notas_fiscais n where n.solicitacao_id=s.id)
      and not exists(select 1 from investigacoes_emissao i where i.solicitacao_id=s.id)
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
    // A confirmação antiga deixou de ser requisito. Esta atualização só remove
    // esse impedimento: tentativas prévias e investigações não são reenfileiradas.
    await client.query(`update solicitacoes_nota set aguardando_confirmacao_medico=false, atualizado_em=now()
      where medico_id=$1 and aguardando_confirmacao_medico and status='pendente'`,[medico.id]);
    await client.query(`update dados_profissionais_pendencias set estado=$2, atualizado_em=now() where medico_id=$1`,[medico.id,'concluido']);
    return liberadas;
  }
}
