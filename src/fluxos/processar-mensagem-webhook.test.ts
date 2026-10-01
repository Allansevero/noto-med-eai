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
    const existente = this.pacientes.find(
      (p) => p.medicoId === params.medicoId && p.telefone === params.telefone
    );
    if (existente) {
      existente.nome = params.nome ?? existente.nome;
      existente.cpfHash = params.cpfHash ?? existente.cpfHash;
      return existente;
    }
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
    const sol = { id: `sol-${this.solicitacoes.length + 1}`, ...params };
    this.solicitacoes.push(sol);
    return { id: sol.id };
  }
  async buscarMedicoPorTelefone(telefone: string): Promise<MedicoDadosRegistro | null> {
    if (this.medico && (this.medico.telefone === telefone || `55${this.medico.telefone}` === telefone)) {
      return this.medico;
    }
    return null;
  }
  async buscarSolicitacaoAguardandoData(): Promise<any> {
    const pendente = this.solicitacoes.find((s) => s.aguardandoDataConsulta);
    if (!pendente) return null;
    return {
      id: 'sol-1',
      medicoId: pendente.medicoId,
      pacienteId: pendente.pacienteId,
      nomePaciente: 'Paciente João',
      telefoneMedico: '5551993527271',
      valorServicoCentavos: pendente.valorServicoCentavos,
      ctribNac: pendente.ctribNac,
      criadoEm: new Date()
    };
  }
  async atualizarDataDescricaoSolicitacao(params: any): Promise<void> {
    const s = this.solicitacoes.find((sol) => sol.id === params.solicitacaoId || true);
    if (s) {
      s.xdescServ = params.xdescServ;
      s.fila = params.fila;
      s.aguardandoDataConsulta = false;
    }
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

  function criarDeps(repo: AtendimentoRepositorioMemoria, consultaCpfProvider?: any) {
    return {
      repositorio: repo,
      enviarMensagemPaciente: new EnviarMensagemFake(),
      segredoConfigurado: segredo,
      pepper,
      consultaCpfProvider
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

  it('deve importar pacientes do lote inicial de histórico da Evolution', async () => {
    const repo = new AtendimentoRepositorioMemoria();
    repo.instancias.push({
      id: 'inst-1',
      medicoId: 'med-1',
      nomeInstancia: 'consultorio_dr_joao',
      oficial: false
    });

    const payload = {
      event: 'messages.set',
      instance: 'consultorio_dr_joao',
      data: {
        messages: [
          {
            key: {
              remoteJid: '5511999998888@s.whatsapp.net',
              fromMe: false,
              id: 'HIST-1'
            },
            pushName: 'Maria da Silva',
            message: { conversation: 'Boa tarde, seguem meus dados.' }
          },
          {
            key: {
              remoteJid: '5511999998888@s.whatsapp.net',
              fromMe: false,
              id: 'HIST-2'
            },
            message: { conversation: 'CPF 529.982.247-25' }
          }
        ],
        isLatest: true,
        progress: 100
      }
    };

    const provedorCpf = {
      async consultar() {
        return { nome: 'MARIA DA SILVA OFICIAL' };
      }
    };
    const res = await processarMensagemWebhook(payload, segredo, criarDeps(repo, provedorCpf));

    assert.strictEqual(res.ok, true);
    if (res.ok) assert.strictEqual(res.acao, 'historico_sincronizado');
    assert.strictEqual(repo.conversas.length, 1);
    assert.strictEqual(repo.pacientes.length, 1);
    assert.strictEqual(repo.conversas[0].pacienteId, repo.pacientes[0].id);
    assert.ok(repo.pacientes[0].cpfHash);
    assert.strictEqual(repo.pacientes[0].nome, 'MARIA DA SILVA OFICIAL');
  });

  it('deve cadastrar e vincular contato de mensagem comum mesmo sem CPF e sem gravar pushName como nome', async () => {
    const repo = new AtendimentoRepositorioMemoria();
    repo.instancias.push({
      id: 'inst-1',
      medicoId: 'med-1',
      nomeInstancia: 'consultorio_dr_joao',
      oficial: false
    });

    const res = await processarMensagemWebhook({
      event: 'messages.upsert',
      instance: 'consultorio_dr_joao',
      data: {
        key: {
          remoteJid: '5511988887777@s.whatsapp.net',
          fromMe: false,
          id: 'MSG-CONTATO'
        },
        pushName: 'Ana Souza',
        message: { conversation: 'Gostaria de marcar uma consulta.' }
      }
    }, segredo, criarDeps(repo));

    assert.strictEqual(res.ok, true);
    if (res.ok) assert.strictEqual(res.acao, 'descartada');
    assert.strictEqual(repo.pacientes.length, 1);
    // Nunca salvar o nome do paciente pelo nome/pushName do WhatsApp
    assert.strictEqual(repo.pacientes[0].nome, null);
    assert.strictEqual(repo.conversas[0].pacienteId, repo.pacientes[0].id);
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

  it('deve processar resposta do médico com a data da consulta e avançar para fila pronta', async () => {
    const repo = new AtendimentoRepositorioMemoria();
    repo.instancias.push({
      id: 'inst-oficial',
      medicoId: 'med-1',
      nomeInstancia: 'notomed_oficial',
      oficial: true
    });
    repo.medico = {
      id: 'med-1',
      nomeCompleto: 'Dr. Allan Severo',
      especialidade: 'Cardiologia',
      crm: '12345/RS',
      rqe: null,
      ctribNacPadrao: '041601',
      telefone: '5551993527271'
    };

    const paciente: PacienteRegistro = {
      id: 'pac-1',
      medicoId: 'med-1',
      telefone: '555181936133',
      nome: 'Paciente João',
      cpfHash: 'hash-existente'
    };
    repo.pacientes.push(paciente);

    // Solicitação aguardando data da consulta
    repo.solicitacoes.push({
      id: 'sol-1',
      medicoId: 'med-1',
      pacienteId: 'pac-1',
      valorServicoCentavos: 35000,
      ctribNac: '041601',
      fila: null,
      aguardandoDataConsulta: true,
      xdescServ: 'REFERENTE A CONSULTAS CARDIOLOGIA COM DR.(A) ALLAN SEVERO NAS DATAS DATA A CONFIRMAR'
    });

    const payload = {
      event: 'messages.upsert',
      instance: 'notomed_oficial',
      data: {
        key: {
          remoteJid: '5551993527271@s.whatsapp.net',
          fromMe: false,
          id: 'MSG-RESPOSTA-DATA'
        },
        message: { conversation: '27/09/2026' }
      }
    };

    const res = await processarMensagemWebhook(payload, segredo, criarDeps(repo));
    assert.strictEqual(res.ok, true);
    if (res.ok) {
      assert.strictEqual(res.acao, 'resposta_data_consulta');
    }
    assert.strictEqual(repo.solicitacoes[0].fila, 'pronta');
    assert.ok(repo.solicitacoes[0].xdescServ.includes('NAS DATAS 27/09/2026'));
  });

  it('deve reconhecer CPF fornecido diretamente na mensagem mesmo sem flag aguardando_cpf_desde', async () => {
    const repo = new AtendimentoRepositorioMemoria();
    repo.instancias.push({
      id: 'inst-1',
      nomeInstancia: 'notomed_clinica',
      medicoId: 'med-1',
      oficial: false
    });
    repo.medico = {
      id: 'med-1',
      telefone: '5551993527271',
      nomeCompleto: 'Dr. Allan',
      especialidade: null,
      crm: null,
      rqe: null,
      ctribNacPadrao: '041601'
    };

    const payload = {
      event: 'messages.upsert',
      instance: 'notomed_clinica',
      data: {
        key: {
          remoteJid: '555195611075@s.whatsapp.net',
          fromMe: false,
          id: 'MSG-CPF-DIRETO'
        },
        pushName: 'Emellyn Severo',
        message: { conversation: 'Segue meu CPF: 044.571.170-13' }
      }
    };

    const res = await processarMensagemWebhook(payload, segredo, criarDeps(repo));
    assert.strictEqual(res.ok, true);
    if (res.ok) {
      assert.strictEqual(res.acao, 'resposta_cpf');
    }
  });

  it('deve rotear comando de emissão com data da consulta direto no gatilho para fila pronta', async () => {
    const repo = new AtendimentoRepositorioMemoria();
    repo.instancias.push({
      id: 'inst-1',
      medicoId: 'med-1',
      nomeInstancia: 'consultorio_dr_joao',
      oficial: false
    });
    repo.medico = {
      id: 'med-1',
      telefone: '5551993527271',
      nomeCompleto: 'Dr. Roberto Santos',
      especialidade: 'Cardiologia',
      crm: '12345/SP',
      rqe: '6789',
      ctribNacPadrao: '041601'
    };

    const paciente = await repo.criarPacienteMinimo({
      medicoId: 'med-1',
      telefone: '5511999998888',
      nome: 'Carlos Souza',
      cpfHash: 'hash-existente'
    });

    repo.conversas.push({
      id: 'conv-1',
      instanciaId: 'inst-1',
      medicoId: 'med-1',
      contatoTelefone: '5511999998888',
      pacienteId: paciente.id,
      aguardandoCpfDesde: null
    });

    const payload = {
      event: 'messages.upsert',
      instance: 'consultorio_dr_joao',
      data: {
        key: {
          remoteJid: '5511999998888@s.whatsapp.net',
          fromMe: true,
          id: 'MSG-EMISSAO-DATA'
        },
        message: {
          conversation: 'Vou enviar em instantes a sua NF no valor de R$ 350 da consulta de 25/09/2026'
        }
      }
    };

    const res = await processarMensagemWebhook(payload, segredo, criarDeps(repo));
    assert.strictEqual(res.ok, true);
    if (res.ok) {
      assert.strictEqual(res.acao, 'comando_emissao');
      assert.strictEqual(res.detalhe.solicitacaoId, repo.solicitacoes[0].id);
      assert.strictEqual(res.detalhe.fila, 'pronta');
      assert.strictEqual(res.detalhe.aguardandoData, false);
    }
    assert.strictEqual(repo.solicitacoes.length, 1);
    assert.strictEqual(repo.solicitacoes[0].fila, 'pronta');
    assert.ok(repo.solicitacoes[0].xdescServ.includes('NAS DATAS 25/09/2026'));
  });
});
