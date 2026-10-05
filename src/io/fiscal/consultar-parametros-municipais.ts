/** Consultas somente GET ao ADN, com mTLS. Nenhuma alíquota consultada é aplicada à emissão. */
import https from 'node:https';
import type { ConsultaExterna } from '../../fiscal/comparacao/tipos.js';

export type RequisicaoMunicipal = (url: string, pfx: Buffer, senha: string) => Promise<{ status: number; corpo: string }>;
const requisitar: RequisicaoMunicipal = (url, pfx, passphrase) => new Promise((resolve, reject) => {
  const req = https.get(url, { pfx, passphrase, rejectUnauthorized: true, headers: { Accept: 'application/json' } }, res => {
    const partes: Buffer[] = []; let tamanho = 0;
    res.on('data', (parte: Buffer) => { tamanho += parte.length; if (tamanho > 1_000_000) req.destroy(new Error('Resposta excessiva')); else partes.push(parte); });
    res.on('error', reject);
    res.on('end', () => resolve({ status: res.statusCode ?? 0, corpo: Buffer.concat(partes).toString('utf8') }));
  });
  const limite = setTimeout(() => req.destroy(new Error('Tempo de consulta esgotado')), 8000);
  req.on('close', () => clearTimeout(limite)); req.on('error', reject);
});

export async function consultarParametrosMunicipais(input: {
  municipio?: string; municipioIncidencia?: string; servico?: string; competencia: string; ambiente: 'producao' | 'homologacao'; pfx: Buffer; senha: string;
}, http: RequisicaoMunicipal = requisitar): Promise<{ convenio: ConsultaExterna; aliquota: ConsultaExterna }> {
  const fonte = `ADN — parâmetros municipais (${input.ambiente})`;
  const vazio = (mensagem: string): ConsultaExterna => ({ fonte, estado: 'nao_aplicavel', mensagem, dados: {} });
  const consulta = async (caminho: string, tipo: 'convenio' | 'aliquota'): Promise<ConsultaExterna> => {
    const base = input.ambiente === 'producao' ? 'https://adn.nfse.gov.br' : 'https://adn.producaorestrita.nfse.gov.br';
    try {
      const r = await http(`${base}/parametrizacao/${caminho}`, input.pfx, input.senha);
      if (r.status !== 200) return { fonte, estado: 'indisponivel', mensagem: `Consulta ${tipo} não concluída (HTTP ${r.status}).`, dados: {} };
      const json = JSON.parse(r.corpo);
      if (tipo === 'convenio') {
        const valor = json.parametrosConvenio?.aderenteEmissorNacional;
        if (![0, 1, -1].includes(valor)) throw new Error('Resposta inválida');
        return { fonte, estado: 'consultada', mensagem: 'Convênio municipal consultado. Não comprova habilitação individual do emitente.',
          dados: { municipio: input.municipio!, aderenteEmissorNacional: valor === 1 ? 'Sim' : valor === 0 ? 'Não' : 'Não informado' } };
      }
      // O contrato retorna um dicionário por código completo de serviço. Não escolher
      // a primeira alíquota, nem converter alíquota municipal em efetiva do Simples.
      const grupo = json.aliquotas?.[input.servico!];
      if (!Array.isArray(grupo)) throw new Error('Sem código exato');
      const vigentes = grupo.filter((a: any) => a && typeof a.Aliq === 'number' && Number.isFinite(a.Aliq) && a.Aliq >= 0 && a.Aliq <= 100
        && typeof a.DtIni === 'string' && Number.isFinite(Date.parse(a.DtIni)) && a.DtIni.slice(0, 10) <= input.competencia
        && (a.DtFim == null || (typeof a.DtFim === 'string' && Number.isFinite(Date.parse(a.DtFim)) && a.DtFim.slice(0, 10) >= input.competencia)));
      if (vigentes.length !== 1) throw new Error('Alíquota ausente ou ambígua');
      return { fonte, estado: 'consultada', mensagem: 'Alíquota municipal geral, apenas informativa. Regime especial, Simples e retenções exigem análise própria.',
        dados: { municipio: input.municipioIncidencia!, codigoServico: input.servico!, competencia: input.competencia,
          aliquotaMunicipal: vigentes[0].Aliq, vigenciaInicio: vigentes[0].DtIni, vigenciaFim: vigentes[0].DtFim ?? null } };
    } catch { return { fonte, estado: 'indisponivel', mensagem: `Consulta ${tipo} indisponível, sem resultado único ou com formato não reconhecido.`, dados: {} }; }
  };
  if (!/^\d{7}$/.test(input.municipio ?? '')) return { convenio: vazio('Município IBGE ainda não identificado.'), aliquota: vazio('Município e serviço precisam ser identificados.') };
  const competenciaValida = /^\d{4}-\d{2}-\d{2}$/.test(input.competencia) && Number.isFinite(Date.parse(input.competencia))
    && new Date(input.competencia).toISOString().slice(0, 10) === input.competencia;
  const [convenio, aliquota] = await Promise.all([
    consulta(`${input.municipio}/convenio`, 'convenio'),
    /^\d{7}$/.test(input.municipioIncidencia ?? '') && /^\d{6}(\d{3})?$/.test(input.servico ?? '') && competenciaValida
      ? consulta(`${input.municipioIncidencia}/${input.servico}/${encodeURIComponent(input.competencia + 'T00:00:00')}/aliquota`, 'aliquota')
      : Promise.resolve(vazio('A referência precisa identificar município de incidência, serviço e competência. Esses dados não serão inferidos do CNAE.'))
  ]);
  return { convenio, aliquota };
}
