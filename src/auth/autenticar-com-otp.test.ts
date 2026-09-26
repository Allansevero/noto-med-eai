import { describe, it } from 'node:test';
import assert from 'node:assert';
import { autenticarComOtp } from './autenticar-com-otp.js';
import { gerarHashOtp } from '../otp/hash-otp.js';
import { calcularDataExpiracao } from '../otp/limite-otp.js';
import type { OtpRepositorio, OtpRegistro, CriarOtpParams } from '../otp/otp-repositorio.js';
import type { AuthAdminService, UsuarioAutenticadoInfo } from './auth-admin-service.js';

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

class AuthAdminServiceFake implements AuthAdminService {
  public usuarios: Array<{ telefone: string; info: UsuarioAutenticadoInfo }> = [];

  async buscarPorTelefone(telefone: string): Promise<UsuarioAutenticadoInfo | null> {
    const achado = this.usuarios.find((u) => u.telefone === telefone);
    return achado ? achado.info : null;
  }

  async cadastrarNovoMedico(params: { telefone: string }): Promise<UsuarioAutenticadoInfo> {
    const novo: UsuarioAutenticadoInfo = {
      usuarioId: `user-${this.usuarios.length + 1}`,
      authUserId: `auth-${this.usuarios.length + 1}`,
      papel: 'medico',
      ehNovoUsuario: true
    };
    this.usuarios.push({ telefone: params.telefone, info: novo });
    return novo;
  }

  async gerarSessaoParaUsuario(authUserId: string): Promise<{ tokenAcesso: string; urlRedirecionamento?: string }> {
    return {
      tokenAcesso: `jwt-supabase-token-para-${authUserId}`,
      urlRedirecionamento: `https://app.notomed.com.br/login#access_token=jwt-supabase-token-para-${authUserId}`
    };
  }
}

describe('autenticarComOtp', () => {
  const pepper = 'pepper-auth-teste';
  const telefone = '11987654321';
  const codigoCorreto = '123456';

  it('deve rejeitar código incorreto e retornar tentativas restantes', async () => {
    const repo = new OtpRepositorioMemoria();
    const auth = new AuthAdminServiceFake();

    const hash = gerarHashOtp(codigoCorreto, pepper);
    await repo.salvar({ telefone, codigoHash: hash, expiraEm: calcularDataExpiracao(5) });

    const res = await autenticarComOtp(telefone, '999999', {
      otpRepositorio: repo,
      authAdminService: auth,
      pepper
    });

    assert.strictEqual(res.ok, false);
    if (!res.ok) {
      assert.strictEqual(res.motivo, 'incorreto');
      assert.strictEqual(res.tentativasRestantes, 4);
    }
  });

  it('deve cadastrar novo médico e gerar sessão Supabase quando o telefone não existir', async () => {
    const repo = new OtpRepositorioMemoria();
    const auth = new AuthAdminServiceFake();

    const hash = gerarHashOtp(codigoCorreto, pepper);
    await repo.salvar({ telefone, codigoHash: hash, expiraEm: calcularDataExpiracao(5) });

    const res = await autenticarComOtp(telefone, codigoCorreto, {
      otpRepositorio: repo,
      authAdminService: auth,
      pepper
    });

    assert.strictEqual(res.ok, true);
    if (res.ok) {
      assert.strictEqual(res.sessao.usuario.ehNovoUsuario, true);
      assert.strictEqual(res.sessao.usuario.papel, 'medico');
      assert.ok(res.sessao.tokenAcesso.includes('jwt-supabase-token'));
    }
  });

  it('deve fazer login em conta existente sem criar novo cadastro', async () => {
    const repo = new OtpRepositorioMemoria();
    const auth = new AuthAdminServiceFake();

    // Usuário já existente
    auth.usuarios.push({
      telefone,
      info: {
        usuarioId: 'user-existente',
        authUserId: 'auth-existente',
        papel: 'medico',
        ehNovoUsuario: false
      }
    });

    const hash = gerarHashOtp(codigoCorreto, pepper);
    await repo.salvar({ telefone, codigoHash: hash, expiraEm: calcularDataExpiracao(5) });

    const res = await autenticarComOtp(telefone, codigoCorreto, {
      otpRepositorio: repo,
      authAdminService: auth,
      pepper
    });

    assert.strictEqual(res.ok, true);
    if (res.ok) {
      assert.strictEqual(res.sessao.usuario.ehNovoUsuario, false);
      assert.strictEqual(res.sessao.usuario.usuarioId, 'user-existente');
      assert.strictEqual(res.sessao.tokenAcesso, 'jwt-supabase-token-para-auth-existente');
    }
    assert.strictEqual(auth.usuarios.length, 1); // não duplicou
  });
});
