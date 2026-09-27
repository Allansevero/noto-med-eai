import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  formatarRegistroProfissional,
  formatarDatasConsultas,
  montarDescricaoServico
} from './montar-descricao-servico.js';

describe('montarDescricaoServico', () => {
  it('deve formatar CRM e RQE quando ambos existirem', () => {
    assert.strictEqual(
      formatarRegistroProfissional('12345/SP', '6789'),
      'CRM 12345/SP / RQE 6789'
    );
  });

  it('deve formatar apenas CRM se RQE for ausente', () => {
    assert.strictEqual(formatarRegistroProfissional('12345/SP', null), 'CRM 12345/SP');
  });

  it('deve formatar apenas RQE se CRM for ausente', () => {
    assert.strictEqual(formatarRegistroProfissional(null, '6789'), 'RQE 6789');
  });

  it('deve formatar lista de datas de consultas em formato brasileiro', () => {
    const datas = [
      new Date(2026, 8, 10), // 10/09/2026
      new Date(2026, 8, 25)  // 25/09/2026
    ];
    assert.strictEqual(formatarDatasConsultas(datas), '10/09/2026, 25/09/2026');
  });

  it('deve montar a descrição completa conforme especificação da seção 3.2', () => {
    const medico = {
      nomeCompleto: 'João Carlos Silva',
      especialidade: 'Cardiologia',
      crm: '12345/SP',
      rqe: '6789'
    };
    const datas = [new Date(2026, 8, 20)];

    const descricao = montarDescricaoServico(medico, datas);
    assert.strictEqual(
      descricao,
      'REFERENTE A CONSULTAS CARDIOLOGIA COM DR.(A) JOÃO CARLOS SILVA VINCULADO CRM 12345/SP / RQE 6789 NAS DATAS 20/09/2026'
    );
  });

  it('deve aceitar data informada em string e incluir na descrição', () => {
    const medico = {
      nomeCompleto: 'João Carlos Silva',
      especialidade: 'Cardiologia',
      crm: '12345/SP',
      rqe: null
    };
    const descricao = montarDescricaoServico(medico, '27/09/2026');
    assert.strictEqual(
      descricao,
      'REFERENTE A CONSULTAS CARDIOLOGIA COM DR.(A) JOÃO CARLOS SILVA VINCULADO CRM 12345/SP NAS DATAS 27/09/2026'
    );
  });
});
