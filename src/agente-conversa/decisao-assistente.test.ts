import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validarAcoes, decisaoAssistenteSchema } from './decisao-assistente.js';
const decisao = (dados: any, evidencia: string) => ({
  intencao: 'registrar',
  ritmo: 'manter',
  assunto: 'cadastro',
  acoes: [{ ferramenta: 'registrar_dados', dados, evidencia }]
});
test('registra nome e CRM explícitos juntos sem pesquisar', () => {
  const r = validarAcoes(
    decisao(
      { nome: 'Roberto Santos', crm: '12345/RS' },
      'Roberto Santos, CRM 12345/RS'
    ) as any,
    'Sou Roberto Santos, CRM 12345/RS',
    { etapa: 'apresentacao' }
  );
  assert.deepEqual(r.patch, {
    nomeConfirmado: 'Roberto Santos',
    crmInformado: '12345/RS'
  });
});
test('rejeita dado inventado ou comando fora das ferramentas', () => {
  assert.deepEqual(
    validarAcoes(
      decisao({ crm: '99999/SP' }, 'meu CRM é 12345/RS') as any,
      'meu CRM é 12345/RS',
      { etapa: 'apresentacao' }
    ).patch,
    {}
  );
  assert.equal(
    decisaoAssistenteSchema.safeParse({
      intencao: 'registrar',
      ritmo: 'manter',
      assunto: 'x',
      acoes: [{ ferramenta: 'emitir_nota', dados: {}, evidencia: 'emita' }]
    }).success,
    false
  );
});
test('dúvida com números não grava dados nem seleciona período', () => {
  const d = decisao(
    { periodo: { quantidade: 2, unidade: 'meses' } },
    '2 meses'
  ) as any;
  assert.deepEqual(
    validarAcoes(d, 'Por que considerar 2 meses?', { etapa: 'apresentacao' })
      .patch,
    {}
  );
});
test('sem RQE é opcional; não saber período não cria default', () => {
  assert.deepEqual(
    validarAcoes(
      decisao({ rqe: null }, 'sem RQE') as any,
      'Prefiro seguir sem RQE',
      { etapa: 'apresentacao' }
    ).patch,
    { rqeInformado: null }
  );
  assert.deepEqual(
    validarAcoes(
      decisao(
        { periodo: { quantidade: 60, unidade: 'dias' } },
        'não sei'
      ) as any,
      'não sei',
      { etapa: 'apresentacao' }
    ).patch,
    {}
  );
});
test('pergunta sobre comprovante não escolhe preferência', () => {
  assert.deepEqual(
    validarAcoes(
      decisao(
        { preferencia: 'mesma_do_comprovante' },
        'data do comprovante'
      ) as any,
      'O que acontece se usar a data do comprovante?',
      { etapa: 'apresentacao' }
    ).patch,
    {}
  );
});
test('decisões de conversar e pausar não aceitam ações de gravação', () => {
  assert.equal(
    decisaoAssistenteSchema.safeParse({
      ...decisao({ crm: '123/RS' }, '123/RS'),
      intencao: 'responder'
    }).success,
    false
  );
});

test('negação de preferência, hipótese e dado de terceiro não gravam', () => {
  for (const [texto, dados] of [
    [
      'Não quero usar a data do comprovante',
      { preferencia: 'mesma_do_comprovante' }
    ],
    [
      'Talvez considerar 2 meses',
      { periodo: { quantidade: 2, unidade: 'meses' } }
    ],
    [
      'Meu colega Roberto Santos tem CRM 12345/RS',
      { nome: 'Roberto Santos', crm: '12345/RS' }
    ]
  ] as const) {
    assert.deepEqual(
      validarAcoes(decisao(dados, texto) as any, texto, {
        etapa: 'apresentacao'
      }).patch,
      {}
    );
  }
  assert.deepEqual(
    validarAcoes(decisao({ rqe: null }, 'não sei CRM') as any, 'não sei CRM', {
      etapa: 'aguardando_crm'
    }).patch,
    {}
  );
});
test('período mensal respeita fim do mês e data de Brasília', () => {
  const d = decisao(
    { periodo: { quantidade: 1, unidade: 'meses' } },
    '1 mês'
  ) as any;
  assert.equal(
    validarAcoes(
      d,
      '1 mês',
      { etapa: 'aguardando_janela_tempo' },
      new Date('2026-03-31T14:00:00Z')
    ).patch.janelaDataCorte,
    '2026-02-28'
  );
  assert.equal(
    validarAcoes(
      d,
      '1 mês',
      { etapa: 'aguardando_janela_tempo' },
      new Date('2026-04-01T01:00:00Z')
    ).patch.janelaDataCorte,
    '2026-02-28'
  );
});

