import { describe, it } from 'node:test';
import assert from 'node:assert';
import { extrairDatasConsulta } from './extrair-datas-consulta.js';

describe('extrairDatasConsulta', () => {
  const agoraFixo = new Date(2026, 8, 30, 10, 0, 0); // 30/09/2026

  it('deve retornar encontrou: false para textos nulos, vazios ou sem data', () => {
    assert.strictEqual(extrairDatasConsulta(null, agoraFixo).encontrou, false);
    assert.strictEqual(extrairDatasConsulta('', agoraFixo).encontrou, false);
    assert.strictEqual(extrairDatasConsulta('Vou enviar em instantes a sua NF no valor de R$ 350', agoraFixo).encontrou, false);
  });

  it('deve extrair data única DD/MM assumindo ano corrente', () => {
    const res = extrairDatasConsulta('Vou enviar em instantes a sua NF no valor de R$ 350 da consulta de 25/09', agoraFixo);
    assert.strictEqual(res.encontrou, true);
    assert.strictEqual(res.datas.length, 1);
    assert.strictEqual(res.textoFormatado, '25/09/2026');
  });

  it('deve extrair data única com ano completo DD/MM/AAAA', () => {
    const res = extrairDatasConsulta('/emissao 350 dia 15/08/2025', agoraFixo);
    assert.strictEqual(res.encontrou, true);
    assert.strictEqual(res.datas.length, 1);
    assert.strictEqual(res.textoFormatado, '15/08/2025');
  });

  it('deve extrair data única com ano de 2 dígitos DD/MM/AA', () => {
    const res = extrairDatasConsulta('consulta realizada em 10/05/26', agoraFixo);
    assert.strictEqual(res.encontrou, true);
    assert.strictEqual(res.datas.length, 1);
    assert.strictEqual(res.textoFormatado, '10/05/2026');
  });

  it('deve extrair múltiplas datas completas separadas por "e" ou vírgula', () => {
    const res = extrairDatasConsulta(
      'Vou enviar sua NF no valor de R$ 700 referente as consultas de 10/09 e 15/09',
      agoraFixo
    );
    assert.strictEqual(res.encontrou, true);
    assert.strictEqual(res.datas.length, 2);
    assert.strictEqual(res.textoFormatado, '10/09/2026, 15/09/2026');
  });

  it('deve extrair múltiplos dias no mesmo mês (ex: dias 10 e 15/09)', () => {
    const res = extrairDatasConsulta('consultas dos dias 10 e 15/09', agoraFixo);
    assert.strictEqual(res.encontrou, true);
    assert.strictEqual(res.datas.length, 2);
    assert.strictEqual(res.textoFormatado, '10/09/2026, 15/09/2026');
  });

  it('deve interpretar termo relativo "hoje"', () => {
    const res = extrairDatasConsulta('Vou enviar em instantes a sua NF da consulta de hoje', agoraFixo);
    assert.strictEqual(res.encontrou, true);
    assert.strictEqual(res.datas.length, 1);
    assert.strictEqual(res.textoFormatado, '30/09/2026');
  });

  it('deve interpretar termo relativo "ontem"', () => {
    const res = extrairDatasConsulta('referente a consulta de ontem no valor de R$ 200', agoraFixo);
    assert.strictEqual(res.encontrou, true);
    assert.strictEqual(res.datas.length, 1);
    assert.strictEqual(res.textoFormatado, '29/09/2026');
  });

  it('deve interpretar termo relativo "anteontem"', () => {
    const res = extrairDatasConsulta('/emissao 300 anteontem', agoraFixo);
    assert.strictEqual(res.encontrou, true);
    assert.strictEqual(res.datas.length, 1);
    assert.strictEqual(res.textoFormatado, '28/09/2026');
  });

  it('deve ignorar datas inválidas (ex: 31 de fevereiro)', () => {
    const res = extrairDatasConsulta('consulta de 31/02/2026', agoraFixo);
    assert.strictEqual(res.encontrou, false);
    assert.strictEqual(res.datas.length, 0);
  });

  it('deve interpretar termo relativo "amanhã" e "depois de amanhã"', () => {
    const resAmanha = extrairDatasConsulta('Confirmando nossa consulta de amanhã às 14h', agoraFixo);
    assert.strictEqual(resAmanha.encontrou, true);
    assert.strictEqual(resAmanha.textoFormatado, '01/10/2026');

    const resDepois = extrairDatasConsulta('Agendado para depois de amanhã', agoraFixo);
    assert.strictEqual(resDepois.encontrou, true);
    assert.strictEqual(resDepois.textoFormatado, '02/10/2026');
  });

  it('deve extrair datas por extenso ("13 de outubro", "15 de set de 2026")', () => {
    const res1 = extrairDatasConsulta('Sua consulta foi agendada para 13 de outubro às 10h', agoraFixo);
    assert.strictEqual(res1.encontrou, true);
    assert.strictEqual(res1.textoFormatado, '13/10/2026');

    const res2 = extrairDatasConsulta('Atendimento realizado em 15 de set de 2026', agoraFixo);
    assert.strictEqual(res2.encontrou, true);
    assert.strictEqual(res2.textoFormatado, '15/09/2026');
  });

  it('deve extrair "dia DD" contextual resolvendo virada de mês quando agendado para início do mês seguinte', () => {
    const resMesmoMes = extrairDatasConsulta('Pode ser dia 28 às 15h', agoraFixo);
    assert.strictEqual(resMesmoMes.encontrou, true);
    assert.strictEqual(resMesmoMes.textoFormatado, '28/09/2026');

    const resProximoMes = extrairDatasConsulta('Confirmado para o dia 05 às 14h', agoraFixo);
    assert.strictEqual(resProximoMes.encontrou, true);
    assert.strictEqual(resProximoMes.textoFormatado, '05/10/2026');
  });

  it('deve extrair dia da semana em contexto de agendamento relativo à data da mensagem', () => {
    // 30/09/2026 é quarta-feira (getDay() === 3). Quinta-feira seguinte é 01/10/2026.
    const resQuinta = extrairDatasConsulta('Sua consulta está agendada para quinta-feira às 16h', agoraFixo);
    assert.strictEqual(resQuinta.encontrou, true);
    assert.strictEqual(resQuinta.textoFormatado, '01/10/2026');
  });
});

