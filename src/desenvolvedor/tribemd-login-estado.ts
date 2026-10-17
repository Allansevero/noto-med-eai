export interface EstadoTelaLoginTribemd {
 pagina:'login'|'inicio'|'agenda'|'pacientes'|'outra';
 origemPermitida:boolean;
 senhasVisiveis:number;
 senhasOcultas:number;
 linksProtegidos:number;
 controlesNavegacaoVisiveis:number;
 titulosVisiveis:number;
 confirmado:boolean;
}
// Executado somente pelo adaptador local. Retorna categorias/contagens, nunca textos,
// valores de inputs, títulos, nomes, URLs com parâmetros ou conteúdo de pacientes.
export const codigoEstadoLoginTribemd=String.raw`(() => {
 const origem='https://app.tribemd.com';
 const caminho=p=>p.replace(/\/+$/,'')||'/';
 const paginas={'/login':'login','/inicio':'inicio','/atendimentos/agenda':'agenda','/pacientes':'pacientes'};
 const privada=p=>['/inicio','/atendimentos/agenda','/pacientes'].includes(caminho(p));
 const visivel=e=>e.getClientRects().length>0&&!['hidden','collapse'].includes(getComputedStyle(e).visibility);
 const nomeConhecido=v=>/^(agenda|agendamentos|pacientes|meus pacientes|in[ií]cio)$/i.test((v||'').trim().replace(/\s+/g,' '));
 const senhas=Array.from(document.querySelectorAll('input[type=password]'));
 const senhasVisiveis=senhas.filter(visivel).length;
 const linksProtegidos=Array.from(document.querySelectorAll('a[href]')).filter(e=>{
  if(!visivel(e)||e.closest('form'))return false;
  try{const u=new URL(e.getAttribute('href'),location.href);return u.origin===origem&&privada(u.pathname);}catch{return false;}
 }).length;
 const controlesNavegacaoVisiveis=Array.from(document.querySelectorAll('nav button,aside button,[role=navigation] button,[role=tab],[role=menuitem],.q-item')).filter(e=>
  visivel(e)&&!e.closest('form')&&nomeConhecido(e.getAttribute('aria-label')||e.querySelector('.q-item__label')?.textContent||e.textContent)
 ).length;
 const titulosVisiveis=Array.from(document.querySelectorAll('h1,h2,[role=heading],.q-toolbar__title,.q-breadcrumbs__el')).filter(e=>visivel(e)&&nomeConhecido(e.textContent)).length;
 const origemPermitida=location.origin===origem;
 const pagina=paginas[caminho(location.pathname)]||'outra';
 return {pagina,origemPermitida,senhasVisiveis,senhasOcultas:senhas.length-senhasVisiveis,linksProtegidos,controlesNavegacaoVisiveis,titulosVisiveis,
  confirmado:origemPermitida&&privada(location.pathname)&&senhasVisiveis===0&&(linksProtegidos>0||controlesNavegacaoVisiveis>0||titulosVisiveis>0)};
})()`;
