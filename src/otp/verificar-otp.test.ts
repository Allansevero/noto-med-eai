import { describe, it } from 'node:test';
import assert from 'node:assert';
import { verificarOtp } from './verificar-otp.js';
import { gerarHashOtp } from './hash-otp.js';
import { calcularDataExpiracao } from './limite-otp.js';
import type { OtpRepositorio, OtpRegistro, CriarOtpParams } from './otp-repositorio.js';

class OtpRepositorioMemoria implements OtpRepositorio {
  public registros: OtpRegistro[] = [];

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

describe('verificarOtp', () => {
  const pepper = 'pepper-secreto-teste';
  const telefone = '11987654321';
  const codigoCorreto = '654321';

  it('deve rejeitar código com formato inválido', async () => {
    const repo = new OtpRepositorioMemoria();
    const resultado = await verificarOtp(telefone, 'abc', { repositorio: repo, pepper });

    assert.strictEqual(resultado.ok, false);
    if (!resultado.ok) {
      assert.strictEqual(resultado.motivo, 'codigo_invalido');
    }
  });

  it('deve retornar nao_encontrado se não houver OTP pendente', async () => {
    const repo = new OtpRepositorioMemoria();
    const resultado = await verificarOtp(telefone, '123456', { repositorio: repo, pepper });

    assert.strictEqual(resultado.ok, false);
    if (!resultado.ok) {
      assert.strictEqual(resultado.motivo, 'nao_encontrado');
    }
  });

  it('deve verificar código correto com sucesso e marcar como verificado', async () => {
    const repo = new OtpRepositorioMemoria();
    const hash = gerarHashOtp(codigoCorreto, pepper);
    const expiraEm = calcularDataExpiracao(5);

    await repo.salvar({ telefone, codigoHash: hash, expiraEm });

    const resultado = await verificarOtp(telefone, codigoCorreto, { repositorio: repo, pepper });
    assert.strictEqual(resultado.ok, true);

    // Próxima verificação deve falhar porque já foi utilizado
    const reutilizacao = await verificarOtp(telefone, codigoCorreto, { repositorio: repo, pepper });
    assert.strictEqual(reutilizacao.ok, false);
    if (!reutilizacao.ok) {
      assert.strictEqual(reutilizacao.motivo, 'nao_encontrado');
    }
  });

  it('deve rejeitar código expirado', async () => {
    const repo = new OtpRepositorioMemoria();
    const hash = gerarHashOtp(codigoCorreto, pepper);
    const baseTempo = new Date('2026-09-26T12:00:00Z');
    const expiraEm = new Date('2026-09-26T12:05:00Z');

    await repo.salvar({ telefone, codigoHash: hash, expiraEm, criadoEm: baseTempo });

    const tempoAposExpiracao = new Date('2026-09-26T12:06:00Z');
    const resultado = await verificarOtp(telefone, codigoCorreto, {
      repositorio: repo,
      pepper,
      agora: () => tempoAposExpiracao
    });

    assert.strictEqual(resultado.ok, false);
    if (!resultado.ok) {
      assert.strictEqual(resultado.motivo, 'expirado');
    }
  });

  it('deve contabilizar tentativas falhas e bloquear quando atingir o limite', async () => {
    const repo = new OtpRepositorioMemoria();
    const hash = gerarHashOtp(codigoCorreto, pepper);
    const expiraEm = calcularDataExpiracao(5);

    await repo.salvar({ telefone, codigoHash: hash, expiraEm });

    // 5 tentativas incorretas consecutivas
    for (let i = 1; i <= 5; i++) {
      const tentativa = await verificarOtp(telefone, '000000', { repositorio: repo, pepper });
      assert.strictEqual(tentativa.ok, false);
      if (!tentativa.ok) {
        assert.strictEqual(tentativa.motivo, 'incorreto');
        assert.strictEqual(tentativa.tentativasRestantes, 5 - i);
      }
    }

    // A 6ª tentativa é bloqueada mesmo se acertar o código
    const bloqueado = await verificarOtp(telefone, codigoCorreto, { repositorio: repo, pepper });
    assert.strictEqual(bloqueado.ok, false);
    if (!bloqueado.ok) {
      assert.strictEqual(bloqueado.motivo, 'bloqueado_tentativas');
    }
  });
});
