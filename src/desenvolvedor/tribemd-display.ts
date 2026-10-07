import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
export class TelaVirtualTribemd {
 private constructor(public display:string,private processo:ChildProcess){}
 static async iniciar(signal:AbortSignal,executavel='Xvfb'):Promise<TelaVirtualTribemd>{
  signal.throwIfAborted();
  const p=spawn(executavel,['-displayfd','1','-screen','0','1280x900x24','-nolisten','tcp','-ac'],{stdio:['ignore','pipe','ignore']});
  try{const numero=await new Promise<string>((resolve,reject)=>{
   let texto='';const timer=setTimeout(()=>fim(new Error('DISPLAY_TIMEOUT')),10000);
   const abort=()=>fim(new Error('DISPLAY_CANCELADO'));
   const falha=()=>fim(new Error('DISPLAY_INDISPONIVEL'));
   const dado=(v:Buffer)=>{texto+=v.toString();if(/^\d+\n$/.test(texto))fim(undefined,texto.trim());else if(texto.length>20)falha();};
   function fim(erro?:Error,valor?:string){clearTimeout(timer);signal.removeEventListener('abort',abort);p.removeListener('error',falha);p.removeListener('exit',falha);p.stdout?.removeListener('data',dado);erro?reject(erro):resolve(valor!);}
   p.once('error',falha);p.once('exit',falha);p.stdout!.on('data',dado);signal.addEventListener('abort',abort,{once:true});if(signal.aborted)abort();
  });return new TelaVirtualTribemd(':'+numero,p);
  }catch(erro){p.kill();throw erro;}
 }
 async encerrar(){
  const p=this.processo;if(p.exitCode!==null||p.signalCode!==null)return;
  const fim=once(p,'exit');p.kill('SIGTERM');const timer=setTimeout(()=>p.kill('SIGKILL'),2000);
  try{await fim;}finally{clearTimeout(timer);}
 }
}
