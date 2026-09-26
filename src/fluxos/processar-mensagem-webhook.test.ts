import { describe, it } from 'node:test';
import assert from 'node:assert';
import { processarMensagemWebhook } from './processar-mensagem-webhook.js';
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

class AtendimentoRepositorioMemoria implements AtendimentoRepositorio {
  public instancias: InstanciaRegistro[] = [];
  public conversas: ConversaRegistro[] = [];
  public pacientes: PacienteRegistro[] = [];
  public consultas: ConsultaEmAbertoRegistro[] = [];
  public medico: MedicoDadosRegistro | null = null;
  public agendamentos: any[] = [];
  public solicitacoes: any[] = [];

  async buscarInstanciaPorNome(nome: string): Promise<InstanciaRegistro | null> {
    return this.instancias.find((i) => i.nomeInstancia === nome) ?? null;
  }
  async buscarOuCriarConversa(instanciaId: string, medicoId: string, contatoTelefone: string): Promise<ConversaRegistro> {
    let conv = this.conversas.find((c) => c.instanciaId === instanciaId && c.contatoTelefone === contatoTelefone);
    if (!conv) {
      conv = {
        id: `conv-${this.conversas.length + 1}`,
        instanciaId,
        medicoId,
        contatoTelefone,
        pacienteId: null,
        aguardandoCpfDesde: null
      };
      this.conversas.push(conv);
    }
    return conv;
  }
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
    if (p) p.cpfHash = params.cpfHash;
  }
  async vincularPacienteConversa(conversaId: string, pacienteId: string): Promise<void> {
    const c = this.conversas.find((conv) => conv.id === conversaId);
    if (c) c.pacienteId = pacienteId;
  }
  async marcarAguardandoCpf(conversaId: string, desde: Date | null): Promise<void> {
    const c = this.conversas.find((conv) => conv.id === conversaId);
    if (c) c.aguardandoCpfDesde = desde;
  }
  async criarAgendamento(params: any): Promise<{ id: string }> {
    this.agendamentos.push(params);
    return { id: `ag-${this.agendamentos.length}` };
  }
  async buscarConsultasEmAberto(): Promise<ConsultaEmAbertoRegistro[]> {
    return this.consultas;
  }
  async buscarDadosMedico(): Promise<MedicoDadosRegistro | null> {
    return this.medico;
  }
  async criarSolicitacaoNota(params: any): Promise<{ id: string }> {
    this.solicitacoes.push(params);
    return { id: `sol-${this.solicitacoes.length}` };
  }
  async liberarSolicitacoesPendentesCpf(): Promise<number> { return 1; }
}

class EnviarMensagemFake implements EnviarMensagemPaciente {
  public envios: EnviarMensagemPacienteParams[] = [];
  async enviarTexto(params: EnviarMensagemPacienteParams): Promise<ResultadoEnvioMensagemPaciente> {
    this.envios.push(params);
    return { sucesso: true };
  }
}

describe('processarMensagemWebhook', () => {
  const segredo = 'segredo-secreto-evolution';
  const pepper = 'pepper-app-123';

  function criarDeps(repo: AtendimentoRepositorioMemoria) {
    return {
      repositorio: repo,
      enviarMensagemPaciente: new EnviarMensagemFake(),
      segredoConfigurado: segredo,
      pepper
    };
  }

  it('deve rejeitar requisição com segredo inválido', async () => {
    const repo = new AtendimentoRepositorioMemoria();
    const res = await processarMensagemWebhook({}, 'token-errado', criarDeps(repo));

    assert.strictEqual(res.ok, false);
    if (!res.ok) {
      assert.strictEqual(res.motivo, 'autenticacao_invalida');
    }
  });

  it('deve descartar mensagens de grupo com segurança', async () => {
    const repo = new AtendimentoRepositorioMemoria();
    const payloadGrupo = {
      event: 'messages.upsert',
      instance: 'consultorio_dr_joao',
      data: {
        key: {
          remoteJid: '120363023456789@g.us',
          fromMe: false,
          id: 'MSG-GRUPO'
        },
        message: { conversation: 'Olá a todos do grupo' }
      }
    };

    const res = await processarMensagemWebhook(payloadGrupo, segredo, criarDeps(repo));
    assert.strictEqual(res.ok, true);
    if (res.ok) {
      assert.strictEqual(res.acao, 'descartada');
    }
  });

  it('deve rotear comando /agendado disparado pelo médico (fromMe: true)', async () => {
    const repo = new AtendimentoRepositorioMemoria();
    repo.instancias.push({
      id: 'inst-1',
      medicoId: 'med-1',
      nomeInstancia: 'consultorio_dr_joao',
      oficial: false
    });

    const payload = {
      event: 'messages.upsert',
      instance: 'consultorio_dr_joao',
      data: {
        key: {
          remoteJid: '5511999998888@s.whatsapp.net',
          fromMe: true,
          id: 'MSG-AGENDADO'
        },
        message: { conversation: 'Consulta agendada!' }
      }
    };

    const res = await processarMensagemWebhook(payload, segredo, criarDeps(repo));
    assert.strictEqual(res.ok, true);
    if (res.ok) {
      assert.strictEqual(res.acao, 'comando_agendado');
    }
    assert.strictEqual(repo.agendamentos.length, 1);
  });

  it('deve rotear resposta de CPF quando a conversa estiver aguardando CPF', async () => {
    const repo = new AtendimentoRepositorioMemoria();
    repo.instancias.push({
      id: 'inst-1',
      medicoId: 'med-1',
      nomeInstancia: 'consultorio_dr_joao',
      oficial: false
    });

    const paciente = await repo.criarPacienteMinimo({
      medicoId: 'med-1',
      telefone: '5511999998888'
    });

    repo.conversas.push({
      id: 'conv-1',
      instanciaId: 'inst-1',
      medicoId: 'med-1',
      contatoTelefone: '5511999998888',
      pacienteId: paciente.id,
      aguardandoCpfDesde: new Date()
    });

    const payload = {
      event: 'messages.upsert',
      instance: 'consultorio_dr_joao',
      data: {
        key: {
          remoteJid: '5511999998888@s.whatsapp.net',
          fromMe: false,
          id: 'MSG-RESPOSTA-CPF'
        },
        message: { conversation: '529.982.247-25' }
      }
    };

    const res = await processarMensagemWebhook(payload, segredo, criarDeps(repo));
    assert.strictEqual(res.ok, true);
    if (res.ok) {
      assert.strictEqual(res.acao, 'resposta_cpf');
    }
    assert.strictEqual(repo.conversas[0].aguardandoCpfDesde, null);
    assert.ok(paciente.cpfHash !== null);
  });
});
