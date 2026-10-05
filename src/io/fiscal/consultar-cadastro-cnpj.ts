/** Consulta cadastral secundária e sem credencial. Nunca envia A1, senha ou XML ao provedor. */
import type { ConsultaExterna, CamposFiscais } from '../../fiscal/comparacao/tipos.js';

export async function consultarCadastroCnpj(cnpj: string, requisitar: typeof fetch = fetch): Promise<ConsultaExterna> {
  const fonte = 'BrasilAPI / Minha Receita (base cadastral secundária)';
  const falha = (mensagem: string): ConsultaExterna => ({ fonte, estado: 'indisponivel', mensagem, dados: {} });
  if (!/^\d{14}$/.test(cnpj)) return { fonte, estado: 'nao_aplicavel', mensagem: 'Consulta cadastral disponível para CNPJ numérico.', dados: {} };
  try {
    const resposta = await requisitar(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`, {
      headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(8000), redirect: 'error'
    });
    if (!resposta.ok) return falha(`Cadastro não consultado (HTTP ${resposta.status}).`);
    const d = await resposta.json();
    if (typeof d.cnpj !== 'string' || d.cnpj.replace(/\D/g, '') !== cnpj || typeof d.razao_social !== 'string') {
      return falha('Resposta cadastral inválida ou referente a outro CNPJ.');
    }
    const dados: CamposFiscais = { razaoSocial: d.razao_social.slice(0, 200) };
    if (/^\d{7}$/.test(String(d.codigo_municipio_ibge ?? ''))) dados.municipioEmitente = String(d.codigo_municipio_ibge);
    if (typeof d.opcao_pelo_mei === 'boolean' && typeof d.opcao_pelo_simples === 'boolean') {
      if (d.opcao_pelo_mei && !d.opcao_pelo_simples) return falha('Consulta cadastral retornou enquadramentos conflitantes.');
      dados.opcaoSimplesNacional = d.opcao_pelo_mei ? 'mei' : d.opcao_pelo_simples ? 'me_epp' : 'nao_optante';
    }
    if (/^\d{7}$/.test(String(d.cnae_fiscal ?? ''))) dados.cnaePrincipal = String(d.cnae_fiscal);
    if (typeof d.descricao_situacao_cadastral === 'string') dados.situacaoCadastral = d.descricao_situacao_cadastral.slice(0, 80);
    return { fonte, estado: 'consultada', mensagem: 'Cadastro para conferência; pode haver defasagem. CNAE não determina sozinho a tributação do serviço.', dados };
  } catch { return falha('Consulta cadastral indisponível ou fora do prazo. Tente novamente mais tarde.'); }
}
