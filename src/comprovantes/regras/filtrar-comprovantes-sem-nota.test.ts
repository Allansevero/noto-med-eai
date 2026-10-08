/**
 * Testes unitários para a regra cronológica de comprovantes sem nota fiscal.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  filtrarComprovantesSemNota,
  ehDocumentoPdfNotaFiscal,
  type MensagemHistoricoConversa
} from './filtrar-comprovantes-sem-nota.js';

test('identifica corretamente PDF de nota fiscal por nome ou texto', () => {
  assert.equal(ehDocumentoPdfNotaFiscal({
    id: '1', timestamp: 1000, fromMe: true, tipo: 'documento',
    nomeArquivo: 'DANFSe_NFe_00123.pdf', mimetype: 'application/pdf'
  }), true);

  assert.equal(ehDocumentoPdfNotaFiscal({
    id: '2', timestamp: 1000, fromMe: true, tipo: 'documento',
    nomeArquivo: 'exame_sangue.pdf', mimetype: 'application/pdf'
  }), false);

  assert.equal(ehDocumentoPdfNotaFiscal({
    id: '3', timestamp: 1000, fromMe: false, tipo: 'imagem',
    nomeArquivo: 'foto.jpg', mimetype: 'image/jpeg'
  }), false);
});

test('ignora comprovante quando há envio posterior de PDF de nota fiscal', () => {
  const mensagens: MensagemHistoricoConversa[] = [
    {
      id: 'msg-1',
      timestamp: 1000,
      fromMe: false,
      tipo: 'imagem',
      comprovante: { ehComprovante: true, valorCentavos: 35000, dataPagamento: '2026-09-10' }
    },
    {
      id: 'msg-2',
      timestamp: 2000,
      fromMe: true,
      tipo: 'documento',
      nomeArquivo: 'NotaFiscal_001.pdf',
      mimetype: 'application/pdf'
    }
  ];

  const resultado = filtrarComprovantesSemNota(mensagens);
  assert.equal(resultado.length, 0);
});

test('seleciona comprovante que sucede a última nota e não tem nota posterior', () => {
  const mensagens: MensagemHistoricoConversa[] = [
    {
      id: 'msg-antiga',
      timestamp: 1000,
      fromMe: false,
      tipo: 'imagem',
      comprovante: { ehComprovante: true, valorCentavos: 30000 }
    },
    {
      id: 'nota-anterior',
      timestamp: 2000,
      fromMe: true,
      tipo: 'documento',
      nomeArquivo: 'DANFSe_001.pdf',
      mimetype: 'application/pdf'
    },
    {
      id: 'comp-novo',
      timestamp: 3000,
      fromMe: false,
      tipo: 'imagem',
      comprovante: {
        ehComprovante: true,
        valorCentavos: 45000,
        valorFormatado: '450.00',
        dataPagamento: '2026-10-05',
        pagadorNome: 'Luciana Martins'
      }
    }
  ];

  const resultado = filtrarComprovantesSemNota(mensagens);
  assert.equal(resultado.length, 1);
  assert.equal(resultado[0].mensagemId, 'comp-novo');
  assert.equal(resultado[0].valorCentavos, 45000);
  assert.equal(resultado[0].valorFormatado, '450.00');
  assert.equal(resultado[0].pagadorNome, 'Luciana Martins');
});

test('descarta comprovantes fora da janela temporal de busca (dataCorte)', () => {
  const dataCorte = new Date('2026-09-01').getTime();
  const mensagens: MensagemHistoricoConversa[] = [
    {
      id: 'comp-muito-antigo',
      timestamp: new Date('2026-08-15').getTime(),
      fromMe: false,
      tipo: 'imagem',
      comprovante: { ehComprovante: true, valorCentavos: 25000 }
    },
    {
      id: 'comp-recente',
      timestamp: new Date('2026-09-15').getTime(),
      fromMe: false,
      tipo: 'imagem',
      comprovante: { ehComprovante: true, valorCentavos: 50000, dataPagamento: '2026-09-15' }
    }
  ];

  const resultado = filtrarComprovantesSemNota(mensagens, dataCorte);
  assert.equal(resultado.length, 1);
  assert.equal(resultado[0].mensagemId, 'comp-recente');
  assert.equal(resultado[0].valorCentavos, 50000);
});

test('ignora mensagens que não são comprovantes de pagamento', () => {
  const mensagens: MensagemHistoricoConversa[] = [
    {
      id: 'foto-comum',
      timestamp: 1000,
      fromMe: false,
      tipo: 'imagem',
      comprovante: { ehComprovante: false }
    },
    {
      id: 'texto-comum',
      timestamp: 2000,
      fromMe: false,
      tipo: 'texto',
      texto: 'Boa tarde doutor'
    }
  ];

  assert.equal(filtrarComprovantesSemNota(mensagens).length, 0);
});
