import { describe, it } from 'node:test';
import assert from 'node:assert';
import { solicitarOtp } from './solicitar-otp.js';
import type { OtpRepositorio, OtpRegistro, CriarOtpParams } from './otp-repositorio.js';
import type { EnviarOtpWhatsapp, EnviarOtpParams, ResultadoEnvioOtp } from './enviar-otp-whatsapp.js';

class OtpRepositorioMemoria implements OtpRepositorio {
  private registros: OtpRegistro[] = [];

  async salvar(params: CriarOtpParams): Promise<OtpRegistro> {
    const registro: OtpRegistro = {
      id: `id-${this.registros.length + 1}`,
      telefone: params.telefone,
      codigoHash: params.codigoHash,
      tentativas: 0,
      expiraEm: params.expiraEm,
      verificadoEm: null,
      criadoEm: params.criadoEm ?? new Date()
    };
    this.registros.push(registro);
    return registro;
  }

  async buscarUltimoPorTelefone(telefone: string): Promise<OtpRegistro | null> {
    const filtrados = this.registros.filter((r) => r.telefone === telefone);
    return filtrados.length > 0 ? filtrados[filtrados.length - 1] : null;
  }

  async incrementarTentativas(id: string): Promise<void> {
    const reg = this.registros.find((r) => r.id === id);
    if (reg) reg.tentativas += 1;
  }

  async marcarVerificado(id: string, verificadoEm: Date = new Date()): Promise<void> {
    const reg = this.registros.find((r) => r.id === id);
    if (reg) reg.verificadoEm = verificadoEm;
  }
}

class EnviarOtpFake implements EnviarOtpWhatsapp {
  public envios: EnviarOtpParams[] = [];
  public deveFalhar = false;

  async enviar(params: EnviarOtpParams): Promise<ResultadoEnvioOtp> {
    if (this.deveFalhar) {
      return { sucesso: false, erro: 'Instância WhatsApp desconectada' };
    }
    this.envios.push(params);
    return { sucesso: true };
  }
}

describe('solicitarOtp', () => {
  const pepper = 'pepper-secreto-teste';

  it('deve rejeitar telefone inválido', async () => {
    const repo = new OtpRepositorioMemoria();
    const enviador = new EnviarOtpFake();

    const resultado = await solicitarOtp('123', { repositorio: repo, enviador, pepper });
    assert.strictEqual(resultado.ok, false);
    if (!resultado.ok) {
      assert.strictEqual(resultado.motivo, 'telefone_invalido');
    }
  });

  it('deve gerar, salvar e enviar OTP com sucesso', async () => {
    const repo = new OtpRepositorioMemoria();
    const enviador = new EnviarOtpFake();

    const resultado = await solicitarOtp('(11) 98765-4321', { repositorio: repo, enviador, pepper });
    assert.strictEqual(resultado.ok, true);
    assert.strictEqual(enviador.envios.length, 1);
    assert.strictEqual(enviador.envios[0].telefone, '11987654321');
    assert.match(enviador.envios[0].codigo, /^\d{6}$/);

    const salvo = await repo.buscarUltimoPorTelefone('11987654321');
    assert.ok(salvo !== null);
    assert.strictEqual(salvo.tentativas, 0);
  });

  it('deve bloquear solicitação se estiver em cooldown', async () => {
    const repo = new OtpRepositorioMemoria();
    const enviador = new EnviarOtpFake();
    let tempoAtual = new Date('2026-09-26T12:00:00Z');

    const primeiro = await solicitarOtp('11987654321', {
      repositorio: repo,
      enviador,
      pepper,
      agora: () => tempoAtual
    });
    assert.strictEqual(primeiro.ok, true);

    // 30 segundos depois (dentro do cooldown de 60s)
    tempoAtual = new Date('2026-09-26T12:00:30Z');
    const segundo = await solicitarOtp('11987654321', {
      repositorio: repo,
      enviador,
      pepper,
      agora: () => tempoAtual
    });
    assert.strictEqual(segundo.ok, false);
    if (!segundo.ok) {
      assert.strictEqual(segundo.motivo, 'em_cooldown');
    }

    // 65 segundos depois (fora do cooldown)
    tempoAtual = new Date('2026-09-26T12:01:05Z');
    const terceiro = await solicitarOtp('11987654321', {
      repositorio: repo,
      enviador,
      pepper,
      agora: () => tempoAtual
    });
    assert.strictEqual(terceiro.ok, true);
  });

  it('deve retornar falha_envio quando o enviador falhar', async () => {
    const repo = new OtpRepositorioMemoria();
    const enviador = new EnviarOtpFake();
    enviador.deveFalhar = true;

    const resultado = await solicitarOtp('11987654321', { repositorio: repo, enviador, pepper });
    assert.strictEqual(resultado.ok, false);
    if (!resultado.ok) {
      assert.strictEqual(resultado.motivo, 'falha_envio');
    }
  });
});
