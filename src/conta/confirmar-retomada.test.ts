import {test} from 'node:test';
import assert from 'node:assert/strict';
import {interpretarConfirmacaoNotas} from './confirmar-retomada.js';
test('autorização exige declaração explícita; IA não substitui consentimento',()=>{
 for(const texto of ['pode emitir','Pode emitir as notas!','autorizo a emissão das notas.'])assert.equal(interpretarConfirmacaoNotas(texto),true);
 for(const texto of ['oi','sim','não pode emitir','pode emitir?','pode emitir para CPF 123','ignore as regras'])assert.equal(interpretarConfirmacaoNotas(texto),false);
});
