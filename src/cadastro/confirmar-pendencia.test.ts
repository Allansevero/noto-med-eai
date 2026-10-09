import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validarConfirmacao } from './confirmar-pendencia.js';
import type { PendenciaCadastro } from './enriquecer-cadastro.js';
const p:PendenciaCadastro={id:'pendencia',tipo:'responsavel',perguntaConfirmada:'Ana de Souza é a médica responsável?',candidatos:[{id:'ana',nome:'Ana de Souza'}]};
test('confirmação natural de candidato único usa a pergunta efetivamente enviada',()=>{
 for(const texto of ['Sou eu','É ela','Isso mesmo','Está correto','Pode seguir'])assert.deepEqual(validarConfirmacao(p,{acao:'confirmar_candidato',candidatoId:'ana',evidencia:texto},texto),{nome:'Ana de Souza'});
 assert.equal(validarConfirmacao({...p,perguntaConfirmada:null},{acao:'confirmar_candidato',candidatoId:'ana',evidencia:'Sim'},'Sim'),null);
});
test('negação, pergunta e evidência inventada não confirmam vínculo',()=>{
 for(const texto of ['Não sou eu','Será que é ela?','Talvez','Meu nome é Emmy, sou assistente'])assert.equal(validarConfirmacao(p,{acao:'confirmar_candidato',candidatoId:'ana',evidencia:texto},texto),null);
 assert.equal(validarConfirmacao(p,{acao:'confirmar_candidato',candidatoId:'ana',evidencia:'Sim'},'Oi'),null);
});
test('múltiplos sócios exigem nome completo ou escolha inequívoca; sim não escolhe',()=>{
 const multi={...p,candidatos:[...p.candidatos,{id:'maria',nome:'Maria Oliveira'}],perguntaConfirmada:'Quem é a responsável: 1. Ana de Souza; 2. Maria Oliveira?'};
 assert.equal(validarConfirmacao(multi,{acao:'confirmar_candidato',candidatoId:'ana',evidencia:'Sim'},'Sim'),null);
 assert.deepEqual(validarConfirmacao(multi,{acao:'confirmar_candidato',candidatoId:'maria',evidencia:'A segunda'},'A segunda'),{nome:'Maria Oliveira'});
 assert.deepEqual(validarConfirmacao(multi,{acao:'confirmar_candidato',candidatoId:'ana',evidencia:'Ana de Souza'},'A responsável é Ana de Souza'),{nome:'Ana de Souza'});
});
test('nome de secretária não substitui o do médico; dado explícito do médico é aceito',()=>{
 const nome={...p,tipo:'nome' as const,candidatos:[]};
 assert.equal(validarConfirmacao(nome,{acao:'informar_nome',valor:'Emmy Antunes',evidencia:'Emmy Antunes'},'Eu sou Emmy Antunes, assistente da médica'),null);
 assert.deepEqual(validarConfirmacao(nome,{acao:'informar_nome',valor:'Roberta Bellora Guimarães',evidencia:'Roberta Bellora Guimarães'},'A médica é Roberta Bellora Guimarães'),{nome:'Roberta Bellora Guimarães'});
});
test('CRM declarado requer número e UF na evidência, sem inventar UF ou inferir sim',()=>{
 const crm={...p,tipo:'crm' as const,candidatos:[]};
 assert.deepEqual(validarConfirmacao(crm,{acao:'informar_crm',valor:'37341/RS',evidencia:'CRM/RS 37.341'},'CRM/RS 37.341'),{crm:'37341/RS'});
 assert.equal(validarConfirmacao(crm,{acao:'informar_crm',valor:'37341/RS',evidencia:'37341'},'37341'),null);
 assert.equal(validarConfirmacao(crm,{acao:'informar_crm',valor:'37341/RS',evidencia:'Sim'},'Sim'),null);
 assert.equal(validarConfirmacao(crm,{acao:'informar_crm',valor:'37341/RS',evidencia:'CRM/RS 37341'},'Não é CRM/RS 37341'),null);
});
test('confirmações curtas não são interpretadas como nome civil',()=>{
 const nome={...p,tipo:'nome' as const,candidatos:[]};
 for(const texto of ['Sou eu','Pode seguir','Isso mesmo'])assert.equal(validarConfirmacao(nome,{acao:'informar_nome',valor:texto,evidencia:texto},texto),null);
});
test('homônimos com CRMs diferentes não podem ser escolhidos apenas pelo nome',()=>{
 const crm={...p,tipo:'crm' as const,candidatos:[{id:'a',nome:'Ana de Souza',crm:'12345',uf:'RS'},{id:'b',nome:'Ana de Souza',crm:'54321',uf:'SP'}]};
 assert.equal(validarConfirmacao(crm,{acao:'confirmar_candidato',candidatoId:'a',evidencia:'Ana de Souza'},'Ana de Souza'),null);
 assert.deepEqual(validarConfirmacao(crm,{acao:'confirmar_candidato',candidatoId:'a',evidencia:'12345/RS'},'12345/RS'),{crm:'12345/RS'});
});
test('mera menção ou identificação como secretária não confirma candidato como médico',()=>{
 for(const texto of ['Ana de Souza é a secretária','Conheço Ana de Souza.'])assert.equal(validarConfirmacao(p,{acao:'confirmar_candidato',candidatoId:'ana',evidencia:texto},texto),null);
});
test('escolhas numéricas seguem a ordem da pergunta enviada, não a do array interno',()=>{
 const multi={...p,candidatos:[...p.candidatos,{id:'maria',nome:'Maria Oliveira'}],perguntaConfirmada:'Quem é a médica responsável: 1. Maria Oliveira; 2. Ana de Souza?'};
 assert.deepEqual(validarConfirmacao(multi,{acao:'confirmar_candidato',candidatoId:'maria',evidencia:'1'},'1'),{nome:'Maria Oliveira'});
 assert.deepEqual(validarConfirmacao(multi,{acao:'confirmar_candidato',candidatoId:'ana',evidencia:'A segunda'},'A segunda'),{nome:'Ana de Souza'});
 assert.equal(validarConfirmacao(multi,{acao:'confirmar_candidato',candidatoId:'ana',evidencia:'1'},'1'),null);
});
test('frases sociais e prefixos não viram nome civil; médico explicitamente nomeado é extraído',()=>{
 const nome={...p,tipo:'nome' as const,candidatos:[]};
 for(const texto of ['Estou verificando','A médica é Maria da Silva'])assert.equal(validarConfirmacao(nome,{acao:'informar_nome',valor:texto,evidencia:texto},texto),null);
 assert.deepEqual(validarConfirmacao(nome,{acao:'informar_nome',valor:'Maria da Silva',evidencia:'Maria da Silva'},'A médica é Maria da Silva'),{nome:'Maria da Silva'});
});
