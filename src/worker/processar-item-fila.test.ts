import { describe, it } from 'node:test';
import assert from 'node:assert';
import { processarItemFila } from './processar-item-fila.js';
import type {
  FilaRepositorio,
  ItemFilaComTentativas,
  RegistrarSucessoEmissaoParams,
  ContextoEnvioNota
} from './fila-repositorio.js';
import type { EmissorDpsService, SolicitacaoEmissaoItem, ResultadoEmissaoDps } from './emissor-dps-service.js';
import type { EnviarPdfDanfse, EnviarPdfDanfseParams, ResultadoEnvioPdf } from '../whatsapp/enviar-pdf-danfse.js';
import type { NotificadorAlertas, NotificarMedicoParams, NotificarDesenvolvedorParams } from './notificar-erro-medico.js';

class FilaRepositorioMemoria implements FilaRepositorio {
  public sucessos: RegistrarSucessoEmissaoParams[] = [];
  public reagendados: any[] = [];
  public falhasDefinitivas: any[] = [];
  public contexto: ContextoEnvioNota = {
    instanciaNome: 'dr_joao',
    contatoTelefone: '5511999998888',
    telefoneMedico: '5511988887777',
    nomePaciente: 'Paciente Silva'
  };

  async buscarETravarProximoItem(): Promise<ItemFilaComTentativas | null> { return null; }
  async buscarContextoEnvio(): Promise<ContextoEnvioNota | null> { return this.contexto; }
  async registrarSucesso(params: RegistrarSucessoEmissaoParams): Promise<void> {
    this.sucessos.push(params);
  }
  async reagendarTentativa(params: any): Promise<void> {
    this.reagendados.push(params);
  }
  async marcarFalhaDefinitiva(params: any): Promise<void> {
    this.falhasDefinitivas.push(params);
  }
}

class EmissorDpsFake implements EmissorDpsService {
  public deveFalhar = false;
  public deveLancarExcecao = false;
  public erroMensagem = 'Falha de comunicação com a SEFIN';

  async emitir(item: SolicitacaoEmissaoItem): Promise<ResultadoEmissaoDps> {
    if (this.deveLancarExcecao) {
      throw new Error('Falha catastrófica inesperada');
    }
    if (this.deveFalhar) {
      return { sucesso: false, erro: this.erroMensagem };
    }
    return {
      sucesso: true,
      chaveAcesso: '35260912345678000199560010000000011234567890',
      ndps: 1,
      serie: '00001',
      competencia: '2026-09',
      dataEmissao: new Date(),
      valorServicosCentavos: item.valorServicoCentavos,
      xmlStoragePath: 'notas/xml/1.xml',
      pdfStoragePath: 'notas/pdf/1.pdf'
    };
  }
}

class EnviarPdfFake implements EnviarPdfDanfse {
  public envios: EnviarPdfDanfseParams[] = [];
  async enviarPdf(params: EnviarPdfDanfseParams): Promise<ResultadoEnvioPdf> {
    this.envios.push(params);
    return { sucesso: true };
  }
}

class NotificadorAlertasFake implements NotificadorAlertas {
  public avisosMedico: NotificarMedicoParams[] = [];
  public avisosDev: NotificarDesenvolvedorParams[] = [];

  async notificarMedicoWhatsApp(params: NotificarMedicoParams): Promise<void> {
    this.avisosMedico.push(params);
  }
  async notificarDesenvolvedorEmail(params: NotificarDesenvolvedorParams): Promise<void> {
    this.avisosDev.push(params);
  }
}

describe('processarItemFila', () => {
  const itemBase: ItemFilaComTentativas = {
    id: 'sol-1',
    medicoId: 'med-1',
    pacienteId: 'pac-1',
    xdescServ: 'REFERENTE A CONSULTAS...',
    valorServicoCentavos: 35000,
    ctribNac: '080201',
    tentativas: 0
  };

  it('deve emitir com sucesso, gravar nota e enviar PDF ao paciente', async () => {
    const repo = new FilaRepositorioMemoria();
    const emissor = new EmissorDpsFake();
    const pdf = new EnviarPdfFake();
    const notificador = new NotificadorAlertasFake();

    const res = await processarItemFila(itemBase, {
      filaRepositorio: repo,
      emissorDps: emissor,
      enviarPdfDanfse: pdf,
      notificadorAlertas: notificador
    });

    assert.strictEqual(res.ok, true);
    if (res.ok) {
      assert.strictEqual(res.status, 'emitida');
    }
    assert.strictEqual(repo.sucessos.length, 1);
    assert.strictEqual(pdf.envios.length, 1);
    assert.strictEqual(pdf.envios[0].contatoTelefone, '5511999998888');
    assert.strictEqual(notificador.avisosMedico.length, 0); // sem aviso de erro
  });

  it('deve reagendar com backoff na 1ª falha sem alertar médico ou paciente', async () => {
    const repo = new FilaRepositorioMemoria();
    const emissor = new EmissorDpsFake();
    emissor.deveFalhar = true;
    const pdf = new EnviarPdfFake();
    const notificador = new NotificadorAlertasFake();

    const res = await processarItemFila(itemBase, {
      filaRepositorio: repo,
      emissorDps: emissor,
      enviarPdfDanfse: pdf,
      notificadorAlertas: notificador
    });

    assert.strictEqual(res.ok, false);
    if (!res.ok) {
      assert.strictEqual(res.status, 'reagendada');
    }
    assert.strictEqual(repo.reagendados.length, 1);
    assert.strictEqual(repo.reagendados[0].tentativas, 1);
    assert.strictEqual(pdf.envios.length, 0);
    assert.strictEqual(notificador.avisosMedico.length, 0);
  });

  it('deve marcar falha definitiva e avisar médico pelo WhatsApp oficial na 3ª tentativa', async () => {
    const repo = new FilaRepositorioMemoria();
    const emissor = new EmissorDpsFake();
    emissor.deveFalhar = true;
    const pdf = new EnviarPdfFake();
    const notificador = new NotificadorAlertasFake();

    const itemUltimaTentativa: ItemFilaComTentativas = {
      ...itemBase,
      tentativas: 2 // próxima será a 3ª tentativa
    };

    const res = await processarItemFila(itemUltimaTentativa, {
      filaRepositorio: repo,
      emissorDps: emissor,
      enviarPdfDanfse: pdf,
      notificadorAlertas: notificador
    });

    assert.strictEqual(res.ok, false);
    if (!res.ok) {
      assert.strictEqual(res.status, 'erro_definitivo');
    }
    assert.strictEqual(repo.falhasDefinitivas.length, 1);
    assert.strictEqual(pdf.envios.length, 0); // nunca notifica o paciente do erro
    assert.strictEqual(notificador.avisosMedico.length, 1);
    assert.strictEqual(notificador.avisosMedico[0].telefoneMedico, '5511988887777');
  });

  it('deve alertar o desenvolvedor por e-mail em caso de erro inesperado / bug', async () => {
    const repo = new FilaRepositorioMemoria();
    const emissor = new EmissorDpsFake();
    emissor.deveLancarExcecao = true;
    const pdf = new EnviarPdfFake();
    const notificador = new NotificadorAlertasFake();

    const res = await processarItemFila(itemBase, {
      filaRepositorio: repo,
      emissorDps: emissor,
      enviarPdfDanfse: pdf,
      notificadorAlertas: notificador
    });

    assert.strictEqual(res.ok, false);
    assert.strictEqual(notificador.avisosDev.length, 1);
    assert.ok(notificador.avisosDev[0].assunto.includes('Alerta'));
  });
});
