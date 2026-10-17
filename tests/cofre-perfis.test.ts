import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash, randomBytes } from 'node:crypto';
import { copyFile, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PerfisTribemd, type PerfilTribemd } from '../src/desenvolvedor/tribemd-perfil.js';

let diretorio: string;
let chave: string;
let perfis: PerfisTribemd;
const perfil: PerfilTribemd = { email: 'clinica@example.invalid', senha: 'senha-ficticia-unica-para-teste',
  estado: { cookies: [{ name: 'sessao', value: 'cookie-ficticio', domain: 'app.tribemd.com', path: '/', expires: -1, httpOnly: true, secure: true, sameSite: 'Lax' }], origins: [] } };
const arquivo = (conta: string) => join(diretorio, createHash('sha256').update(conta).digest('hex') + '.enc');

beforeEach(async () => {
  diretorio = await mkdtemp(join(tmpdir(), 'noto-perfis-teste-')); chave = randomBytes(32).toString('base64');
  perfis = new PerfisTribemd(diretorio, chave);
});
afterEach(async () => { await rm(diretorio, { recursive: true, force: true }); });

describe('envelope AES-GCM real, arquivos temporários por conta', () => {
  it('descriptografa credenciais e cookies sem os persistir em texto claro', async () => {
    await perfis.salvar('conta-a', perfil);
    expect(await perfis.ler('conta-a')).toEqual(perfil);
    const texto = await readFile(arquivo('conta-a'), 'utf8');
    for (const segredo of [perfil.email!, perfil.senha!, 'cookie-ficticio']) expect(texto).not.toContain(segredo);
    expect(Object.keys(JSON.parse(texto)).sort()).toEqual(['dados', 'iv', 'tag', 'v']);
    expect((await stat(arquivo('conta-a'))).mode & 0o777).toBe(0o600);
    expect((await stat(diretorio)).mode & 0o777).toBe(0o700);
    expect(await readdir(diretorio)).toEqual([createHash('sha256').update('conta-a').digest('hex') + '.enc']);
  });

  it('salva credenciais diferentes sem misturar as contas', async () => {
    const outro = { email: 'outra@example.invalid', senha: 'outra-senha-ficticia' };
    await perfis.salvar('conta-a', perfil); await perfis.salvar('conta-b', outro);
    expect(await perfis.ler('conta-a')).toEqual(perfil); expect(await perfis.ler('conta-b')).toEqual(outro);
    expect(await perfis.ler('conta-inexistente')).toEqual({});
  });

  it('gera IV e ciphertext novos ao salvar o mesmo conteúdo', async () => {
    await perfis.salvar('conta-a', perfil); const antes = JSON.parse(await readFile(arquivo('conta-a'), 'utf8'));
    await perfis.salvar('conta-a', perfil); const depois = JSON.parse(await readFile(arquivo('conta-a'), 'utf8'));
    expect(depois.iv).not.toBe(antes.iv); expect(depois.dados).not.toBe(antes.dados);
    expect(await perfis.ler('conta-a')).toEqual(perfil);
  });

  it('não descriptografa envelope com outra chave', async () => {
    await perfis.salvar('conta-a', perfil);
    const outraChave = new PerfisTribemd(diretorio, randomBytes(32).toString('base64'));
    await expect(outraChave.ler('conta-a')).rejects.toThrow('PERFIL_INTEGRA_INVALIDA');
  });

  it('AAD impede trocar envelope de uma conta pelo de outra', async () => {
    await perfis.salvar('conta-a', perfil); await copyFile(arquivo('conta-a'), arquivo('conta-b'));
    await expect(perfis.ler('conta-b')).rejects.toThrow('PERFIL_INTEGRA_INVALIDA');
    expect(await perfis.ler('conta-a')).toEqual(perfil);
  });

  it('detecta alteração de um byte do ciphertext', async () => {
    await perfis.salvar('conta-a', perfil); const envelope = JSON.parse(await readFile(arquivo('conta-a'), 'utf8'));
    const dados = Buffer.from(envelope.dados, 'base64'); dados[0] ^= 1; envelope.dados = dados.toString('base64');
    await writeFile(arquivo('conta-a'), JSON.stringify(envelope));
    await expect(perfis.ler('conta-a')).rejects.toThrow('PERFIL_INTEGRA_INVALIDA');
  });

  it('bloqueia concorrência na mesma conta e permite outra conta', async () => {
    const liberarA = await perfis.bloquear('conta-a'); const liberarB = await perfis.bloquear('conta-b');
    try { await expect(perfis.bloquear('conta-a')).rejects.toThrow('PERFIL_OCUPADO'); }
    finally { await liberarA(); await liberarB(); }
    const liberarNovamente = await perfis.bloquear('conta-a'); await liberarNovamente();
    expect(await readdir(diretorio)).toEqual([]);
  });

  it('excluir conta A não apaga o perfil de B', async () => {
    await perfis.salvar('conta-a', perfil); await perfis.salvar('conta-b', perfil); await perfis.esquecer('conta-a');
    expect(await perfis.ler('conta-a')).toEqual({}); expect(await perfis.ler('conta-b')).toEqual(perfil);
  });

  it('não escreve credencial em console no sucesso ou erro de integridade', async () => {
    const chamadas: unknown[] = [];
    const espioes = (['log', 'info', 'warn', 'error', 'debug'] as const).map(metodo => vi.spyOn(console, metodo).mockImplementation((...args) => { chamadas.push(args); }));
    try {
      await perfis.salvar('conta-a', perfil); expect(await perfis.ler('conta-a')).toEqual(perfil);
      await writeFile(arquivo('conta-a'), '{}'); await expect(perfis.ler('conta-a')).rejects.toThrow('PERFIL_INTEGRA_INVALIDA');
      expect(chamadas).toEqual([]);
    } finally { for (const espiao of espioes) espiao.mockRestore(); }
  });

  it.each(['', 'AAAA', Buffer.alloc(31).toString('base64')])('rejeita chave inválida %s', entrada => {
    expect(() => new PerfisTribemd(diretorio, entrada)).toThrow('32 bytes em base64');
  });
  it('rejeita caminho arbitrário no identificador da conta', async () => {
    await expect(perfis.salvar('../outra-conta', perfil)).rejects.toThrow('CLINICA_INVALIDA');
    expect(await readdir(diretorio)).toEqual([]);
  });
});
