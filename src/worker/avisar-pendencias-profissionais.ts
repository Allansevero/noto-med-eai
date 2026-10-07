/** Avisos independentes da fila de notas prontas; reservas ficam no PostgreSQL. */
export function iniciarAvisosPendenciasProfissionais(
  notificador:{notificarPendentes():Promise<void>}, intervaloMs=60000
){
  let ativo=true;let executando=false;
  const ciclo=async()=>{
    if(!ativo || executando)return;
    executando=true;
    try{await notificador.notificarPendentes();}
    catch{console.warn('[DadosProfissionais] Não foi possível consultar pendências. Verifique a migração.');}
    finally{executando=false;}
  };
  void ciclo();
  const timer=setInterval(()=>{void ciclo();},intervaloMs);
  timer.unref();
  return {parar(){ativo=false;clearInterval(timer);}};
}
