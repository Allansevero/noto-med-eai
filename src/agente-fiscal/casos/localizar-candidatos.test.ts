import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LocalizadorCandidatos } from './localizar-candidatos.js';
const png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/ZxoAAAAASUVORK5CYII=';
const dia = new Date(Date.now()-86400000).toISOString().slice(0,10);
function comprovante() { return { versaoExtracao:2, ehComprovante:true,statusPagamento:'realizado' as const,
  dataPagamento:dia,valorCentavos:40000,pagadorNome:'Maria Silva',favorecidoNome:'Clinica Exemplo',favorecidoDocumento:'11222333000181',transacaoId:'pix1' }; }
function ambiente(nota?: object) {
 const rows:any[]=[{id:'p1',direcao:'recebida',tipo_mensagem:'imagem',criado_em:new Date(),conteudo:'',conversa_id:'conv1',
  contato_telefone:'51999998888',contato_nome:'Maria Silva',nome_instancia:'clinica',
  payload_bruto:{key:{id:'wa1'},base64:png}}];
 if(nota) rows.push({id:'nf1',direcao:'enviada',tipo_mensagem:'documento',criado_em:new Date(),conteudo:'',conversa_id:'conv1',
  contato_telefone:'51999998888',contato_nome:'Maria Silva',nome_instancia:'clinica',payload_bruto:{comprovante:{versaoExtracao:2,ehComprovante:false,notaFiscal:nota}}});
 let chamadas=0;
 const pool={query:async(sql:string)=>sql.includes('from medicos m')
  ?{rows:[{nome_completo:'Maria Medica',razao_social:'Clinica Exemplo',documento:'11222333000181'}]}
  :sql.includes('from whatsapp_mensagens m')?{rows}:{rows:[{id:'p1'}]}};
 const localizador=new LocalizadorCandidatos(pool as any,{analisarImagem:async()=>{chamadas++;return comprovante();}},
  {obterBase64MensagemMidia:async()=>{throw Error('Mídia já embutida');}},'chave');
 return{localizador,chamadas:()=>chamadas,rows};
}
test('análise documental bem-sucedida é reutilizada na busca seguinte',async()=>{
 const a=ambiente();const r1=await a.localizador.localizar('m1');const r2=await a.localizador.localizar('m1');
 assert.equal(a.chamadas(),1);assert.equal(r1.candidatos.length,1);assert.equal(r2.candidatos.length,1);
});
test('nota fiscal reconhecida mas inconclusiva impede aprovação automática do pagamento',async()=>{
 const a=ambiente({ehNotaFiscal:true,status:'desconhecido',numero:'123'});
 const r=await a.localizador.localizar('m1');
 assert.equal(r.candidatos.length,1);assert.ok(r.revisoes>0);
 assert.ok(r.candidatos[0].motivosRevisao?.includes('documento_na_conversa_sem_analise'));
});
test('nota forte correspondente já enviada elimina candidato sem repetir visão',async()=>{
 const a=ambiente({ehNotaFiscal:true,status:'emitida',numero:'123',valorCentavos:40000,
  tomadorNome:'Maria Silva',prestadorNome:'Clinica Exemplo',referenciaPagamento:'pix1'});
 const r=await a.localizador.localizar('m1');assert.equal(r.candidatos.length,0);assert.equal(a.chamadas(),1);
});
test('comprovante para outro favorecido fica em revisão',async()=>{
 const a=ambiente();a.rows[0].payload_bruto.comprovante={...comprovante(),favorecidoDocumento:'99888777000166'};
 const r=await a.localizador.localizar('m1');assert.equal(a.chamadas(),0);
 assert.ok(r.candidatos[0].motivosRevisao?.includes('Favorecido do pagamento não confirmado no cadastro fiscal.'));
});
