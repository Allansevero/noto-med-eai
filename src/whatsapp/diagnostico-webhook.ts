import type {ResultadoProcessarWebhook} from '../fluxos/processar-mensagem-webhook.js';

const objeto=(v:unknown):Record<string,unknown>=>v && typeof v==='object'&&!Array.isArray(v)?v as Record<string,unknown>:{};
/** Apenas categorias conhecidas. Nunca propagar corpo, instância, mensagem ou JID. */
export function diagnosticoEntradaWebhook(payload:unknown){
 const p=objeto(payload),d=objeto(p.data),k=objeto(d.key);
 const evento=typeof p.event==='string'?p.event.toLowerCase().replaceAll('_','.'):'';
 const jid=typeof k.remoteJid==='string'?k.remoteJid:'';
 return {evento:['messages.upsert','messages.set','messages.update','connection.update','chats.set','contacts.set'].includes(evento)?evento:'outro',
  fromMe:typeof k.fromMe==='boolean'?k.fromMe:undefined,
  tipoContato:jid.endsWith('@lid')?'lid':jid.endsWith('@s.whatsapp.net')?'telefone':jid.endsWith('@g.us')?'grupo':jid.endsWith('@broadcast')?'broadcast':'outro',
  dadosEmLote:Array.isArray(p.data)};
}
export function diagnosticoResultadoWebhook(res:ResultadoProcessarWebhook):Record<string,unknown>{
 if(!res.ok)return {resultado:'rejeitado',motivo:res.motivo};
 const d=objeto(res.detalhe);
 const r:Record<string,unknown>={resultado:d.ok===false?'bloqueado':'processado',acao:res.acao};
 if(res.motivoDescarte)r.motivo=res.motivoDescarte;
 if(res.acao==='comando_emissao'){
  if(typeof d.motivo==='string'&&['paciente_ausente','valor_indisponivel','medico_nao_encontrado','limite_atingido'].includes(d.motivo))r.motivo=d.motivo;
  if(d.fila===null||d.fila==='pronta'||d.fila==='pendente_cadastro')r.fila=d.fila;
  for(const campo of ['aguardandoCpf','aguardandoData','aguardandoDadosProfissionais'])if(typeof d[campo]==='boolean')r[campo]=d[campo];
 }
 return r;
}
export function diagnosticoErroWebhook(erro:unknown):Record<string,string>{
 const code=objeto(erro).code;
 const codigos=['42P01','42703','42883','42501','42P08','42804','22P02','22023','23502','23503','23505','40001','40P01','53300','57014','08006','XX000'];
 return typeof code==='string'&&codigos.includes(code)?{codigo:'BANCO_ERRO',codigoBanco:code}:{codigo:'ERRO_PROCESSAMENTO'};
}
