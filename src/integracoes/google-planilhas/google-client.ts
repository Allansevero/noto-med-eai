import type { GooglePlanilhas } from './types.js';

export interface GooglePlanilhasClientOptions {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  fetch?: typeof fetch;
}

type Objeto = Record<string, unknown>;
function objeto(value: unknown): Objeto {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Resposta inválida do Google.');
  return value as Objeto;
}
function inteiro(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) throw new Error('Resposta inválida do Google.');
  return value;
}
function texto(value: unknown): string {
  if (typeof value !== 'string' || !value) throw new Error('Resposta inválida do Google.');
  return value;
}

/** Reads a bounded, formatted snapshot; the caller must inspect worksheet column counts. */
export class GooglePlanilhasClient implements GooglePlanilhas {
  private readonly fetcher: typeof fetch;
  constructor(private readonly options: GooglePlanilhasClientOptions) {
    this.fetcher = options.fetch ?? globalThis.fetch;
  }

  urlAutorizacao(estado: string, desafio: string): string {
    const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    url.search = new URLSearchParams({
      client_id: this.options.clientId, redirect_uri: this.options.redirectUri,
      response_type: 'code', scope: 'https://www.googleapis.com/auth/spreadsheets.readonly',
      access_type: 'offline', prompt: 'consent', state: estado,
      code_challenge: desafio, code_challenge_method: 'S256',
    }).toString();
    return url.href;
  }

  async trocarCodigo(codigo: string, verificador: string) {
    return this.token({grant_type: 'authorization_code', code: codigo, code_verifier: verificador, redirect_uri: this.options.redirectUri});
  }

  async renovar(refreshToken: string) {
    return this.token({grant_type: 'refresh_token', refresh_token: refreshToken});
  }

  async revogar(token: string): Promise<void> {
    await this.requisitar('https://oauth2.googleapis.com/revoke', this.formulario({token}), false);
  }

  async abas(token: string, id: string) {
    this.validarId(id);
    const url = new URL(`https://sheets.googleapis.com/v4/spreadsheets/${id}`);
    url.searchParams.set('fields', 'spreadsheetId,properties.title,sheets.properties');
    const body = objeto(await this.requisitar(url.href, {headers:{Authorization:`Bearer ${token}`}}));
    if (!Array.isArray(body.sheets)) throw new Error('Resposta inválida do Google.');
    return {titulo: texto(objeto(body.properties).title), abas: body.sheets.map(sheet => {
      const properties = objeto(objeto(sheet).properties);
      const grid = objeto(properties.gridProperties);
      return {id: inteiro(properties.sheetId), titulo: texto(properties.title), linhas: inteiro(grid.rowCount), colunas: inteiro(grid.columnCount)};
    })};
  }

  async ler(token: string, id: string, aba: string) {
    this.validarId(id);
    if (!aba || aba.length > 100) throw new Error('Nome de aba inválido.');
    const range = `'${aba.replaceAll("'", "''")}'!A1:AZ1001`;
    const url = new URL(`https://sheets.googleapis.com/v4/spreadsheets/${id}/values/${encodeURIComponent(range)}`);
    url.searchParams.set('valueRenderOption', 'FORMATTED_VALUE');
    url.searchParams.set('majorDimension', 'ROWS');
    const body = objeto(await this.requisitar(url.href, {headers:{Authorization:`Bearer ${token}`}}));
    const rows = body.values ?? [];
    if (!Array.isArray(rows) || rows.some(row => !Array.isArray(row) || row.some(value => typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean'))) throw new Error('Resposta inválida do Google.');
    // 1001 includes a potential header and 1000 data rows. Reaching the bound is not proof of completeness.
    const limitado = rows.length >= 1001 || rows.some(row => row.length > 52);
    const valores: string[][] = rows.slice(0,1001).map(row => row.slice(0,52).map((value: unknown) => String(value)));
    return {valores, limitado};
  }

  private validarId(id: string): void {
    if (!/^[\w-]{10,200}$/.test(id)) throw new Error('Identificador de planilha inválido.');
  }

  private formulario(values: Record<string,string>): RequestInit {
    return {method:'POST', headers:{'Content-Type':'application/x-www-form-urlencoded'}, body:new URLSearchParams(values).toString()};
  }

  private async token(values: Record<string,string>): Promise<{accessToken:string;refreshToken?:string;expiraEm:number}> {
    const body = objeto(await this.requisitar('https://oauth2.googleapis.com/token', this.formulario({
      ...values, client_id:this.options.clientId, client_secret:this.options.clientSecret,
    })));
    const accessToken = texto(body.access_token);
    const expiry = inteiro(body.expires_in);
    if (expiry === 0 || !Number.isSafeInteger(Date.now() + expiry * 1000)) throw new Error('Resposta inválida do Google.');
    const refreshToken = body.refresh_token === undefined ? undefined : texto(body.refresh_token);
    return {accessToken, ...(refreshToken === undefined ? {} : {refreshToken}), expiraEm:Date.now() + expiry * 1000};
  }

  private async requisitar(url: string, init: RequestInit, lerJson = true): Promise<unknown> {
    // Endpoints originate only in this class. Never follow redirects with credentials.
    let response: Response;
    try {
      response = await this.fetcher(url, {...init, redirect:'error', signal:AbortSignal.timeout(15_000)});
    } catch {
      throw new Error('Não foi possível conectar ao Google. Tente novamente.');
    }
    if (response.status !== 200) {
      if (response.status === 401 || response.status === 403) throw new Error('Acesso ao Google recusado. Reconecte sua conta ou confira as permissões.');
      throw new Error('Não foi possível concluir a solicitação ao Google.');
    }
    if (!lerJson) return undefined;
    try { return await response.json(); } catch { throw new Error('Resposta inválida do Google.'); }
  }
}
