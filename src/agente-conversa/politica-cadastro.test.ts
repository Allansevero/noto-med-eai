import { test } from 'node:test';
import assert from 'node:assert/strict';
import { carregarConfig } from '../config.js';
import { AgenteAssistente } from './agente-assistente.js';
import { PostgresDadosProfissionaisService } from '../io/postgres/postgres-dados-profissionais-service.js';

test('cadastro assume confirmação; reativação conversacional deve ser explícita', () => {
  assert.equal(carregarConfig({}).notoCadastroModo, 'confirmacao');
  assert.equal(carregarConfig({NOTO_CADASTRO_MODO:'conversacional'}).notoCadastroModo, 'conversacional');
  assert.throws(() => carregarConfig({NOTO_CADASTRO_MODO:'qualquer'}));
});
test('modo confirmação não enfileira apresentação nem recupera turnos antigos', async () => {
  const repo = new Proxy({}, {get:() => () => { throw Error('fila antiga acessada'); }});
  const agente = new AgenteAssistente(repo as any, {} as any, {} as any, {} as any, 'assistente', undefined, 'confirmacao');
  await agente.iniciarAoConectar('medico');
  await agente.recuperar();
  await agente.processar('medico');
  assert.deepEqual(await agente.receber({medicoId:'medico',instancia:'assistente',mensagemId:'msg',texto:'Oi'}), {estado:'suspenso',mensagensConfirmadas:0});
});
test('coleta profissional legada não pergunta nem interpreta dados em modo confirmação', async () => {
  const pool = new Proxy({}, {get:() => () => { throw Error('coleta legada acessada'); }});
  const service = new PostgresDadosProfissionaisService(pool as any, {} as any, 'assistente', undefined, false, 'confirmacao');
  await service.solicitar('medico');
  assert.deepEqual(await service.processarResposta({medicoId:'medico',texto:'Emmy',mensagemId:'msg'}), {tratada:false,completo:false});
});
