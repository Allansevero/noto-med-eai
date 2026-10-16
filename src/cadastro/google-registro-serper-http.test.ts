import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GoogleConsultaRegistro } from './google-registro.js';

test('classifica erros HTTP por motivos estáticos sem repetir Serper nem chamar NVIDIA', async () => {
  for (const [mensagem, motivo] of [
    ['Missing query', 'CONSULTA_AUSENTE'],
    ['Invalid API key', 'CREDENCIAL_RECUSADA'],
    ['Not enough credits', 'CREDITOS_INSUFICIENTES'],
    ['Too many requests', 'LIMITE_REQUISICOES'],
    ['Invalid parameters', 'PARAMETROS_RECUSADOS'],
    ['Bruna Botter; token=chave-serper-secreta; unexpected upstream error', 'ERRO_NAO_CLASSIFICADO']
  ]) {
    let pesquisas = 0, extracoes = 0;
    const cliente = new GoogleConsultaRegistro({
      serperApiKey: 'chave-serper-secreta', nvidiaApiKey: 'chave-nvidia-secreta', incluirDiagnostico: true,
      requisitar: (async () => { pesquisas++; return Response.json({ message: mensagem }, { status: 400 }); }) as typeof fetch,
      completar: async () => { extracoes++; throw Error('não deve chamar NVIDIA'); }
    });
    const resultado = await cliente.buscar('Bruna Botter');
    assert.deepEqual(resultado, { estado: 'indisponivel', codigo: 'SERPER_HTTP_400', diagnostico: [{ etapa: 'serper_http', status: 400, motivo }] });
    assert.equal(pesquisas, 1);
    assert.equal(extracoes, 0);
    assert.doesNotMatch(JSON.stringify(resultado), /Bruna|Botter|secreta|token/);
  }
});

test('limita o corpo de erro e mantém o código HTTP para HTML, JSON desconhecido e streams inválidos', async () => {
  for (const [resposta, motivo] of [
    [new Response('<html>Bruna Botter segredo</html>', { status: 502 }), 'CORPO_NAO_JSON'],
    [Response.json({ detail: 'Bruna Botter segredo' }, { status: 400 }), 'ERRO_NAO_CLASSIFICADO'],
    [new Response('x'.repeat(4097), { status: 400 }), 'CORPO_LIMITE_EXCEDIDO'],
    [new Response(new ReadableStream({ start(controller) { controller.error(Error('segredo')); } }), { status: 400 }), 'CORPO_INDISPONIVEL']
  ] as const) {
    const cliente = new GoogleConsultaRegistro({ serperApiKey: 'fixture', nvidiaApiKey: 'fixture', incluirDiagnostico: true,
      requisitar: (async () => resposta) as typeof fetch });
    assert.deepEqual(await cliente.buscar('Bruna Botter'), { estado: 'indisponivel', codigo: `SERPER_HTTP_${resposta.status}`,
      diagnostico: [{ etapa: 'serper_http', status: resposta.status, motivo }] });
  }
});

test('encerra diagnóstico de corpo que não termina sem novas chamadas pagas', async () => {
  let cancelado = false;
  const resposta = new Response(new ReadableStream({ cancel() { cancelado = true; } }), { status: 400 });
  const cliente = new GoogleConsultaRegistro({ serperApiKey: 'fixture', nvidiaApiKey: 'fixture', incluirDiagnostico: true,
    requisitar: (async () => resposta) as typeof fetch });
  assert.deepEqual(await cliente.buscar('Bruna Botter'), { estado: 'indisponivel', codigo: 'SERPER_HTTP_400',
    diagnostico: [{ etapa: 'serper_http', status: 400, motivo: 'CORPO_INDISPONIVEL' }] });
  assert.equal(cancelado, true);
});
