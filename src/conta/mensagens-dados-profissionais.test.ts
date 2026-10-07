import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  pedirNomeCompleto,
  pedirCrm,
  confirmarNotasPendentes,
  confirmarDadosSalvos,
  confirmarRetomadaNotas,
  orientarConfirmacaoNotas,
  interpretarConfirmacaoNotas,
} from './mensagens-dados-profissionais.js';

test('nome explica a pausa e pede apenas a identidade completa', () => {
  const mensagem = pedirNomeCompleto();
  assert.match(mensagem, /nota.*pausad/i);
  assert.match(mensagem, /falta.*nome/i);
  assert.match(mensagem, /qual.*nome completo/i);
  assert.doesNotMatch(mensagem, /CRM|RQE/i);
  assert.equal(mensagem.match(/\?/g)?.length, 1);
});

test('CRM pede somente número e UF, sem exigir RQE', () => {
  const mensagem = pedirCrm();
  assert.match(mensagem, /CRM/);
  assert.match(mensagem, /número/);
  assert.match(mensagem, /UF/);
  assert.doesNotMatch(mensagem, /nome|RQE/i);
  assert.equal(mensagem.match(/\?/g)?.length, 1);
});

test('notas anteriores continuam pausadas até confirmação explícita', () => {
  const mensagem = confirmarNotasPendentes();
  assert.match(mensagem, /notas anteriores.*pausadas/i);
  assert.match(mensagem, /pode emitir/i);
  assert.doesNotMatch(mensagem, /já emiti|emitidas|emissão concluída/i);
});

test('salvar dados confirma conferência sem presumir pendências nem garantir emissão', () => {
  const mensagem = confirmarDadosSalvos();
  assert.match(mensagem, /dados.*salvos/i);
  assert.match(mensagem, /conferir se falta.*emitir/i);
  assert.doesNotMatch(mensagem, /precisamos resolver.*pendências/i);
  assert.doesNotMatch(mensagem, /já emiti|emitidas|emissão concluída|payload|pipeline|onboarding/i);
});

test('retomada confirma autorização e preserva conferência das tentativas anteriores', () => {
  const mensagem = confirmarRetomadaNotas();
  assert.match(mensagem, /autorização.*retomar/i);
  assert.match(mensagem, /já.*tentativa.*conferid/i);
  assert.doesNotMatch(mensagem, /já emiti|emitidas|emissão concluída/i);
});

test('orientação pede autorização para retomar com uma pergunta natural', () => {
  const mensagem = orientarConfirmacaoNotas();
  assert.match(mensagem, /posso retomar suas notas pendentes\?/i);
  assert.doesNotMatch(mensagem, /outras respostas|não autorizam/i);
  assert.match(mensagem, /pode emitir/i);
  assert.equal(mensagem.match(/\?/g)?.length, 1);
});

test('mensagens cabem numa conversa curta sem formulário', () => {
  for (const mensagem of [pedirNomeCompleto(), pedirCrm(), confirmarNotasPendentes(), confirmarDadosSalvos(), confirmarRetomadaNotas(), orientarConfirmacaoNotas()]) {
    assert.ok(mensagem.length <= 220);
    assert.doesNotMatch(mensagem, /\n|!!|prezado|conforme solicitado|protocolo|ficamos à disposição/i);
    assert.ok((mensagem.match(/\?/g) ?? []).length <= 1);
  }
});

test('aceita somente frases completas de autorização explícita', () => {
  for (const texto of ['pode emitir', 'pode emitir as notas', 'autorizo a emissão das notas', ' Pode emitir. ', 'PODE EMITIR AS NOTAS!', 'autorizo a emissão das notas.', 'pode emitir!!']) {
    assert.equal(interpretarConfirmacaoNotas(texto), true, texto);
  }
});

test('recusa cumprimentos, negação, perguntas e comandos misturados', () => {
  for (const texto of ['', 'oi', 'sim', 'ok', 'pode', 'não pode emitir', 'não emitir', 'nao pode emitir', 'pode emitir?', 'pode emitir as notas?', 'pode emitir!?', 'autorizo a emissão das notas?', 'pode emitir nota para CPF 12345678900', 'pode emitir as notas para CPF 12345678900', 'pode emitir e cancelar a outra', 'oi, pode emitir', 'pode emitir. Mas espere', 'pode emitir\nnão emitir', 'não, autorizo a emissão das notas', 'não autorizo a emissão das notas', 'pode emitir,', 'pode emitir:']) {
    assert.equal(interpretarConfirmacaoNotas(texto), false, texto);
  }
});
