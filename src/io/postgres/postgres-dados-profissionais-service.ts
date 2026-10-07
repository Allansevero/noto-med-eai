import type pg from 'pg';
import type { DadosProfissionaisService } from '../../conta/dados-profissionais-service.js';
import { dadosProfissionaisCompletos, interpretarRespostaProfissional, nomeProfissionalValido, normalizarCrm } from '../../conta/validar-dados-emissao.js';
import { perfilProfissionalSchema } from '../../conta/validar-perfil-profissional.js';
import { montarDescricaoServico } from '../../emissao/montar-descricao-servico.js';
import type { EnviarMensagemPaciente } from '../../whatsapp/enviar-mensagem-paciente.js';

type Medico = {id:string;usuario_id:string;nome_completo:string;crm:string|null;rqe:string|null;especialidade:string|null;telefone:string|null};
/** SQL fixo; destinatário é sempre o usuário do médico, nunca um paciente. */
export class PostgresDadosProfissionaisService implements DadosProfissionaisService {
  constructor(private readonly pool:pg.Pool, private readonly enviador:EnviarMensagemPaciente, private readonly instanciaOficialNome:string) {}
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
    const telefone=await this.transacao(async client=>{
      const medico=await this.medico(client,medicoId);
      if(!medico || dadosProfissionaisCompletos(medico) || !medico.telefone || !this.instanciaOficialNome) return null;
      const reserva=await client.query(`insert into dados_profissionais_pendencias (medico_id, estado)
        values ($1,'reservado') on conflict (medico_id) do update set estado='reservado', atualizado_em=now()
        where dados_profissionais_pendencias.estado='concluido' returning medico_id`,[medicoId]);
      return reserva.rows.length ? medico.telefone : null;
    });
    if(!telefone)return;
    // Commit precede a rede: timeout ou queda após envio nunca gera segundo prompt.
    let estado='incerto';
    try {
      const r=await this.enviador.enviarTexto({instanciaNome:this.instanciaOficialNome,contatoTelefone:telefone,
        texto:'Para emitir sua nota preciso do seu nome completo e CRM. Responda nesta conversa:\nNome completo: seu nome\nCRM: número/UF\nRQE: número (opcional)\nVocê também pode enviar primeiro o nome completo e depois o CRM.'});
      if(r.sucesso)estado='enviado';
    } catch { /* Resultado de transporte incerto: preservar reserva. */ }
    await this.pool.query(`update dados_profissionais_pendencias set estado=$2, atualizado_em=now()
      where medico_id=$1 and estado='reservado'`,[medicoId,estado]);
  }
  async processarResposta(entrada:{medicoId:string;texto:string;mensagemId:string}):Promise<{tratada:boolean;completo:boolean}> {
    let resposta: {telefone:string;texto:string}|undefined;
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
        const faltantes=[];
        if(!nomeProfissionalValido(medico.nome_completo))faltantes.push('Nome completo: seu nome completo real');
        if(!normalizarCrm(medico.crm))faltantes.push('CRM: número/UF');
        resposta={telefone:medico.telefone,texto:final
          ? 'Dados profissionais salvos. As solicitações prontas poderão continuar; a emissão ainda depende dos dados do paciente, da data da consulta e da validação fiscal.'
          : 'Ainda preciso dos seguintes dados para liberar o perfil profissional. Responda nesta conversa:\n'+faltantes.join('\n')};
      }
      return {tratada:true,completo:final};
    });
    // Não manter locks do banco durante a rede. A dedupe já foi confirmada no commit.
    if(resposta){
      try{await this.enviador.enviarTexto({instanciaNome:this.instanciaOficialNome,contatoTelefone:resposta.telefone,texto:resposta.texto});}
      catch{/* Falha de transporte não desfaz o perfil salvo nem repete esta resposta. */}
    }
    return resultado;
  }
  async retomar(medicoId:string):Promise<number> {
    return this.transacao(async client=>{const medico=await this.medico(client,medicoId);return medico&&dadosProfissionaisCompletos(medico)?this.liberar(client,medico):0;});
  }
  private async liberar(client:pg.PoolClient,medico:Medico):Promise<number> {
    const resultado=await client.query(`select s.id, s.xdesc_serv, s.datas_consulta_texto,
      (select string_agg(to_char(a.data_hora,'DD/MM/YYYY'), ', ' order by a.data_hora)
       from solicitacao_nota_agendamentos sa join agendamentos a on a.id=sa.agendamento_id
       where sa.solicitacao_id=s.id and a.medico_id=s.medico_id and a.paciente_id=s.paciente_id) as datas_agendamentos
      from solicitacoes_nota s where s.medico_id=$1 and s.aguardando_dados_profissionais
      and s.status='pendente' and s.tentativas=0
      and not exists(select 1 from notas_fiscais n where n.solicitacao_id=s.id)
      and not exists(select 1 from investigacoes_emissao i where i.solicitacao_id=s.id)
      for update of s`,[medico.id]);
    let liberadas=0;
    for(const s of resultado.rows){
      const datas=s.datas_consulta_texto?.trim() || s.xdesc_serv.match(/\bNAS DATAS\s+(.+)$/i)?.[1] || s.datas_agendamentos || 'DATA A CONFIRMAR';
      const descricao=montarDescricaoServico({nomeCompleto:medico.nome_completo,crm:medico.crm,rqe:medico.rqe,especialidade:medico.especialidade},datas);
      const r=await client.query(`update solicitacoes_nota s set xdesc_serv=$3, aguardando_dados_profissionais=false,
        fila=case when s.aguardando_data_consulta then null
          when exists(select 1 from pacientes p where p.id=s.paciente_id and p.medico_id=s.medico_id and p.cpf_cnpj_encriptado is not null)
          then 'pronta'::fila_solicitacao_nota else 'pendente_cadastro'::fila_solicitacao_nota end,
        atualizado_em=now() where s.id=$1 and s.medico_id=$2 and s.aguardando_dados_profissionais and s.status='pendente'`,[s.id,medico.id,descricao]);
      liberadas+=r.rowCount??0;
    }
    await client.query(`update dados_profissionais_pendencias set estado=$2, atualizado_em=now() where medico_id=$1`,[medico.id,'concluido']);
    return liberadas;
  }
}
