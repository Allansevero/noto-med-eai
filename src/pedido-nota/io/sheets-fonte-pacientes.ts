/**
 * Fonte de pacientes via Google Sheets ao vivo (banco de dados externo).
 * Consulta a planilha diretamente pela API do Google Sheets sem copiar dados
 * para o banco local, com cache em memória de 60 segundos por médico/planilha.
 */

import type pg from 'pg';
import { validarCpf } from '../../paciente/validar-cpf.js';
import { gerarVariantesTelefoneBrasileiro } from '../../whatsapp/variantes-telefone-brasileiro.js';
import type { PacienteEncontrado, TermoBuscaPaciente } from '../tipos.js';
import type { FontePacientes } from './fonte-pacientes.js';

export interface MapeamentoColunasPlanilha {
  indiceNome: number;
  indiceCpf?: number;
  indiceTelefone?: number;
  indiceData?: number;
  indiceValor?: number;
}

interface CachePlanilha {
  linhas: string[][];
  expiraEm: number;
}

export class SheetsFontePacientes implements FontePacientes {
  readonly nomeFonte = 'sheets';
  private readonly cache = new Map<string, CachePlanilha>();

  constructor(
    private readonly pool: pg.Pool,
    private readonly encryptionKey?: string,
    private readonly googleClientId?: string,
    private readonly googleClientSecret?: string,
    private readonly fetchFn: typeof fetch = fetch
  ) {}

  async buscar(medicoId: string, termo: TermoBuscaPaciente): Promise<PacienteEncontrado[]> {
    if (!termo.nome && !termo.telefone && !termo.cpf) {
      return [];
    }

    const conexao = await this.carregarConexao(medicoId);
    if (!conexao || !conexao.planilhaId || !conexao.accessToken) {
      return [];
    }

    const conexaoValida = {
      planilhaId: conexao.planilhaId,
      abaNome: conexao.abaNome,
      accessToken: conexao.accessToken
    };

    const linhas = await this.obterLinhasComCache(medicoId, conexaoValida);
    if (!linhas || linhas.length < 2) {
      return [];
    }

    const mapeamento = conexao.mapeamento || this.inferirMapeamento(linhas[0] || []);
    if (mapeamento.indiceNome < 0) {
      return [];
    }

    return this.filtrarLinhas(linhas.slice(1), mapeamento, termo);
  }

  private async carregarConexao(medicoId: string) {
    if (!this.encryptionKey) return null;

    const sql = `
      select planilha_id, planilha_nome, aba_nome, mapeamento_colunas,
             pgp_sym_decrypt(access_token, $2) as access_token,
             pgp_sym_decrypt(refresh_token, $2) as refresh_token,
             expira_em
      from google_planilhas_conexoes
      where medico_id = $1 and access_token is not null
      limit 1
    `;
    const { rows } = await this.pool.query(sql, [medicoId, this.encryptionKey]).catch(() => ({ rows: [] }));
    if (rows.length === 0) return null;

    const r = rows[0];
    let token = r.access_token;

    // Renova o token se expirado e se houver refresh token
    const expirado = r.expira_em && new Date(r.expira_em).getTime() <= Date.now() + 60_000;
    if (expirado && r.refresh_token && this.googleClientId && this.googleClientSecret) {
      const novoToken = await this.renovarAccessToken(r.refresh_token, medicoId);
      if (novoToken) token = novoToken;
    }

    return {
      planilhaId: r.planilha_id as string | null,
      abaNome: (r.aba_nome as string | null) || 'Página1',
      mapeamento: r.mapeamento_colunas as MapeamentoColunasPlanilha | null,
      accessToken: token as string | null
    };
  }

