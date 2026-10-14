/**
 * Testes para o processamento de lotes de histórico entregues pela Evolution API.
 * Verifica o agrupamento por telefone, sincronização de CPF e persistência em lote.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { processarHistoricoWebhook } from './processar-historico-webhook.js';
import type {
  AtendimentoRepositorio,
  ConversaRegistro,
  PacienteRegistro,
  InstanciaRegistro,
  ConsultaEmAbertoRegistro,
  MedicoDadosRegistro
} from '../atendimento/atendimento-repositorio.js';

class AtendimentoRepositorioLoteMemoria implements AtendimentoRepositorio {
  public conversas: ConversaRegistro[] = [];
  public pacientes: PacienteRegistro[] = [];
  public mensagensSalvas: any[] = [];
  public chamadasSalvarEmLote: number = 0;

  async buscarInstanciaPorNome(nome: string): Promise<InstanciaRegistro | null> {
    return {
      id: 'inst-1',
      medicoId: 'med-1',
      nomeInstancia: nome,
      oficial: false
    };
  }

  async buscarOuCriarConversa(instanciaId: string, medicoId: string | null, contatoTelefone: string, contatoNome?: string | null): Promise<ConversaRegistro> {
    let c = this.conversas.find(conv => conv.contatoTelefone === contatoTelefone);
    if (!c) {
      c = {
        id: `conv-${this.conversas.length + 1}`,
        instanciaId,
        medicoId,
        contatoTelefone,
        contatoNome,
        pacienteId: null,
        aguardandoCpfDesde: null
      };
      this.conversas.push(c);
    }
    return c;
  }

  async buscarPacientePorId(id: string): Promise<PacienteRegistro | null> {
    return this.pacientes.find(p => p.id === id) ?? null;
  }

  async buscarPacientePorTelefone(medicoId: string, telefone: string): Promise<PacienteRegistro | null> {
    return this.pacientes.find(p => p.medicoId === medicoId && p.telefone === telefone) ?? null;
  }

  async criarPacienteMinimo(params: any): Promise<PacienteRegistro> {
    const p: PacienteRegistro = {
      id: `pac-${this.pacientes.length + 1}`,
      medicoId: params.medicoId,
      telefone: params.telefone,
      nome: params.nome ?? null,
      cpfHash: params.cpfHash ?? null
    };
    this.pacientes.push(p);
    return p;
  }

  async atualizarCpfPaciente(params: any): Promise<void> {
    const p = this.pacientes.find(pac => pac.id === params.pacienteId);
    if (p) {
      p.cpfHash = params.cpfHash;
      if (params.nome) p.nome = params.nome;
    }
  }

  async vincularPacienteConversa(conversaId: string, pacienteId: string): Promise<void> {
    const c = this.conversas.find(conv => conv.id === conversaId);
    if (c) c.pacienteId = pacienteId;
  }

  async salvarMensagensEmLote(mensagens: any[]): Promise<void> {
    this.chamadasSalvarEmLote += 1;
    this.mensagensSalvas.push(...mensagens);
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

describe('processarHistoricoWebhook', () => {
  const pepper = 'pepper-lote-teste';

  it('deve usar salvarMensagensEmLote para persistir mensagens do histórico com alta performance', async () => {
    const repo = new AtendimentoRepositorioLoteMemoria();

    const payload = {
      event: 'messages.set',
      instance: 'inst_dr_teste',
      data: {
        messages: [
          {
            key: { remoteJid: '5511999998888@s.whatsapp.net', fromMe: false, id: 'MSG-1' },
            message: { conversation: 'Olá doutor, boa tarde!' },
            messageTimestamp: 1700000000
          },
          {
            key: { remoteJid: '5511999998888@s.whatsapp.net', fromMe: true, id: 'MSG-2' },
            message: { conversation: 'Boa tarde, como posso ajudar?' },
            messageTimestamp: 1700000010
          },
          {
            key: { remoteJid: '5511988887777@s.whatsapp.net', fromMe: false, id: 'MSG-3' },
            message: { conversation: 'Meu CPF é 529.982.247-25' },
            messageTimestamp: 1700000020
          }
        ]
      }
    };

    const res = await processarHistoricoWebhook(payload, {
      repositorio: repo,
      pepper
    });

    assert.strictEqual(res.ok, true);
    if (res.ok) {
      assert.strictEqual(res.acao, 'historico_sincronizado');
      assert.strictEqual(res.mensagensAnalisadas, 3);
      assert.strictEqual(res.conversasAnalisadas, 2);
    }

    // Deve ter chamado salvarMensagensEmLote 2 vezes (uma para cada conversa) em vez de 3 inserts individuais
    assert.strictEqual(repo.chamadasSalvarEmLote, 2);
    assert.strictEqual(repo.mensagensSalvas.length, 3);
    assert.strictEqual(repo.conversas.length, 2);
    assert.strictEqual(repo.pacientes.length, 2);
  });
});
