import { describe, expect, it, vi } from 'vitest';
import type pg from 'pg';
import { lerEstadoComunicacaoMedico } from '../src/onboarding/io/ler-estado-comunicacao-medico.js';

const medicoId = 'medico-ficticio'; const agora = new Date('2026-10-18T15:00:00Z');
const agenda = { nome: 'tribemd', conectada: true };
function banco() {
  const linha: Record<string, any> = { medico_id: medicoId, usuario_id: 'usuario-ficticio', medico_nome: 'Medica Ficticia', crm: '12345/SC', rqe: null,
    cert_ativos: '1', whats_conectados: '1', whatsapp_vinculado: true, confirmado_pelo_medico: true,
    revisao_profissional: { estado: 'concluido', dados: { aprovacaoPainel: { confirmadoEm: '2026-10-17T15:00:00Z', nome: 'Medica Ficticia', crm: '12345/SC', rqe: null } } } };
  let notas: unknown[] = [{ data_emissao: '2026-10-17T15:00:00Z', valor_servicos_centavos: 35000, paciente: 'Paciente Ficticio' }];
  const chamadas: Array<[string, any[]]> = [];
  const pool = { query: vi.fn(async (sql: string, parametros: any[]) => {
    chamadas.push([sql, parametros]);
    if (sql.includes('as cert_ativos')) return { rows: [linha] };
    if (sql.includes('from notas_fiscais')) return { rows: notas };
    throw Error('SQL_FORA_DA_BORDA');
  }) };
  return { linha, pool: pool as unknown as pg.Pool, chamadas, semNota: () => { notas = []; } };
}
describe('estado do médico reutiliza o checklist e consulta a nota do banco', () => {
  it('monta última nota, fiscal e agenda explícita sem consultar credenciais', async () => {
    const c = banco(); const r = await lerEstadoComunicacaoMedico(c.pool, medicoId, agora, agenda, false);
    expect(r).toEqual({ nomeMedico: 'Medica Ficticia', estado: { agora, fiscal: { certificado: 'ok', dadosFiscais: 'ok' }, agenda,
      ultimaNota: { dataEmissao: '2026-10-17T15:00:00.000Z', diasDesdeEmissao: 1, valorCentavos: 35000, paciente: 'Paciente Ficticio' } } });
    const [sql, parametros] = c.chamadas[1];
    expect(sql).toMatch(/where n\.medico_id = \$1/); expect(sql).toContain("n.status = 'autorizada'");
    expect(sql).toMatch(/p\.medico_id = n\.medico_id/); expect(sql).toMatch(/order by n\.data_emissao desc/); expect(parametros).toEqual([medicoId]);
    expect(sql).not.toMatch(/senha|password|token|cookie/i);
  });
  it('ausência de nota e agenda desconectada são preservadas', async () => {
    const c = banco(); c.semNota();
    expect(await lerEstadoComunicacaoMedico(c.pool, medicoId, agora, { nome: null, conectada: false }, false)).toMatchObject({ estado: { ultimaNota: null, agenda: { nome: null, conectada: false } } });
  });
  it.each(['certificado', 'dadosFiscais'] as const)('problema de %s vem do checklist sem bloquear comunicação após vínculo', async campo => {
    const c = banco(); if (campo === 'certificado') c.linha.cert_ativos = '0'; else c.linha.confirmado_pelo_medico = false;
    expect(await lerEstadoComunicacaoMedico(c.pool, medicoId, agora, agenda, false)).toMatchObject({ estado: { fiscal: { [campo]: 'problema' } } });
  });
  it('desconexão temporária do WhatsApp não apaga o onboarding já vinculado', async () => {
    const c = banco(); c.linha.whats_conectados = '0';
    expect(await lerEstadoComunicacaoMedico(c.pool, medicoId, agora, agenda, false)).not.toBeNull();
  });
  it('antes do vínculo não monta comunicação', async () => {
    const c = banco(); c.linha.whats_conectados = '0'; c.linha.whatsapp_vinculado = false;
    expect(await lerEstadoComunicacaoMedico(c.pool, medicoId, agora, agenda, false)).toBeNull(); expect(c.chamadas).toHaveLength(1);
  });
  it('sem aprovação profissional não presume término do onboarding', async () => {
    const c = banco(); c.linha.revisao_profissional = null;
    expect(await lerEstadoComunicacaoMedico(c.pool, medicoId, agora, agenda, false)).toBeNull();
  });
  it('erro de banco não inventa estado', async () => {
    const pool = { query: async () => { throw Error('erro privado ficticio'); } } as unknown as pg.Pool;
    await expect(lerEstadoComunicacaoMedico(pool, medicoId, agora, agenda, false)).rejects.toThrow();
  });
});
