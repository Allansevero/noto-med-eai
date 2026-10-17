'use strict';
const el=id=>document.getElementById(id);
const caminho=path=>new URL(path.replace(/^\//,''),new URL('./',location.href)).href;
let sessao,imagemUrl,atualizando=false,fechando=false;
const mensagens={ORIGEM_INVALIDA:'Origem inválida.',LOGIN_INDISPONIVEL:'Este login já foi tentado. Confira o diagnóstico e encerre para uma nova tentativa.',PERFIL_OCUPADO:'Perfil em uso. Aguarde o encerramento da outra sessão.',NAVEGADOR_OCUPADO:'Já existe um navegador aberto.',CREDENCIAL_AUSENTE:'Informe e-mail e senha.',LOGIN_HTTP_ERRO:'Uma chamada do login retornou erro HTTP. Confira o diagnóstico.',OPERACAO_FALHOU:'Não foi possível concluir. Confira a configuração e o diagnóstico.'};
async function api(path,method='GET',body){
 const r=await fetch(caminho(path),{method,credentials:'same-origin',cache:'no-store',headers:method==='GET'?{}:{'Content-Type':'application/json','X-Tribemd-Teste':'1'},body:body===undefined?undefined:JSON.stringify(body)});
 const j=await r.json();if(!r.ok)throw Error(mensagens[j.codigo]||j.codigo||'Falha no teste.');return j;
}
function mostrar(s){
 sessao=s?.id;el('estado').textContent=s?`${s.estado}${s.codigo?' · '+s.codigo:''}`:'Nenhuma sessão aberta.';
 el('dados').textContent=s?.resultado?JSON.stringify(s.resultado,null,2):'';
 el('diagnostico').textContent=s?.diagnostico?JSON.stringify(s.diagnostico,null,2):'';
 const pronto=s?.estado==='pronto',login=s?.estado==='aguardando_login',controle=login||s?.estado==='necessita_intervencao';
 el('entrar').disabled=!login;el('salva').disabled=!login||!s?.credencialSalva;
 for(const id of ['confirmar','tab','escape','rolar'])el(id).disabled=!controle;
 for(const id of ['agenda','pacientes'])el(id).disabled=!pronto;
 el('fechar').disabled=!sessao;el('abrir').querySelector('button').disabled=!!sessao;el('esquecer').disabled=!!sessao;
}
async function executar(fn){try{await fn();}catch(e){el('estado').textContent=e.message;}}
el('abrir').onsubmit=e=>{e.preventDefault();void executar(async()=>mostrar(await api('/api/sessoes','POST',{clinica:el('abrir').elements.clinica.value.trim()})));};
el('login').onsubmit=e=>{e.preventDefault();const f=e.currentTarget;const d={email:f.elements.email.value.trim(),senha:f.elements.senha.value};f.reset();void executar(async()=>{try{mostrar(await api(`/api/sessoes/${sessao}/login`,'POST',d));}finally{d.email='';d.senha='';}});};
el('salva').onclick=()=>void executar(async()=>mostrar(await api(`/api/sessoes/${sessao}/login`,'POST',{})));
el('confirmar').onclick=()=>void executar(async()=>mostrar(await api(`/api/sessoes/${sessao}/confirmar`,'POST',{})));
for(const pagina of ['agenda','pacientes'])el(pagina).onclick=()=>void executar(async()=>mostrar(await api(`/api/sessoes/${sessao}/ler`,'POST',{pagina})));
el('fechar').onclick=()=>void executar(async()=>{fechando=true;try{await api(`/api/sessoes/${sessao}`,'DELETE',{});mostrar(null);el('tela').removeAttribute('src');if(imagemUrl)URL.revokeObjectURL(imagemUrl);}finally{fechando=false;}});
el('esquecer').onclick=()=>void executar(async()=>{const clinica=el('abrir').elements.clinica.value.trim();if(!clinica)throw Error('Informe o identificador da clínica.');await api('/api/perfis/'+encodeURIComponent(clinica),'DELETE',{});el('estado').textContent='Perfil e credenciais excluídos.';});
async function controlar(d){if(sessao)await api(`/api/sessoes/${sessao}/controle`,'POST',d);}
el('tela').onclick=e=>void executar(async()=>{const r=e.target.getBoundingClientRect();await controlar({tipo:'clicar',x:Math.min(1279,Math.max(0,Math.floor((e.clientX-r.left)*1280/r.width))),y:Math.min(899,Math.max(0,Math.floor((e.clientY-r.top)*900/r.height)))});});
el('tab').onclick=()=>void executar(()=>controlar({tipo:'tecla',tecla:'Tab'}));el('escape').onclick=()=>void executar(()=>controlar({tipo:'tecla',tecla:'Escape'}));el('rolar').onclick=()=>void executar(()=>controlar({tipo:'rolar',deltaY:500}));
async function atualizar(){
 if(atualizando||!sessao||fechando)return;atualizando=true;const id=sessao;
 try{
  const s=await api(`/api/sessoes/${id}`);if(sessao!==id||fechando)return;mostrar(s);
  const r=await fetch(caminho(`/api/sessoes/${id}/tela`),{cache:'no-store'});if(r.status!==200)return;
  const blob=await r.blob();if(sessao!==id||fechando)return;
  const anterior=imagemUrl;imagemUrl=URL.createObjectURL(blob);el('tela').src=imagemUrl;if(anterior)URL.revokeObjectURL(anterior);
 }catch{el('estado').textContent='Sessão indisponível. Recarregue para recuperar ou iniciar novamente.';}finally{atualizando=false;}
}
setInterval(()=>void atualizar(),1000);
void executar(async()=>{const r=await api('/api/sessoes');if(r.sessoes.length)mostrar(r.sessoes[0]);});
