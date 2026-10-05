/** Treino deve sobreviver a chamadas concorrentes sem simular emissão fiscal. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { enviarTreino, type TreinoDeps, type ResultadoEnvioTreino } from './enviar-treino.js';
import { MENSAGENS_TREINO, MODELO_EMISSAO_TREINO } from './mensagens-treino.js';
import { casarRespostaRapida } from '../../whatsapp/casar-resposta-rapida.js';

function contexto() {
  const registros = new Map<string, { etapa: number; estado: string }>();
  const envios: Array<{ telefone: string; texto: string }> = [];
  const deps: TreinoDeps = {
    consultarDestinatario: async () => ({ liberado: true, telefone: '5551999998888' }),
    repositorio: {
      async criar(id) { if (!registros.has(id)) registros.set(id, { etapa: 0, estado: 'pendente' }); },
      async reservarEtapa(id) {
        const r = registros.get(id)!;
        if (r.estado !== 'pendente' || r.etapa >= MENSAGENS_TREINO.length) return null;
        r.estado = 'enviando'; return r.etapa;
      },
      async registrarResultado(id, etapa, resultado) {
        const r = registros.get(id)!;
        assert.equal(r.etapa, etapa); assert.equal(r.estado, 'enviando');
        if (resultado.sucesso) {
          r.etapa++;
          r.estado = r.etapa === MENSAGENS_TREINO.length ? 'concluido' : 'pendente';
        } else r.estado = resultado.incerto ? 'incerto' : 'falha';
      }
    },
    async enviar(telefone, mensagem) {
      envios.push({ telefone, texto: mensagem.texto });
      return { sucesso: true, formato: mensagem.copiarTexto ? 'botao' : 'texto', mensagemId: `msg-${envios.length}` };
    }
  };
  return { deps, registros, envios };
}

test('envia roteiro em ordem uma vez apesar de gatilhos concorrentes e reconexão', async () => {
  const c = contexto();
  await Promise.all([enviarTreino('m', c.deps), enviarTreino('m', c.deps), enviarTreino('m', c.deps)]);
  await enviarTreino('m', c.deps);
  assert.deepEqual(c.envios.map(e => e.texto), MENSAGENS_TREINO.map(m => m.texto));
  assert.ok(c.envios.every(e => e.telefone === '5551999998888'));
  assert.equal(c.registros.get('m')?.estado, 'concluido');
});

test('onboarding incompleto ou telefone ausente não cria treino nem envia mensagens', async () => {
  for (const destinatario of [{ liberado: false, telefone: '5551999998888' }, { liberado: true, telefone: null }]) {
    const c = contexto();
    c.deps.consultarDestinatario = async () => destinatario;
    await enviarTreino('m', c.deps);
    assert.equal(c.registros.size, 0); assert.equal(c.envios.length, 0);
  }
});

test('rejeição ou resultado incerto interrompe sem reiniciar a sequência', async () => {
  for (const incerto of [true, false]) {
    const c = contexto(); let chamadas = 0;
    c.deps.enviar = async (): Promise<ResultadoEnvioTreino> => {
      chamadas++;
      return chamadas === 2 ? { sucesso: false, incerto, motivo: 'falha simulada' }
        : { sucesso: true, formato: 'texto' };
    };
    await enviarTreino('m', c.deps);
    await enviarTreino('m', c.deps);
    assert.equal(chamadas, 2);
    assert.equal(c.registros.get('m')?.etapa, 1);
    assert.equal(c.registros.get('m')?.estado, incerto ? 'incerto' : 'falha');
  }
});

test('falha ao registrar sucesso mantém reserva e impede duplicar envio', async () => {
  const c = contexto();
  c.deps.repositorio.registrarResultado = async () => { throw new Error('DB indisponível'); };
  await assert.rejects(() => enviarTreino('m', c.deps));
  await enviarTreino('m', c.deps);
  assert.equal(c.envios.length, 1);
  assert.equal(c.registros.get('m')?.estado, 'enviando');
});

test('reinício entre mensagens confirmadas retoma a próxima etapa', async () => {
  const c = contexto();
  c.registros.set('m', { etapa: 3, estado: 'pendente' });
  await enviarTreino('m', c.deps);
  assert.deepEqual(c.envios.map(e => e.texto), MENSAGENS_TREINO.slice(3).map(m => m.texto));
});

test('modelo preenchido produz valor e data esperados no reconhecedor existente', () => {
  const texto = MODELO_EMISSAO_TREINO.replace('[preecha]', '350,00').replace('[preecha]', '01/10/2026');
  const resultado = casarRespostaRapida(texto, true);
  assert.ok(resultado.casou && resultado.tipo === 'emissao');
  assert.equal(resultado.valorDigitadoCentavos, 35000);
  assert.equal(resultado.datasTexto, '01/10/2026');
  assert.equal(resultado.datas?.length, 1);
  assert.equal(casarRespostaRapida(texto, false).casou, false);
});
