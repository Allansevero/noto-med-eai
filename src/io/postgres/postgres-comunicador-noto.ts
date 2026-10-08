import type pg from 'pg';
import type {ComunicadorNoto, ContextoMensagemNoto, EntradaComunicacaoNoto, GeradorMensagemNoto, ResultadoComunicacaoNoto} from '../../conversa/comunicador-noto.js';
import type {EnviarMensagemPaciente} from '../../whatsapp/enviar-mensagem-paciente.js';

const naoEnviado={sucesso:false,envioIniciado:false};
const incerto={sucesso:false,envioIniciado:true};
const proibida=/cpf|cnpj|cert|senha|password|token|secret|chave|api.?key|sql|query|url|endpoint|payload|xml|stack|erroTecnico/i;
function textoSeguro(valor:unknown,limite=2000):string|null {
 if(typeof valor!=='string')return null;
 return valor.slice(0,8000).replace(/-----BEGIN[\s\S]*?(?:-----END[^\n]*|$)/gi,'')
  .replace(/https?:\/\/\S+/gi,'').replace(/\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}[- .]?\d{2}\b/g,'').replace(/\b\d{3}\.?\d{3}\.?\d{3}[- .]?\d{2}\b/g,'')
  .replace(/\b(?:bearer\s+\S+|(?:token|password|senha|secret|api[_-]?key)\s*[:=]\s*\S+)/gi,'')
  .replace(/\b(?:select\s+[\s\S]*?\bfrom\b|insert\s+into|update\s+\w+\s+set|delete\s+from)[^\n]*/gi,'')
  .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,'').trim().slice(0,limite)||null;
}
function dadosSeguros(valor:unknown,nivel=0):Record<string,unknown> {
 if(!valor || typeof valor!=='object' || Array.isArray(valor) || nivel>2)return {};
 const resultado:Record<string,unknown>={};
 for(const [chave,v] of Object.entries(valor).slice(0,30)){
  if(proibida.test(chave) || chave==='__proto__' || chave==='constructor')continue;
  const k=chave.slice(0,80);
  if(typeof v==='string'){const t=textoSeguro(v,500);if(t)resultado[k]=t;}
  else if(typeof v==='boolean' || typeof v==='number' && Number.isFinite(v))resultado[k]=v;
  else if(v && typeof v==='object' && !Array.isArray(v))resultado[k]=dadosSeguros(v,nivel+1);
 }
 return resultado;
}
function validarMensagens(valor:unknown,c:ContextoMensagemNoto):string[]{
 if(!Array.isArray(valor) || valor.length<1 || valor.length>3 || valor.some(v=>typeof v!=='string' || !v.trim() || v.trim().length>500))throw new Error('formato');
 const mensagens=valor.map(v=>(v as string).trim());const tudo=mensagens.join(' ').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
 if(c.destinatario==='paciente' && /\b(?:crm|rqe)\b|dados profissionais|confirmacao.{0,40}medico|medico.{0,40}confirmacao|outras notas|notas.{0,40}(?:pendentes|paradas)|(?:pendentes|paradas).{0,40}notas/.test(tudo))throw new Error('privacidade_paciente');
 if(mensagens.some(m=>textoSeguro(m,500)!==m))throw new Error('conteudo');
 if(c.caso?.status!=='emitida' && /(?:nota(?:s)?|nfse|nfs-e)\s+(?:foi\s+|foram\s+|ja\s+)?(?:emitid|autorizad)|(?:\bemitimos\b|\bemiti\b|emissao concluida)/.test(tudo))throw new Error('estado');
 if(/suporte.{0,40}(?:encaminhad|acionad|avisad)|(?:encaminh|acion).{0,40}suporte/.test(tudo))throw new Error('suporte');
 const ancora=c.caso??(c.evento==='limite_emissao'?{nomePaciente:typeof c.dados.nomePaciente==='string'?c.dados.nomePaciente:null,telefonePaciente:typeof c.dados.telefonePaciente==='string'?c.dados.telefonePaciente:null,valorCentavos:c.dados.valorCentavos}:null);
 if(c.evento==='limite_emissao' && (!ancora || typeof ancora.valorCentavos!=='number' || !Number.isFinite(ancora.valorCentavos)))throw new Error('contexto_limite');
 if(ancora && ['pedir_nome','pedir_crm','pedir_confirmacao','orientar_confirmacao','pedir_data','limite_emissao','falha_emissao'].includes(c.evento)){
  const primeira=mensagens[0].toLowerCase();const nome=ancora.nomePaciente?.toLowerCase();const telefone=ancora.telefonePaciente?.replace(/\D/g,'');
  if(!(nome && primeira.includes(nome)) && !(telefone && primeira.replace(/\D/g,'').includes(telefone)))throw new Error('paciente');
  const valor=(Number(ancora.valorCentavos)/100).toFixed(2);const reais=Number(valor).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
  const valores=primeira.match(/(?<![\d.,])\d+(?:\.\d{3})*(?:[,.]\d{2})(?!\d|[.,]\d)/g)??[];
  if(!valores.some(v=>[valor,valor.replace('.',','),reais].includes(v)))throw new Error('valor');
 }
 return mensagens;
}

