import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
function tela(opcoes:{expirada?:boolean;ativo?:boolean}={}){
 const nodes=new Map<string,any>(),pedidos:any[]=[],timers:any[]=[];
 const el=(id:string)=>{if(!nodes.has(id))nodes.set(id,{value:'',hidden:false,disabled:false,textContent:'',handlers:{},addEventListener(e:string,f:any){this.handlers[e]=f;}});return nodes.get(id);};
 const c=vm.createContext({document:{getElementById:el,createElement(){return {click(){}};}},window:{addEventListener(){}},sessionStorage:{getItem(){return null;},setItem(){},removeItem(){}},Intl,Date,Blob,URL,setTimeout(f:any,ms:number){timers.push({f,ms});return timers.length;},clearTimeout(){},
  async fetch(url:string,options:any){pedidos.push({url,options});let d:any={ok:true};const expiraEm=new Date(Date.now()+20*60000).toISOString();
   if(url.endsWith('/acesso'))d.iaConfigurada=true;
   else if(options.method==='POST')d={ok:true,sessaoId:'sessao',estado:'preparando',eventos:[],expiraEm};
   else if(options.method!=='DELETE')d={ok:true,sessaoId:'sessao',estado:opcoes.ativo?'investigando':'parcial',expiraEm,eventos:[{etapa:'login_confirmado'}],resultado:{pacientes:[{nome:'Ana',cpf:'52998224725'}]}};
   if(opcoes.expirada&&options.method==='GET'&&!url.endsWith('/acesso'))return new Response(JSON.stringify({ok:false,detalhe:'Sessão expirada.'}),{status:410});return new Response(JSON.stringify(d));}});
 const html=readFileSync(new URL('./desenvolvedor-tribemd.html',import.meta.url),'utf8');vm.runInContext(html.match(/<script>([\s\S]*?)<\/script>/)![1],c);
 return {el,pedidos,timers};
}
async function iniciar(t:ReturnType<typeof tela>){const {el}=t;
 el('chave').value='chave';await el('formAcesso').handlers.submit({preventDefault(){}});assert.equal(el('chave').value,'');
 el('email').value='teste@example.com';el('senha').value='segredo';el('inicio').value='2026-10-07';el('fim').value='2026-10-14';
 await el('formLogin').handlers.submit({preventDefault(){}});await new Promise<void>(r=>setImmediate(r));
}
test('interface envia credenciais só ao endpoint local, limpa os campos e mostra resultado para revisão',async()=>{
 const t=tela();await iniciar(t);const {el,pedidos}=t;
 assert.equal(el('senha').value,'');assert.equal(el('email').value,'');assert.match(el('resultado').textContent,/Ana/);
 assert.equal(pedidos.filter(p=>p.options.body?.includes('segredo')).length,1);assert.ok(pedidos.every(p=>p.url.startsWith('/api/desenvolvedor/tribemd')));
 await el('btnEncerrar').handlers.click();assert.equal(el('btnBaixar').disabled,true);assert.ok(!el('resultado').textContent.includes('52998224725'));
});

test('expiração local remove dados pessoais, download e sessão antiga',async()=>{
 const t=tela();await iniciar(t);assert.equal(t.el('btnBaixar').disabled,false);
 t.timers.filter(v=>v.ms>60000).at(-1).f();
 assert.equal(t.el('btnBaixar').disabled,true);assert.equal(t.el('btnIniciar').disabled,false);
 assert.ok(!t.el('resultado').textContent.includes('52998224725'));
});
test('HTTP 410 durante acompanhamento também remove resultados pessoais',async()=>{
 const opcoes={ativo:true,expirada:false},t=tela(opcoes);await iniciar(t);opcoes.expirada=true;
 await t.timers.filter(v=>v.ms===2500).at(-1).f();await new Promise<void>(r=>setImmediate(r));
 assert.equal(t.el('btnBaixar').disabled,true);assert.ok(!t.el('resultado').textContent.includes('52998224725'));
});
