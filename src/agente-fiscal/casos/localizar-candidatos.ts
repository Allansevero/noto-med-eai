import type pg from 'pg';
import type { EvolutionApiClient } from '../../io/evolution/evolution-api-client.js';
import { validarComprovanteCache, type PaligemmaComprovanteClient } from '../../io/nvidia/paligemma-comprovante-client.js';
import { correlacionarConsultaPagamento, type CandidatoNotaFiscal, type MensagemContextoConversa } from '../regras/correlacionar-consulta-pagamento.js';
import { inicioJanelaPagamentosBrasilia, normalizarIdentidade, obterPagamentoDocumental, obterNotaFiscalDocumental } from '../regras/evidencias-documentais.js';
import { prepararMidiaFiscal, MidiaFiscalNaoSuportada } from '../io/preparar-midia-fiscal.js';

export interface ResultadoLocalizacao {
  candidatos: CandidatoNotaFiscal[];
  revisoes: number;
  analisados: number;
  incompleto: boolean;
}

type Registro = Record<string, unknown>;
function objeto(valor: unknown): Registro {
  return valor !== null && typeof valor === 'object' && !Array.isArray(valor) ? valor as Registro : {};
}
function envelope(payload: Registro): Registro {
  const data = objeto(payload.data);
  return Object.keys(data).length ? data : payload;
}

/** Extraction progress lives beside each message, surviving restarts and bounded batches. */
export class LocalizadorCandidatos {
  constructor(
    private readonly pool: pg.Pool,
    private readonly comprovanteClient: Pick<PaligemmaComprovanteClient, 'analisarImagem'>,
    private readonly evolutionClient: Pick<EvolutionApiClient, 'obterBase64MensagemMidia'>,
    private readonly chaveCriptografia: string
  ) {}

