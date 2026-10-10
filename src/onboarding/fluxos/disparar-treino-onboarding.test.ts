import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setImmediate } from 'node:timers/promises';
import { criarDisparadorTreino } from './disparar-treino-onboarding.js';
test('treino desativado mesmo com flag antiga ligada, sem reservar ou enviar', async (t) => {
  let acessos = 0;
  t.mock.method(globalThis, 'fetch', async () => {
    acessos++;
    throw Error('não enviar');
  });
  const pool: any = {
    query: async () => {
      acessos++;
      throw Error('não consultar treino');
    }
  };
  const disparar = criarDisparadorTreino(pool, {
    treinoOnboardingAtivo: true,
    evolutionApiUrl: 'https://e.test',
    evolutionGlobalApiKey: 'teste',
    evolutionOfficialInstanceName: 'oficial'
  } as any);
  disparar('med-1');
  await setImmediate();
  assert.equal(acessos, 0);
});
