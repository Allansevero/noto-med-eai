import { describe, expect, it, vi } from 'vitest';
import type pg from 'pg';
import type { SupabaseClient } from '@supabase/supabase-js';
import { solicitarOtp } from '../src/otp/solicitar-otp.js';
import { verificarOtp } from '../src/otp/verificar-otp.js';
import { gerarHashOtp } from '../src/otp/hash-otp.js';
import type { OtpRepositorio, OtpRegistro } from '../src/otp/otp-repositorio.js';
import { autenticarComOtp } from '../src/auth/autenticar-com-otp.js';
import type { AuthAdminService, UsuarioAutenticadoInfo } from '../src/auth/auth-admin-service.js';
import { SupabaseAuthAdminService } from '../src/io/supabase/supabase-auth-admin-service.js';

const telefone = '5511999990000';
const inicio = new Date('2026-10-17T12:00:00Z');
const pepper = 'pepper-ficticio-otp';

function otpEmMemoria() {
  let registro: OtpRegistro | null = null;
  let codigoEnviado = '';
  let agora = inicio;
  let falhaEnvio = false;
  const repositorio: OtpRepositorio = {
    async salvar(params) { registro = { ...params, id: 'otp-1', criadoEm: params.criadoEm ?? agora, tentativas: 0, verificadoEm: null }; return registro; },
    async buscarUltimoPorTelefone(numero) { return registro?.telefone === numero ? registro : null; },
    async incrementarTentativas() { registro!.tentativas++; },
    async marcarVerificado(_id, data) { registro!.verificadoEm = data ?? agora; }
  };
  const deps = { repositorio, pepper, agora: () => agora,
    enviador: { async enviar(input: { telefone: string; codigo: string }) { codigoEnviado = input.codigo; return falhaEnvio ? { sucesso: false, erro: 'WHATSAPP_INDISPONIVEL' } : { sucesso: true }; } } };
  return { deps, codigo: () => codigoEnviado, registro: () => registro,
    avancar(ms: number) { agora = new Date(inicio.getTime() + ms); }, falharEnvio() { falhaEnvio = true; } };
}

function identidade(novo: boolean) {
  const eventos: string[] = [];
  const usuario: UsuarioAutenticadoInfo = { usuarioId: 'usuario-1', medicoId: 'medico-1', authUserId: 'auth-1', nome: 'Clara Almeida', papel: 'medico', ehNovoUsuario: novo };
  const authAdminService: AuthAdminService = {
    async buscarPorTelefone(numero) { eventos.push(`buscar:${numero}`); return novo ? null : usuario; },
    async cadastrarNovoMedico(input) { eventos.push(`cadastrar:${input.telefone}`); return usuario; },
    async gerarSessaoParaUsuario(id) { eventos.push(`sessao:${id}`); return { tokenAcesso: 'sessao-ficticia' }; }
  };
  return { authAdminService, usuario, eventos };
}

describe('OTP real com persistência e WhatsApp fake', () => {
  it.each(['123', '123456789012345', 'sem numero'])('não cria OTP para telefone %s', async numero => {
    const banco = otpEmMemoria();
    expect(await solicitarOtp(numero, banco.deps)).toMatchObject({ ok: false, motivo: 'telefone_invalido' });
    expect(banco.registro()).toBeNull(); expect(banco.codigo()).toBe('');
  });

  it('envia seis dígitos, persiste só o hash e expira em cinco minutos', async () => {
    const banco = otpEmMemoria();
    expect(await solicitarOtp('+55 (11) 99999-0000', banco.deps)).toEqual({ ok: true, expiraEm: new Date('2026-10-17T12:05:00Z') });
    expect(banco.codigo()).toMatch(/^\d{6}$/);
    expect(banco.registro()).toEqual({ id: 'otp-1', telefone, codigoHash: gerarHashOtp(banco.codigo(), pepper), criadoEm: inicio,
      expiraEm: new Date('2026-10-17T12:05:00Z'), tentativas: 0, verificadoEm: null });
    expect(banco.registro()!.codigoHash).not.toBe(banco.codigo());
  });

  it('bloqueia reenvio antes de 60s e libera no limite exato', async () => {
    const banco = otpEmMemoria(); await solicitarOtp(telefone, banco.deps);
    banco.avancar(59999);
    expect(await solicitarOtp(telefone, banco.deps)).toMatchObject({ ok: false, motivo: 'em_cooldown' });
    banco.avancar(60000);
    expect(await solicitarOtp(telefone, banco.deps)).toEqual({ ok: true, expiraEm: new Date('2026-10-17T12:06:00Z') });
  });

  it('falha de envio mantém o registro e aplica cooldown (achado)', async () => {
    const banco = otpEmMemoria(); banco.falharEnvio();
    expect(await solicitarOtp(telefone, banco.deps)).toEqual({ ok: false, motivo: 'falha_envio', detalhe: 'WHATSAPP_INDISPONIVEL' });
    expect(banco.registro()).not.toBeNull();
    expect(await solicitarOtp(telefone, banco.deps)).toMatchObject({ ok: false, motivo: 'em_cooldown' });
  });

  it('aceita código no instante exato da expiração; rejeita um milissegundo depois', async () => {
    const banco = otpEmMemoria(); await solicitarOtp(telefone, banco.deps); banco.avancar(300001);
    expect(await verificarOtp(telefone, banco.codigo(), banco.deps)).toMatchObject({ ok: false, motivo: 'expirado' });
    banco.avancar(300000);
    expect(await verificarOtp(telefone, ` ${banco.codigo()} `, banco.deps)).toEqual({ ok: true, telefone });
  });

  it('bloqueia após cinco erros mesmo que o próximo código esteja correto', async () => {
    const banco = otpEmMemoria(); await solicitarOtp(telefone, banco.deps);
    const errado = banco.codigo() === '000000' ? '111111' : '000000';
    for (let tentativa = 1; tentativa <= 5; tentativa++) {
      expect(await verificarOtp(telefone, errado, banco.deps)).toEqual({ ok: false, motivo: 'incorreto', detalhe: 'Código incorreto', tentativasRestantes: 5 - tentativa });
    }
    expect(await verificarOtp(telefone, banco.codigo(), banco.deps)).toMatchObject({ ok: false, motivo: 'bloqueado_tentativas' });
    expect(banco.registro()!.tentativas).toBe(5);
  });

  it('código já verificado não pode ser reutilizado', async () => {
    const banco = otpEmMemoria(); await solicitarOtp(telefone, banco.deps);
    expect(await verificarOtp(telefone, banco.codigo(), banco.deps)).toEqual({ ok: true, telefone });
    expect(banco.registro()!.verificadoEm).toEqual(inicio);
    expect(await verificarOtp(telefone, banco.codigo(), banco.deps)).toMatchObject({ ok: false, motivo: 'nao_encontrado' });
  });

  it('formato inválido não consome tentativa', async () => {
    const banco = otpEmMemoria(); await solicitarOtp(telefone, banco.deps);
    expect(await verificarOtp(telefone, '12ab34', banco.deps)).toMatchObject({ ok: false, motivo: 'codigo_invalido' });
    expect(banco.registro()!.tentativas).toBe(0);
  });
});

