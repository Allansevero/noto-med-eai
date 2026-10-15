import test from 'node:test';
import assert from 'node:assert';
import { SheetsFontePacientes } from './sheets-fonte-pacientes.js';

test('SheetsFontePacientes: retorna vazio quando médico não tem conexão ou planilha', async () => {
  const mockPool = {
    query: async () => ({ rows: [] })
  } as any;

  const fonte = new SheetsFontePacientes(mockPool, 'chave-123');
  const res = await fonte.buscar('med-1', { nome: 'Carlos' });
  assert.strictEqual(res.length, 0);
});

test('SheetsFontePacientes: busca em tempo real via Google Sheets API com cache', async () => {
  let chamadasFetch = 0;
  const mockPool = {
    query: async () => ({
      rows: [
        {
          planilha_id: 'sheet-xyz',
          aba_nome: 'Pacientes',
          mapeamento_colunas: {
            indiceNome: 0,
            indiceCpf: 1,
            indiceTelefone: 2,
            indiceData: 3,
            indiceValor: 4
          },
          access_token: 'token-valido',
          refresh_token: null,
          expira_em: new Date(Date.now() + 3600_000)
        }
      ]
    })
  } as any;

  const mockFetch = async () => {
    chamadasFetch++;
    return {
      ok: true,
      json: async () => ({
        values: [
          ['Nome Completo', 'CPF', 'Telefone', 'Data', 'Valor'],
          ['Antônio Marques', '52998224725', '51998124521', '14/10/2026', '400,00'],
          ['Beatriz Santos', '12345678909', '11999998888', '12/10/2026', '350,00']
        ]
      })
    };
  };

  const fonte = new SheetsFontePacientes(mockPool, 'chave-123', 'id', 'secret', mockFetch as any);

  // 1ª busca: chama fetch
  const res1 = await fonte.buscar('med-1', { nome: 'Antônio Marques' });
  assert.strictEqual(res1.length, 1);
  assert.strictEqual(res1[0].nome, 'Antônio Marques');
  assert.strictEqual(res1[0].cpfLimpo, '52998224725');
  assert.strictEqual(res1[0].telefone, '51998124521');
  assert.strictEqual(res1[0].origem, 'sheets');
  assert.strictEqual(chamadasFetch, 1);

  // 2ª busca rápida: aproveita o cache de 60s
  const res2 = await fonte.buscar('med-1', { nome: 'Beatriz' });
  assert.strictEqual(res2.length, 1);
  assert.strictEqual(res2[0].nome, 'Beatriz Santos');
  assert.strictEqual(chamadasFetch, 1);
});
