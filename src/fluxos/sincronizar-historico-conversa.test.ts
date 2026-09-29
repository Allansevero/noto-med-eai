import { describe, it } from 'node:test';
import assert from 'node:assert';
import { sincronizarHistoricoConversa } from './sincronizar-historico-conversa.js';
import type {
  AtendimentoRepositorio,
  ConversaRegistro,
  PacienteRegistro,
  InstanciaRegistro,
  ConsultaEmAbertoRegistro,
  MedicoDadosRegistro
} from '../atendimento/atendimento-repositorio.js';
import type { ConsultaCpfProvider, DadosConsultaCpf } from '../paciente/consulta-cpf-provider.js';
import type { RespostaRapidaModelo } from '../whatsapp/casar-resposta-rapida.js';

class AtendimentoRepositorioMemoria implements AtendimentoRepositorio {
  public conversas: ConversaRegistro[] = [];
  public pacientes: PacienteRegistro[] = [];

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
    const pac: PacienteRegistro = {
      id: `pac-${this.pacientes.length + 1}`,
      medicoId: params.medicoId,
      telefone: params.telefone,
      nome: params.nome ?? null,
      cpfHash: params.cpfHash ?? null
    };
    this.pacientes.push(pac);
    return pac;
  }
  async atualizarCpfPaciente(params: any): Promise<void> {
    const p = this.pacientes.find((pac) => pac.id === params.pacienteId);
    if (p) {
      p.cpfHash = params.cpfHash;
      if (params.nome) p.nome = params.nome;
    }
  }
  async vincularPacienteConversa(conversaId: string, pacienteId: string): Promise<void> {
    const c = this.conversas.find((conv) => conv.id === conversaId);
    if (c) c.pacienteId = pacienteId;
  }
  async marcarAguardandoCpf(): Promise<void> {}
  async criarAgendamento(): Promise<{ id: string }> { return { id: 'ag-1' }; }
  async buscarConsultasEmAberto(): Promise<ConsultaEmAbertoRegistro[]> { return []; }
  async buscarDadosMedico(): Promise<MedicoDadosRegistro | null> { return null; }
  async buscarMedicoPorTelefone(): Promise<MedicoDadosRegistro | null> { return null; }
  async buscarSolicitacaoAguardandoData(): Promise<any> { return null; }
  async atualizarDataDescricaoSolicitacao(): Promise<void> {}
  async criarSolicitacaoNota(): Promise<{ id: string }> { return { id: 'sol-1' }; }
  async liberarSolicitacoesPendentesCpf(): Promise<number> { return 0; }
}

describe('sincronizarHistoricoConversa', () => {
  const pepper = 'pepper-onboarding-teste';

  it('deve criar e vincular paciente pelo contato mesmo sem CPF nas mensagens antigas', async () => {
    const repo = new AtendimentoRepositorioMemoria();
    const conversa: ConversaRegistro = {
      id: 'conv-1',
      instanciaId: 'inst-1',
      medicoId: 'med-1',
      contatoTelefone: '5511999998888',
      pacienteId: null,
      aguardandoCpfDesde: null
    };
    repo.conversas.push(conversa);

    const mensagens = [
      'Olá doutor, bom dia!',
      'Gostaria de tirar uma dúvida sobre a receita',
      'Obrigado pelo retorno!'
    ];

    const res = await sincronizarHistoricoConversa(conversa, mensagens, {
      repositorio: repo,
      pepper
    });

    assert.strictEqual(res.ok, true);
    assert.strictEqual(res.pacienteVinculado, true);
    assert.strictEqual(conversa.pacienteId, repo.pacientes[0].id);
    assert.strictEqual(repo.pacientes.length, 1);
    assert.strictEqual(repo.pacientes[0].telefone, '5511999998888');
  });

  it('deve extrair CPF do histórico, consultar dados e vincular paciente preenchido', async () => {
    const repo = new AtendimentoRepositorioMemoria();
    const conversa: ConversaRegistro = {
      id: 'conv-1',
      instanciaId: 'inst-1',
      medicoId: 'med-1',
      contatoTelefone: '5511999998888',
      pacienteId: null,
      aguardandoCpfDesde: null
    };
    repo.conversas.push(conversa);

    const mensagens = [
      'Boa tarde, para o pedido de exames segue meus dados:',
      'CPF 529.982.247-25',
      'Fico no aguardo da guia'
    ];

    const provedorFake: ConsultaCpfProvider = {
      async consultar(): Promise<DadosConsultaCpf> {
        return { nome: 'Fernando Oliveira' };
      }
    };

    const res = await sincronizarHistoricoConversa(conversa, mensagens, {
      repositorio: repo,
      consultaCpfProvider: provedorFake,
      pepper
    });

    assert.strictEqual(res.ok, true);
    assert.strictEqual(res.pacienteVinculado, true);
    assert.strictEqual(res.cpf, '52998224725');
    assert.strictEqual(repo.pacientes.length, 1);
    assert.strictEqual(repo.pacientes[0].nome, 'Fernando Oliveira');
    assert.strictEqual(conversa.pacienteId, repo.pacientes[0].id);
  });
});