  private async renovarAccessToken(refreshToken: string, medicoId: string): Promise<string | null> {
    try {
      const resp = await this.fetchFn('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: this.googleClientId!,
          client_secret: this.googleClientSecret!,
          refresh_token: refreshToken,
          grant_type: 'refresh_token'
        })
      });
      if (!resp.ok) return null;
      const data: any = await resp.json();
      if (!data.access_token) return null;

      const expiraEm = new Date(Date.now() + (data.expires_in || 3600) * 1000);
      await this.pool.query(
        `update google_planilhas_conexoes
         set access_token = pgp_sym_encrypt($2, $3),
             expira_em = $4,
             atualizado_em = now()
         where medico_id = $1`,
        [medicoId, data.access_token, this.encryptionKey, expiraEm]
      );
      return data.access_token;
    } catch {
      return null;
    }
  }

  private async obterLinhasComCache(
    medicoId: string,
    conexao: { planilhaId: string; abaNome: string; accessToken: string }
  ): Promise<string[][] | null> {
    const chave = `${medicoId}:${conexao.planilhaId}:${conexao.abaNome}`;
    const emCache = this.cache.get(chave);
    if (emCache && emCache.expiraEm > Date.now()) {
      return emCache.linhas;
    }

    const range = encodeURIComponent(conexao.abaNome);
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${conexao.planilhaId}/values/${range}`;

    try {
      const resp = await this.fetchFn(url, {
        headers: { Authorization: `Bearer ${conexao.accessToken}` },
        signal: AbortSignal.timeout(8000)
      });
      if (!resp.ok) return null;
      const data: any = await resp.json();
      const valores = Array.isArray(data.values) ? data.values : [];
      this.cache.set(chave, {
        linhas: valores,
        expiraEm: Date.now() + 60_000 // 60 segundos de cache
      });
      return valores;
    } catch {
      return null;
    }
  }

  private inferirMapeamento(cabecalho: string[]): MapeamentoColunasPlanilha {
    let indiceNome = -1;
    let indiceCpf: number | undefined;
    let indiceTelefone: number | undefined;
    let indiceData: number | undefined;
    let indiceValor: number | undefined;

    cabecalho.forEach((col, idx) => {
      const c = col.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
      if (indiceNome < 0 && (c.includes('nome') || c.includes('paciente'))) indiceNome = idx;
      if (indiceCpf === undefined && c.includes('cpf')) indiceCpf = idx;
      if (indiceTelefone === undefined && (c.includes('tel') || c.includes('whats') || c.includes('celular') || c.includes('contato'))) indiceTelefone = idx;
      if (indiceData === undefined && (c.includes('data') || c.includes('consulta'))) indiceData = idx;
      if (indiceValor === undefined && (c.includes('valor') || c.includes('preco') || c.includes('pagamento'))) indiceValor = idx;
    });

    return { indiceNome: indiceNome >= 0 ? indiceNome : 0, indiceCpf, indiceTelefone, indiceData, indiceValor };
  }

  private filtrarLinhas(
    linhas: string[][],
    mapa: MapeamentoColunasPlanilha,
    termo: TermoBuscaPaciente
  ): PacienteEncontrado[] {
    const encontrados: PacienteEncontrado[] = [];
    const variantesTelefone = termo.telefone ? gerarVariantesTelefoneBrasileiro(termo.telefone) : [];
    const cpfBuscado = termo.cpf ? termo.cpf.replace(/\D/g, '') : null;
    const nomeBuscadoPartes = termo.nome
      ? termo.nome.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().split(/\s+/).filter(p => p.length >= 2)
      : [];

    for (const linha of linhas) {
      const nomeOriginal = linha[mapa.indiceNome]?.trim() || '';
      if (!nomeOriginal) continue;

      const cpfLimpo = mapa.indiceCpf !== undefined && linha[mapa.indiceCpf]
        ? linha[mapa.indiceCpf].replace(/\D/g, '')
        : null;

      const telefoneLimpo = mapa.indiceTelefone !== undefined && linha[mapa.indiceTelefone]
        ? linha[mapa.indiceTelefone].replace(/\D/g, '')
        : null;

      let deuMatch = false;

      // 1. Match por CPF
      if (cpfBuscado && cpfLimpo && cpfLimpo === cpfBuscado) {
        deuMatch = true;
      }

      // 2. Match por Telefone
      if (!deuMatch && telefoneLimpo && variantesTelefone.length > 0) {
        if (variantesTelefone.some(v => v.includes(telefoneLimpo) || telefoneLimpo.includes(v))) {
          deuMatch = true;
        }
      }

      // 3. Match por Nome
      if (!deuMatch && nomeBuscadoPartes.length > 0) {
        const nomeNorm = nomeOriginal.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        if (nomeBuscadoPartes.every(parte => nomeNorm.includes(parte))) {
          deuMatch = true;
        }
      }

      if (deuMatch) {
        let valorSugeridoCentavos: number | null = null;
        if (mapa.indiceValor !== undefined && linha[mapa.indiceValor]) {
          const num = Number.parseFloat(linha[mapa.indiceValor].replace(/\./g, '').replace(',', '.').replace(/\D/g, ''));
          if (!Number.isNaN(num) && num > 0) valorSugeridoCentavos = num * 100;
        }

        const dataSugerida = mapa.indiceData !== undefined && linha[mapa.indiceData]
          ? linha[mapa.indiceData].trim()
          : null;

        encontrados.push({
          nome: nomeOriginal,
          cpfLimpo: cpfLimpo && validarCpf(cpfLimpo) ? cpfLimpo : null,
          telefone: telefoneLimpo || null,
          origem: 'sheets',
          detalheOrigem: 'Google Planilhas (ao vivo)',
          dataConsultaSugerida: dataSugerida,
          valorSugeridoCentavos
        });

        if (encontrados.length >= 5) break;
      }
    }

    return encontrados;
  }
}