describe('login/cadastro depois de verificar OTP de verdade', () => {
  it.each([false, true])('gera sessão, novo usuário = %s', async novo => {
    const banco = otpEmMemoria(); const auth = identidade(novo); await solicitarOtp(telefone, banco.deps);
    expect(await autenticarComOtp(telefone, banco.codigo(), { otpRepositorio: banco.deps.repositorio, authAdminService: auth.authAdminService, pepper, agora: banco.deps.agora }))
      .toEqual({ ok: true, sessao: { usuario: auth.usuario, tokenAcesso: 'sessao-ficticia', urlRedirecionamento: undefined } });
    expect(auth.eventos).toEqual(novo ? [`buscar:${telefone}`, `cadastrar:${telefone}`, 'sessao:auth-1'] : [`buscar:${telefone}`, 'sessao:auth-1']);
    expect(banco.registro()!.verificadoEm).toEqual(inicio);
  });

  it('não chama identidade para OTP ausente', async () => {
    const banco = otpEmMemoria(); const auth = identidade(false);
    expect(await autenticarComOtp(telefone, '123456', { otpRepositorio: banco.deps.repositorio, authAdminService: auth.authAdminService, pepper }))
      .toEqual({ ok: false, motivo: 'nao_encontrado', tentativasRestantes: undefined });
    expect(auth.eventos).toEqual([]);
  });

  it('falha da sessão Supabase deixa o OTP consumido (achado)', async () => {
    const banco = otpEmMemoria(); const auth = identidade(false); await solicitarOtp(telefone, banco.deps);
    auth.authAdminService.gerarSessaoParaUsuario = async () => { throw new Error('SUPABASE_INDISPONIVEL'); };
    const deps = { otpRepositorio: banco.deps.repositorio, authAdminService: auth.authAdminService, pepper, agora: banco.deps.agora };
    await expect(autenticarComOtp(telefone, banco.codigo(), deps)).rejects.toThrow('SUPABASE_INDISPONIVEL');
    expect(await autenticarComOtp(telefone, banco.codigo(), deps)).toMatchObject({ ok: false, motivo: 'nao_encontrado' });
  });
});

describe('adaptador Supabase — sessão separada da identidade administrativa', () => {
  it.each(['auth-1', 'outro-auth'])('valida o usuário devolvido pelo provedor: %s', async idRetornado => {
    const clienteSessao = { auth: { async verifyOtp() { return { data: { session: { access_token: 'token-ficticio' }, user: { id: idRetornado } }, error: null }; } } } as unknown as SupabaseClient;
    const pool = { query: async () => { throw new Error('Nenhum SQL esperado na emissão da sessão'); } } as unknown as pg.Pool;
    const servico = new SupabaseAuthAdminService('https://supabase.invalid', 'chave-ficticia', pool, () => clienteSessao);
    const email = vi.spyOn(servico.supabaseClient.auth.admin, 'getUserById').mockResolvedValue({ data: { user: { id: 'auth-1', email: 'identidade@example.invalid' } }, error: null } as any);
    const link = vi.spyOn(servico.supabaseClient.auth.admin, 'generateLink').mockResolvedValue({ data: { properties: { hashed_token: 'hash-ficticio' } }, error: null } as any);
    const administrativo = vi.spyOn(servico.supabaseClient.auth, 'verifyOtp').mockImplementation(async () => { throw new Error('Não trocar a sessão administrativa'); });
    try {
      if (idRetornado === 'auth-1') expect(await servico.gerarSessaoParaUsuario('auth-1')).toEqual({ tokenAcesso: 'token-ficticio' });
      else await expect(servico.gerarSessaoParaUsuario('auth-1')).rejects.toThrow('Não foi possível validar a sessão de acesso.');
    } finally { email.mockRestore(); link.mockRestore(); administrativo.mockRestore(); }
  });
});
