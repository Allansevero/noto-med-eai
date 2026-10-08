/**
 * Um único ciclo de exceção, com registro antes das ações externas. Falhas de
 * auditoria nunca caem na retentativa genérica; casos interrompidos ficam retidos.
 */
import { podeCorrigirTributosFederais, diagnosticarRejeicao, descreverRetornoProvedor } from './analisar-rejeicao.js';
import type { ItemFilaComTentativas } from '../worker/fila-repositorio.js';
import type { EmissorDpsService, ResultadoEmissaoDps } from '../worker/emissor-dps-service.js';
import { permiteRetentativa, type DecisorFiscal, type FalhaEmissao, type InvestigacaoRepositorio } from './investigacao.js';
import { decidirResponsabilidadeFalha, type DecisaoResponsabilidadeFalha } from './decidir-responsabilidade-falha.js';

type Autorizacao = Extract<ResultadoEmissaoDps, { sucesso: true }>;
export interface AgenteFiscalDeps {
  repositorio: InvestigacaoRepositorio;
  decisor: DecisorFiscal;
}
export async function investigarFalha(
  entrada: { item: ItemFilaComTentativas; falha: FalhaEmissao },
  deps: AgenteFiscalDeps & {
    emissor: EmissorDpsService;
    concluir: (nota: Autorizacao) => Promise<void>;
    notificar: (decisao: DecisaoResponsabilidadeFalha) => Promise<void>;
  }
): Promise<Autorizacao | null> {
  const { item, falha } = entrada;
  const repo = deps.repositorio;
  if (!await repo.assumir(item, falha)) return null;
  let etapa = 'consultar_contexto';
  try {
    const contexto = await repo.consultar(item);
    await repo.registrar(item, { tipo: 'ferramenta', nome: 'consultar_contexto', resultado: contexto });
    if (contexto.autorizada) {
      await repo.registrar(item, { tipo: 'verificacao', motivo: 'Autorização já persistida; nenhuma retransmissão executada.' });
      await escalar('Nota autorizada; conferir pendência de entrega sem repetir emissão.', entrada, deps);
      return null;
    }
    const permitido = permiteRetentativa(falha, contexto);
    const correcaoPermitida = contexto.tentativas < 3 && podeCorrigirTributosFederais(falha) && !!deps.emissor.corrigirRejeicao;
    // Não envia CPF, nome, descrição clínica, XML, credenciais ou resposta bruta ao LLM.
    const contextoModelo = {
      status: contexto.status, tentativas: contexto.tentativas, perfil: contexto.perfil,
      codigo: falha.codigoErroSefin, falhaAntesDoEnvio: falha.falhaAntesDoEnvio,
      transmissao: falha.contextoTecnico, retentativaPermitida: permitido,
      diagnostico: diagnosticarRejeicao(falha),
      pendenciasFiscais: falha.pendenciasFiscais,
      retornoProvedor: descreverRetornoProvedor(falha),
      ferramentasPermitidas: [...(permitido ? ['tentar_novamente'] : []),
        ...(correcaoPermitida ? ['corrigir_tributos_federais'] : []), 'escalar']
    };
    await repo.registrar(item, { tipo: 'contexto_modelo', contexto: contextoModelo });
    etapa = 'decidir';
    const decisao = await deps.decisor.decidir(contextoModelo);
    await repo.registrar(item, { tipo: 'decisao', ...decisao });
    const autorizada = (decisao.acao === 'tentar_novamente' && permitido) ||
      (decisao.acao === 'corrigir_tributos_federais' && correcaoPermitida);
    if (!autorizada || decisao.acao === 'escalar' || !await repo.reservarTentativa(item, decisao.acao)) {
      await escalar('Ação automática não autorizada ou não indicada. Revisar causa e ação propostas no histórico.', entrada, deps);
      return null;
    }
    if (decisao.acao === 'corrigir_tributos_federais') {
      await repo.registrar(item, { tipo: 'correcao', regra: 'E0676_bloco_automatico_v1',
        campo: 'valores.trib.tribFed', antes: { piscofins: { CST: '08' } }, depois: null,
        ndps: falha.contextoTecnico?.ndps, motivo: 'Bloco automático explicitamente rejeitado pela SEFIN.' });
    }
    etapa = decisao.acao;
    const resultado = decisao.acao === 'corrigir_tributos_federais'
      ? await deps.emissor.corrigirRejeicao!(item, falha)
      : await deps.emissor.emitir(item);
    await repo.registrar(item, { tipo: 'resultado_ferramenta', nome: decisao.acao,
      resultado: resultado.sucesso ? { sucesso: true, chaveAcesso: resultado.chaveAcesso } : resultado });
    if (!resultado.sucesso) {
      await repo.registrar(item, { tipo: 'diagnostico_resultado', codigo: resultado.codigoErroSefin,
        diagnostico: diagnosticarRejeicao(resultado), motivo: 'Limite de uma ação corretiva atingido.' });
      await escalar('A única retentativa permitida falhou. Conferir retorno da tentativa antes de qualquer nova emissão.', entrada, deps);
      return null;
    }
    etapa = 'persistir_e_entregar';
    await deps.concluir(resultado);
    etapa = 'verificar_resultado';
    const verificado = await repo.consultar(item);
    if (!verificado.autorizada || verificado.status !== 'emitida') {
      await escalar('Retorno de sucesso sem autorização persistida. Conciliar resultado; não retransmitir.', entrada, deps);
      return null;
    }
    await repo.registrar(item, { tipo: 'verificacao', status: verificado.status,
      motivo: 'SEFIN retornou autorização e nota autorizada foi confirmada no banco.' }, 'resolvido');
    return resultado;
  } catch (erro) {
    await repo.registrar(item, { tipo: 'falha_tecnica', etapa,
      classe: erro instanceof Error ? erro.name : 'desconhecida',
      detalhe: erro instanceof Error ? erro.message.slice(0, 1000) : 'Falha sem mensagem' });
    await escalar('Investigação interrompida por falha técnica. Verificar eventos e autorização antes de retomar; não há evidência para outra tentativa automática.', entrada, deps);
    return null;
  }
}
async function escalar(
  motivo: string,
  entrada: { item: ItemFilaComTentativas; falha?: FalhaEmissao },
  deps: AgenteFiscalDeps & { notificar: (decisao: DecisaoResponsabilidadeFalha) => Promise<void> }
) {
  const decisao = decidirResponsabilidadeFalha(entrada.falha);
  await deps.repositorio.registrar(entrada.item, {
    tipo: 'escalonamento',
    motivo,
    responsavel: decisao.responsavel,
    categoria: decisao.categoria,
    acaoNecessaria: decisao.acaoSugerida
  }, 'necessita_intervencao');
  try {
    await deps.notificar(decisao);
    await deps.repositorio.registrar(entrada.item, {
      tipo: decisao.responsavel === 'desenvolvedor' ? 'notificacao_desenvolvedor' : 'notificacao',
      resultado: 'enviada'
    });
  } catch {
    await deps.repositorio.registrar(entrada.item, {
      tipo: decisao.responsavel === 'desenvolvedor' ? 'notificacao_desenvolvedor' : 'notificacao',
      resultado: 'falhou',
      acaoNecessaria: decisao.responsavel === 'desenvolvedor'
        ? 'Alertar equipe de desenvolvimento sobre a falha técnica.'
        : 'Comunicar pendência ao médico.'
    });
  }
}
