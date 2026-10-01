import { describe, it } from 'node:test';
import assert from 'node:assert';
import { processarRespostaCpf } from './processar-resposta-cpf.js';
import type {
  AtendimentoRepositorio,
  ConversaRegistro,
  PacienteRegistro,
  InstanciaRegistro,
  ConsultaEmAbertoRegistro,
  MedicoDadosRegistro
} from '../atendimento/atendimento-repositorio.js';
import type { RespostaRapidaModelo } from '../whatsapp/casar-resposta-rapida.js';
import type { ConsultaCpfProvider, DadosConsultaCpf } from '../paciente/consulta-cpf-provider.js';
import { gerarHashCpf } from '../paciente/hash-cpf.js';

class AtendimentoRepositorioMemoria implements AtendimentoRepositorio {
  public conversas: ConversaRegistro[] = [];
  public pacientes: PacienteRegistro[] = [];
  public solicitacoesLiberadasCount = 1;

  async buscarInstanciaPorNome(): Promise<InstanciaRegistro | null> { return null; }
  async buscarOuCriarConversa(): Promise<ConversaRegistro> { throw new Error('Not implemented'); }
  async buscarRespostasRapidasMedico(): Promise<RespostaRapidaModelo[]> { return []; }
  async buscarPacientePorId(id: string): Promise<PacienteRegistro | null> {
    return this.pacientes.find((p) => p.id === id) ?? null;
  }
  async buscarPacientePorTelefone(): Promise<PacienteRegistro | null> { return null; }
  async buscarPacientePorCpfHash(medicoId: string, cpfHash: string): Promise<PacienteRegistro | null> {
    return this.pacientes.find((p) => p.medicoId === medicoId && p.cpfHash === cpfHash) ?? null;
  }
  async criarPacienteMinimo(params: any): Promise<PacienteRegistro> {
    const pac: PacienteRegistro = {
      id: `pac-${this.pacientes.length + 1}`,
      medicoId: params.medicoId,
      telefone: params.telefone,
      nome: params.nome ?? null,
      cpfHash: params.cpfHash ?? null,
      nomeValidado: false
    };
    this.pacientes.push(pac);
    return pac;
  }
  async atualizarCpfPaciente(params: { pacienteId: string; cpfHash: string; nome?: string | null; nomeValidado?: boolean }): Promise<void> {
    const pac = this.pacientes.find((p) => p.id === params.pacienteId);
    if (pac) {
      pac.cpfHash = params.cpfHash;
      if (params.nome && !pac.nomeValidado) pac.nome = params.nome;
      pac.nomeValidado = Boolean(params.nomeValidado);
    }
  }
  async vincularPacienteConversa(): Promise<void> {}
  async marcarAguardandoCpf(conversaId: string, aguardandoDesde: Date | null): Promise<void> {
    const conv = this.conversas.find((c) => c.id === conversaId);
    if (conv) conv.aguardandoCpfDesde = aguardandoDesde;
  }
  async criarAgendamento(): Promise<{ id: string }> { return { id: 'ag-1' }; }
  async buscarConsultasEmAberto(): Promise<ConsultaEmAbertoRegistro[]> { return []; }
  async buscarDadosMedico(): Promise<MedicoDadosRegistro | null> { return null; }
  async buscarMedicoPorTelefone(): Promise<MedicoDadosRegistro | null> { return null; }
  async buscarSolicitacaoAguardandoData(): Promise<any> { return null; }
  async atualizarDataDescricaoSolicitacao(): Promise<void> {}
  async criarSolicitacaoNota(): Promise<{ id: string }> { return { id: 'sol-1' }; }
  async liberarSolicitacoesPendentesCpf(): Promise<number> {
    return this.solicitacoesLiberadasCount;
  }
}

