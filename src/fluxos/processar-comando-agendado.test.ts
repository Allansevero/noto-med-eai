import { describe, it } from 'node:test';
import assert from 'node:assert';
import { processarComandoAgendado } from './processar-comando-agendado.js';
import type {
  AtendimentoRepositorio,
  ConversaRegistro,
  PacienteRegistro,
  InstanciaRegistro,
  ConsultaEmAbertoRegistro,
  MedicoDadosRegistro
} from '../atendimento/atendimento-repositorio.js';
import type { RespostaRapidaModelo } from '../whatsapp/casar-resposta-rapida.js';

class AtendimentoRepositorioMemoria implements AtendimentoRepositorio {
  public conversas: ConversaRegistro[] = [];
  public pacientes: PacienteRegistro[] = [];
  public agendamentosCriados: Array<{
    medicoId: string;
    pacienteId: string;
    conversaId: string;
    dataHora: Date;
    valorConsultaCentavos?: number | null;
  }> = [];

  async buscarInstanciaPorNome(): Promise<InstanciaRegistro | null> { return null; }
  async buscarOuCriarConversa(): Promise<ConversaRegistro> { throw new Error('Not implemented'); }
  async buscarRespostasRapidasMedico(): Promise<RespostaRapidaModelo[]> { return []; }
  async buscarPacientePorId(): Promise<PacienteRegistro | null> { return null; }
  async buscarPacientePorTelefone(medicoId: string, telefone: string): Promise<PacienteRegistro | null> {
    return this.pacientes.find((p) => p.medicoId === medicoId && p.telefone === telefone) ?? null;
  }
  async criarPacienteMinimo(params: { medicoId: string; telefone: string; email?: string | null; cpfHash?: string | null }): Promise<PacienteRegistro> {
    const pac: PacienteRegistro = {
      id: `pac-${this.pacientes.length + 1}`,
      medicoId: params.medicoId,
      telefone: params.telefone,
      nome: null,
      email: params.email,
      cpfHash: params.cpfHash ?? null
    };
    this.pacientes.push(pac);
    return pac;
  }
  async atualizarCpfPaciente(): Promise<void> {}
  async vincularPacienteConversa(conversaId: string, pacienteId: string): Promise<void> {
    const conv = this.conversas.find((c) => c.id === conversaId);
    if (conv) conv.pacienteId = pacienteId;
  }
  async marcarAguardandoCpf(): Promise<void> {}
  async criarAgendamento(params: {
    medicoId: string;
    pacienteId: string;
    conversaId: string;
    dataHora: Date;
    valorConsultaCentavos?: number | null;
  }): Promise<{ id: string }> {
    this.agendamentosCriados.push(params);
    return { id: `ag-${this.agendamentosCriados.length}` };
  }
  async buscarConsultasEmAberto(): Promise<ConsultaEmAbertoRegistro[]> { return []; }
  async buscarDadosMedico(): Promise<MedicoDadosRegistro | null> { return null; }
  async criarSolicitacaoNota(): Promise<{ id: string }> { return { id: 'sol-1' }; }
  async liberarSolicitacoesPendentesCpf(): Promise<number> { return 0; }
}

describe('processarComandoAgendado', () => {
  const pepper = 'pepper-teste-123';

  it('deve criar paciente mínimo e agendamento quando o paciente ainda não existe', async () => {
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
      'Olá, quero agendar para dia 25/10/2026 às 15:00',
      'O valor é R$ 400,00',
      'Consulta agendada!'
    ];

    const res = await processarComandoAgendado(conversa, mensagens, {
      repositorio: repo,
      pepper
    });

    assert.strictEqual(res.ok, true);
    assert.strictEqual(repo.pacientes.length, 1);
    assert.strictEqual(repo.pacientes[0].telefone, '5511999998888');
    assert.strictEqual(conversa.pacienteId, repo.pacientes[0].id);
    assert.strictEqual(repo.agendamentosCriados.length, 1);
    assert.strictEqual(repo.agendamentosCriados[0].valorConsultaCentavos, 40000);
  });
});
