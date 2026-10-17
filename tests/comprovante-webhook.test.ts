import { describe, expect, it } from 'vitest';
import { processarMensagemWebhook } from '../src/fluxos/processar-mensagem-webhook.js';
import type { AtendimentoRepositorio } from '../src/atendimento/atendimento-repositorio.js';

function persistenciaWhatsapp() {
  const mensagens: unknown[] = [];
  const pacientes: unknown[] = [];
  const conversa = { id: 'conversa-1', instanciaId: 'instancia-1', medicoId: 'medico-1', contatoTelefone: '5511999990000', pacienteId: null as string | null, aguardandoCpfDesde: null };
  const repositorio = {
    async buscarInstanciaPorNome(nomeInstancia: string) { return { id: 'instancia-1', medicoId: 'medico-1', nomeInstancia, oficial: false }; },
    async buscarMedicoPorTelefone() { return null; },
    async buscarOuCriarConversa() { return conversa; },
    async criarPacienteMinimo(params: unknown) { pacientes.push(params); return { id: 'paciente-1' }; },
    async vincularPacienteConversa(_conversa: string, pacienteId: string) { conversa.pacienteId = pacienteId; },
    async salvarMensagem(params: unknown) { mensagens.push(params); },
    async criarSolicitacaoNota() { throw new Error('Webhook não deve emitir na base atual'); }
  };
  return { mensagens, pacientes, deps: { repositorio: repositorio as unknown as AtendimentoRepositorio,
    segredoConfigurado: 'segredo-ficticio', pepper: 'pepper-ficticio', instanciaAssistenteNome: 'assistente' } };
}

function evento(message: Record<string, unknown>, fromMe = false, instance = 'clinica-1') {
  return { event: 'messages.upsert', instance, data: { key: { remoteJid: '5511999990000@s.whatsapp.net', fromMe, id: 'mensagem-ficticia' },
    messageTimestamp: 1791892800, pushName: 'Nome não comprovado do WhatsApp', message } };
}

describe('comprovante e dúvida — limite real do webhook atual', () => {
  it.each([
    ['imagem', { imageMessage: { mimetype: 'image/jpeg', url: 'https://midia.invalid/pix.jpg', caption: 'PIX realizado R$ 350,25' } }, 'PIX realizado R$ 350,25'],
    ['imagem', { imageMessage: { mimetype: 'image/jpeg', url: 'https://midia.invalid/agendado.jpg', caption: 'Pagamento agendado' } }, 'Pagamento agendado'],
    ['documento', { documentMessage: { mimetype: 'application/pdf', fileName: 'comprovante.pdf', url: 'https://midia.invalid/pix.pdf' } }, '']
  ])('registra %s sem verificar pagamento, destinatário ou abrir dúvida', async (tipoMensagem, message, conteudo) => {
    const banco = persistenciaWhatsapp();
    const payload = evento(message);
    expect(await processarMensagemWebhook(payload, 'segredo-ficticio', banco.deps)).toEqual({ ok: true, acao: 'mensagem_registrada' });
    expect(banco.mensagens).toEqual([{ conversaId: 'conversa-1', direcao: 'recebida', tipoMensagem, conteudo, payloadBruto: payload.data }]);
    expect(banco.pacientes).toEqual([{ medicoId: 'medico-1', telefone: '5511999990000', nome: null, origemCadastro: 'conversa_whatsapp' }]);
  });

  it('resposta do médico é texto salvo; repetição não vira decisão reutilizável', async () => {
    const banco = persistenciaWhatsapp();
    const payload = evento({ conversation: 'Sim, pode emitir; é pacote de duas consultas.' }, true);
    expect(await processarMensagemWebhook(payload, 'segredo-ficticio', banco.deps)).toEqual({ ok: true, acao: 'mensagem_registrada' });
    expect(await processarMensagemWebhook(payload, 'segredo-ficticio', banco.deps)).toEqual({ ok: true, acao: 'mensagem_registrada' });
    expect(banco.mensagens).toEqual(Array.from({ length: 2 }, () => ({ conversaId: 'conversa-1', direcao: 'enviada', tipoMensagem: 'texto',
      conteudo: 'Sim, pode emitir; é pacote de duas consultas.', payloadBruto: payload.data })));
  });

  it.each(['Pode emitir', 'Não emitir', 'É um pacote'])('canal assistente descarta resposta "%s"', async conversation => {
    const banco = persistenciaWhatsapp();
    expect(await processarMensagemWebhook(evento({ conversation }, false, 'assistente'), 'segredo-ficticio', banco.deps))
      .toEqual({ ok: true, acao: 'descartada', motivoDescarte: 'gatilho_nao_reconhecido' });
    expect(banco.mensagens).toEqual([]); expect(banco.pacientes).toEqual([]);
  });

  it('segredo inválido impede qualquer persistência', async () => {
    const banco = persistenciaWhatsapp();
    expect(await processarMensagemWebhook(evento({ conversation: 'Olá' }), 'errado', banco.deps)).toEqual({ ok: false, motivo: 'autenticacao_invalida' });
    expect(banco.mensagens).toEqual([]); expect(banco.pacientes).toEqual([]);
  });

  it('canal oficial permanece exclusivo do OTP', async () => {
    const banco = persistenciaWhatsapp();
    expect(await processarMensagemWebhook(evento({ conversation: 'Pode emitir' }, false, 'notomed_oficial'), 'segredo-ficticio', banco.deps))
      .toEqual({ ok: true, acao: 'descartada', motivoDescarte: 'canal_oficial_somente_otp' });
    expect(banco.mensagens).toEqual([]);
  });
});