describe('processarRespostaCpf', () => {
  const pepper = 'pepper-teste-123';

  it('deve rejeitar mensagem que não contenha CPF válido', async () => {
    const repo = new AtendimentoRepositorioMemoria();
    const conversa: ConversaRegistro = {
      id: 'conv-1',
      instanciaId: 'inst-1',
      medicoId: 'med-1',
      contatoTelefone: '5511999998888',
      pacienteId: 'pac-1',
      aguardandoCpfDesde: new Date()
    };

    const res = await processarRespostaCpf(conversa, 'Não lembro meu CPF agora', {
      repositorio: repo,
      pepper
    });

    assert.strictEqual(res.ok, false);
    if (!res.ok) {
      assert.strictEqual(res.motivo, 'cpf_invalido_ou_ausente');
    }
  });

  it('deve processar CPF válido, atualizar paciente e liberar notas pendentes', async () => {
    const repo = new AtendimentoRepositorioMemoria();
    const paciente: PacienteRegistro = {
      id: 'pac-1',
      medicoId: 'med-1',
      telefone: '5511999998888',
      nome: null,
      cpfHash: null
    };
    repo.pacientes.push(paciente);

    const conversa: ConversaRegistro = {
      id: 'conv-1',
      instanciaId: 'inst-1',
      medicoId: 'med-1',
      contatoTelefone: '5511999998888',
      pacienteId: 'pac-1',
      aguardandoCpfDesde: new Date()
    };
    repo.conversas.push(conversa);

    const provedorFake: ConsultaCpfProvider = {
      async consultar(): Promise<DadosConsultaCpf> {
        return { nome: 'Maria Santos Silva' };
      }
    };

    const res = await processarRespostaCpf(conversa, 'Meu CPF é 529.982.247-25', {
      repositorio: repo,
      consultaCpfProvider: provedorFake,
      pepper
    });

    assert.strictEqual(res.ok, true);
    if (res.ok) {
      assert.strictEqual(res.cpf, '52998224725');
      assert.strictEqual(res.solicitacoesLiberadas, 1);
    }
    assert.strictEqual(conversa.aguardandoCpfDesde, null);
    assert.strictEqual(paciente.nome, 'Maria Santos Silva');
    assert.ok(paciente.cpfHash !== null);
  });

  it('deve substituir apelido/nome incompleto do WhatsApp pelo nome civil oficial da Receita', async () => {
    const repo = new AtendimentoRepositorioMemoria();
    const paciente: PacienteRegistro = {
      id: 'pac-2',
      medicoId: 'med-1',
      telefone: '555195611075',
      nome: 'Emellyn Severo', // Nome incompleto vindo do pushName do WhatsApp
      cpfHash: null
    };
    repo.pacientes.push(paciente);

    const conversa: ConversaRegistro = {
      id: 'conv-2',
      instanciaId: 'inst-1',
      medicoId: 'med-1',
      contatoTelefone: '555195611075',
      pacienteId: 'pac-2',
      aguardandoCpfDesde: new Date()
    };
    repo.conversas.push(conversa);

    const provedorReceita: ConsultaCpfProvider = {
      async consultar(cpf: string): Promise<DadosConsultaCpf> {
        return { nome: 'EMELLYN ANTUNES RODRIGUES SEVERO' };
      }
    };

    const res = await processarRespostaCpf(conversa, '04457117013', {
      repositorio: repo,
      consultaCpfProvider: provedorReceita,
      pepper
    });

    assert.strictEqual(res.ok, true);
    assert.strictEqual(paciente.nome, 'EMELLYN ANTUNES RODRIGUES SEVERO');
    assert.strictEqual(paciente.nomeValidado, false); // Permanece false até a 2ª verificação na emissão da nota
  });

  it('nunca deve chamar a API se o paciente já possuir nomeValidado = true', async () => {
    const repo = new AtendimentoRepositorioMemoria();
    const paciente: PacienteRegistro = {
      id: 'pac-1',
      medicoId: 'med-1',
      telefone: '5511999999999',
      nome: 'Maria Santos Silva',
      cpfHash: 'hash-anterior',
      nomeValidado: true
    };
    repo.pacientes.push(paciente);

    const conversa: ConversaRegistro = {
      id: 'conv-1',
      instanciaId: 'inst-1',
      medicoId: 'med-1',
      contatoTelefone: '5511999999999',
      pacienteId: 'pac-1',
      aguardandoCpfDesde: new Date()
    };
    repo.conversas.push(conversa);

    let chamadasApi = 0;
    const provedorReceita: ConsultaCpfProvider = {
      async consultar() {
        chamadasApi++;
        return { nome: 'Outro Nome' };
      }
    };

    const res = await processarRespostaCpf(conversa, '529.982.247-25', {
      repositorio: repo,
      consultaCpfProvider: provedorReceita,
      pepper
    });

    assert.strictEqual(res.ok, true);
    assert.strictEqual(chamadasApi, 0); // ZERO chamadas à API!
    assert.strictEqual(paciente.nome, 'Maria Santos Silva'); // Nome imutável
  });

  it('deve reaproveitar nome validado de outro cadastro com mesmo CPF sem chamar a API', async () => {
    const repo = new AtendimentoRepositorioMemoria();
    const pacienteOriginal: PacienteRegistro = {
      id: 'pac-1',
      medicoId: 'med-1',
      telefone: '555195611075',
      nome: 'EMELLYN ANTUNES RODRIGUES SEVERO',
      cpfHash: gerarHashCpf('04457117013', pepper),
      nomeValidado: true
    };
    const pacienteNovo: PacienteRegistro = {
      id: 'pac-2',
      medicoId: 'med-1',
      telefone: '555193527271', // Telefone novo/diferente
      nome: null,
      cpfHash: null
    };
    repo.pacientes.push(pacienteOriginal, pacienteNovo);

    const conversa: ConversaRegistro = {
      id: 'conv-2',
      instanciaId: 'inst-1',
      medicoId: 'med-1',
      contatoTelefone: '555193527271',
      pacienteId: 'pac-2',
      aguardandoCpfDesde: new Date()
    };
    repo.conversas.push(conversa);

    let chamadasApi = 0;
    const provedorReceita: ConsultaCpfProvider = {
      async consultar() {
        chamadasApi++;
        return { nome: 'NOME DA API' };
      }
    };

    const res = await processarRespostaCpf(conversa, '04457117013', {
      repositorio: repo,
      consultaCpfProvider: provedorReceita,
      pepper
    });

    assert.strictEqual(res.ok, true);
    assert.strictEqual(chamadasApi, 0); // Reaproveitou o cadastro existente no banco, zero chamadas à API
    assert.strictEqual(pacienteNovo.nome, 'EMELLYN ANTUNES RODRIGUES SEVERO');
    assert.strictEqual(pacienteNovo.nomeValidado, true);
  });
});
