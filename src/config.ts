/**
 * Leitura e validação das variáveis de ambiente de infraestrutura e segredos.
 * Este é o único módulo autorizado a interagir com process.env para segredos,
 * isolando regras de negócio e permitindo fallback seguro para desenvolvimento.
 */

import 'dotenv/config';

export interface AppConfig {
  porta: number;
  host: string;
  databaseUrl: string;
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
  encryptionKey: string;
  appPepper: string;
  evolutionApiUrl: string;
  evolutionGlobalApiKey: string;
  evolutionWebhookSecret: string;
  evolutionOfficialInstanceName: string;
  resendApiKey?: string;
  devEmailAlerta?: string;
  groqApiKey: string;
  groqModel: string;
  agenteFiscalAtivo?: boolean;
  preparacaoFiscalAtiva?: boolean;
  treinoOnboardingAtivo?: boolean;
  comparacaoFiscalAtiva?: boolean;
  desenvolvedorFiscalAtivo?: boolean;
  desenvolvedorFiscalToken?: string;
  chromiumExecutablePath?: string;
  googleClientId?: string;
  googleClientSecret?: string;
  googleRedirectUri?: string;
  googleApiKey?: string;
  googleAppId?: string;
  meuDanfeApiKey?: string;
  hubDesenvolvedorToken?: string;
  stripeSecretKey?: string;
  stripePublishableKey?: string;
  stripePriceId?: string;
  stripeWebhookSecret?: string;
}

export function carregarConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  if (env['PREPARACAO_FISCAL_ATIVA'] === 'true' && env['AGENTE_FISCAL_ATIVO'] !== 'true') {
    throw new Error('PREPARACAO_FISCAL_ATIVA requer AGENTE_FISCAL_ATIVO para tratar pendências sem retentativas cegas.');
  }
  if (env['DESENVOLVEDOR_FISCAL_ATIVO'] === 'true' && (!env['DESENVOLVEDOR_FISCAL_TOKEN'] ||
      env['DESENVOLVEDOR_FISCAL_TOKEN'].trim() !== env['DESENVOLVEDOR_FISCAL_TOKEN'] ||
      env['DESENVOLVEDOR_FISCAL_TOKEN'].length < 32 || env['DESENVOLVEDOR_FISCAL_TOKEN'].length > 256)) {
    throw new Error('DESENVOLVEDOR_FISCAL_TOKEN de 32 a 256 caracteres é obrigatório para ativar a área de teste.');
  }
  return {
    porta: Number.parseInt(env['PORT'] || '3000', 10),
    host: env['HOST'] || '0.0.0.0',
    databaseUrl: env['DATABASE_URL'] || '',
    supabaseUrl: env['SUPABASE_URL'] || '',
    supabaseServiceRoleKey: env['SUPABASE_SERVICE_ROLE_KEY'] || '',
    encryptionKey: env['ENCRYPTION_KEY'] || 'dev_secret_key_default_32_chars_ok',
    appPepper: env['APP_PEPPER'] || 'dev_pepper_default_secret_string',
    evolutionApiUrl: env['EVOLUTION_API_URL'] || '',
    evolutionGlobalApiKey: env['EVOLUTION_GLOBAL_API_KEY'] || '',
    evolutionWebhookSecret: env['EVOLUTION_WEBHOOK_SECRET'] || '',
    evolutionOfficialInstanceName: env['EVOLUTION_OFFICIAL_INSTANCE_NAME'] || 'notomed_oficial',
    resendApiKey: env['RESEND_API_KEY'],
    devEmailAlerta: env['DEV_EMAIL_ALERTA'],
    groqApiKey: env['GROQ_API_KEY'] || '',
    groqModel: env['GROQ_MODEL'] || 'openai/gpt-oss-120b',
    agenteFiscalAtivo: env['AGENTE_FISCAL_ATIVO'] === 'true',
    preparacaoFiscalAtiva: env['PREPARACAO_FISCAL_ATIVA'] === 'true',
    treinoOnboardingAtivo: env['TREINO_ONBOARDING_ATIVO'] === 'true',
    comparacaoFiscalAtiva: env['COMPARACAO_FISCAL_ATIVA'] === 'true',
    desenvolvedorFiscalAtivo: env['DESENVOLVEDOR_FISCAL_ATIVO'] === 'true',
    desenvolvedorFiscalToken: env['DESENVOLVEDOR_FISCAL_TOKEN'],
    chromiumExecutablePath: env['CHROMIUM_EXECUTABLE_PATH'] || '/usr/bin/chromium-browser',
    googleClientId: env['GOOGLE_CLIENT_ID'],
    googleClientSecret: env['GOOGLE_CLIENT_SECRET'],
    googleRedirectUri: env['GOOGLE_REDIRECT_URI'],
    googleApiKey: env['GOOGLE_API_KEY'],
    googleAppId: env['GOOGLE_APP_ID'],
    meuDanfeApiKey: env['MEU_DANFE_API_KEY'],
    hubDesenvolvedorToken: env['HUB_DESENVOLVEDOR_TOKEN'],
    stripeSecretKey: env['STRIPE_SECRET_KEY'],
    stripePublishableKey: env['NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY'],
    stripePriceId: env['STRIPE_PRICE_ID'] || 'price_1UFaloBMqkVPUWioDTWXIPv6',
    stripeWebhookSecret: env['STRIPE_WEBHOOK_SECRET']
  };
}

export const config = carregarConfig();
