/**
 * Consulta online dos registros profissionais do médico (CRM e RQE).
 * Porta desacoplada da rede para permitir testes puros e busca pública (CFM/CRM).
 */

export interface DadosMedicoOnline {
  nomeCompleto: string;
  crm: string;
  uf: string;
  rqe?: string | null;
  especialidade?: string | null;
  situacao?: string;
}

export interface BuscarMedicoOnlineProvider {
  buscarPorNome(nomeCompleto: string, uf?: string): Promise<DadosMedicoOnline | null>;
}

export class CfmBuscarMedicoOnlineProvider implements BuscarMedicoOnlineProvider {
  constructor(
    private readonly fetchFn: typeof fetch = fetch,
    private readonly apiUrl?: string
  ) {}

  async buscarPorNome(nomeCompleto: string, uf?: string): Promise<DadosMedicoOnline | null> {
    const nomeLimpo = nomeCompleto.trim();
    if (!nomeLimpo || nomeLimpo.split(/\s+/).length < 2) {
      return null;
    }

    if (!this.apiUrl) {
      // Quando não há URL de API externa configurada, retorna null de forma segura
      // permitindo que o Noto peça o CRM diretamente ao médico na conversa.
      return null;
    }

    try {
      const url = new URL(this.apiUrl);
      url.searchParams.set('nome', nomeLimpo);
      if (uf) url.searchParams.set('uf', uf.toUpperCase());

      const resp = await this.fetchFn(url.toString(), {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(10_000)
      });

      if (!resp.ok) return null;
      const json = await resp.json() as any;
      if (!json || !json.crm) return null;

      return {
        nomeCompleto: json.nomeCompleto || nomeLimpo,
        crm: String(json.crm),
        uf: String(json.uf || uf || 'SP').toUpperCase(),
        rqe: json.rqe ? String(json.rqe) : null,
        especialidade: json.especialidade ? String(json.especialidade) : null,
        situacao: json.situacao || 'Ativo'
      };
    } catch {
      return null;
    }
  }
}
