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
  async salvarMensagem(params: any): Promise<void> {}
  async buscarMensagensRecentesConversa(): Promise<string[]> { return []; }
}


class EnviarMensagemPacienteFake implements EnviarMensagemPaciente {
  public envios: EnviarMensagemPacienteParams[] = [];
  public comunicacoes: any[] = [];
  public comunicador = { enviar: async (entrada: any) => {
    this.comunicacoes.push(entrada); return { sucesso: true, envioIniciado: true };
  } };

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
      comunicadorNoto: enviador.comunicador,
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
      comunicadorNoto: enviador.comunicador,
      instanciaNome: 'dr_roberto'
    });

    assert.strictEqual(res.ok, true);
    if (res.ok) {
      assert.strictEqual(res.fila, 'pendente_cadastro');
      assert.strictEqual(res.aguardandoCpf, true);
    }
    assert.strictEqual(enviador.comunicacoes.length, 1);
    assert.strictEqual(enviador.comunicacoes[0].evento, 'pedir_cpf');
    assert.ok(conversa.aguardandoCpfDesde !== null);
  });

  it('deve criar paciente mínimo e pedir CPF se o médico emite diretamente para contato novo', async () => {
    const repo = new AtendimentoRepositorioMemoria();
    const enviador = new EnviarMensagemPacienteFake();
    repo.medico = medicoPadrao;

    const conversaSemPaciente: ConversaRegistro = {
      id: 'conv-novo-contato',
      instanciaId: 'inst-1',
      medicoId: 'med-1',
      contatoTelefone: '5551988887777',
      pacienteId: null,
      aguardandoCpfDesde: null
    };
    repo.conversas.push(conversaSemPaciente);

    repo.consultas.push({
      id: 'ag-novo',
      dataHora: new Date(2026, 8, 25),
      valorConsultaCentavos: 20000
    });

    const res = await processarComandoEmissao(conversaSemPaciente, 20000, {
      repositorio: repo,
      enviarMensagemPaciente: enviador,
      comunicadorNoto: enviador.comunicador,
      instanciaNome: 'dr_roberto'
    });

    assert.strictEqual(res.ok, true);
    if (res.ok) {
      assert.strictEqual(res.fila, 'pendente_cadastro');
      assert.strictEqual(res.aguardandoCpf, true);
    }
    assert.strictEqual(repo.pacientes.length, 1);
    assert.strictEqual(repo.pacientes[0].telefone, '5551988887777');
    assert.strictEqual(conversaSemPaciente.pacienteId, repo.pacientes[0].id);
    assert.strictEqual(enviador.comunicacoes.length, 1);
    assert.strictEqual(enviador.comunicacoes[0].evento, 'pedir_cpf');
  });

  it('deve enviar pergunta ao médico via notomed_oficial quando não houver data agendada no banco', async () => {
    const repo = new AtendimentoRepositorioMemoria();
    const enviador = new EnviarMensagemPacienteFake();
    repo.medico = {
      ...medicoPadrao,
      telefone: '5551993527271'
    };

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

    // Nenhuma consulta em aberto (sem data agendada)
    repo.consultas = [];

    const res = await processarComandoEmissao(conversa, 35000, {
      repositorio: repo,
      enviarMensagemPaciente: enviador,
      comunicadorNoto: enviador.comunicador,
      instanciaNome: 'dr_roberto',
      instanciaOficialNome: 'notomed_oficial'
    });

    assert.strictEqual(res.ok, true);
    if (res.ok) {
      assert.strictEqual(res.fila, null);
      assert.strictEqual(res.aguardandoData, true);
    }
    assert.strictEqual(repo.solicitacoesCriadas.length, 1);
    assert.strictEqual(repo.solicitacoesCriadas[0].aguardandoDataConsulta, true);
    assert.strictEqual(repo.solicitacoesCriadas[0].fila, null);

    // Mensagem enviada ao médico pelo notomed_oficial
    assert.strictEqual(enviador.comunicacoes.length, 1);
    assert.strictEqual(enviador.comunicacoes[0].evento, 'pedir_data');
    assert.strictEqual(enviador.comunicacoes[0].solicitacaoId, 'sol-1');
    assert.strictEqual(enviador.envios.length, 0);
  });

  it('deve bloquear emissão e notificar o médico se o limite de notas for atingido', async () => {
    const repo = new AtendimentoRepositorioMemoria();
    const enviador = new EnviarMensagemPacienteFake();
    repo.medico = { ...medicoPadrao, telefone: '5551993527271' };

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

    const mockBillingRepo = {
      buscarUsoELimiteMedico: async () => ({
        planoNome: 'Gratuito',
        limiteNotasDia: 5,
        notasHoje: 5, // Limite atingido!
        notasMes: 15,
        travaEmissao: false,
        assinaturaStatus: 'trial'
      }),
      buscarContaPorMedico: async () => null,
      buscarAssinaturaPorStripeSub: async () => null,
      atualizarAssinaturaStripe: async () => {},
      registrarFatura: async () => {}
    };

    const res = await processarComandoEmissao(conversa, 20000, {
      repositorio: repo,
      enviarMensagemPaciente: enviador,
      comunicadorNoto: enviador.comunicador,
      billingRepositorio: mockBillingRepo,
      instanciaNome: 'dr_roberto',
      instanciaOficialNome: 'notomed_oficial'
    });

    assert.strictEqual(res.ok, false);
    if (!res.ok) {
      assert.strictEqual(res.motivo, 'limite_atingido');
    }
    // Nenhuma solicitação deve ser criada no banco
    assert.strictEqual(repo.solicitacoesCriadas.length, 0);
    // Notificação de bloqueio enviada ao médico
    assert.strictEqual(enviador.comunicacoes.length, 1);
    assert.equal(enviador.comunicacoes[0].evento, 'limite_emissao');
    assert.equal(enviador.comunicacoes[0].dados.nomePaciente, 'Carlos Souza');
    assert.equal(enviador.comunicacoes[0].dados.valorCentavos, 20000);
    assert.equal(enviador.comunicacoes[0].solicitacaoId, undefined);
    assert.match(enviador.comunicacoes[0].dados.motivo, /limite de 5 notas fiscais gratuitas de hoje/);
  });

  it('deve aceitar condição de data direto na mensagem de gatilho sem perguntar ao médico', async () => {
    const repo = new AtendimentoRepositorioMemoria();
    const enviador = new EnviarMensagemPacienteFake();
    repo.medico = { ...medicoPadrao, telefone: '5551993527271' };

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
    repo.consultas = []; // Nenhuma consulta agendada previamente no banco!

    const res = await processarComandoEmissao(conversa, 35000, {
      repositorio: repo,
      enviarMensagemPaciente: enviador,
      comunicadorNoto: enviador.comunicador,
      instanciaNome: 'dr_roberto',
      instanciaOficialNome: 'notomed_oficial',
      textoComando: 'Vou enviar em instantes a sua NF no valor de R$ 350 da consulta de 25/09/2026',
      agora: () => new Date(2026, 8, 30)
    });

    assert.strictEqual(res.ok, true);
    if (res.ok) {
      assert.strictEqual(res.fila, 'pronta');
      assert.strictEqual(res.aguardandoData, false);
      assert.strictEqual(res.aguardandoCpf, false);
    }
    // Deve criar a solicitação pronta e agendamento vinculado com a data do gatilho
    assert.strictEqual(repo.solicitacoesCriadas.length, 1);
    assert.strictEqual(repo.solicitacoesCriadas[0].fila, 'pronta');
    assert.strictEqual(repo.solicitacoesCriadas[0].aguardandoDataConsulta, false);
    assert.match(repo.solicitacoesCriadas[0].xdescServ, /NAS DATAS 25\/09\/2026/);
    assert.strictEqual(repo.consultas.length, 1);
    assert.strictEqual(repo.consultas[0].dataHora.getDate(), 25);

    // NÃO deve enviar mensagem ao médico perguntando a data
    assert.strictEqual(enviador.envios.length, 0);
  });

  it('deve aceitar condição de múltiplas datas no gatilho e incluir todas na descrição da nota', async () => {
    const repo = new AtendimentoRepositorioMemoria();
    const enviador = new EnviarMensagemPacienteFake();
    repo.medico = { ...medicoPadrao, telefone: '5551993527271' };

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
    repo.consultas = [];

    const res = await processarComandoEmissao(conversa, 70000, {
      repositorio: repo,
      enviarMensagemPaciente: enviador,
      comunicadorNoto: enviador.comunicador,
      instanciaNome: 'dr_roberto',
      instanciaOficialNome: 'notomed_oficial',
      textoComando: 'Vou enviar sua NF no valor de R$ 700 referente as consultas de 10/09 e 15/09',
      agora: () => new Date(2026, 8, 30)
    });

    assert.strictEqual(res.ok, true);
    if (res.ok) {
      assert.strictEqual(res.fila, 'pronta');
      assert.strictEqual(res.aguardandoData, false);
    }
    assert.strictEqual(repo.consultas.length, 2);
    assert.match(repo.solicitacoesCriadas[0].xdescServ, /NAS DATAS 10\/09\/2026, 15\/09\/2026/);
    assert.strictEqual(enviador.envios.length, 0);
  });
});


