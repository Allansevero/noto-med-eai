import { chromium, type Browser } from 'playwright-core';
import { nomeProfissionalValido, normalizarCrm } from '../conta/validar-dados-emissao.js';
import type { DadosMedicoOnline } from '../medico/io/buscar-medico-online.js';
import type { ConsultaRegistro, ResultadoConsulta } from './consultas.js';
export const CFM_BUSCA_URL='https://portal.cfm.org.br/busca-medicos/';
const normal=(s:string)=>s.normalize('NFD').replace(/\p{M}/gu,'').toUpperCase().replace(/\s+/g,' ').trim();
export interface CartaoCfm {nome:string;texto:string}
export function extrairRegistrosCfm(nome:string,cartoes:CartaoCfm[]):DadosMedicoOnline[]{
 const encontrados:DadosMedicoOnline[]=[];
 for(const card of cartoes){
  if(normal(card.nome.replace(/\s*\(nome de registro\)\s*$/i,''))!==normal(nome))continue;
  const crm=card.texto.match(/\bCRM:\s*([\d.\s-]+)\s*\/\s*([A-Z]{2})\b/i);
  if(!crm)continue;
  const numero=crm[1].replace(/[.\s-]/g,''),uf=crm[2].toUpperCase();
  if(!normalizarCrm(`${numero}/${uf}`))continue;
  const rqes=[...new Set([...card.texto.matchAll(/\bRQE\s*(?:N[º°O.]?\s*)?[:\-]?\s*(\d+)/gi)].map(m=>m[1]))];
  encontrados.push({nomeCompleto:nome.trim(),crm:numero,uf,rqe:rqes.length===1?rqes[0]:null,rqes,
   origem:'Consulta pública do CFM',urlOrigem:CFM_BUSCA_URL,verificado:false});
 }
 return [...new Map(encontrados.map(r=>[`${r.crm}/${r.uf}`,r])).values()];
}

/** Opera o formulário público pelo navegador. Não resolve nem contorna desafios. */
export class CfmConsultaRegistro implements ConsultaRegistro {
 constructor(private executavel:string,private abrir:()=>Promise<Browser>=()=>chromium.launch({executablePath:executavel,headless:true,args:['--no-sandbox','--disable-dev-shm-usage']})){}
 async buscar(nome:string):Promise<ResultadoConsulta<DadosMedicoOnline[]>>{
  if(!nomeProfissionalValido(nome))return {estado:'indisponivel',codigo:'CFM_NOME_INVALIDO'};
  let browser:Browser|undefined;
  try{
   browser=await this.abrir();const page=await browser.newPage();page.setDefaultTimeout(15000);
   page.on('dialog',dialog=>void dialog.dismiss());
   await page.goto(CFM_BUSCA_URL,{waitUntil:'domcontentloaded',timeout:20000});
   await page.locator('#buscaForm #nome').fill(nome.trim());
   await page.locator('#buscaForm button[type="submit"]').click();
   try{await page.waitForFunction(()=>{
    const resultado=document.querySelector('.busca-resultado');
    return !!resultado && ((resultado.querySelector('.card-body')!==null)||/Nenhum resultado encontrado/i.test(resultado.textContent||''));
   },undefined,{timeout:15000});}
   catch{
    const captcha=await page.locator('iframe[src*="recaptcha"],.g-recaptcha').count();
    return {estado:'indisponivel',codigo:captcha?'CFM_CAPTCHA_OU_TIMEOUT':'CFM_RESULTADO_INDISPONIVEL'};
   }
   const cartoes=await page.locator('.busca-resultado .resultado-item .card-body').evaluateAll(cards=>cards.map(card=>{
    const clone=card.cloneNode(true) as HTMLElement;
    // O portal acrescenta o badge visual "52" antes de NU_CRM no RJ.
    // Remover o badge no DOM evita confundi-lo com parte do número cadastral.
    for(const label of clone.querySelectorAll('b')){
     if(label.textContent?.trim()!=='CRM:')continue;
     for(const badge of label.parentElement?.querySelectorAll('span[style*="inline-flex"]')||[]){
      if(badge.textContent?.trim()==='52')badge.remove();
     }
    }
    const walker=document.createTreeWalker(clone,NodeFilter.SHOW_TEXT),partes:string[]=[];
    while(walker.nextNode())partes.push(walker.currentNode.textContent||'');
    return {nome:(clone.querySelector('h2')||clone.querySelector('h4'))?.textContent||'',texto:partes.join(' ')};
   }));
   const registros=extrairRegistrosCfm(nome,cartoes);
   return registros.length?{estado:'consultado',dados:registros}:{estado:'nao_encontrado',codigo:'CFM_NAO_ENCONTRADO'};
  }catch{return {estado:'indisponivel',codigo:'CFM_NAVEGACAO_INDISPONIVEL'};}
  finally{await browser?.close().catch(()=>undefined);}
 }
}
