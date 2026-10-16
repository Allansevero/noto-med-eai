import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const html=readFileSync(new URL('./index.html',import.meta.url),'utf8');
function tela(){
 const nodes=new Map<string,any>();const node=(id:string)=>{
  if(!nodes.has(id))nodes.set(id,{value:'',hidden:false,disabled:false,readOnly:true,textContent:'',handlers:{},children:[] as any[],
   classList:{remove(){},add(){}},querySelector(){return null;},addEventListener(e:string,h:any){this.handlers[e]=h;},replaceChildren(){this.children=[];},appendChild(n:any){this.children.push(n);}});
  return nodes.get(id);
 };
 const pedidos:any[]=[];const c=vm.createContext({sessaoAtual:{tokenAcesso:'jwt',usuario:{medicoId:'medico'}},painelDisponivel:true,document:{hidden:false,getElementById:node,createElement:()=>({textContent:'',value:'',children:[] as any[],appendChild(n:any){this.children.push(n);}})},AbortSignal,URL,
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
test('painel mostra fontes de cada RQE e não preenche campo quando há múltiplas sugestões',()=>{
 const f=tela();
 vm.runInContext(`renderizarRevisaoCadastro({trabalhoId:'t',versao:'v1',whatsappConectado:true,estado:'aguardando_confirmacao',aprovado:false,nome:'Bruna Botter',crm:'30858/SC',rqe:'',candidatos:[],pesquisaCrm:'consultado',registros:[{nomeCompleto:'Bruna Botter',crm:'30858',uf:'SC',rqe:null,rqes:['21234','44556'],fontesRqe:[{numero:'21234',uf:'SC',titulo:'Perfil A',urlOrigem:'https://medicos.example/a',evidencia:'Bruna Botter CRM-SC 30858 RQE-SC 21234'},{numero:'44556',uf:'SC',titulo:'Perfil B',urlOrigem:'https://medicos.example/b',evidencia:'Bruna Botter CRM-SC 30858 RQE-SC 44556'}]}]},true)`,f.c);
 assert.equal(f.node('inputContaRqe').value,'');
 assert.equal(f.node('fontesRqeProfissional').children.length,2);
 assert.deepEqual(f.node('fontesRqeProfissional').children.map((item:any)=>item.children[0].href),['https://medicos.example/a','https://medicos.example/b']);
 assert.match(f.node('fontesRqeProfissional').children[1].children[0].textContent,/RQE 44556\/SC/);
});
test('resposta atrasada após troca de sessão não preenche dados de outra conta',async()=>{
 const f=tela();let devolver:any;f.c.fetch=()=>new Promise(r=>{devolver=r;});
 const pedido=vm.runInContext('atualizarRevisaoCadastro(true)',f.c);vm.runInContext("sessaoAtual={tokenAcesso:'outra'}",f.c);
 devolver({ok:true,json:async()=>({ok:true,revisao:{trabalhoId:'t',nome:'Conta anterior',candidatos:[],registros:[]}})});await pedido;
 assert.equal(f.node('inputContaNome').value,'');
});

test('dados profissionais podem ser aprovados antes de conectar WhatsApp',()=>{
 const f=tela();vm.runInContext("renderizarRevisaoCadastro({trabalhoId:'t',versao:'v1',whatsappConectado:false,estado:'aguardando_confirmacao',aprovado:false,nome:'Ana de Souza',crm:'37341/RS',rqe:'',candidatos:[],registros:[],pesquisaCrm:'consultado'},true)",f.c);
 assert.equal(f.node('btnConfirmarProfissional').disabled,false);assert.doesNotMatch(f.node('contaRevisaoProfissionalStatus').textContent,/Conecte seu WhatsApp/);
});
test('pesquisa nome do Hub selecionado pelo painel sem exigir WhatsApp nem confirmar perfil',async()=>{
 const f=tela();vm.runInContext("renderizarRevisaoCadastro({trabalhoId:'t',versao:'v3',whatsappConectado:false,estado:'aguardando_confirmacao',aprovado:false,nome:'',crm:'',rqe:'',candidatos:[{nome:'Ana de Souza'},{nome:'Beatriz Lima'}],registros:[],pesquisaCrm:'pendente'},true)",f.c);
 const select=f.node('selectResponsavelProfissional');select.value='Beatriz Lima';select.handlers.change({target:select});
 assert.equal(f.node('btnPesquisarResponsavel').disabled,false);
 await f.node('btnPesquisarResponsavel').handlers.click();
 assert.equal(f.pedidos[0].url,'/api/conta/cadastro/pesquisar');
 assert.equal(JSON.parse(f.pedidos[0].init.body).nome,'Beatriz Lima');
 assert.equal(f.pedidos.some(p=>p.url==='/api/conta/cadastro/aprovar'),false);
});

test('falha Serper não é apresentada como pesquisa em andamento e código fica em detalhes',()=>{
 const f=tela();vm.runInContext("renderizarRevisaoCadastro({trabalhoId:'t',versao:'v1',estado:'pendente',nome:'Ana de Souza',crm:'',rqe:'',candidatos:[],registros:[],pesquisaCrm:'indisponivel',pesquisaCodigo:'SERPER_HTTP_400'},true)",f.c);
 const status=f.node('contaRevisaoProfissionalStatus').textContent;
 assert.match(status,/Não foi possível concluir/);assert.doesNotMatch(status,/Estamos|SERPER_HTTP/);
 assert.equal(f.node('btnConfirmarProfissional').disabled,false);
 assert.equal(f.node('detalhesPesquisaProfissional').hidden,false);
 assert.match(f.node('codigoPesquisaProfissional').textContent,/SERPER_HTTP_400/);
});
test('resultado novo durante edição preserva os campos e usa versão atual na aprovação',async()=>{
 const f=tela();vm.runInContext("renderizarRevisaoCadastro({trabalhoId:'t',versao:'v1',estado:'consultando',nome:'Ana de Souza',crm:'',rqe:'',candidatos:[],registros:[]},true)",f.c);
 f.node('inputContaCrm').value='37341/RS';f.node('inputContaCrm').handlers.input();
 vm.runInContext("renderizarRevisaoCadastro({trabalhoId:'t',versao:'v2',estado:'aguardando_confirmacao',nome:'Ana de Souza',crm:'99999/RS',rqe:'',candidatos:[],registros:[]})",f.c);
 assert.equal(f.node('inputContaCrm').value,'37341/RS');
 await f.node('btnConfirmarProfissional').handlers.click();
 const body=JSON.parse(f.pedidos[0].init.body);assert.equal(body.versao,'v2');assert.equal(body.crm,'37341/RS');
});
test('créditos esgotados explicam falha nos detalhes e permitem preencher dados',()=>{
 const f=tela();vm.runInContext("renderizarRevisaoCadastro({trabalhoId:'t',versao:'v1',estado:'aguardando_confirmacao',nome:'Ana de Souza',crm:'',rqe:'',candidatos:[],registros:[],pesquisaCrm:'indisponivel',pesquisaCodigo:'SERPER_HTTP_400',diagnosticoPesquisa:[{etapa:'serper_http',status:400,motivo:'CREDITOS_INSUFICIENTES'}]},true)",f.c);
 assert.doesNotMatch(f.node('contaRevisaoProfissionalStatus').textContent,/Estamos|consultando/);
 assert.match(f.node('codigoPesquisaProfissional').textContent,/Créditos.*esgotados/);
 assert.equal(f.node('btnConfirmarProfissional').disabled,false);
});