it('guarda a solicitação sem fila e pede dados profissionais ao médico, sem usar o contato do paciente', async () => {
  for (const nome of [null, 'Médico 9886', 'Maria']) {
    const repo = new AtendimentoRepositorioMemoria();
    repo.medico = { id: 'med-1', nomeCompleto: nome, crm: null, rqe: null, especialidade: null, ctribNacPadrao: '080201', telefone: '5548999998888' } as any;
    repo.pacientes.push({ id: 'pac-1', medicoId: 'med-1', telefone: '5511999990000', nome: 'Paciente Silva', cpfHash: 'hash' });
    repo.consultas.push({ id: 'ag-1', dataHora: new Date(2026,9,7), valorConsultaCentavos: 15000 });
    const pedidos: string[] = [];
    const resultado = await processarComandoEmissao({ id: 'conversa', instanciaId: 'inst', medicoId: 'med-1', pacienteId: 'pac-1', contatoTelefone: '5511999990000', aguardandoCpfDesde: null }, 15000, {
      repositorio: repo, enviarMensagemPaciente: new EnviarMensagemPacienteFake(), instanciaNome: 'medico_inst',
      dadosProfissionais: { solicitar: async (id: string) => { pedidos.push(id); }, retomar: async () => 0 }
    } as any);
    assert.equal(resultado.ok, true);
    assert.equal(repo.solicitacoesCriadas[0].fila, null);
    assert.equal(repo.solicitacoesCriadas[0].aguardandoDadosProfissionais, true);
    assert.equal(repo.solicitacoesCriadas[0].datasConsultaTexto, '07/10/2026');
    assert.deepEqual(pedidos, ['med-1']);
  }
});

