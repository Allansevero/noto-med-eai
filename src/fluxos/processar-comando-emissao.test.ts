import { describe, it } from 'node:test';
import assert from 'node:assert';
import { processarComandoEmissao } from './processar-comando-emissao.js';
import { MENSAGEM_PEDIDO_CPF } from '../whatsapp/whatsapp-config.js';
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
  public conversas: ConversaRegistro[] = [];
  public pacientes: PacienteRegistro[] = [];
  public consultas: ConsultaEmAbertoRegistro[] = [];
  public medico: MedicoDadosRegistro | null = null;
  public solicitacoesCriadas: any[] = [];

  async buscarInstanciaPorNome(): Promise<InstanciaRegistro | null> { return null; }
  async buscarOuCriarConversa(): Promise<ConversaRegistro> { throw new Error('Not implemented'); }
  async buscarRespostasRapidasMedico(): Promise<RespostaRapidaModelo[]> { return []; }
  async buscarPacientePorId(id: string): Promise<PacienteRegistro | null> {
    return this.pacientes.find((p) => p.id === id) ?? null;
  }
  async buscarPacientePorTelefone(): Promise<PacienteRegistro | null> { return null; }
  async criarPacienteMinimo(): Promise<PacienteRegistro> { throw new Error('Not implemented'); }
  async atualizarCpfPaciente(): Promise<void> {}
  async vincularPacienteConversa(): Promise<void> {}
  async marcarAguardandoCpf(conversaId: string, aguardandoDesde: Date | null): Promise<void> {
    const conv = this.conversas.find((c) => c.id === conversaId);
    if (conv) conv.aguardandoCpfDesde = aguardandoDesde;
  }
  async criarAgendamento(): Promise<{ id: string }> { return { id: 'ag-1' }; }
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
  async liberarSolicitacoesPendentesCpf(): Promise<number> { return 0; }
}

class EnviarMensagemPacienteFake implements EnviarMensagemPaciente {
  public envios: EnviarMensagemPacienteParams[] = [];

  async enviarTexto(params: EnviarMensagemPacienteParams): Promise<ResultadoEnvioMensagemPaciente> {
    this.envios.push(params);
    return { sucesso: true, mensagemId: `msg-${this.envios.length}` };
  }
}

describe('processarComandoEmissao', () => {
  const medicoPadrao: MedicoDadosRegistro = {
    id: 'med-1',
    nomeCompleto: 'Dr. Roberto Alves',
    especialidade: 'Pediatria',
    crm: '9988/SP',
    rqe: null,
    ctribNacPadrao: '080201'
  };

  it('deve gerar solicitação com fila pronta quando o paciente já possui CPF', async () => {
    const repo = new AtendimentoRepositorioMemoria();
    const enviador = new EnviarMensagemPacienteFake();
    repo.medico = medicoPadrao;

    const paciente: PacienteRegistro = {
      id: 'pac-1',
      medicoId: 'med-1',
      telefone: '5511999998888',
      nome: 'Carlos Souza',
      cpfHash: 'hash-existente'
    };
    repo.pacientes.push(paciente);

    const conversa: ConversaRegistro = {
      id: 'conv-1',
      instanciaId: 'inst-1',
      medicoId: 'med-1',
      contatoTelefone: '5511999998888',
      pacienteId: 'pac-1',
      aguardandoCpfDesde: null
    };
    repo.conversas.push(conversa);

    repo.consultas.push({
      id: 'ag-1',
      dataHora: new Date(2026, 8, 20),
      valorConsultaCentavos: 35000
    });

    const res = await processarComandoEmissao(conversa, null, {
      repositorio: repo,
      enviarMensagemPaciente: enviador,
      instanciaNome: 'dr_roberto'
    });

    assert.strictEqual(res.ok, true);
    if (res.ok) {
      assert.strictEqual(res.fila, 'pronta');
      assert.strictEqual(res.aguardandoCpf, false);
    }
    assert.strictEqual(repo.solicitacoesCriadas.length, 1);
    assert.strictEqual(repo.solicitacoesCriadas[0].valorServicoCentavos, 35000);
    assert.strictEqual(enviador.envios.length, 0); // nenhuma mensagem enviada ao paciente
  });

  it('deve gerar solicitação pendente_cadastro e pedir reenvio de CPF se o paciente não tem CPF salvo', async () => {
    const repo = new AtendimentoRepositorioMemoria();
    const enviador = new EnviarMensagemPacienteFake();
    repo.medico = medicoPadrao;

    const pacienteSemCpf: PacienteRegistro = {
      id: 'pac-sem-cpf',
      medicoId: 'med-1',
      telefone: '5511999998888',
      nome: null,
      cpfHash: null
    };
    repo.pacientes.push(pacienteSemCpf);

    const conversa: ConversaRegistro = {
      id: 'conv-1',
      instanciaId: 'inst-1',
      medicoId: 'med-1',
      contatoTelefone: '5511999998888',
      pacienteId: 'pac-sem-cpf',
      aguardandoCpfDesde: null
    };
    repo.conversas.push(conversa);

    repo.consultas.push({
      id: 'ag-2',
      dataHora: new Date(2026, 8, 22),
      valorConsultaCentavos: 40000
    });

    const res = await processarComandoEmissao(conversa, 40000, {
      repositorio: repo,
      enviarMensagemPaciente: enviador,
      instanciaNome: 'dr_roberto'
    });

    assert.strictEqual(res.ok, true);
    if (res.ok) {
      assert.strictEqual(res.fila, 'pendente_cadastro');
      assert.strictEqual(res.aguardandoCpf, true);
    }
    assert.strictEqual(enviador.envios.length, 1);
    assert.strictEqual(enviador.envios[0].texto, MENSAGEM_PEDIDO_CPF);
    assert.ok(conversa.aguardandoCpfDesde !== null);
  });
});
