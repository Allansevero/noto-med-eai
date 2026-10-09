import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AgenteAssistente } from './agente-assistente.js';
import type { PostgresAssistente, Reserva } from './postgres-assistente.js';
import type { ContextoMensagemNoto } from '../conversa/comunicador-noto.js';
function fixture(fase = 'analisando') {
  const r: Reserva = {
    medicoId: 'm',
    token: 't',
    versao: 0,
    estado: {
      etapa: 'concluido',
      nomeConfirmado: 'Roberto Santos',
      crmInformado: '12345/RS',
      rqeInformado: null,
      janelaDataCorte: '2026-01-01',
      preferencia: 'mesma_do_comprovante'
    },
    turno: {
      id: '1',
      sequencia: '1',
      mensagem_id: 'e1',
      texto: 'Por que pedem CRM?',
      estado: fase,
      decisao: {
        intencao: 'esclarecer',
        ritmo: 'manter',
        assunto: 'CRM',
        acoes: []
      },
      resultados: [],
      mensagens: ['Explicação já preparada.'],
      confirmadas: 0
    }
  };
  let reservado = false;
  const eventos: string[] = [];
  let contexto: ContextoMensagemNoto | undefined;
  const repo = {
    enfileirar: async () => {},
    reservar: async () => (reservado ? null : ((reservado = true), r)),
    historico: async () => [
      { papel: 'noto', texto: 'O CRM vai na descrição.' }
    ],
    panorama: async () => ({
      telefone: '5511999999999',
      quantidadePacientes: 2
    }),
    aplicar: async (_r: Reserva, patch: unknown) => {
      assert.deepEqual(patch, {});
      eventos.push('aplicar');
      r.turno.estado = 'aplicado';
      return r.estado;
    },
    prepararResposta: async (_r: Reserva, m: string[]) => {
      eventos.push('preparar');
      r.turno.mensagens = m;
      r.turno.estado = 'preparado';
    },
    iniciarEnvio: async () => {
      eventos.push('iniciar');
      r.turno.estado = 'enviando';
    },
    confirmarMensagem: async () => {
      eventos.push('confirmar');
    },
    concluir: async () => {
      eventos.push('concluir');
    },
    falhar: async () => {
      eventos.push('falhar');
    },
    liberar: async () => {
      eventos.push('liberar');
    }
  } as unknown as PostgresAssistente;
  const decisor = {
    decidir: async () => {
      eventos.push('decidir');
      return r.turno.decisao;
    }
  };
  const gerador = {
    gerar: async (c: ContextoMensagemNoto) => {
      contexto = c;
      eventos.push('gerar');
      return ['O CRM identifica o registro profissional na descrição.'];
    }
  };
  return { r, repo, decisor, gerador, eventos, contexto: () => contexto };
}
test('depois de concluído responde dúvidas com histórico e resultados antes do envio', async () => {
  const f = fixture();
  const a = new AgenteAssistente(
    f.repo,
    f.decisor,
    f.gerador,
    {
      enviarTexto: async () => {
        f.eventos.push('enviar');
        return { sucesso: true };
      }
    },
    'assistente'
  );
  await a.receber({
    medicoId: 'm',
    instancia: 'assistente',
    mensagemId: 'e1',
    texto: 'Por que pedem CRM?'
  });
  assert.deepEqual(f.eventos, [
    'decidir',
    'aplicar',
    'gerar',
    'preparar',
    'iniciar',
    'enviar',
    'confirmar',
    'concluir',
    'liberar'
  ]);
  assert.equal(f.contexto()?.historico.length, 1);
  assert.equal(f.contexto()?.dados.fluxo, 'assistente_contextual');
});
test('recupera resposta preparada sem repetir modelo nem cadastro e trata entrega incerta', async () => {
  const f = fixture('preparado');
  const a = new AgenteAssistente(
    f.repo,
    f.decisor,
    f.gerador,
    { enviarTexto: async () => ({ sucesso: false }) },
    'assistente'
  );
  await a.receber({
    medicoId: 'm',
    instancia: 'assistente',
    mensagemId: 'e1',
    texto: 'Por que pedem CRM?'
  });
  assert.deepEqual(f.eventos, ['iniciar', 'falhar', 'liberar']);
});

test('modelo inválido e falha de gravação não geram confirmação ou transporte', async () => {
  for (const falha of ['modelo', 'banco']) {
    const f = fixture();
    const decisor =
      falha === 'modelo'
        ? {
            decidir: async () =>
              ({
                intencao: 'registrar',
                ritmo: 'manter',
                assunto: 'x',
                acoes: [{ ferramenta: 'emitir_nota' }]
              }) as any
          }
        : f.decisor;
    if (falha === 'banco')
      f.repo.aplicar = async () => {
        f.eventos.push('gravar_falhou');
        throw Error('banco');
      };
    await new AgenteAssistente(
      f.repo,
      decisor,
      f.gerador,
      {
        enviarTexto: async () => {
          throw Error('não pode enviar');
        }
      },
      'assistente'
    ).receber({
      medicoId: 'm',
      instancia: 'assistente',
      mensagemId: 'e1',
      texto: f.r.turno.texto
    });
    assert.ok(!f.eventos.includes('gerar'));
    assert.ok(f.eventos.includes('falhar'));
    assert.ok(f.eventos.includes('liberar'));
  }
});
test('falha na redação após gravação não tenta transportar nem reaplicar ações', async () => {
  const f = fixture();
  f.gerador.gerar = async () => {
    f.eventos.push('gerar');
    throw Error('NVIDIA');
  };
  await new AgenteAssistente(
    f.repo,
    f.decisor,
    f.gerador,
    {
      enviarTexto: async () => {
        throw Error('não pode enviar');
      }
    },
    'assistente'
  ).receber({
    medicoId: 'm',
    instancia: 'assistente',
    mensagemId: 'e1',
    texto: f.r.turno.texto
  });
  assert.equal(f.r.turno.estado, 'aplicado');
  assert.deepEqual(f.eventos, [
    'decidir',
    'aplicar',
    'gerar',
    'falhar',
    'liberar'
  ]);
});
test('envio parcial confirma só primeira mensagem e interrompe sem repetir', async () => {
  const f = fixture('preparado');
  f.r.turno.mensagens = ['Primeira', 'Segunda', 'Terceira'];
  let n = 0;
  await new AgenteAssistente(
    f.repo,
    f.decisor,
    f.gerador,
    { enviarTexto: async () => ({ sucesso: ++n === 1 }) },
    'assistente'
  ).receber({
    medicoId: 'm',
    instancia: 'assistente',
    mensagemId: 'e1',
    texto: f.r.turno.texto
  });
  assert.equal(n, 2);
  assert.deepEqual(f.eventos, ['iniciar', 'confirmar', 'falhar', 'liberar']);
});

test('apresentação inicial segue a fila e guia sem executar decisão de cadastro', async () => {
  const f = fixture();
  f.r.estado = { etapa: 'apresentacao' };
  f.r.turno.texto = '';
  f.r.turno.mensagem_id = 'apresentacao:m';
  f.repo.enfileirarApresentacao = async () => true;
  await new AgenteAssistente(
    f.repo,
    f.decisor,
    f.gerador,
    { enviarTexto: async () => ({ sucesso: true }) },
    'assistente'
  ).iniciarAoConectar('m');
  assert.ok(!f.eventos.includes('decidir'));
  assert.equal(f.contexto()?.dados.apresentacaoInicial, true);
  assert.equal(f.contexto()?.medico.nome, null);
  assert.ok(f.eventos.includes('confirmar'));
});
