import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { processarRespostaDataConsulta } from './processar-resposta-data-consulta.js';
import type { AtendimentoRepositorio } from '../atendimento/atendimento-repositorio.js';

describe('processarRespostaDataConsulta', () => {
  const criarRepoMock = (opts: {
    medicoExiste?: boolean;
    solicitacaoPendente?: boolean;
    pacienteComCpf?: boolean;
  } = {}) => {
    let solicitacaoAtualizada: any = null;
    const repositorio: Partial<AtendimentoRepositorio> = {
      async buscarMedicoPorTelefone(tel) {
        if (opts.medicoExiste === false) return null;
        return {
          id: 'medico-1',
          nomeCompleto: 'Dr. Allan Severo',
          especialidade: 'Cardiologia',
          crm: '12345/RS',
          rqe: null,
          ctribNacPadrao: '041601',
          telefone: tel
        };
      },
      async buscarSolicitacaoAguardandoData(medicoId) {
        if (opts.solicitacaoPendente === false) return null;
        return {
          id: 'sol-1',
          medicoId,
          pacienteId: 'paciente-1',
          nomePaciente: 'Paciente João',
          telefoneMedico: '5551993527271',
          valorServicoCentavos: 35000,
          ctribNac: '041601',
          criadoEm: new Date()
        };
      },
      async buscarPacientePorId(id) {
        return {
          id,
          medicoId: 'medico-1',
          telefone: '555181936133',
          nome: 'Paciente João',
          cpfHash: opts.pacienteComCpf === false ? null : 'hash123'
        };
      },
      async atualizarDataDescricaoSolicitacao(params) {
        solicitacaoAtualizada = params;
      }
    };

    return {
      repositorio: repositorio as AtendimentoRepositorio,
      getSolicitacaoAtualizada: () => solicitacaoAtualizada
    };
  };

  it('deve rejeitar quando texto da resposta for vazio', async () => {
    const { repositorio } = criarRepoMock();
    const res = await processarRespostaDataConsulta('5551993527271', '   ', {
      repositorio,
      enviarMensagem: { enviarTexto: async () => ({ sucesso: true }) } as any
    });
    assert.equal(res.ok, false);
    if (!res.ok) assert.equal(res.motivo, 'data_vazia');
  });

  it('deve rejeitar quando médico não for encontrado pelo telefone', async () => {
    const { repositorio } = criarRepoMock({ medicoExiste: false });
    const res = await processarRespostaDataConsulta('5551999999999', '27/09/2026', {
      repositorio,
      enviarMensagem: { enviarTexto: async () => ({ sucesso: true }) } as any
    });
    assert.equal(res.ok, false);
    if (!res.ok) assert.equal(res.motivo, 'medico_nao_encontrado');
  });

  it('deve rejeitar quando não houver solicitação aguardando data', async () => {
    const { repositorio } = criarRepoMock({ solicitacaoPendente: false });
    const res = await processarRespostaDataConsulta('5551993527271', '27/09/2026', {
      repositorio,
      enviarMensagem: { enviarTexto: async () => ({ sucesso: true }) } as any
    });
    assert.equal(res.ok, false);
    if (!res.ok) assert.equal(res.motivo, 'solicitacao_nao_encontrada');
  });

  it('deve atualizar solicitação com nova descrição e colocar fila pronta quando paciente tem CPF', async () => {
    const { repositorio, getSolicitacaoAtualizada } = criarRepoMock({ pacienteComCpf: true });
    let mensagemEnviada = '';
    const res = await processarRespostaDataConsulta('5551993527271', '27/09/2026', {
      repositorio,
      enviarMensagem: {
        enviarTexto: async (params: any) => {
          mensagemEnviada = params.texto;
          return { sucesso: true };
        }
      } as any
    });

    assert.equal(res.ok, true);
    if (res.ok) {
      assert.equal(res.fila, 'pronta');
      assert.equal(res.dataInformada, '27/09/2026');
    }
    const atualizada = getSolicitacaoAtualizada();
    assert.ok(atualizada);
    assert.equal(atualizada.fila, 'pronta');
    assert.ok(atualizada.xdescServ.includes('NAS DATAS 27/09/2026'));
    assert.ok(mensagemEnviada.includes('27/09/2026'));
  });

  it('deve colocar fila pendente_cadastro se paciente não tiver CPF', async () => {
    const { repositorio, getSolicitacaoAtualizada } = criarRepoMock({ pacienteComCpf: false });
    const res = await processarRespostaDataConsulta('5551993527271', 'ontem', {
      repositorio,
      enviarMensagem: { enviarTexto: async () => ({ sucesso: true }) } as any
    });

    assert.equal(res.ok, true);
    if (res.ok) {
      assert.equal(res.fila, 'pendente_cadastro');
    }
    const atualizada = getSolicitacaoAtualizada();
    assert.equal(atualizada.fila, 'pendente_cadastro');
    assert.ok(atualizada.xdescServ.includes('NAS DATAS ONTEM'));
  });
  it('data recebida verifica pendência profissional atual e solicita os dados sem prometer emissão', async () => {
    const { repositorio } = criarRepoMock();
    const acoes: string[] = [];
    let texto = '';
    await processarRespostaDataConsulta('5551993527271', '27/09/2026', {
      repositorio,
      dadosProfissionais: {
        solicitar: async id => { acoes.push('pedir:'+id); },
        retomar: async id => { acoes.push('retomar:'+id); return 0; },
        processarResposta: async () => ({tratada:false, completo:false})
      },
      enviarMensagem: { enviarTexto: async params => {texto=params.texto; return {sucesso:true};} }
    });
    assert.deepEqual(acoes, ['pedir:medico-1', 'retomar:medico-1']);
    assert.match(texto, /Data registrada/);
    assert.doesNotMatch(texto, /está sendo emitida/);
  });

});
