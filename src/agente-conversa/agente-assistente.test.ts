import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AgenteAssistente } from './agente-assistente.js';
import { ErroNvidiaChat } from '../io/nvidia/chat-client.js';
import { NvidiaGeradorMensagemNoto } from '../io/nvidia/adaptadores.js';
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
    resultado:async()=>({estado:'concluido',mensagensConfirmadas:1}),
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

test('falha de gravação preserva etapa e SQLSTATE sem registrar mensagem ou dados pessoais', async (t) => {
  const f = fixture();
  const logs: unknown[] = [];
  t.mock.method(console, 'warn', (...args: unknown[]) => logs.push(args));
  f.repo.aplicar = async () => { throw Object.assign(new Error('segredo e nome do paciente'), {code:'23505', detail:'CPF privado'}); };
  let diagnostico: unknown;
  f.repo.falhar = async (...args: unknown[]) => { diagnostico = args[1]; };
  await new AgenteAssistente(f.repo, f.decisor, f.gerador, {enviarTexto:async()=>{throw Error('não enviar');}}, 'assistente').processar('m');
  assert.equal(diagnostico, 'gravar_dados:BANCO_23505');
  assert.match(JSON.stringify(logs), /gravar_dados/);
  assert.match(JSON.stringify(logs), /BANCO_23505/);
  assert.doesNotMatch(JSON.stringify(logs), /segredo|paciente|CPF privado/);
});

test('falhas da decisão distinguem HTTP, JSON e erro desconhecido sem expor resposta bruta', async (t) => {
  t.mock.method(console, 'warn', () => {});
  for (const [erro, esperado] of [
    [new ErroNvidiaChat('IA_HTTP_ERRO', 429), 'IA_HTTP_ERRO_429'],
    [new SyntaxError('resposta privada'), 'JSON_INVALIDO'],
    [Object.assign(new Error('privado'), {code:'segredo'}), 'PROCESSAMENTO_FALHOU']
  ] as const) {
    const f = fixture();
    f.decisor.decidir = async () => { throw erro; };
    let diagnostico: unknown;
    f.repo.falhar = async (...args: unknown[]) => { diagnostico = args[1]; };
    await new AgenteAssistente(f.repo, f.decisor, f.gerador, {enviarTexto:async()=>{throw Error('não enviar');}}, 'assistente').processar('m');
    assert.equal(diagnostico, 'decidir:' + esperado);
    assert.ok(!f.eventos.includes('aplicar'));
  }
});

test('falha HTTP na redação preserva período salvo e permite retomar sem repetir gravação', async t => {
  t.mock.method(console,'warn',()=>{});
  const f=fixture('aplicado');
  f.r.turno.texto='5 dias';f.r.estado.janelaDataCorte='2026-10-04';
  f.r.turno.resultados=[{campo:'periodo',estado:'salvo'}];
  let diagnostico:unknown;
  f.repo.falhar=async(_r,erro)=>{diagnostico=erro;f.eventos.push('falhar');};
  const chamada=t.mock.method(globalThis,'fetch',async()=>new Response('resposta privada',{status:429}));
  const enviar={enviarTexto:async()=>{f.eventos.push('enviar');return {sucesso:true};}};
  const a=new AgenteAssistente(f.repo,f.decisor,new NvidiaGeradorMensagemNoto('chave-privada'),enviar,'assistente');
  await a.processar('m');
  assert.equal(diagnostico,'redigir:IA_HTTP_ERRO_429');
  assert.equal(f.r.estado.janelaDataCorte,'2026-10-04');
  assert.ok(!f.eventos.includes('aplicar'));assert.ok(!f.eventos.includes('enviar'));
  let reservada=false;
  f.repo.reservar=async()=>reservada?null:((reservada=true),f.r);
  chamada.mock.mockImplementation(async()=>Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify({mensagens:['O período de cinco dias ficou registrado. Qual data prefere usar na descrição?']})}}]}));
  await a.processar('m');
  assert.ok(f.eventos.includes('concluir'));assert.equal(f.eventos.filter(x=>x==='enviar').length,1);
  assert.ok(!f.eventos.includes('decidir'));assert.ok(!f.eventos.includes('aplicar'));
  assert.equal(f.r.estado.janelaDataCorte,'2026-10-04');
});

test('leitura inicia após persistir entrada, em paralelo e sem bloquear resposta quando falha', async () => {
  const f = fixture();
  f.repo.enfileirar = async () => { f.eventos.push('entrada'); return true; };
  const leitor = { marcarLida: async () => { f.eventos.push('ler'); throw new Error('offline'); } };
  await new (AgenteAssistente as any)(f.repo, f.decisor, f.gerador,
    { enviarTexto: async () => { f.eventos.push('enviar'); return { sucesso: true }; } }, 'assistente', leitor)
    .receber({ medicoId: 'm', instancia: 'assistente', mensagemId: 'e1', texto: 'Olá', contatoTelefone: '5511999999999',
      chaveMensagem: { id: 'e1', remoteJid: '5511999999999@s.whatsapp.net', fromMe: false } });
  assert.ok(f.eventos.indexOf('entrada') < f.eventos.indexOf('ler'));
  assert.equal(f.eventos.includes('enviar'), true);
});
test('resposta superada por nova mensagem não é enviada', async () => {
  const f = fixture();
  (f.repo as any).temMensagemPosterior = async () => true;
  (f.repo as any).descartarRespostaSuperada = async () => { f.eventos.push('superada'); };
  await new AgenteAssistente(f.repo, f.decisor, f.gerador,
    { enviarTexto: async () => { throw new Error('resposta antiga não deve sair'); } }, 'assistente').processar('m');
  assert.equal(f.eventos.includes('superada'), true);
  assert.equal(f.eventos.includes('falhar'), false);
});

test('redação que pede CRM salvo é corrigida uma vez antes de enviar', async () => {
  const f = fixture(); let geracoes = 0; const enviadas: string[] = [];
  f.gerador.gerar = async c => {
    geracoes++;
    if (geracoes === 1) return ['Me passa o CRM com a UF?'];
    assert.deepEqual((c.dados.correcaoResposta as any).codigos, ['CRM_JA_SALVO']);
    return ['O CRM vai na descrição da consulta.'];
  };
  await new AgenteAssistente(f.repo, f.decisor, f.gerador,
    { enviarTexto: async e => { enviadas.push(e.texto); return { sucesso: true }; } }, 'assistente').processar('m');
  assert.equal(geracoes, 2);
  assert.deepEqual(enviadas, ['O CRM vai na descrição da consulta.']);
});
test('duas respostas incoerentes não chegam ao usuário nem reaplicam dados', async () => {
  const f = fixture(); let geracoes = 0;
  f.gerador.gerar = async () => { geracoes++; return ['Me passa o CRM com a UF?']; };
  await new AgenteAssistente(f.repo, f.decisor, f.gerador,
    { enviarTexto: async () => { throw Error('não enviar resposta incoerente'); } }, 'assistente').processar('m');
  assert.equal(geracoes, 2);
  assert.equal(f.eventos.filter(e => e === 'aplicar').length, 1);
  assert.equal(f.eventos.includes('falhar'), true);
});
