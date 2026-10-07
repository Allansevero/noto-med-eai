import { Router, type RequestHandler } from 'express';
import { createHash, timingSafeEqual, randomUUID } from 'node:crypto';
import { ColetorWhatsapp } from './coletor-whatsapp.js';
import type { EvolutionColetor } from './evolution-coletor.js';
import { ErroEvolutionColetor } from './evolution-coletor.js';
interface Sessao { id: string; nome: string; expira: number; disponivel: boolean; removendo: boolean; ocupada: boolean; estado: string; paginas: number; registros: number; invalidos: number; motivos: string[]; coletor: ColetorWhatsapp; erro?: string; qrcode?: string | null; diagnostico?: {etapa:string;codigo:string;statusHttp?:number} }
export function criarRouterWhatsappDesenvolvedor(deps: { ativo: boolean; token?: string; evolution: EvolutionColetor; agora?: () => number }) {
  const router = Router(), sessoes = new Map<string, Sessao>(), agora = deps.agora || Date.now;
  router.use((_req,res,next)=>{res.setHeader('Cache-Control','no-store');next();});
  if (!deps.ativo) { router.use((_req,res)=>res.status(404).json({ok:false,detalhe:'Área de desenvolvedor desativada.'}));return router; }
  if (!deps.token || deps.token.trim() !== deps.token || deps.token.length < 32 || deps.token.length > 256) throw new Error('Chave de desenvolvedor inválida.');
  const segredo = createHash('sha256').update(deps.token).digest();
  router.use((req,res,next)=>{ const h=req.header('Authorization')||'', t=h.startsWith('Bearer ')?h.slice(7):'';
    if (!t || !timingSafeEqual(segredo,createHash('sha256').update(t).digest())) return res.status(401).json({ok:false,detalhe:'Informe a chave de desenvolvedor.'});next(); });
  const limpar = async (s: Sessao) => {
    if (s.removendo) return;
    s.removendo = true;
    try { await deps.evolution.remover(s.nome); sessoes.delete(s.id); } finally { s.removendo = false; }
  };
  // Mantém a sessão em caso de falha de exclusão para permitir nova tentativa de limpeza.
  const timer = setInterval(()=>{for(const s of sessoes.values()) if (s.expira <= agora() && !s.ocupada) {
    s.coletor = new ColetorWhatsapp();void limpar(s).catch(()=>{});
  }},60000);timer.unref();
  const registrarFalha=(erro:unknown,sessaoId?:string)=>{
    const d=erro instanceof ErroEvolutionColetor?{etapa:erro.etapa,codigo:erro.codigo,statusHttp:erro.statusHttp}:{etapa:'operacao',codigo:'FALHA_OPERACAO'};
    console.error('[Coletor WhatsApp] Operação pendente:',{sessaoId,...d});return d;
  };
  const rota = (h: RequestHandler): RequestHandler => async(req,res,next)=>{try{await h(req,res,next);}catch(erro) {const diagnostico=registrarFalha(erro);res.status(502).json({ok:false,diagnostico,detalhe:'Não foi possível concluir a operação na Evolution. Tente novamente.'});}};
  const obter = (id: string, res: any, encerramento = false) => {
    const s=sessoes.get(id);
    if (!s || (!encerramento && s.expira<=agora())) { res.status(410).json({ok:false,detalhe:'Sessão encerrada ou expirada. Conecte novamente.'});return null; }
    if(s.removendo) {res.status(409).json({ok:false,detalhe:'Sessão sendo encerrada.'});return null;}return s;
  };
  const resultado = (s:Sessao) => ({ok:true,sessaoId:s.id,instanciaTeste:s.nome,expiraEm:new Date(s.expira).toISOString(),estado:s.estado,
    cobertura:{origem:'historico_disponivel_na_evolution',paginasConsultadas:s.paginas,registrosRecebidos:s.registros,registrosInvalidos:s.invalidos,
      paginacaoConcluida:s.estado==='concluida',motivos:s.motivos,limiteMensagens:5000,limitePaginas:50},...s.coletor.resultado(),qrcodeBase64:s.qrcode||null,...(s.erro?{detalhe:s.erro}:{}),...(s.diagnostico?{diagnostico:s.diagnostico}:{})});
  const preparar=async(s:Sessao)=>{
    try{await deps.evolution.criar(s.nome);s.disponivel=true;s.qrcode=await deps.evolution.qrcode(s.nome);s.estado='conectando';}
    catch(erro){s.estado='falha';s.diagnostico=registrarFalha(erro,s.id);s.erro='Não foi possível preparar a conexão com a Evolution. Confira o diagnóstico e encerre esta sessão antes de tentar novamente.';}
    finally{s.ocupada=false;}
  };
  router.get('/acesso',(_req,res)=>res.json({ok:true}));
  router.post('/sessoes',rota(async(_req,res)=>{
    if(sessoes.size>=3) {res.status(429).json({ok:false,detalhe:'Encerre uma sessão de teste antes de conectar outra.'});return;}
    const id=randomUUID(),s:Sessao={id,nome:'noto_dev_coletor_'+id.replace(/-/g,''),expira:agora()+30*60000,disponivel:false,removendo:false,ocupada:true,estado:'preparando',paginas:0,registros:0,invalidos:0,motivos:[],coletor:new ColetorWhatsapp()};
    sessoes.set(id,s);
    res.status(202).json(resultado(s));void preparar(s);
  }));
  router.get('/sessoes/:id',rota(async(req,res)=>{const s=obter(String(req.params.id),res);if(s)res.json(resultado(s));}));
  router.get('/sessoes/:id/conexao',rota(async(req,res)=>{const s=obter(String(req.params.id),res);if(!s)return;
    if(!s.disponivel) {res.status(409).json({ok:false,detalhe:'A conexão desta sessão não foi preparada.'});return;}
    const estado=await deps.evolution.estado(s.nome);if(estado==='open')s.qrcode=null;res.json({ok:true,estado});
  }));
  router.post('/sessoes/:id/qrcode',rota(async(req,res)=>{const s=obter(String(req.params.id),res);if(!s)return;
    if(!s.disponivel||s.ocupada){res.status(409).json({ok:false,detalhe:'Sessão indisponível ou ocupada.'});return;}
    s.ocupada=true;try{s.qrcode=await deps.evolution.qrcode(s.nome);s.estado='conectando';s.erro=undefined;s.diagnostico=undefined;res.json({ok:true,qrcodeBase64:s.qrcode});}finally{s.ocupada=false;}
  }));
  const varrer = async(s:Sessao)=>{
    try {
      const paginasVistas = new Set<string>();
      for(let p=1;p<=50;p++){
        if(s.expira<=agora()){s.motivos.push('sessao_expirada');break;}
        const pagina=await deps.evolution.pagina(s.nome,p);s.paginas=p;s.registros+=pagina.registros;s.invalidos+=pagina.invalidos;
        const assinatura = pagina.mensagens.length ? createHash('sha256').update(JSON.stringify(pagina.mensagens.map(m=>[m.key.remoteJid,m.key.id]))).digest('hex') : null;
        if (assinatura && paginasVistas.has(assinatura)) {s.motivos.push('paginacao_sem_avanco');break;}
        if (assinatura) paginasVistas.add(assinatura);
        const antes=s.coletor.resultado().mensagensAnalisadas;
        const cabem=Math.max(0,5000-antes);for(const m of pagina.mensagens.slice(0,cabem))s.coletor.adicionar(m);
        if(pagina.mensagens.length>cabem){s.motivos.push('limite_mensagens');break;}
        if(pagina.totalPaginas===null) {s.motivos.push('metadados_paginacao_ausentes');break;}
        if(p>=pagina.totalPaginas) break;
        if(pagina.registros===0){s.motivos.push('pagina_vazia_antes_do_fim');break;}
        if(s.coletor.resultado().mensagensAnalisadas>=5000){s.motivos.push('limite_mensagens');break;}
        if(p===50)s.motivos.push('limite_paginas');
      }
      if(s.invalidos)s.motivos.push('mensagens_com_formato_invalido');
      if(s.coletor.resultado().textosLimitados)s.motivos.push('textos_limitados');
      s.estado=s.motivos.length?'parcial':'concluida';
    }catch{s.estado='falha';s.erro='A leitura foi interrompida. O resultado parcial está disponível; tente uma nova varredura.';s.motivos.push('leitura_interrompida');}
    finally{s.ocupada=false;}
  };
  router.post('/sessoes/:id/varrer',rota(async(req,res)=>{
    const s=obter(String(req.params.id),res);if(!s)return;
    if(!s.disponivel||s.ocupada){res.status(409).json({ok:false,detalhe:'Já existe uma operação em andamento nesta sessão.'});return;}
    s.ocupada=true;
    try {
      if(await deps.evolution.estado(s.nome)!=='open'){res.status(409).json({ok:false,detalhe:'Conecte o WhatsApp antes de varrer.'});s.ocupada=false;return;}
      s.coletor=new ColetorWhatsapp();s.paginas=0;s.registros=0;s.invalidos=0;s.motivos=[];s.erro=undefined;s.estado='varrendo';
      res.status(202).json(resultado(s));void varrer(s);
    }catch(erro){s.ocupada=false;throw erro;}
  }));
  router.delete('/sessoes/:id',rota(async(req,res)=>{const s=obter(String(req.params.id),res,true);if(!s)return;
    if(s.ocupada){res.status(409).json({ok:false,detalhe:'Aguarde a operação atual antes de encerrar.'});return;}
    await limpar(s);res.json({ok:true});
  }));
  return router;
}
