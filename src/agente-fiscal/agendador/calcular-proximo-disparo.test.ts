import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parsearHorariosConfigurados,
  calcularProximoDisparoMs
} from './calcular-proximo-disparo.js';

describe('calcularProximoDisparo', () => {
  test('deve parsear múltiplos horários separados por vírgula', () => {
    const horarios = parsearHorariosConfigurados('12:00, 18:00, 20:30');
    assert.deepEqual(horarios, [
      { horas: 12, minutos: 0 },
      { horas: 18, minutos: 0 },
      { horas: 20, minutos: 30 }
    ]);
  });

  test('deve retornar horário padrão de 18:00 para string vazia ou inválida', () => {
    const horarios = parsearHorariosConfigurados('');
    assert.deepEqual(horarios, [{ horas: 18, minutos: 0 }]);
  });

  test('deve calcular próximo horário corretamente dentro do mesmo dia', () => {
    // 10:00 da manhã no fuso de Brasília
    const agora = new Date('2026-10-13T13:00:00.000Z'); // 13h UTC = 10h Brasília
    const horarios = [{ horas: 12, minutos: 0 }, { horas: 18, minutos: 0 }];

    const calc = calcularProximoDisparoMs(horarios, agora, 'America/Sao_Paulo');
    // Deve apontar para 12:00 (daqui a aprox 2 horas = 7.200.000 ms)
    assert.ok(calc.msRestantes > 7_000_000 && calc.msRestantes <= 7_200_000);
  });

  test('deve avançar para o primeiro horário do dia seguinte após o último horário passar', () => {
    // 19:00 da noite no fuso de Brasília
    const agora = new Date('2026-10-13T22:00:00.000Z'); // 22h UTC = 19h Brasília
    const horarios = [{ horas: 12, minutos: 0 }, { horas: 18, minutos: 0 }];

    const calc = calcularProximoDisparoMs(horarios, agora, 'America/Sao_Paulo');
    // Deve apontar para 12:00 do dia seguinte (daqui a 17 horas = ~61.200.000 ms)
    assert.ok(calc.msRestantes > 60_000_000);
  });
});
