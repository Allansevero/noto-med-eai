/**
 * Configurações do serviço fiscal isolado.
 * Centraliza a leitura de variáveis de ambiente do app fiscal,
 * garantindo que valores padrão seguros sejam aplicados.
 */

export interface FiscalConfig {
  porta: number;
  tokenInterno: string;
  databaseUrl?: string;
  chaveCriptografiaCertificado: string;
}

export function carregarFiscalConfig(env: NodeJS.ProcessEnv = process.env): FiscalConfig {
  return {
    porta: Number(env['PORT'] || env['FISCAL_PORT'] || 3001),
    tokenInterno: env['INTERNAL_FISCAL_TOKEN'] || env['FISCAL_INTERNAL_SECRET'] || 'dev-fiscal-token-segredo',
    databaseUrl: env['DATABASE_URL'],
    chaveCriptografiaCertificado: env['ENCRYPTION_KEY'] || env['FISCAL_ENCRYPTION_KEY'] || 'dev-chave-cripto-fiscal-32chars!!'
  };
}
