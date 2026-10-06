/** Compara fontes independentes sem inferir tributos ausentes nem alterar o cadastro. */
import type { CamposFiscais, ContextoComparacao, EvidenciasExternas, ValorComparavel } from './tipos.js';

const rotulos: Record<string, string> = {
  razaoSocial: 'Razão social', municipioEmitente: 'Município do emitente (IBGE)',
  opcaoSimplesNacional: 'Enquadramento no Simples', regimeApuracaoSn: 'Apuração do Simples',
  regimeEspecialTributacao: 'Regime especial', municipioPrestacao: 'Município da prestação (IBGE)',
  ctribNac: 'Código nacional do serviço', ctribMun: 'Código municipal do serviço', cnbs: 'NBS',
  aliquotaIss: 'Alíquota de ISS declarada (%)', tribISSQN: 'Situação do ISS', tpRetISSQN: 'Retenção de ISS',
  cstPisCofins: 'CST PIS/COFINS', percentualTotTribSN: 'Tributos aproximados do Simples (%)',
  'totalTributos.tipo': 'Forma de totalização dos tributos', 'totalTributos.federal': 'Tributos federais aproximados (%)',
  'totalTributos.estadual': 'Tributos estaduais aproximados (%)', 'totalTributos.municipal': 'Tributos municipais aproximados (%)',
  'pisCofinsCalculo.base': 'Base de cálculo de PIS/COFINS', 'pisCofinsCalculo.aliquotaPis': 'Alíquota PIS (%)',
  'pisCofinsCalculo.aliquotaCofins': 'Alíquota COFINS (%)', 'pisCofinsCalculo.tipoRetencao': 'Retenção de PIS/COFINS',
  'ibscbs.CST': 'CST IBS/CBS', 'ibscbs.cClassTrib': 'Classificação IBS/CBS',
  'ibscbs.cIndOp': 'Operação IBS/CBS', 'ibscbs.finNFSe': 'Finalidade IBS/CBS',
  'ibscbs.indFinal': 'Consumo pessoal IBS/CBS', 'ibscbs.indDest': 'Destinatário IBS/CBS'
};
const normalizar = (valor: ValorComparavel | undefined) => typeof valor === 'string'
  ? valor.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().replace(/\s+/g, ' ').toUpperCase() : valor ?? null;

export function compararDadosFiscais(contexto: ContextoComparacao, evidencias: EvidenciasExternas, consultadoEm: string) {
  // Cadastro atual não comprova retroativamente o regime da competência da nota.
  const externo: CamposFiscais = evidencias.cadastral.estado === 'consultada' ? evidencias.cadastral.dados : {};
  const linhas = Object.entries(rotulos).map(([campo, nome]) => {
    const referencia = contexto.referencia[campo] ?? null;
    const preparado = contexto.preparado[campo] ?? null;
    const consultado = externo[campo] ?? null;
    const estado = referencia === null ? 'sem_referencia' : consultado === null ? 'nao_conferido'
      : normalizar(referencia) === normalizar(consultado) ? 'coincide' : 'diverge';
    const comparacaoNoto = !contexto.referenciaHash ? 'sem_referencia'
      : normalizar(referencia) === normalizar(preparado) ? 'coincide' : 'diverge';
    return { campo, nome, referencia, consultado, preparado, estado, comparacaoNoto,
      fonte: consultado === null ? 'Sem consulta independente para este campo' : evidencias.cadastral.fonte };
  });
  const divergencias = linhas.filter(l => l.estado === 'diverge' || l.comparacaoNoto === 'diverge').length;
  return { versao: 1, consultadoEm, referenciaHash: contexto.referenciaHash, numeroReferencia: contexto.numero,
    competencia: contexto.competencia, ambiente: contexto.ambiente, politicaConfirmada: contexto.politicaConfirmada,
    estado: !contexto.referenciaHash ? 'sem_referencia' : divergencias ? 'divergencias' : 'comparacao_parcial',
    divergencias, linhas, fontes: Object.values(evidencias), pendencias: contexto.pendencias,
    observacao: 'Comparação informativa. Dados cadastrais refletem a consulta atual; a nota reflete sua competência. IBS/CBS e outros campos sem fonte independente continuam baseados na referência. Alíquota municipal geral não substitui a alíquota aplicável à empresa. Nenhum parâmetro foi alterado.' };
}
