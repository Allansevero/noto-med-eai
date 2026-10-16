import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GoogleConsultaRegistro } from './google-registro.js';
import { extrairRegistrosDeterministico, extrairRqes } from './extrair-registros-google.js';

test('extrairRqes não confunde preposições após o número (em, de) com siglas de UF', () => {
  const rqes = extrairRqes('Dra. Alice Castro Menezes Xavier - CRM-RS 53395 - RQE 29510 em Psiquiatria e RQE nº 40529 de Psicoterapia.');
  assert.deepEqual(rqes, [
    { numero: '29510', uf: undefined },
    { numero: '40529', uf: undefined }
  ]);
});

test('extrairRegistrosDeterministico extrai CRM e múltiplos RQEs instantaneamente sem depender da IA', async () => {
  const nome = 'ALICE CASTRO MENEZES XAVIER';
  const organic = [
    {
      title: 'Dra. Alice Castro Menezes Xavier - Psiquiatra',
      snippet: 'Alice Castro Menezes Xavier. Psiquiatra em Porto Alegre. CRM-RS 53395 · RQE 29510 em Psiquiatria.',
      link: 'https://medicos.example/alice-xavier'
    },
    {
      title: 'Alice Castro Menezes Xavier | Escavador',
      snippet: 'Médica Alice Castro Menezes Xavier inscrita no CRM 53395/RS com especialidade RQE-RS 40529.',
      link: 'https://escavador.example/alice-xavier'
    }
  ];

  const extraidos = extrairRegistrosDeterministico(
    nome,
    organic.map((item, indice) => ({ indice, titulo: item.title, trecho: item.snippet, url: item.link }))
  );
  assert.equal(extraidos.length, 1);
  assert.equal(extraidos[0].crm, '53395');
  assert.equal(extraidos[0].uf, 'RS');
  assert.deepEqual(extraidos[0].rqes?.map(r => r.numero), ['29510', '40529']);

  let chamouSerper = 0;
  const inicio = performance.now();
  const cliente = new GoogleConsultaRegistro({
    serperApiKey: 'serper-ok',
    nvidiaApiKey: 'nvidia-ok',
    requisitar: (async () => {
      chamouSerper++;
      return Response.json({ organic });
    }) as typeof fetch
  });
  const resultado = await cliente.buscar(nome);
  const duracaoMs = performance.now() - inicio;

  assert.equal(chamouSerper, 1);
  assert.equal(resultado.estado, 'consultado');
  if (resultado.estado === 'consultado') {
    assert.equal(resultado.dados.length, 1);
    assert.equal(resultado.dados[0].crm, '53395');
    assert.equal(resultado.dados[0].uf, 'RS');
    assert.deepEqual(resultado.dados[0].rqes, ['29510', '40529']);
  }
  assert.ok(duracaoMs < 200, `Esperado < 200ms, levou ${duracaoMs}ms`);
});