  async localizar(medicoId: string): Promise<ResultadoLocalizacao> {
    const agora = new Date();
    const corte = inicioJanelaPagamentosBrasilia(agora);
    const contexto = new Date(agora.getTime() - 45 * 86_400_000);
    const resultado: ResultadoLocalizacao = { candidatos: [], revisoes: 0, analisados: 0, incompleto: false };
    const fiscal = (await this.pool.query(`select m.nome_completo,
      pgp_sym_decrypt(f.cpf_cnpj_encriptado, $2) as documento,
      f.razao_social
      from medicos m join usuarios u on u.id=m.usuario_id and u.ativo=true
      left join medico_perfil_fiscal f on f.medico_id=m.id where m.id=$1`,
      [medicoId, this.chaveCriptografia])).rows[0];
    if (!fiscal) throw new Error('MEDICO_INATIVO');
    const { rows } = await this.pool.query(`
      select m.id, m.direcao, m.tipo_mensagem, m.conteudo, m.criado_em, m.payload_bruto,
             c.id as conversa_id, c.contato_telefone, coalesce(p.nome, c.contato_nome) as contato_nome,
             i.nome_instancia
      from whatsapp_mensagens m
      join whatsapp_conversas c on c.id = m.conversa_id
      join whatsapp_instancias i on i.id = c.instancia_id and i.medico_id = c.medico_id
      left join pacientes p on p.id = c.paciente_id and p.medico_id = c.medico_id
      where c.medico_id = $1 and i.oficial = false and m.criado_em >= $2 and m.criado_em <= $3
      order by m.criado_em, m.id`, [medicoId, contexto, agora]);
    const conversas = new Map<string, { telefone: string; nome: string | null; mensagens: MensagemContextoConversa[]; pendente: boolean; revisao: boolean }>();
    let tentadas = 0;
    for (const row of rows) {
      let conversa = conversas.get(row.conversa_id);
      if (!conversa) {
        conversa = { telefone: row.contato_telefone, nome: row.contato_nome, mensagens: [], pendente: false, revisao: false };
        conversas.set(row.conversa_id, conversa);
      }
      const payload = objeto(row.payload_bruto);
      const mensagem: MensagemContextoConversa = { id: row.id, direcao: row.direcao, tipo: row.tipo_mensagem, conteudo: row.conteudo, criadoEm: row.criado_em, payloadBruto: payload };
      conversa.mensagens.push(mensagem);
      if (!['imagem', 'documento'].includes(row.tipo_mensagem) || new Date(row.criado_em) < corte) continue;
      const cache = validarComprovanteCache(payload.comprovante);
      if (cache) {
        payload.comprovante = cache;
        resultado.analisados++;
        if ((cache.ehComprovante && (cache.statusPagamento === 'desconhecido' ||
            (cache.statusPagamento === 'realizado' && !obterPagamentoDocumental(mensagem)))) ||
            (row.direcao === 'enviada' && cache.notaFiscal?.ehNotaFiscal &&
            cache.notaFiscal.status !== 'cancelada' && !obterNotaFiscalDocumental(mensagem))) {
          resultado.revisoes++;
          conversa.revisao = true;
        }
        continue;
      }
      // Untrusted/old cache must never reach correlation as validated evidence.
      delete payload.comprovante;
      const progresso = objeto(payload.analiseFiscal);
      const tentativas = progresso.versao === 2 && Number.isInteger(progresso.tentativas) ? Number(progresso.tentativas) : 0;
      if (progresso.versao === 2 && (progresso.status === 'revisao' || tentativas >= 3)) {
        resultado.revisoes++;
        conversa.revisao = true;
        continue;
      }
      if (tentadas >= 20 || Date.now() - agora.getTime() >= 90_000 ||
          (progresso.status === 'processando' && Date.parse(String(progresso.em)) > Date.now() - 120_000)) {
        conversa.pendente = resultado.incompleto = true;
        continue;
      }
      const estado = { versao: 2, status: 'processando', tentativas: tentativas + 1, em: new Date().toISOString() };
      // Compare prior progress so concurrent workers cannot claim the same extraction.
      const claim = await this.pool.query(`update whatsapp_mensagens
        set payload_bruto = jsonb_set(coalesce(payload_bruto, '{}'::jsonb), '{analiseFiscal}', $2::jsonb)
        where id = $1 and coalesce(payload_bruto->'analiseFiscal', '{}'::jsonb) = $3::jsonb returning id`,
      [row.id, JSON.stringify(estado), JSON.stringify(progresso)]);
      if (!claim.rows.length) { conversa.pendente = resultado.incompleto = true; continue; }
      tentadas++;
      try {
        const dados = envelope(payload);
        const conteudo = objeto(dados.message);
        const midiaPayload = objeto(conteudo.imageMessage ?? conteudo.documentMessage);
        let base64 = midiaPayload.base64 ?? dados.base64;
        if (typeof base64 !== 'string' || !base64) {
          const whatsappId = objeto(dados.key).id;
          if (typeof whatsappId !== 'string' || !whatsappId) throw new MidiaFiscalNaoSuportada('id_whatsapp_ausente');
          const midia = await this.evolutionClient.obterBase64MensagemMidia(row.nome_instancia, whatsappId);
          base64 = midia?.base64;
        }
        if (typeof base64 !== 'string' || !base64) throw new Error('midia_indisponivel');
        const preparada = await prepararMidiaFiscal(base64);
        const extraido = await this.comprovanteClient.analisarImagem(preparada.base64, preparada.mimeType);
        const comprovante = validarComprovanteCache({ ...extraido, documentoHash: preparada.documentoHash });
        if (!comprovante) throw new Error('extracao_invalida');
        await this.pool.query(`update whatsapp_mensagens set payload_bruto =
          jsonb_set(jsonb_set(coalesce(payload_bruto, '{}'::jsonb), '{comprovante}', $2::jsonb), '{analiseFiscal}', $3::jsonb)
          where id = $1`, [row.id, JSON.stringify(comprovante), JSON.stringify({ ...estado, status: 'concluido' })]);
        payload.comprovante = comprovante;
        resultado.analisados++;
        if ((comprovante.ehComprovante && (comprovante.statusPagamento === 'desconhecido' ||
            (comprovante.statusPagamento === 'realizado' && !obterPagamentoDocumental(mensagem)))) ||
            (row.direcao === 'enviada' && comprovante.notaFiscal?.ehNotaFiscal &&
            comprovante.notaFiscal.status !== 'cancelada' && !obterNotaFiscalDocumental(mensagem))) {
          resultado.revisoes++;
          conversa.revisao = true;
        }
      } catch (erro) {
        const permanente = erro instanceof MidiaFiscalNaoSuportada || estado.tentativas >= 3;
        await this.pool.query(`update whatsapp_mensagens set payload_bruto =
          jsonb_set(coalesce(payload_bruto, '{}'::jsonb), '{analiseFiscal}', $2::jsonb) where id = $1`,
        [row.id, JSON.stringify({ ...estado, status: permanente ? 'revisao' : 'falhou', motivo: erro instanceof MidiaFiscalNaoSuportada ? erro.message : 'analise_indisponivel' })]);
        if (permanente) { resultado.revisoes++; conversa.revisao = true; }
        else conversa.pendente = resultado.incompleto = true;
      }
    }
    for (const conversa of conversas.values()) {
      // A not-yet-inspected outgoing document may be the corresponding invoice.
      if (conversa.pendente) continue;
      const candidatos = correlacionarConsultaPagamento(conversa.mensagens, conversa.telefone, conversa.nome, agora, undefined, corte);
      for (const candidato of candidatos) {
        const documento = candidato.favorecidoDocumento?.replace(/\D/g, '');
        const documentoCompleto = documento && [11, 14].includes(documento.length) &&
          !/[*xX]/.test(candidato.favorecidoDocumento || '');
        const nome = normalizarIdentidade(candidato.favorecidoNome);
        const nomeCompativel = nome && [fiscal.nome_completo, fiscal.razao_social].some(n => normalizarIdentidade(n) === nome);
        if (documentoCompleto ? documento !== fiscal.documento?.replace(/\D/g, '') : !nomeCompativel) {
          candidato.requerRevisao = true;
          candidato.motivosRevisao = [...(candidato.motivosRevisao || []), 'Favorecido do pagamento não confirmado no cadastro fiscal.'];
        }
        if (conversa.revisao) {
          candidato.requerRevisao = true;
          candidato.motivosRevisao = [...(candidato.motivosRevisao ?? []), 'documento_na_conversa_sem_analise'];
        }
        if (candidato.requerRevisao) resultado.revisoes++;
        resultado.candidatos.push(candidato);
      }
    }
    return resultado;
  }
}
