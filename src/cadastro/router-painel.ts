import { Router } from 'express';
import type pg from 'pg';
import { ZodError } from 'zod';
import type { PostgresCadastro } from './postgres-cadastro.js';
import { aprovacaoPainelSchema, ErroRevisaoCadastro } from './revisao-painel.js';

export function criarRouterCadastroPainel(deps:{pool:pg.Pool;repo:PostgresCadastro;autenticar:(token:string)=>Promise<string|null>}){
 const router=Router();
 router.use(async(req,res,next)=>{
  res.setHeader('Cache-Control','no-store');
  try{
   const header=req.header('Authorization')||'';
   const authId=header.startsWith('Bearer ')?await deps.autenticar(header.slice(7)):null;
   if(!authId){res.status(401).json({ok:false,detalhe:'Entre novamente para revisar o cadastro.'});return;}
   const medico=(await deps.pool.query('select m.id from medicos m join usuarios u on u.id=m.usuario_id where u.auth_user_id=$1 and u.ativo=true limit 1',[authId])).rows[0];
   if(!medico){res.status(403).json({ok:false,detalhe:'Conta médica não encontrada.'});return;}
   res.locals.medicoId=medico.id;next();
  }catch{res.status(503).json({ok:false,detalhe:'Não foi possível verificar a sessão.'});}
 });
 router.get('/',async(_req,res)=>{
  try{res.json({ok:true,revisao:await deps.repo.revisaoPainel(res.locals.medicoId)});}
  catch{res.status(503).json({ok:false,detalhe:'Não foi possível consultar seus dados profissionais.'});}
 });
 router.post('/aprovar',async(req,res)=>{
  try{const dados=aprovacaoPainelSchema.parse(req.body);res.json({ok:true,revisao:await deps.repo.aprovarPainel(res.locals.medicoId,dados)});}
  catch(e){
   if(e instanceof ZodError){res.status(400).json({ok:false,detalhe:e.issues[0]?.message});return;}
   if(e instanceof ErroRevisaoCadastro){res.status(e.status).json({ok:false,detalhe:e.message});return;}
   res.status(503).json({ok:false,detalhe:'Não foi possível confirmar os dados. Atualize e tente novamente.'});
  }
 });
 return router;
}
