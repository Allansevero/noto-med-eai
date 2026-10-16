/**
 * Orquestrador pós-conexão do WhatsApp da clínica com o Noto.
 * Envia uma mensagem inicial de boas-vindas tranquila ao médico,
 * sincroniza o histórico, minera CPFs e dados cadastrais dos pacientes no banco
 * e, após a cadência necessária ("dar tempo ao tempo"), aciona a primeira nota fiscal pendente.
 */

import { redigirMensagemBoasVindasConexao } from '../regras/redigir-mensagem-boas-vindas-conexao.js';
import { varrerESolicitarAprovacao, type ResultadoVarreduraAprovacao } from './varrer-e-solicitar-aprovacao.js';
import type { PostgresCandidatosNotaRepositorio } from '../io/postgres-candidatos-nota-repositorio.js';
import type { EnviarMensagemPaciente } from '../../whatsapp/enviar-mensagem-paciente.js';
import type { PaligemmaComprovanteClient } from '../../io/nvidia/paligemma-comprovante-client.js';
import type { EvolutionApiClient } from '../../io/evolution/evolution-api-client.js';

export interface IniciarOnboardingPosConexaoDeps {
  medicoId: string;
  nomeInstancia: string;
  repositorio: PostgresCandidatosNotaRepositorio;
  enviarMensagemAssistente: EnviarMensagemPaciente;
  instanciaAssistenteNome: string;
  sincronizarHistorico: (nomeInstancia: string) => Promise<unknown>;
  comprovanteClient?: PaligemmaComprovanteClient;
  evolutionClient?: EvolutionApiClient;
  solicitarVarredura?: (medicoId: string) => Promise<void>;
  esperarMs?: (ms: number) => Promise<void>;
}

export interface ResultadoOnboardingPosConexao {
  ok: boolean;
  boasVindasEnviada: boolean;
  pacientesEnriquecidos: number;
  resultadoVarredura?: ResultadoVarreduraAprovacao;
  erro?: string;
}

export async function iniciarOnboardingPosConexao(
  deps: IniciarOnboardingPosConexaoDeps
): Promise<ResultadoOnboardingPosConexao> {
  const dadosMedico = await deps.repositorio.obterDadosMedico(deps.medicoId);
  const telefoneMedico = dadosMedico?.telefone;

  let boasVindasEnviada = false;

  // 1. Enviar mensagem de boas-vindas humanizada e tranquila ao médico
  if (telefoneMedico) {
    const textoBoasVindas = redigirMensagemBoasVindasConexao(dadosMedico?.nomeCompleto);
    const envio = await deps.enviarMensagemAssistente.enviarTexto({
      instanciaNome: deps.instanciaAssistenteNome,
      contatoTelefone: telefoneMedico,
      texto: textoBoasVindas
    });
    boasVindasEnviada = envio.sucesso;
  }

  // 2. Sincronizar histórico da instância recém-conectada
  try {
    await deps.sincronizarHistorico(deps.nomeInstancia);
  } catch (err: any) {
    console.warn('[iniciarOnboardingPosConexao] Sincronização inicial em andamento ou parcial:', err?.message || err);
  }

  // 3. Mapear e enriquecer CPFs dos pacientes minerando o histórico profundo
  let pacientesEnriquecidos = 0;
  if (deps.repositorio.enriquecerCpfsPacientesHistorico) {
    try {
      pacientesEnriquecidos = await deps.repositorio.enriquecerCpfsPacientesHistorico(deps.medicoId);
      console.info(`[iniciarOnboardingPosConexao] Mapeamento concluído: ${pacientesEnriquecidos} paciente(s) com CPF enriquecido.`);
    } catch (err: any) {
      console.warn('[iniciarOnboardingPosConexao] Falha ao enriquecer CPFs de pacientes:', err?.message || err);
    }
  }

  // 4. Cadência tranquila: aguarda breve intervalo antes de apresentar a primeira nota ("dar tempo ao tempo")
  const esperar = deps.esperarMs || ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
  await esperar(2000);

  // 5. Apresentar a primeira nota com calma (uma por uma)
  let resultadoVarredura: ResultadoVarreduraAprovacao | undefined;
  try {
    if (deps.solicitarVarredura) {
      await deps.solicitarVarredura(deps.medicoId);
      return { ok: true, boasVindasEnviada, pacientesEnriquecidos };
    }
    resultadoVarredura = await varrerESolicitarAprovacao(deps.medicoId, {
      repositorio: deps.repositorio,
      enviarMensagem: deps.enviarMensagemAssistente,
      instanciaNome: deps.instanciaAssistenteNome,
      comprovanteClient: deps.comprovanteClient,
      evolutionClient: deps.evolutionClient
    });
  } catch (err: any) {
    console.warn('[iniciarOnboardingPosConexao] Falha na primeira varredura pós-conexão:', err?.message || err);
  }

  return {
    ok: true,
    boasVindasEnviada,
    pacientesEnriquecidos,
    resultadoVarredura
  };
}
