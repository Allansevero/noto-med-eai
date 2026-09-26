import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  otpEstaExpirado,
  excedeuTentativasOtp,
  estaEmCooldownReenvio,
  calcularDataExpiracao
} from './limite-otp.js';

describe('limite-otp', () => {
  it('deve identificar quando o OTP está expirado', () => {
    const agora = new Date('2026-09-26T12:00:00Z');
    const expirado = new Date('2026-09-26T11:59:59Z');
    const valido = new Date('2026-09-26T12:05:00Z');

    assert.strictEqual(otpEstaExpirado(expirado, agora), true);
    assert.strictEqual(otpEstaExpirado(valido, agora), false);
  });

  it('deve verificar limite de tentativas excedido', () => {
    assert.strictEqual(excedeuTentativasOtp(4, 5), false);
    assert.strictEqual(excedeuTentativasOtp(5, 5), true);
    assert.strictEqual(excedeuTentativasOtp(6, 5), true);
  });

  it('deve verificar cooldown de reenvio entre solicitações', () => {
    const criadoEm = new Date('2026-09-26T12:00:00Z');
    const dentroDoCooldown = new Date('2026-09-26T12:00:45Z');
    const aposCooldown = new Date('2026-09-26T12:01:05Z');

    assert.strictEqual(estaEmCooldownReenvio(criadoEm, 60, dentroDoCooldown), true);
    assert.strictEqual(estaEmCooldownReenvio(criadoEm, 60, aposCooldown), false);
  });

  it('deve calcular data de expiração adicionando os minutos configurados', () => {
    const base = new Date('2026-09-26T12:00:00Z');
    const expira = calcularDataExpiracao(5, base);

    assert.strictEqual(expira.toISOString(), '2026-09-26T12:05:00.000Z');
  });
});
