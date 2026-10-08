/**
 * Caso de uso: Processamento do comando rápido /emissao disparado pelo médico.
 * Consolida consultas em aberto, calcula o valor dos serviços, monta xdesc_serv legal
 * e gerencia a fila ('pronta' vs 'pendente_cadastro' com reenvio de CPF, seção 3.2).
 */

import { calcularValorEmissao } from '../emissao/calcular-valor-emissao.js';
import type { DadosProfissionaisService } from '../conta/dados-profissionais-service.js';
import { dadosProfissionaisCompletos } from '../conta/validar-dados-emissao.js';
import { formatarDatasConsultas, montarDescricaoServico } from '../emissao/montar-descricao-servico.js';
import type { ComunicadorNoto, EntradaComunicacaoNoto } from '../conversa/comunicador-noto.js';
import type { AtendimentoRepositorio, ConversaRegistro } from '../atendimento/atendimento-repositorio.js';
import type { EnviarMensagemPaciente } from '../whatsapp/enviar-mensagem-paciente.js';
import type { BillingRepositorio } from '../billing/billing-repositorio.js';
import { verificarLimiteEmissao } from '../billing/verificar-limite-emissao.js';
import type { ExtratorIaService } from '../ia/extrator-ia-service.js';
import type { ConsultaCpfProvider } from '../paciente/consulta-cpf-provider.js';
import { extrairDadosAgendamentoComIa } from '../agendamento/extrair-dados-agendamento-ia.js';
import { gerarHashCpf } from '../paciente/hash-cpf.js';

import { extrairCpfTexto } from '../paciente/extrair-cpf-texto.js';
import { ehNomeCivilValido } from '../paciente/regras/validar-nome-civil.js';
import { extrairDatasConsulta } from '../emissao/regras/extrair-datas-consulta.js';

export interface ProcessarEmissaoDeps {
  repositorio: AtendimentoRepositorio;
  comunicadorNoto?: ComunicadorNoto;
  dadosProfissionais?: DadosProfissionaisService;
  enviarMensagemPaciente: EnviarMensagemPaciente;
  billingRepositorio?: BillingRepositorio;
  consultaCpfProvider?: ConsultaCpfProvider;
  iaService?: ExtratorIaService;
  pepper?: string;
  instanciaNome: string;
  instanciaOficialNome?: string;
  agora?: () => Date;
  textoComando?: string | null;
  mensagemIdComando?: string;
  datasComando?: Date[];
}

export type ResultadoProcessarEmissao =
  | {
      ok: true;
      solicitacaoId: string;
      fila: 'pronta' | 'pendente_cadastro' | null;
      aguardandoCpf: boolean;
      aguardandoData: boolean;
      aguardandoDadosProfissionais?: boolean;
    }
  | {
      ok: false;
      motivo:
        | 'paciente_ausente'
        | 'valor_indisponivel'
        | 'medico_nao_encontrado'
        | 'limite_atingido';
      detalhe?: string;
    };