test('revisão: negações e perguntas sem pontuação não confirmam valores', () => {
  const casos = [
    ['Meu CRM não é 12345/SP', { crm: '12345/SP' }],
    ['Não use a data do comprovante', { preferencia: 'mesma_do_comprovante' }],
    [
      'Quero entender se 2 meses inclui setembro',
      { periodo: { quantidade: 2, unidade: 'meses' } }
    ],
    [
      'Gostaria de saber se posso usar 2 meses',
      { periodo: { quantidade: 2, unidade: 'meses' } }
    ]
  ];
  for (const [texto, dados] of casos)
    assert.deepEqual(
      validarAcoes(decisao(dados, String(texto)) as any, String(texto), {
        etapa: 'aguardando_crm'
      }).patch,
      {}
    );
});
test('revisão: recusar RQE não bloqueia a opção de seguir sem ele', () => {
  for (const texto of [
    'Não quero informar RQE',
    'Prefiro não informar RQE',
    'Não tenho RQE'
  ]) {
    assert.deepEqual(
      validarAcoes(decisao({ rqe: null }, texto) as any, texto, {
        etapa: 'aguardando_rqe_opcional'
      }).patch,
      { rqeInformado: null }
    );
  }
});
test('revisão: aceita declaração explícita separada de dúvida na mesma mensagem', () => {
  const texto =
    'Meu nome é Roberto Santos. Meu CRM é 12345/RS. Por que pedem CRM?';
  assert.deepEqual(
    validarAcoes(
      decisao(
        { nome: 'Roberto Santos', crm: '12345/RS' },
        'Meu nome é Roberto Santos. Meu CRM é 12345/RS.'
      ) as any,
      texto,
      { etapa: 'apresentacao' }
    ).patch,
    { nomeConfirmado: 'Roberto Santos', crmInformado: '12345/RS' }
  );
});

test('recusa de outro dado não dispensa RQE e confirmação de período aceita há dois meses', () => {
  assert.deepEqual(
    validarAcoes(
      decisao({ rqe: null }, 'Não tenho CRM') as any,
      'Não tenho CRM',
      { etapa: 'aguardando_rqe_opcional' }
    ).patch,
    {}
  );
  const texto = 'Há dois meses';
  assert.ok(
    validarAcoes(
      decisao({ periodo: { quantidade: 2, unidade: 'meses' } }, texto) as any,
      texto,
      { etapa: 'aguardando_janela_tempo' }
    ).patch.janelaDataCorte
  );
});

test('nome informado em resposta contextual aceita sim é sem confundir secretária', () => {
  const estado: any = { etapa: 'apresentacao', perguntaPendente: 'nome_profissional', interlocutor: { papel: 'secretaria', nomeInformado: 'Emmy' } };
  assert.deepEqual(validarAcoes(decisao({ nome: 'Renata Oliveira Guimarães' }, 'Sim, é Renata Oliveira Guimarães') as any,
    'Sim, é Renata Oliveira Guimarães', estado).patch, { nomeConfirmado: 'Renata Oliveira Guimarães' });
  assert.deepEqual(validarAcoes(decisao({ nome: 'Emellyn Antunes' }, 'me chamo Emellyn Antunes') as any,
    'me chamo Emellyn Antunes', estado).patch, {});
});
test('dispensa natural de RQE usa a pergunta anterior mesmo com etapa antiga', () => {
  for (const texto of ['Não precisa', 'Siga sem ele.', 'Pode seguir sem', 'Pode prosseguir']) {
    assert.deepEqual(validarAcoes(decisao({ rqe: null }, texto) as any, texto,
      { etapa: 'apresentacao', perguntaPendente: 'rqe' } as any).patch, { rqeInformado: null }, texto);
    assert.deepEqual(validarAcoes(decisao({ rqe: null }, texto) as any, texto,
      { etapa: 'aguardando_crm', perguntaPendente: 'crm' } as any).patch, {}, texto);
  }
});

test('dispensa contextual aceita cortesia e negação natural mas não inverte intenção', () => {
  const estado: any = { etapa: 'aguardando_rqe_opcional', perguntaPendente: 'rqe' };
  for (const texto of ['Não precisa, obrigada', 'Por mim pode seguir sem ele', 'Acho que não precisa disso, pode seguir']) {
    assert.deepEqual(validarAcoes(decisao({ rqe: null }, texto) as any, texto, estado).patch, { rqeInformado: null }, texto);
  }
  for (const texto of ['Não quero seguir sem RQE', 'Não dispenso o RQE', 'Será que não precisa?', 'Não precisa alterar o CRM']) {
    assert.deepEqual(validarAcoes(decisao({ rqe: null }, texto) as any, texto, estado).patch, {}, texto);
  }
});

test('pedir para manter RQE atual não é dispensa', () => {
  for (const texto of ['Não precisa alterar o RQE', 'Não quero mudar o RQE', 'Pode manter o RQE']) {
    assert.deepEqual(validarAcoes(decisao({ rqe: null }, texto) as any, texto,
      { etapa: 'aguardando_rqe_opcional', perguntaPendente: 'rqe', rqeInformado: '987' } as any).patch, {}, texto);
  }
});
