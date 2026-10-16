import test from 'node:test';
import assert from 'node:assert';
import {
  redigirConfirmacaoPedido,
  redigirEscolhaMultipla,
  redigirSolicitacaoDadosFaltantes,
  redigirSucessoEmissao
} from './redigir-mensagens-pedido.js';

test('redigirConfirmacaoPedido: formata dados completos', () => {
  const msg = redigirConfirmacaoPedido({
    nomePaciente: 'Antônio Marques Silva',
    dataConsulta: '14/10/2026',
    valorCentavos: 40000,
    precisaConfirmarValor: true
  });

  assert.ok(msg.includes('Antônio Marques Silva'));
  assert.ok(msg.includes('14/10/2026'));
  assert.ok(msg.includes('400,00'));
  assert.ok(msg.includes('Confirma a emissão'));
});

test('redigirEscolhaMultipla: numera opções com final de telefone', () => {
  const msg = redigirEscolhaMultipla([
    { nome: 'João Silva', telefone: '51999994521', origem: 'supabase' },
    { nome: 'João Silva Filho', telefone: '51999998810', origem: 'supabase' }
  ], 'João Silva');

  assert.ok(msg.includes('1️⃣ João Silva (WhatsApp final ...4521)'));
  assert.ok(msg.includes('2️⃣ João Silva Filho (WhatsApp final ...8810)'));
});

test('redigirSolicitacaoDadosFaltantes: lista itens pendentes', () => {
  const msg = redigirSolicitacaoDadosFaltantes({
    nomeBuscado: 'Carlos Andrade',
    precisaCpf: true,
    precisaValor: true,
    precisaTelefone: true
  });

  assert.ok(msg.includes('Carlos Andrade'));
  assert.ok(msg.includes('CPF do paciente'));
  assert.ok(msg.includes('Valor da consulta'));
  assert.ok(msg.includes('WhatsApp do paciente'));
});

test('redigirSucessoEmissao: inclui valor e aviso de PDF', () => {
  const msg = redigirSucessoEmissao('Antônio Marques', 35000);
  assert.ok(msg.includes('Antônio Marques'));
  assert.ok(msg.includes('350,00'));
  assert.ok(msg.includes('PDF será enviado'));
});
