import assert from 'node:assert/strict';
import test from 'node:test';
import { redigirNotificacaoCandidato } from './redigir-notificacao-candidato.js';

test('redige notificação quando paciente já tem CPF', () => {
  const msg = redigirNotificacaoCandidato(
    {
      nomePaciente: 'Mariana Souza',
      valorCentavos: 35000,
      dataPagamento: '2026-10-14',
      tipoPagamento: 'pix',
      temCpf: true
    },
    'Dr. Carlos Eduardo'
  );

  assert.ok(msg.includes('Olá, Dr(a). Carlos!'));
  assert.ok(msg.includes('Mariana Souza'));
  assert.ok(msg.includes('350,00'));
  assert.ok(msg.includes('PIX em 14/10/2026'));
  assert.ok(msg.includes('Posso emitir a NFS-e agora?'));
});

test('redige notificação alertando ausência de CPF do paciente', () => {
  const msg = redigirNotificacaoCandidato(
    {
      nomePaciente: 'João Pedro',
      valorCentavos: 45000,
      dataPagamento: '2026-10-14',
      tipoPagamento: 'pix',
      temCpf: false
    },
    'Dra. Ana Paula'
  );

  assert.ok(msg.includes('Olá, Dr(a). Ana!'));
  assert.ok(msg.includes('Ainda não temos o CPF de João Pedro'));
  assert.ok(msg.includes('ou responda "pedir"'));
});

test('trata nome vazio do médico e do paciente elegantemente', () => {
  const msg = redigirNotificacaoCandidato({
    valorCentavos: 20000,
    temCpf: true
  });

  assert.ok(msg.startsWith('Olá!'));
  assert.ok(msg.includes('Paciente'));
  assert.ok(msg.includes('200,00'));
});
