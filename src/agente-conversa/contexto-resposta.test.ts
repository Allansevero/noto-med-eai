import { test } from 'node:test';
import assert from 'node:assert/strict';
import { contextualizarResposta } from './contexto-resposta.js';

test('última pergunta efetivamente enviada define referência da resposta curta', () => {
  const historico: any = [
    { papel: 'noto', texto: 'Me diz o nome completo da médica, como está nos documentos?' },
    { papel: 'medico', texto: 'Sim, é Renata Oliveira Guimarães' },
    { papel: 'noto', texto: 'Se quiser o RQE, me passa o número; se não, seguimos sem ele.' }
  ];
  assert.equal(contextualizarResposta({ etapa: 'apresentacao' }, historico, 'Não precisa').perguntaPendente, 'rqe');
});
test('identifica secretária sem adotar nome citado como nome profissional', () => {
  const r = contextualizarResposta({ etapa: 'apresentacao' }, [], 'Olá, me chamo Emmy sou assistente da Dra.Renata Oliveira. Como podemos ajudar?');
  assert.equal(r.interlocutor?.papel, 'secretaria');
  assert.equal(r.interlocutor?.nomeInformado, 'Emmy');
  assert.equal(r.nomeConfirmado, undefined);
});
test('uma dúvida recente sobre outro assunto não torna dispensa de RQE uma confirmação', () => {
  const r = contextualizarResposta({ etapa: 'aguardando_rqe_opcional' }, [{ papel: 'noto', texto: 'Quer alterar o nome do paciente?' }], 'Não precisa');
  assert.equal(r.perguntaPendente, null);
});

test('a pergunta final prevalece sobre confirmação de RQE na mesma mensagem', () => {
  const r = contextualizarResposta({ etapa: 'aguardando_janela_tempo', rqeInformado: null }, [
    { papel: 'noto', texto: 'Seguimos sem RQE na descrição. Qual período de comprovantes você quer considerar?' }
  ], 'Não precisa');
  assert.equal(r.perguntaPendente, 'periodo');
});

test('pergunta final após vírgula prevalece e referência curta usa oferta opcional anterior', () => {
  assert.equal(contextualizarResposta({ etapa: 'aguardando_janela_tempo', rqeInformado: null }, [
    { papel: 'noto', texto: 'Seguimos sem RQE, qual período de comprovantes você quer considerar?' }
  ], 'Não precisa').perguntaPendente, 'periodo');
  assert.equal(contextualizarResposta({ etapa: 'aguardando_rqe_opcional' }, [
    { papel: 'noto', texto: 'O RQE é opcional. Quer incluir?' }
  ], 'Não precisa').perguntaPendente, 'rqe');
});

test('período dos comprovantes não escolhe preferência da data', () => {
  assert.equal(contextualizarResposta({ etapa: 'aguardando_janela_tempo' }, [
    { papel: 'noto', texto: 'De qual período vamos usar os comprovantes?' }
  ], 'Últimos 30 dias').perguntaPendente, 'periodo');
});
