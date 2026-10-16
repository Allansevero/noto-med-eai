import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  extrairCpfTexto,
  extrairTodosCpfsTexto,
  extrairCpfConversaSegura
} from './extrair-cpf-texto.js';

describe('extrairCpfTexto', () => {
  it('deve retornar null para texto nulo, vazio ou sem CPF válido', () => {
    assert.strictEqual(extrairCpfTexto(null), null);
    assert.strictEqual(extrairCpfTexto(''), null);
    assert.strictEqual(extrairCpfTexto('Olá doutor, tudo bem?'), null);
  });

  it('não deve confundir número de telefone de 11 dígitos ou chave de 50 dígitos com CPF', () => {
    assert.strictEqual(extrairCpfTexto('meu telefone é 11987654321'), null);
    assert.strictEqual(extrairCpfTexto('43149022228297130000157000000000046725117598932162.pdf'), null);
  });

  it('deve extrair CPF válido formatado de frase natural', () => {
    const texto = 'Boa tarde secretária, meu CPF é 529.982.247-25 para o convênio';
    assert.strictEqual(extrairCpfTexto(texto), '52998224725');
  });

  it('deve extrair CPF válido sem formatação de resposta curta', () => {
    assert.strictEqual(extrairCpfTexto('52998224725'), '52998224725');
  });

  it('deve extrair CPF com espaços, barras, pontos, traços e espaços pós-pontuação', () => {
    assert.strictEqual(extrairCpfTexto('meu CPF: 529 982 247 25'), '52998224725');
    assert.strictEqual(extrairCpfTexto('chave pix cpf 52998224725'), '52998224725');
    assert.strictEqual(extrairCpfTexto('doc 529.982.247 25'), '52998224725');
    assert.strictEqual(extrairCpfTexto('CPF 529.982.247/25'), '52998224725');
    assert.strictEqual(extrairCpfTexto('CPF 529.982.247.25'), '52998224725');
    assert.strictEqual(extrairCpfTexto('CPF 529-982-247-25'), '52998224725');
    assert.strictEqual(extrairCpfTexto('CPF: 529. 982. 247 - 25'), '52998224725');
    assert.strictEqual(extrairCpfTexto('CPF:529982247/25'), '52998224725');
  });

  it('deve ignorar o CPF da clínica/médica quando passado em cpfsIgnorados e retornar o do paciente', () => {
    const textoConversa = [
      'Clínica: Segue nossa chave PIX CPF 111.444.777-35',
      'Paciente: Obrigado! Meu CPF para a nota é 529.982.247-25'
    ].join('\n');

    assert.strictEqual(extrairCpfTexto(textoConversa, ['111.444.777-35']), '52998224725');
    assert.deepStrictEqual(extrairTodosCpfsTexto(textoConversa), ['11144477735', '52998224725']);
  });

  it('extrairCpfConversaSegura nunca deve retornar a chave PIX enviada pela clínica como CPF do paciente', () => {
    const apenasPixClinica = [
      { direcao: 'enviada' as const, texto: 'Olá! Segue nossa chave PIX: 111.444.777-35 (Dra. Bruna)' },
      { direcao: 'recebida' as const, texto: 'Perfeito, acabei de fazer o pagamento!' }
    ];
    assert.strictEqual(extrairCpfConversaSegura(apenasPixClinica), null);

    const pixClinicaMaisCpfPaciente = [
      { direcao: 'enviada' as const, texto: 'Olá! Segue nossa chave PIX: 111.444.777-35 (Dra. Bruna)' },
      { direcao: 'recebida' as const, texto: 'Meu CPF é 529.982.247-25' }
    ];
    assert.strictEqual(extrairCpfConversaSegura(pixClinicaMaisCpfPaciente), '52998224725');
  });
});


