/**
 * Testes focados na busca condicional de dados via IA no histórico da conversa
 * durante o comando /emissao (sem sobrecarregar a IA quando os dados já existem).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { processarComandoEmissao } from './processar-comando-emissao.js';
import type {
  AtendimentoRepositorio,
  ConversaRegistro,
  PacienteRegistro,
  InstanciaRegistro,
  ConsultaEmAbertoRegistro,
  MedicoDadosRegistro
} from '../atendimento/atendimento-repositorio.js';
import type { EnviarMensagemPaciente, EnviarMensagemPacienteParams, ResultadoEnvioMensagemPaciente } from '../whatsapp/enviar-mensagem-paciente.js';
import type { RespostaRapidaModelo } from '../whatsapp/casar-resposta-rapida.js';
import type { ExtratorIaService, DadosExtracaoIa } from '../ia/extrator-ia-service.js';
import type { ConsultaCpfProvider, DadosConsultaCpf } from '../paciente/consulta-cpf-provider.js';

class AtendimentoRepositorioMemoria implements AtendimentoRepositorio {
  public conversas: ConversaRegistro[] = [];
  public pacientes: PacienteRegistro[] = [];
  public consultas: ConsultaEmAbertoRegistro[] = [];
  public medico: MedicoDadosRegistro | null = null;
  public solicitacoesCriadas: any[] = [];
  public mensagensConversa: { conversaId: string; conteudo: string }[] = [];

  async buscarInstanciaPorNome(): Promise<InstanciaRegistro | null> { return null; }
  async buscarOuCriarConversa(): Promise<ConversaRegistro> { throw new Error('Not implemented'); }
  async buscarRespostasRapidasMedico(): Promise<RespostaRapidaModelo[]> { return []; }
  async buscarPacientePorId(id: string): Promise<PacienteRegistro | null> {
    return this.pacientes.find((p) => p.id === id) ?? null;
  }
  async buscarPacientePorTelefone(medicoId: string, telefone: string): Promise<PacienteRegistro | null> {
    return this.pacientes.find((p) => p.medicoId === medicoId && p.telefone === telefone) ?? null;
  }
  async criarPacienteMinimo(params: any): Promise<PacienteRegistro> {
    const novo: PacienteRegistro = {
      id: `pac-${this.pacientes.length + 1}`,
      medicoId: params.medicoId,
      telefone: params.telefone,
      nome: params.nome ?? null,
      cpfHash: params.cpfHash ?? null
    };
    this.pacientes.push(novo);
    return novo;
  }
  async atualizarCpfPaciente(params: { pacienteId: string; cpfHash: string; cpf?: string; nome?: string | null }): Promise<void> {
    const pac = this.pacientes.find((p) => p.id === params.pacienteId);
    if (pac) {
      pac.cpfHash = params.cpfHash;
      if (params.nome !== undefined) pac.nome = params.nome;
    }
  }
  async vincularPacienteConversa(conversaId: string, pacienteId: string): Promise<void> {
    const conv = this.conversas.find((c) => c.id === conversaId);
    if (conv) conv.pacienteId = pacienteId;
  }
  async marcarAguardandoCpf(conversaId: string, aguardandoDesde: Date | null): Promise<void> {
    const conv = this.conversas.find((c) => c.id === conversaId);
    if (conv) conv.aguardandoCpfDesde = aguardandoDesde;
  }
  async criarAgendamento(params?: any): Promise<{ id: string }> {
    const novo = { id: `ag-${this.consultas.length + 1}`, dataHora: params?.dataHora ?? new Date(), valorConsultaCentavos: params?.valorConsultaCentavos ?? null };
    this.consultas.push(novo);
    return { id: novo.id };
  }
  async buscarConsultasEmAberto(): Promise<ConsultaEmAbertoRegistro[]> {
    return this.consultas;
  }
  async buscarDadosMedico(): Promise<MedicoDadosRegistro | null> {
    return this.medico;
  }
  async criarSolicitacaoNota(params: any): Promise<{ id: string }> {
    this.solicitacoesCriadas.push(params);
    return { id: `sol-${this.solicitacoesCriadas.length}` };
  }
  async buscarMedicoPorTelefone(): Promise<MedicoDadosRegistro | null> { return this.medico; }
  async buscarSolicitacaoAguardandoData(): Promise<any> { return null; }
  async atualizarDataDescricaoSolicitacao(): Promise<void> {}
  async liberarSolicitacoesPendentesCpf(): Promise<number> { return 0; }
  async salvarMensagem(params: { conversaId: string; conteudo: string }): Promise<void> {
    this.mensagensConversa.push(params);
  }
  async buscarMensagensRecentesConversa(conversaId: string, limite = 20): Promise<string[]> {
    return this.mensagensConversa
      .filter((m) => m.conversaId === conversaId)
      .slice(-limite)
      .map((m) => m.conteudo);
  }
}

class EnviarMensagemPacienteFake implements EnviarMensagemPaciente {
  public envios: EnviarMensagemPacienteParams[] = [];
  async enviarTexto(params: EnviarMensagemPacienteParams): Promise<ResultadoEnvioMensagemPaciente> {
    this.envios.push(params);
    return { sucesso: true, mensagemId: `msg-${this.envios.length}` };
  }
}

describe('processarComandoEmissao - IA e histórico condicional', () => {
  const medicoPadrao: MedicoDadosRegistro = {
    id: 'med-1',
    nomeCompleto: 'Dra. Mariana Costa',
    especialidade: 'Cardiologia',
    crm: '12345/SP',
    rqe: null,
    ctribNacPadrao: '080201'
  };

  it('não deve acionar IA se o paciente já tem CPF e a consulta já tem data e valor', async () => {
    const repo = new AtendimentoRepositorioMemoria();
    const enviador = new EnviarMensagemPacienteFake();
    repo.medico = medicoPadrao;

    repo.pacientes.push({
      id: 'pac-1',
      medicoId: 'med-1',
      telefone: '5511988887777',
      nome: 'Lucas Silva',
      cpfHash: 'hash-existente'
    });

    const conversa: ConversaRegistro = {
      id: 'conv-1',
      instanciaId: 'inst-1',
      medicoId: 'med-1',
      contatoTelefone: '5511988887777',
      pacienteId: 'pac-1',
      aguardandoCpfDesde: null
    };
    repo.conversas.push(conversa);

    repo.consultas.push({
      id: 'ag-1',
      dataHora: new Date(2026, 8, 20),
      valorConsultaCentavos: 30000
    });

    let iaChamada = false;
    const mockIa: ExtratorIaService = {
      async extrairDados(): Promise<DadosExtracaoIa> {
        iaChamada = true;
        return { dataHoraIso: null, valorConsultaCentavos: null, nomePaciente: null, emailPaciente: null, cpfPaciente: null };
      }
    };

    const res = await processarComandoEmissao(conversa, 30000, {
      repositorio: repo,
      enviarMensagemPaciente: enviador,
      iaService: mockIa,
      instanciaNome: 'dra_mariana'
    });

    assert.strictEqual(res.ok, true);
    assert.strictEqual(iaChamada, false, 'IA não deve ser chamada quando dados já estão cadastrados');
    assert.strictEqual(repo.solicitacoesCriadas[0].fila, 'pronta');
  });

  it('deve buscar no histórico com IA e consultar Receita Federal quando o paciente não tem CPF mas forneceu no chat', async () => {
    const repo = new AtendimentoRepositorioMemoria();
    const enviador = new EnviarMensagemPacienteFake();
    repo.medico = medicoPadrao;

    // Paciente cadastrado sem CPF
    repo.pacientes.push({
      id: 'pac-1',
      medicoId: 'med-1',
      telefone: '5511988887777',
      nome: null,
      cpfHash: null
    });

    const conversa: ConversaRegistro = {
      id: 'conv-1',
      instanciaId: 'inst-1',
      medicoId: 'med-1',
      contatoTelefone: '5511988887777',
      pacienteId: 'pac-1',
      aguardandoCpfDesde: null
    };
    repo.conversas.push(conversa);

    repo.consultas.push({
      id: 'ag-1',
      dataHora: new Date(2026, 8, 20),
      valorConsultaCentavos: 45000
    });

    // Mensagem no histórico com CPF
    repo.mensagensConversa.push({
      conversaId: 'conv-1',
      conteudo: 'Boa tarde doutora, meu CPF é 012.345.678-90 para a nota.'
    });

    let iaChamada = false;
    const mockIa: ExtratorIaService = {
      async extrairDados(): Promise<DadosExtracaoIa> {
        iaChamada = true;
        return {
          cpfPaciente: '01234567890',
          dataHoraIso: null,
          valorConsultaCentavos: null,
          nomePaciente: null,
          emailPaciente: null
        };
      }
    };

    let cpfConsultado: string | null = null;
    const mockCpfProvider: ConsultaCpfProvider = {
      async consultar(cpf: string): Promise<DadosConsultaCpf> {
        cpfConsultado = cpf;
        return {
          nome: 'LUCAS SILVA FERREIRA',
          dataNascimento: new Date('1990-05-15'),
          situacaoCadastral: 'REGULAR'
        };
      }
    };

    const res = await processarComandoEmissao(conversa, 45000, {
      repositorio: repo,
      enviarMensagemPaciente: enviador,
      iaService: mockIa,
      consultaCpfProvider: mockCpfProvider,
      pepper: 'teste_pepper',
      instanciaNome: 'dra_mariana'
    });

    assert.strictEqual(res.ok, true);
    assert.strictEqual(iaChamada, true, 'IA deve ser chamada para recuperar o CPF ausente');
    assert.strictEqual(cpfConsultado, '01234567890');

    // Verifica que o nome oficial da Receita foi salvo, e não o pushName do WhatsApp
    const pacienteAtualizado = repo.pacientes.find((p) => p.id === 'pac-1');
    assert.strictEqual(pacienteAtualizado?.nome, 'LUCAS SILVA FERREIRA');
    assert.ok(pacienteAtualizado?.cpfHash);

    // Como encontrou CPF, a fila vai para 'pronta' e não pede CPF novamente
    assert.strictEqual(res.ok && res.fila, 'pronta');
    assert.strictEqual(res.ok && res.aguardandoCpf, false);
    assert.strictEqual(enviador.envios.length, 0);
  });

  it('deve buscar no histórico com IA e recuperar data da consulta ausente', async () => {
    const repo = new AtendimentoRepositorioMemoria();
    const enviador = new EnviarMensagemPacienteFake();
    repo.medico = medicoPadrao;

    repo.pacientes.push({
      id: 'pac-1',
      medicoId: 'med-1',
      telefone: '5511988887777',
      nome: 'Carlos Eduardo',
      cpfHash: 'hash-existente'
    });

    const conversa: ConversaRegistro = {
      id: 'conv-1',
      instanciaId: 'inst-1',
      medicoId: 'med-1',
      contatoTelefone: '5511988887777',
      pacienteId: 'pac-1',
      aguardandoCpfDesde: null
    };
    repo.conversas.push(conversa);

    // Nenhuma consulta em aberto no banco
    repo.consultas = [];

    // Histórico menciona a data
    repo.mensagensConversa.push({
      conversaId: 'conv-1',
      conteudo: 'Consulta agendada para 25/09/2026 às 14h'
    });

    const mockIa: ExtratorIaService = {
      async extrairDados(): Promise<DadosExtracaoIa> {
        return {
          dataHoraIso: '2026-09-25T14:00:00.000Z',
          valorConsultaCentavos: null,
          nomePaciente: null,
          emailPaciente: null,
          cpfPaciente: null
        };
      }
    };

    const res = await processarComandoEmissao(conversa, 25000, {
      repositorio: repo,
      enviarMensagemPaciente: enviador,
      iaService: mockIa,
      instanciaNome: 'dra_mariana'
    });

    assert.strictEqual(res.ok, true);
    if (res.ok) {
      assert.strictEqual(res.aguardandoData, false);
      assert.strictEqual(res.fila, 'pronta');
    }
    // Agendamento criado automaticamente
    assert.strictEqual(repo.consultas.length, 1);
    // Não enviou mensagem perguntando data ao médico
    assert.strictEqual(enviador.envios.length, 0);
  });
});
