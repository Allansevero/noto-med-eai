import { test } from 'node:test';
import assert from 'node:assert/strict';
import { processarItemFila } from './processar-item-fila.js';
import { PostgresEmissorDpsService } from '../io/fiscal/postgres-emissor-dps-service.js';
const item = { id: 'sol', medicoId: 'med', pacienteId: 'pac', xdescServ: 'CONSULTA', valorServicoCentavos: 15000, ctribNac: '080201', tentativas: 2 };

test('emissor bloqueia cadastro incompleto antes de certificado, numeração ou qualquer transmissão', async () => {
  for (const nome of [null, 'Médico 9886', 'Maria', 'Maria da Silva']) {
    const consultas: string[] = [];
    const pool = { query: async (sql: string) => {
      consultas.push(sql);
      if (sql.includes('from medicos')) return { rows: [{ nome_completo: nome, crm: null }] };
      throw new Error('Não deve acessar emissão');
    } } as any;
    const emissor = new PostgresEmissorDpsService(pool, 'chave');
    const resultado = await emissor.emitir(item);
    assert.equal(resultado.sucesso, false);
    assert.equal((resultado as any).dadosProfissionaisPendentes, true);
    assert.equal(consultas.length, 1);
  }
});

test('worker suspende solicitação sem consumir tentativas nem chamar agente fiscal', async () => {
  const acoes: string[] = [];
  const resultado = await processarItemFila(item, {
    emissorDps: { emitir: async () => ({ sucesso: false, erro: 'Dados pendentes', dadosProfissionaisPendentes: true }) },
    filaRepositorio: {
      suspenderPorDadosProfissionais: async (id: string) => { acoes.push('suspender:'+id); },
      reagendarTentativa: async () => { throw new Error('Não deve reagendar'); },
      marcarFalhaDefinitiva: async () => { throw new Error('Não deve falhar definitivamente'); }
    },
    dadosProfissionais: { solicitar: async (id: string) => { acoes.push('pedir:'+id); }, retomar: async () => 0 },
    agenteFiscal: { decisor: { decidir: async () => { throw new Error('Não deve usar agente fiscal'); } } }
  } as any);
  assert.equal(resultado.status, 'aguardando_dados_profissionais');
  assert.deepEqual(acoes, ['suspender:sol', 'pedir:med']);
});

test('emissor retém nota anterior mesmo com nome e CRM válidos até confirmação na conversa', async () => {
  const consultas: string[]=[];
  const pool={query:async(sql:string)=>{
    consultas.push(sql);
    if(sql.includes('from medicos'))return {rows:[{nome_completo:'Ana Silva',crm:'123/RS',aguardando_confirmacao_medico:true}]};
    throw Error('Não pode acessar dados de emissão');
  }} as any;
  const res=await new PostgresEmissorDpsService(pool,'fake').emitir(item);
  assert.equal(res.sucesso,false);
  assert.equal((res as any).dadosProfissionaisPendentes,true);
  assert.equal(consultas.length,1);
});