export async function processarComandoEmissao(
  conversa: ConversaRegistro,
  valorDigitadoCentavos: number | null,
  deps: ProcessarEmissaoDeps
): Promise<ResultadoProcessarEmissao> {
  if (!conversa.medicoId) {
    return { ok: false, motivo: 'medico_nao_encontrado' };
  }
  const medicoId = conversa.medicoId;

  let pacienteId = conversa.pacienteId;
  let pacienteNovo = false;

  if (!pacienteId) {
    const existente = await deps.repositorio.buscarPacientePorTelefone(
      medicoId,
      conversa.contatoTelefone
    );
    if (existente) {
      pacienteId = existente.id;
    } else {
      const novo = await deps.repositorio.criarPacienteMinimo({
        medicoId,
        telefone: conversa.contatoTelefone,
        nome: null,
        origemCadastro: 'conversa'
      });
      pacienteId = novo.id;
      pacienteNovo = true;
    }
    await deps.repositorio.vincularPacienteConversa(conversa.id, pacienteId);
    conversa.pacienteId = pacienteId;
  }

  let paciente = await deps.repositorio.buscarPacientePorId(pacienteId);
  let consultas = await deps.repositorio.buscarConsultasEmAberto(medicoId, pacienteId);

  // 1. Processa condição de datas informada diretamente na mensagem do gatilho
  const agoraRef = deps.agora ? deps.agora() : new Date();
  const datasDoGatilho: Date[] = deps.datasComando && deps.datasComando.length > 0
    ? deps.datasComando
    : (deps.textoComando ? extrairDatasConsulta(deps.textoComando, agoraRef).datas : []);

  if (datasDoGatilho.length > 0) {
    const consultasVinculadas: typeof consultas = [];
    const valorPorConsulta = valorDigitadoCentavos
      ? Math.round(valorDigitadoCentavos / datasDoGatilho.length)
      : null;

    for (const dataGatilho of datasDoGatilho) {
      const existente = consultas.find((c) => {
        const d = new Date(c.dataHora);
        return (
          d.getDate() === dataGatilho.getDate() &&
          d.getMonth() === dataGatilho.getMonth() &&
          d.getFullYear() === dataGatilho.getFullYear()
        );
      });

      if (existente) {
        consultasVinculadas.push(existente);
      } else {
        const novo = await deps.repositorio.criarAgendamento({
          medicoId,
          pacienteId,
          conversaId: conversa.id,
          dataHora: dataGatilho,
          valorConsultaCentavos: valorPorConsulta
        });
        consultasVinculadas.push({
          id: novo.id,
          dataHora: dataGatilho,
          valorConsultaCentavos: valorPorConsulta
        });
      }
    }

    consultas = consultasVinculadas;
  }

  let calculo = calcularValorEmissao(valorDigitadoCentavos, consultas.map((c) => c.valorConsultaCentavos));

  let possuiCpf = Boolean(paciente?.cpfHash);
  let semDataConsulta = consultas.length === 0;
  let semValor = !calculo.ok || !calculo.valorCentavos;

  // Busca na conversa somente quando não tem paciente cadastrado naquele número ou quando faltam dados
  const precisaBuscarDados = pacienteNovo || !possuiCpf || semDataConsulta || semValor;

  if (precisaBuscarDados && deps.iaService && deps.repositorio.buscarMensagensRecentesConversa) {
    const mensagens = await deps.repositorio.buscarMensagensRecentesConversa(conversa.id, 20);
    if (mensagens && mensagens.length > 0) {
      const dadosExtraidos = await extrairDadosAgendamentoComIa(mensagens, {
        iaService: deps.iaService,
        agora: deps.agora ? deps.agora() : new Date()
      });

      // 1. CPF encontrado no histórico
      if (!possuiCpf && dadosExtraidos.cpfPaciente) {
        const cpfLimpo = extrairCpfTexto(dadosExtraidos.cpfPaciente);
        if (cpfLimpo) {
          const pepper = deps.pepper || 'pepper_padrao';
          const cpfHash = gerarHashCpf(cpfLimpo, pepper);

          let nomeFinal: string | null = null;
          let dataNascFinal: Date | null = null;
          let nomeValidado = false;

          if (deps.repositorio.buscarPacientePorCpfHash) {
            const existente = await deps.repositorio.buscarPacientePorCpfHash(medicoId, cpfHash);
            if (existente?.nomeValidado && ehNomeCivilValido(existente.nome)) {
              nomeFinal = existente.nome;
              dataNascFinal = existente.dataNascimento ?? null;
              nomeValidado = true;
            }
          }

          if (!nomeValidado && deps.consultaCpfProvider) {
            try {
              const dadosConsulta = await deps.consultaCpfProvider.consultar(cpfLimpo);
              if (dadosConsulta?.nome && ehNomeCivilValido(dadosConsulta.nome)) {
                nomeFinal = dadosConsulta.nome;
                dataNascFinal = dadosConsulta.dataNascimento ?? null;
              }
            } catch (err: any) {
              console.warn('[processarComandoEmissao] Falha ao consultar provedor de CPF:', err?.message || err);
            }
          }

          await deps.repositorio.atualizarCpfPaciente({
            pacienteId,
            cpfHash,
            cpf: cpfLimpo,
            nome: nomeFinal,
            dataNascimento: dataNascFinal,
            nomeValidado
          });
          possuiCpf = true;
          paciente = await deps.repositorio.buscarPacientePorId(pacienteId);
        }
      }

      // 2. Data da consulta encontrada no histórico
      if (semDataConsulta && dadosExtraidos.dataHora) {
        const novoAgendamento = await deps.repositorio.criarAgendamento({
          medicoId,
          pacienteId,
          conversaId: conversa.id,
          dataHora: dadosExtraidos.dataHora,
          valorConsultaCentavos: calculo.valorCentavos ?? dadosExtraidos.valorConsultaCentavos ?? null
        });
        consultas = [{
          id: novoAgendamento.id,
          dataHora: dadosExtraidos.dataHora,
          valorConsultaCentavos: calculo.valorCentavos ?? dadosExtraidos.valorConsultaCentavos ?? null
        }];
        semDataConsulta = false;
      }

      // 3. Valor da consulta encontrado no histórico
      if (semValor && dadosExtraidos.valorConsultaCentavos) {
        calculo = calcularValorEmissao(valorDigitadoCentavos, [dadosExtraidos.valorConsultaCentavos]);
        semValor = !calculo.ok || !calculo.valorCentavos;
      }
    }
  }

  if (semValor || !calculo.valorCentavos) {
    return { ok: false, motivo: 'valor_indisponivel' };
  }

  const medico = await deps.repositorio.buscarDadosMedico(medicoId);
  if (!medico) return { ok: false, motivo: 'medico_nao_encontrado' };

  if (deps.billingRepositorio) {
    const uso = await deps.billingRepositorio.buscarUsoELimiteMedico(medicoId);
    const verificacao = verificarLimiteEmissao(uso);
    if (!verificacao.permitido) {
      await comunicar(deps, {
        medicoId, chave: `limite_emissao:${deps.mensagemIdComando ?? `${conversa.id}:${calculo.valorCentavos}`}`,
        evento: 'limite_emissao', mensagemRecebida: deps.textoComando ?? undefined,
        dados: { nomePaciente: paciente?.nome ?? null, telefonePaciente: conversa.contatoTelefone,
          valorCentavos: calculo.valorCentavos, motivo: verificacao.mensagem }
      });
      return { ok: false, motivo: 'limite_atingido', detalhe: verificacao.mensagem };
    }
  }

  const aguardandoDadosProfissionais = !dadosProfissionaisCompletos(medico);
  const fila = semDataConsulta || aguardandoDadosProfissionais ? null : (possuiCpf ? 'pronta' : 'pendente_cadastro');
  const medicoDescricao = { ...medico, nomeCompleto: medico.nomeCompleto || '' };
  const xdescServ = semDataConsulta
    ? montarDescricaoServico(medicoDescricao, 'DATA A CONFIRMAR')
    : montarDescricaoServico(medicoDescricao, consultas.map((c) => c.dataHora));

  const solicitacao = await deps.repositorio.criarSolicitacaoNota({
    medicoId,
    pacienteId,
    xdescServ,
    valorServicoCentavos: calculo.valorCentavos,
    ctribNac: medico.ctribNacPadrao,
    fila,
    aguardandoDataConsulta: semDataConsulta,
    aguardandoDadosProfissionais,
    datasConsultaTexto: formatarDatasConsultas(semDataConsulta ? 'DATA A CONFIRMAR' : consultas.map(c => c.dataHora)),
    agendamentoIds: consultas.map((c) => c.id)
  });

  if (aguardandoDadosProfissionais && deps.dadosProfissionais) {
    await deps.dadosProfissionais.solicitar(medicoId);
    await deps.dadosProfissionais.retomar(medicoId);
  }

  if (semDataConsulta) {
    await comunicar(deps, {
      medicoId, chave: `pedir_data:${solicitacao.id}`, evento: 'pedir_data',
      solicitacaoId: solicitacao.id, mensagemRecebida: deps.textoComando ?? undefined
    });
  }

  if (!possuiCpf) {
    const dataAtual = deps.agora ? deps.agora() : new Date();
    await deps.repositorio.marcarAguardandoCpf(conversa.id, dataAtual);
    await comunicar(deps, {
      medicoId, chave: `pedir_cpf:${solicitacao.id}`, evento: 'pedir_cpf',
      solicitacaoId: solicitacao.id, pacienteId, instanciaPaciente: deps.instanciaNome
    });
  }

  return {
    ok: true,
    solicitacaoId: solicitacao.id,
    fila,
    aguardandoCpf: !possuiCpf,
    aguardandoData: semDataConsulta,
    aguardandoDadosProfissionais
  };
}

async function comunicar(deps: ProcessarEmissaoDeps, entrada: EntradaComunicacaoNoto): Promise<void> {
  try {
    if (!deps.comunicadorNoto) {
      console.warn('[processarComandoEmissao] Comunicador indisponível', { evento: entrada.evento });
      return;
    }
    const resultado = await deps.comunicadorNoto.enviar(entrada);
    if (!resultado.sucesso) console.warn('[processarComandoEmissao] Comunicação não concluída', { evento: entrada.evento });
  } catch {
    console.warn('[processarComandoEmissao] Comunicação falhou', { evento: entrada.evento });
  }
}
