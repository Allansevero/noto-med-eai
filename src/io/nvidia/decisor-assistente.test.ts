import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { NvidiaDecisorAssistente } from './decisor-assistente.js';
import { NvidiaGeradorMensagemNoto } from './adaptadores.js';
test('decisor recebe guia completo, histórico e limites; resposta contextual respeita pausa', async (t) => {
  const contexto = {
    estado: { etapa: 'apresentacao' as const, pausado: true },
    mensagemRecebida: 'Por que precisam de CRM?',
    historico: [
      { papel: 'medico' as const, texto: 'Prefiro conversar depois' }
    ],
    panorama: { quantidadePacientes: 2 }
  };
  const decisao = {
    intencao: 'esclarecer',
    ritmo: 'manter',
    assunto: 'CRM',
    acoes: []
  };
  let body: any;
  const mock = t.mock.method(
    globalThis,
    'fetch',
    async (_url: unknown, init?: RequestInit) => {
      body = JSON.parse(String(init?.body));
      return Response.json({
        choices: [
          {
            finish_reason: 'stop',
            message: { content: JSON.stringify(decisao) }
          }
        ]
      });
    }
  );
  assert.deepEqual(
    await new NvidiaDecisorAssistente('teste').decidir(contexto),
    decisao
  );
  const guia = await readFile(
    new URL('../../../docs/prompts/noto-conversa.md', import.meta.url),
    'utf8'
  );
  assert.ok(body.messages[0].content.includes(guia));
  assert.deepEqual(JSON.parse(body.messages[1].content), contexto);
  mock.mock.mockImplementation(async (_url: unknown, init?: RequestInit) => {
    body = JSON.parse(String(init?.body));
    return Response.json({
      choices: [
        {
          message: {
            content: JSON.stringify({
              mensagens: ['Posso explicar sem continuar o cadastro agora.']
            })
          }
        }
      ]
    });
  });
  await new NvidiaGeradorMensagemNoto('teste').gerar({
    evento: 'conversa',
    destinatario: 'medico',
    medico: { nome: null, crm: null, rqe: null },
    caso: null,
    quantidadeNotasParadas: 0,
    mensagemRecebida: contexto.mensagemRecebida,
    historico: contexto.historico,
    dados: { fluxo: 'assistente_contextual', estado: contexto.estado }
  });
  assert.match(body.messages[0].content, /não cobre dados/);
  assert.doesNotMatch(
    body.messages[0].content,
    /redija mensagens naturais a partir do objetivo/
  );
  mock.mock.mockImplementation(async () =>
    Response.json({
      choices: [
        {
          message: {
            content: JSON.stringify({
              ...decisao,
              acoes: [{ ferramenta: 'emitir_nota' }]
            })
          }
        }
      ]
    })
  );
  await assert.rejects(new NvidiaDecisorAssistente('teste').decidir(contexto));
});
