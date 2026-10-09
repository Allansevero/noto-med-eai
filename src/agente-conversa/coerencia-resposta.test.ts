import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inconsistenciasResposta } from './coerencia-resposta.js';
test('impede pedir de novo nome e CRM já salvos', () => {
  const estado: any = { etapa: 'aguardando_rqe_opcional', nomeConfirmado: 'Renata Oliveira Guimarães', crmInformado: '37341/RS' };
  assert.deepEqual(inconsistenciasResposta(['Me passa o CRM dela com a UF?'], estado, []), ['CRM_JA_SALVO']);
  assert.deepEqual(inconsistenciasResposta(['Preciso do nome completo dela, como está nos documentos. Você pode me passar?'], estado, []), ['NOME_JA_SALVO']);
  assert.deepEqual(inconsistenciasResposta(['Recebi o CRM. Quer incluir RQE?'], estado, []), []);
});
test('rejeição de campo não pode virar confirmação de gravação ou dispensa', () => {
  assert.deepEqual(inconsistenciasResposta(['Combinado. Seguimos sem o RQE.'], { etapa: 'apresentacao' }, [{ campo: 'rqe', estado: 'rejeitado' }]), ['RQE_NAO_REGISTRADO']);
  assert.deepEqual(inconsistenciasResposta(['Ele já entra na descrição da nota.'], { etapa: 'aguardando_crm' }, [{ campo: 'crm', estado: 'rejeitado' }]), ['CRM_NAO_REGISTRADO']);
});

test('pedidos naturais de CRM e nome do próprio médico também são duplicação', () => {
  const estado: any = { etapa: 'aguardando_rqe_opcional', nomeConfirmado: 'Ana Maria Silva', crmInformado: '123/RS', interlocutor: { papel: 'medica' } };
  assert.deepEqual(inconsistenciasResposta(['Me passa seu nome completo?'], estado, []), ['NOME_JA_SALVO']);
  assert.deepEqual(inconsistenciasResposta(['Pode enviar seu CRM com a UF?'], estado, []), ['CRM_JA_SALVO']);
  assert.deepEqual(inconsistenciasResposta(['Me passa seu nome completo?'], { ...estado, interlocutor: { papel: 'secretaria' } }, []), []);
});
