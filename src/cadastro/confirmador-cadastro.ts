import { z } from 'zod';
import { ErroNvidiaChat } from '../io/nvidia/chat-client.js';
import { inconsistenciasResposta } from '../agente-conversa/coerencia-resposta.js';
import type { EntradaTurno } from '../agente-conversa/postgres-assistente.js';
import type { GeradorMensagemNoto } from '../conversa/comunicador-noto.js';
import type { EnviarMensagemPaciente } from '../whatsapp/enviar-mensagem-paciente.js';
import { marcarMensagemLida, type LeitorMensagemWhatsApp } from '../whatsapp/marcar-mensagem-lida.js';
import type { DecisorCadastro } from './nvidia-decisor-cadastro.js';
import { validarConfirmacao } from './confirmar-pendencia.js';
import type { PostgresCadastro, AvisoCadastro } from './postgres-cadastro.js';
const textoSchema=z.array(z.string().trim().min(1).max(500)).length(1);
function codigoFalha(e:unknown):string{
 if(e instanceof ErroNvidiaChat&&['IA_NAO_CONFIGURADA','IA_CONEXAO_FALHOU','IA_HTTP_ERRO','IA_RESPOSTA_INVALIDA'].includes(e.codigo))return e.codigo+(e.statusHttp?'_'+e.statusHttp:'');
 return 'CONFIRMACAO_PROCESSAMENTO_FALHOU';
}
export class ConfirmadorCadastro {
 private executando:Promise<void>|null=null;
 constructor(private repo:PostgresCadastro,private decisor:DecisorCadastro,private gerador:GeradorMensagemNoto,private enviar:EnviarMensagemPaciente,
  private instancia:string,private aposConfirmacao?:()=>Promise<void>,private leitor?:LeitorMensagemWhatsApp,private prontoParaEnviar:()=>Promise<boolean>=async()=>true){}
 async receber(e:EntradaTurno):Promise<{processado:boolean}>{
  if(e.instancia!==this.instancia)return {processado:false};
  const processado=await this.repo.enfileirarResposta(e);
  if(processado){
   if(this.leitor&&e.chaveMensagem&&e.contatoTelefone)void marcarMensagemLida(this.leitor,{instanciaNome:e.instancia,mensagemId:e.mensagemId,contatoTelefone:e.contatoTelefone,chaveMensagem:e.chaveMensagem});
   void this.recuperar().catch(()=>console.warn('[Cadastro confirmação]',{codigo:'RECUPERACAO_FALHOU'}));
  }
  return {processado};
 }
 recuperar():Promise<void>{
  if(this.executando)return this.executando;
  this.executando=this.ciclo().finally(()=>{this.executando=null;});return this.executando;
 }
 private async ciclo():Promise<void>{
  for(let i=0;i<5;i++){
   const r=await this.repo.reservarResposta();if(!r)break;
   try{
    const p=r.trabalho.dados.pendencia;
    const patch=p?validarConfirmacao(p,await this.decisor.decidir(p,r.texto),r.texto):null;
    await this.repo.aplicarConfirmacao(r,patch);
    if(patch)await this.aposConfirmacao?.();
   }catch(e){const codigo=codigoFalha(e);await this.repo.falharResposta(r,codigo);console.warn('[Cadastro confirmação]',{fase:'interpretar',codigo});}
  }
  if(!await this.prontoParaEnviar())return;
  for(let i=0;i<5;i++){
   const a=await this.repo.reservarAviso();if(!a)break;
   try{
    if(!a.texto)await this.repo.prepararAviso(a,await this.redigir(a));
    if(!await this.repo.iniciarAviso(a))continue;
    const envio=await this.enviar.enviarTexto({instanciaNome:this.instancia,contatoTelefone:a.telefone,texto:a.texto!});
    if(!envio.sucesso){
     const status=/^HTTP (\d{3})\b/.exec(envio.erro||'')?.[1];
     const rejeitado=status&&[400,401,403,404,422,429].includes(Number(status));
     await this.repo.falharAviso(a,status?'ENVIO_HTTP_'+status:'ENVIO_INDETERMINADO',!!rejeitado);
     continue;
    }
    await this.repo.confirmarAviso(a);
   }catch(e){const codigo=codigoFalha(e);await this.repo.falharAviso(a,codigo);console.warn('[Cadastro confirmação]',{fase:'redigir_enviar',codigo});}
  }
 }
 private async redigir(a:AvisoCadastro):Promise<string>{
  const nome=a.trabalho.dados.nomeConfirmado??null,crm=a.trabalho.snapshot.crm;
  const mensagens=textoSchema.parse(await this.gerador.gerar({evento:'conversa',destinatario:'medico',medico:{nome,crm,rqe:null},caso:null,quantidadeNotasParadas:0,
   mensagemRecebida:a.mensagem_recebida,dados:{fluxo:'confirmacao_cadastro',objetivo:a.tipo,pendencia:a.trabalho.dados.pendencia??null,origemEmpresa:a.trabalho.dados.empresa?.origem,crmOrigem:a.trabalho.dados.crmOrigem??'Cadastro existente'},
   historico:a.trabalho.dados.pendencia?.perguntaConfirmada?[{papel:'noto',texto:a.trabalho.dados.pendencia.perguntaConfirmada}]:[]}));
  const texto=mensagens[0],n=texto.normalize('NFD').replace(/\p{M}/gu,'').toLowerCase();
  if(/\b(paciente|pacientes|periodo|preferencia|preferencias|integracoes|integracao|rqe|treino|sem emitir|tempo.*emitir|sou o noto|aqui e o noto)\b/.test(n) ||
   (a.tipo==='concluido'&&texto.includes('?')) || inconsistenciasResposta(mensagens,{etapa:'concluido',nomeConfirmado:nome??undefined,crmInformado:crm??undefined},[]).length)throw new ErroNvidiaChat('IA_RESPOSTA_INVALIDA');
  return texto;
 }
}
