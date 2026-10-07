import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ColetorWhatsapp } from './coletor-whatsapp.js';
const msg = (id: string, texto: string, extras: any = {}) => ({ key: { id, remoteJid: '5551999998888@s.whatsapp.net', fromMe: false, ...extras }, message: { conversation: texto }, messageTimestamp: 1791330000 });
test('coleta todos os CPFs válidos e e-mails com evidência, sem assumir identidade', () => {
  const c = new ColetorWhatsapp();
  c.adicionar(msg('a','Meu CPF: 529.982.247-25. Responsável: 12345678909. E-mail: Maria+consulta@Example.com.'));
  c.adicionar(msg('b','52998224725 Maria+consulta@example.com', {fromMe:true}));
  c.adicionar(msg('b','52998224725 Maria+consulta@example.com', {fromMe:true}));
  const r = c.resultado(); const contato=r.contatos[0];
  assert.equal(r.mensagensAnalisadas,2);assert.equal(r.mensagensRepetidas,1);
  assert.equal(contato.whatsapp,'5551999998888');
  assert.deepEqual(contato.cpfs.map(v=>v.valor),['52998224725','12345678909']);
  assert.equal(contato.emails[0].valor,'maria+consulta@example.com');
  assert.deepEqual(contato.cpfs[0].origens.map(o=>o.mensagemId),['a','b']);
  assert.equal(contato.cpfs[0].origens[1].enviadaPeloUsuario,true);
  assert.equal(contato.associacaoPendente,true);
});
test('não trata CPF como telefone nem LID como WhatsApp e exclui grupos/status',()=>{
  const c=new ColetorWhatsapp();
  c.adicionar(msg('a','11111111111 52998224725', {remoteJid:'123456789012345@lid'}));
  c.adicionar(msg('b','52998224725', {remoteJid:'grupo@g.us',remoteJidAlt:'5551999998888@s.whatsapp.net'}));
  c.adicionar(msg('c','52998224725', {remoteJid:'status@broadcast'}));
  const r=c.resultado();assert.equal(r.contatos.length,1);assert.equal(r.contatos[0].whatsapp,null);
  assert.equal(r.contatos[0].cpfs.length,1);assert.equal(r.cpfsInvalidos,1);assert.equal(r.mensagensIgnoradas,2);
});
test('resolve telefone por JID alternativo e preserva mensagens de conversas com dados ausentes',()=>{
  const c=new ColetorWhatsapp();
  c.adicionar(msg('a','Olá', {remoteJid:'123@lid',remoteJidAlt:'5551999998888@s.whatsapp.net'}));
  c.adicionar(msg('b','Sem dados'));
  const r=c.resultado();assert.equal(r.contatos.length,1);assert.equal(r.contatos[0].mensagensAnalisadas,2);
  assert.deepEqual(r.contatos[0].cpfs,[]);assert.deepEqual(r.contatos[0].emails,[]);
});
