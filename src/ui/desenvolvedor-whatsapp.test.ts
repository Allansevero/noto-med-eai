import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
function tela() {
 const html=readFileSync(new URL('./desenvolvedor-whatsapp.html',import.meta.url),'utf8'),nodes=new Map<string,any>(),pedidos:any[]=[],timers:any[]=[];
 const el=(id:string)=>{if(!nodes.has(id))nodes.set(id,{value:'',hidden:false,disabled:false,textContent:'',handlers:{},addEventListener(e:string,f:any){this.handlers[e]=f;},removeAttribute(a:string){delete this[a];}});return nodes.get(id);};
 const snapshot={ok:true,sessaoId:'sessao',estado:'concluida',expiraEm:'2026-10-07T20:00:00Z',cobertura:{paginasConsultadas:2},mensagensAnalisadas:10,contatos:[{whatsapp:'5551999998888',cpfs:[{valor:'52998224725'}]}]};
 let iniciou=false,expirada=false;
 const c=vm.createContext({document:{getElementById:el,createElement(){return {click(){}};}},window:{addEventListener(){}},sessionStorage:{getItem(){return null;},setItem(){},removeItem(){}},setTimeout(f:any){timers.push(f);return timers.length;},clearTimeout(){},Blob,URL,
  async fetch(url:string,opcoes:any){pedidos.push({url,method:opcoes.method,auth:opcoes.headers.Authorization});
   const bad=expirada&&url.endsWith('/sessao');return {ok:!bad,status:bad?410:200,async json(){
    if(bad)return {ok:false,detalhe:'Sessão expirada.'};
    if(url.endsWith('/acesso'))return {ok:true};
    if(url.endsWith('/conexao'))return {ok:true,estado:'open'};
    if(url.endsWith('/varrer')){iniciou=true;return {...snapshot,estado:'varrendo'};}
    if(url.endsWith('/sessoes'))return {...snapshot,estado:'conectando',qrcodeBase64:'data:image/png;base64,AAAA'};
    if(opcoes.method==='DELETE')return {ok:true};
    return iniciou?snapshot:{...snapshot,estado:'conectando'};
   }};
  }});
 vm.runInContext(html.match(/<script>([\s\S]*?)<\/script>/)![1],c);
 const flush=()=>new Promise<void>(r=>setImmediate(r));
 return {el,pedidos,c,timers,flush,expirar(){expirada=true;}};
}
test('conecta com chave somente em memória, inicia varredura após conexão e mostra JSON com dados',async()=>{
 const t=tela();t.el('chave').value='chave-de-teste';await t.el('formAcesso').handlers.submit({preventDefault(){}});
 assert.equal(t.el('chave').value,'');await t.el('btnConectar').handlers.click();await t.flush();
 assert.equal(t.pedidos.filter(p=>p.url.endsWith('/varrer')).length,1);assert.equal(t.el('qr').hidden,true);
 await t.timers.at(-1)();await t.flush();assert.equal(JSON.parse(t.el('resultado').textContent).contatos[0].cpfs[0].valor,'52998224725');
 assert.equal(t.el('btnBaixar').disabled,false);assert.ok(t.pedidos.every(p=>p.auth==='Bearer chave-de-teste'));
 await t.el('btnEncerrar').handlers.click();assert.equal(t.el('btnBaixar').disabled,true);assert.equal(t.el('btnConectar').disabled,false);
 assert.ok(!t.el('resultado').textContent.includes('52998224725'));
});
test('sessão expirada não deixa a tela bloqueada e pode ser encerrada para conectar novamente',async()=>{
 const t=tela();t.el('chave').value='chave';await t.el('formAcesso').handlers.submit({preventDefault(){}});
 await t.el('btnConectar').handlers.click();await t.flush();t.expirar();await t.timers.at(-1)();await t.flush();
 assert.equal(t.el('btnVarrer').disabled,true);await t.el('btnEncerrar').handlers.click();assert.equal(t.el('btnConectar').disabled,false);
});
