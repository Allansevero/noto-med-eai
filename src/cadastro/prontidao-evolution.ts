/** Readiness consulta a mesma rota pública de status já usada pelo onboarding. */
export async function assistenteConectado(config:{url:string;chave:string;instancia:string;instanciaOficial:string},requisitar:typeof fetch=fetch):Promise<boolean>{
 if(!config.url||!config.chave||!config.instancia||config.instancia===config.instanciaOficial)return false;
 try{
  const base=new URL(config.url);if(!['http:','https:'].includes(base.protocol))return false;
  const r=await requisitar(`${config.url.replace(/\/+$/,'')}/instance/connectionState/${encodeURIComponent(config.instancia)}`,{headers:{apikey:config.chave,Accept:'application/json'},redirect:'error',signal:AbortSignal.timeout(5000)});
  if(!r.ok){await r.body?.cancel().catch(()=>{});return false;}
  const d=await r.json();return d?.instance?.state==='open';
 }catch{return false;}
}
