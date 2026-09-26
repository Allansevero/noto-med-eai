import { describe, it } from 'node:test';
import assert from 'node:assert';
import { extrairTelefoneJid } from './extrair-telefone-jid.js';

describe('extrairTelefoneJid', () => {
  it('deve retornar null para valores nulos, vazios ou indefinidos', () => {
    assert.strictEqual(extrairTelefoneJid(null), null);
    assert.strictEqual(extrairTelefoneJid(undefined), null);
    assert.strictEqual(extrairTelefoneJid(''), null);
  });

  it('deve descartar mensagens de grupo e broadcast', () => {
    assert.strictEqual(extrairTelefoneJid('120363023456789@g.us'), null);
    assert.strictEqual(extrairTelefoneJid('status@broadcast'), null);
  });

  it('deve extrair telefone de JID individual comum', () => {
    const telefone = extrairTelefoneJid('5511999998888@s.whatsapp.net');
    assert.strictEqual(telefone, '5511999998888');
  });

  it('deve extrair telefone ignorando identificador de dispositivo multi-device', () => {
    const telefone = extrairTelefoneJid('5511999998888:12@s.whatsapp.net');
    assert.strictEqual(telefone, '5511999998888');
  });

  it('deve rejeitar identificadores com quantidade inválida de dígitos', () => {
    assert.strictEqual(extrairTelefoneJid('123@s.whatsapp.net'), null);
  });
});
