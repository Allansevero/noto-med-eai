import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const html=readFileSync(new URL('./index.html',import.meta.url),'utf8');
function tela(){
 const nodes=new Map<string,any>();const node=(id:string)=>{
  if(!nodes.has(id))nodes.set(id,{value:'',hidden:false,disabled:false,readOnly:true,textContent:'',handlers:{},children:[],
   classList:{remove(){},add(){}},querySelector(){return null;},addEventListener(e:string,h:any){this.handlers[e]=h;},replaceChildren(){this.children=[];},appendChild(n:any){this.children.push(n);}});
  return nodes.get(id);
 };
 const pedidos:any[]=[];const c=vm.createContext({sessaoAtual:{tokenAcesso:'jwt',usuario:{medicoId:'medico'}},painelDisponivel:true,document:{hidden:false,getElementById:node,createElement:()=>({textContent:'',value:''})},AbortSignal,
  abrirSecaoConta(){},atualizarVisualizacaoConta:async()=>{},fetch:async(url:string,init:any)=>{pedidos.push({url,init});return {ok:true,json:async()=>({ok:true,revisao:{trabalhoId:'t',versao:'v2',estado:'concluido',aprovado:true,nome:'Ana de Souza',crm:'37341/RS',rqe:'',candidatos:[],registros:[]}})};}});
 const bloco=html.match(/\/\/ INICIO REVISAO CADASTRO([\s\S]*?)\/\/ FIM REVISAO CADASTRO/)?.[1];assert.ok(bloco,'deve existir revisão cadastral no painel');vm.runInContext(bloco,c);
 return {c,node,pedidos};
}
test('aprovação com WhatsApp conectado envia sessão e versão e remove aviso após sucesso',async()=>{
 const f=tela();vm.runInContext("renderizarRevisaoCadastro({trabalhoId:'t',versao:'v1',whatsappConectado:true,estado:'aguardando_confirmacao',aprovado:false,nome:'Ana de Souza',crm:'37341/RS',rqe:'',candidatos:[],registros:[],pesquisaCrm:'indisponivel'},true)",f.c);
 assert.equal(f.node('avisoDadosProfissionais').hidden,false);assert.equal(f.node('inputContaNome').value,'Ana de Souza');
 await f.node('btnConfirmarProfissional').handlers.click();
 assert.equal(f.pedidos[0].url,'/api/conta/cadastro/aprovar');assert.equal(f.pedidos[0].init.headers.Authorization,'Bearer jwt');
 const body=JSON.parse(f.pedidos[0].init.body);assert.equal(body.versao,'v1');assert.equal(body.crm,'37341/RS');assert.equal('medicoId' in body,false);
 assert.equal(f.node('avisoDadosProfissionais').hidden,true);
});
test('resposta atrasada após troca de sessão não preenche dados de outra conta',async()=>{
 const f=tela();let devolver:any;f.c.fetch=()=>new Promise(r=>{devolver=r;});
 const pedido=vm.runInContext('atualizarRevisaoCadastro(true)',f.c);vm.runInContext("sessaoAtual={tokenAcesso:'outra'}",f.c);
 devolver({ok:true,json:async()=>({ok:true,revisao:{trabalhoId:'t',nome:'Conta anterior',candidatos:[],registros:[]}})});await pedido;
 assert.equal(f.node('inputContaNome').value,'');
});

test('confirmação fica desabilitada enquanto WhatsApp estiver desconectado',()=>{
 const f=tela();vm.runInContext("renderizarRevisaoCadastro({trabalhoId:'t',versao:'v1',whatsappConectado:false,estado:'aguardando_confirmacao',aprovado:false,nome:'Ana de Souza',crm:'37341/RS',rqe:'',candidatos:[],registros:[],pesquisaCrm:'consultado'},true)",f.c);
 assert.equal(f.node('btnConfirmarProfissional').disabled,true);assert.match(f.node('contaRevisaoProfissionalStatus').textContent,/Conecte seu WhatsApp/);
});