/** SQL fixo, destinatários resolvidos no backend e reserva persistida antes de qualquer rede. */
export class PostgresComunicadorNoto implements ComunicadorNoto {
 constructor(private readonly pool:pg.Pool,private readonly enviador:EnviarMensagemPaciente,private readonly instanciaOficialNome:string,private readonly gerador:GeradorMensagemNoto){}
 async enviar(entrada:EntradaComunicacaoNoto):Promise<ResultadoComunicacaoNoto>{
  let id:string|undefined;let reservado=false;
  try {
   if(!entrada.medicoId || !entrada.chave || entrada.chave.length>300)return naoEnviado;
   const existente=(await this.pool.query('select estado from noto_comunicacoes where medico_id=$1 and chave_evento=$2',[entrada.medicoId,entrada.chave])).rows[0]?.estado;
   if(existente && existente!=='falha_ia')return {sucesso:existente==='enviado',envioIniciado:true};
   const medico=(await this.pool.query(`select m.nome_completo, m.crm, m.rqe, u.telefone
    from medicos m join usuarios u on u.id=m.usuario_id where m.id=$1`,[entrada.medicoId])).rows[0];
   if(!medico)return naoEnviado;
   const paciente=entrada.pacienteId!==undefined || entrada.instanciaPaciente!==undefined;
   if(paciente && (entrada.evento!=='pedir_cpf' || !entrada.pacienteId || !entrada.instanciaPaciente))return naoEnviado;
   let telefone=medico.telefone;let instancia=this.instanciaOficialNome;
   if(paciente){
    const destino=(await this.pool.query(`select p.telefone, w.nome_instancia from pacientes p join whatsapp_instancias w on w.medico_id=p.medico_id
     where p.medico_id=$1 and p.id=$2 and w.nome_instancia=$3`,[entrada.medicoId,entrada.pacienteId,entrada.instanciaPaciente])).rows[0];
    if(!destino)return naoEnviado;telefone=destino.telefone;instancia=destino.nome_instancia;
   }
   if(typeof telefone!=='string' || !telefone.trim() || !instancia)return naoEnviado;
   const limiteSemCaso=entrada.evento==='limite_emissao' && !entrada.solicitacaoId;
   const caso=limiteSemCaso?undefined:(await this.pool.query(`select s.id, p.nome, p.telefone, s.valor_servico_centavos, s.datas_consulta_texto, s.status,
    s.aguardando_dados_profissionais, s.aguardando_confirmacao_medico
    from solicitacoes_nota s join pacientes p on p.id=s.paciente_id and p.medico_id=s.medico_id
    where s.medico_id=$1 ${entrada.solicitacaoId?'and s.id=$2':"and s.status='pendente' and (s.aguardando_dados_profissionais or s.aguardando_confirmacao_medico)"}
    ${paciente?`and p.id=$${entrada.solicitacaoId?3:2}`:''} order by s.criado_em, s.id limit 1`,[entrada.medicoId,...(entrada.solicitacaoId?[entrada.solicitacaoId]:[]),...(paciente?[entrada.pacienteId]:[])])).rows[0];
   if(entrada.solicitacaoId && !caso)return naoEnviado;
   const quantidade=(await this.pool.query(`select count(*)::integer as quantidade from solicitacoes_nota where medico_id=$1
    and status='pendente' and (aguardando_dados_profissionais or aguardando_confirmacao_medico)`,[entrada.medicoId])).rows[0]?.quantidade??0;
   const contexto:ContextoMensagemNoto={evento:entrada.evento,destinatario:paciente?'paciente':'medico',medico:{nome:textoSeguro(medico.nome_completo,200),crm:textoSeguro(medico.crm,80),rqe:textoSeguro(medico.rqe,80)},
    caso:caso?{solicitacaoId:caso.id,nomePaciente:textoSeguro(caso.nome,200),telefonePaciente:caso.telefone,valorCentavos:Number(caso.valor_servico_centavos),datas:textoSeguro(caso.datas_consulta_texto,500),status:caso.status,aguardandoDadosProfissionais:Boolean(caso.aguardando_dados_profissionais),aguardandoConfirmacao:Boolean(caso.aguardando_confirmacao_medico)}:null,
    quantidadeNotasParadas:Number(quantidade),mensagemRecebida:textoSeguro(entrada.mensagemRecebida),dados:dadosSeguros(entrada.dados),historico:[]};
   if(paciente){
    contexto.medico={nome:null,crm:null,rqe:null};contexto.quantidadeNotasParadas=0;contexto.dados={};
    if(contexto.caso){contexto.caso.aguardandoDadosProfissionais=false;contexto.caso.aguardandoConfirmacao=false;}
   }
   const registro=(await this.pool.query(`insert into noto_comunicacoes (medico_id,chave_evento,evento,estado,entrada)
    values ($1,$2,$3,'gerando',$4::jsonb) on conflict (medico_id,chave_evento) do update set estado='gerando', entrada=excluded.entrada,
    mensagens='[]'::jsonb, eventos='[]'::jsonb, atualizado_em=now() where noto_comunicacoes.estado='falha_ia' returning id`,[entrada.medicoId,entrada.chave,entrada.evento,JSON.stringify(contexto)])).rows[0];
   if(!registro){const estado=(await this.pool.query('select estado from noto_comunicacoes where medico_id=$1 and chave_evento=$2',[entrada.medicoId,entrada.chave])).rows[0]?.estado;return {sucesso:estado==='enviado',envioIniciado:true};}
   id=registro.id;
   if(!paciente){
    const anteriores=(await this.pool.query(`select entrada, mensagens, estado, eventos from noto_comunicacoes where medico_id=$1 and estado in ('enviado','incerto')
     and entrada->>'destinatario'='medico' order by criado_em desc, id desc limit 8`,[entrada.medicoId])).rows;
    for(const r of anteriores.reverse()){
     if(r.entrada?.destinatario!=='medico')continue;
     const recebida=textoSeguro(r.entrada?.mensagemRecebida);if(recebida)contexto.historico.push({papel:'medico',texto:recebida});
     const aceitos=new Set<number>(Array.isArray(r.eventos)?r.eventos.filter((e:unknown)=>e && typeof e==='object' && (e as {aceito?:unknown}).aceito===true).map((e:{indice:number})=>e.indice):[]);
     if(Array.isArray(r.mensagens))for(const [indice,v] of r.mensagens.slice(0,3).entries()){
      if(r.estado==='incerto' && !aceitos.has(indice))continue;
      const texto=textoSeguro(v);if(texto)contexto.historico.push({papel:'noto',texto});
     }
    }
   }
   const contextoGravado=await this.pool.query(`update noto_comunicacoes set estado=$2, entrada=$3::jsonb, atualizado_em=now()
    where id=$1 and estado='gerando' returning id`,[id,'gerando',JSON.stringify(contexto)]);
   if(!contextoGravado.rows.length)return incerto;
   let mensagens:string[];
   try{mensagens=validarMensagens(await this.gerador.gerar(contexto),contexto);}
   catch{
    await this.pool.query('update noto_comunicacoes set estado=$2, atualizado_em=now() where id=$1 and estado=\'gerando\'',[id,'falha_ia']);
    console.warn('noto_comunicacao',{fase:'geracao',resultado:'falha'});return naoEnviado;
   }
   // Autocommit desta atualização termina antes do primeiro HTTP.
   const reserva=await this.pool.query(`update noto_comunicacoes set estado=$2, mensagens=$3::jsonb, atualizado_em=now()
    where id=$1 and estado='gerando' returning id`,[id,'reservado',JSON.stringify(mensagens)]);
   if(!reserva.rows.length)return incerto;
   reservado=true;
   for(let indice=0;indice<mensagens.length;indice++){
    let aceito=false;try{aceito=(await this.enviador.enviarTexto({instanciaNome:instancia,contatoTelefone:telefone,texto:mensagens[indice]})).sucesso===true;}catch{/* Persistir somente metadados seguros. */}
    await this.pool.query(`update noto_comunicacoes set estado=$2, eventos=eventos || $3::jsonb, atualizado_em=now()
     where id=$1 and estado='reservado'`,[id,aceito?'reservado':'incerto',JSON.stringify([{indice,aceito}])]);
    if(!aceito)return incerto;
   }
   await this.pool.query(`update noto_comunicacoes set estado=$2, atualizado_em=now() where id=$1 and estado='reservado'`,[id,'enviado']);
   return {sucesso:true,envioIniciado:true};
  }catch{
   console.warn('noto_comunicacao',{fase:reservado?'envio':'preparacao',resultado:'falha'});
   if(reservado && id){try{await this.pool.query('update noto_comunicacoes set estado=$2, atualizado_em=now() where id=$1 and estado=\'reservado\'',[id,'incerto']);}catch{/* Reserva já impede repetição. */}}
   return id?incerto:naoEnviado;
  }
 }
}