it('solicita data e CPF exclusivamente pela porta com contexto da solicitação criada', async () => {
  const repo = new AtendimentoRepositorioMemoria(); const env = new EnviarMensagemPacienteFake();
  repo.medico = { id:'med-1',nomeCompleto:'Maria Silva',crm:'123/SC',rqe:null,especialidade:null,ctribNacPadrao:'041601' };
  repo.pacientes.push({id:'pac-1',medicoId:'med-1',telefone:'5511999998888',nome:'Carlos Souza',cpfHash:null});
  const entradas:any[]=[];
  const res=await processarComandoEmissao({id:'conv',instanciaId:'inst',medicoId:'med-1',pacienteId:'pac-1',contatoTelefone:'5511999998888',aguardandoCpfDesde:null},35000,{
    repositorio:repo,enviarMensagemPaciente:env,instanciaNome:'medico-inst',
    comunicadorNoto:{enviar:async (p:any)=>{entradas.push(p);return{sucesso:true,envioIniciado:true};}}
  } as any);
  assert.equal(res.ok,true); assert.equal(env.envios.length,0);
  assert.deepEqual(entradas.map(p=>p.evento),['pedir_data','pedir_cpf']);
  assert.ok(entradas.every(p=>p.solicitacaoId==='sol-1'&&p.medicoId==='med-1'&&p.chave.includes('sol-1')));
  assert.equal(entradas[1].pacienteId,'pac-1');assert.equal(entradas[1].instanciaPaciente,'medico-inst');
});

it('falha na geração mantém solicitação aguardando CPF/data e não usa texto fixo', async () => {
  for(const comunicadorNoto of [undefined,{enviar:async()=>{throw Error('segredo');}}]) {
    const repo=new AtendimentoRepositorioMemoria();const env=new EnviarMensagemPacienteFake();
    repo.medico={id:'med-1',nomeCompleto:'Maria Silva',crm:'123/SC',rqe:null,especialidade:null,ctribNacPadrao:'041601'};
    repo.pacientes.push({id:'pac-1',medicoId:'med-1',telefone:'5511999998888',nome:'Carlos Souza',cpfHash:null});
    const c={id:'conv',instanciaId:'inst',medicoId:'med-1',pacienteId:'pac-1',contatoTelefone:'5511999998888',aguardandoCpfDesde:null};repo.conversas.push(c);
    const r=await processarComandoEmissao(c,35000,{repositorio:repo,enviarMensagemPaciente:env,instanciaNome:'inst',comunicadorNoto} as any);
    assert.equal(r.ok,true);if(r.ok){assert.equal(r.fila,null);assert.equal(r.aguardandoCpf,true);assert.equal(r.aguardandoData,true);}
    assert.equal(env.envios.length,0);assert.ok(c.aguardandoCpfDesde);
  }
});

it('limite atingido continua bloqueando criação quando a IA falha', async () => {
  const repo=new AtendimentoRepositorioMemoria(); const env=new EnviarMensagemPacienteFake();
  repo.medico={id:'med-1',nomeCompleto:'Maria Silva',crm:'123/SC',rqe:null,especialidade:null,ctribNacPadrao:'041601'};
  repo.pacientes.push({id:'pac-1',medicoId:'med-1',telefone:'5511999998888',nome:'Carlos Souza',cpfHash:'hash'});
  const resultado=await processarComandoEmissao({id:'conv',instanciaId:'inst',medicoId:'med-1',pacienteId:'pac-1',contatoTelefone:'5511999998888',aguardandoCpfDesde:null},35000,{
    repositorio:repo,enviarMensagemPaciente:env,instanciaNome:'inst',
    billingRepositorio:{buscarUsoELimiteMedico:async()=>({planoNome:'Gratuito',limiteNotasDia:5,notasHoje:5,notasMes:15,travaEmissao:false,assinaturaStatus:'trial'})} as any,
    comunicadorNoto:{enviar:async()=>{throw Error('secret');}}
  });
  assert.equal(resultado.ok,false);if(!resultado.ok)assert.equal(resultado.motivo,'limite_atingido');
  assert.equal(repo.solicitacoesCriadas.length,0);assert.equal(env.envios.length,0);
});
