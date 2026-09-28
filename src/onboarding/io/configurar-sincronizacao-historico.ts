/**
 * Ativa o histórico completo sem apagar as demais preferências de uma
 * instância já existente. A Evolution exige o objeto inteiro no endpoint de
 * settings, por isso os valores atuais são lidos e reaplicados.
 */

export async function configurarSincronizacaoHistorico(params: {
  baseUrl: string;
  nomeInstancia: string;
  apiKey: string;
}): Promise<boolean> {
  const atuais = await buscarConfiguracaoAtual(params);
  const resposta = await fetch(`${params.baseUrl}/settings/set/${params.nomeInstancia}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: params.apiKey
    },
    body: JSON.stringify({
      rejectCall: lerBooleano(atuais, 'rejectCall', 'reject_call', false),
      msgCall: lerTexto(atuais, 'msgCall', 'msg_call'),
      groupsIgnore: lerBooleano(atuais, 'groupsIgnore', 'groups_ignore', true),
      alwaysOnline: lerBooleano(atuais, 'alwaysOnline', 'always_online', false),
      readMessages: lerBooleano(atuais, 'readMessages', 'read_messages', false),
      readStatus: lerBooleano(atuais, 'readStatus', 'read_status', false),
      syncFullHistory: true
    })
  });

  return resposta.ok;
}

async function buscarConfiguracaoAtual(params: {
  baseUrl: string;
  nomeInstancia: string;
  apiKey: string;
}): Promise<Record<string, unknown>> {
  try {
    const resposta = await fetch(`${params.baseUrl}/settings/find/${params.nomeInstancia}`, {
      headers: { apikey: params.apiKey }
    });
    if (!resposta.ok) return {};
    const dados = await resposta.json();
    return extrairObjetoConfiguracao(dados);
  } catch {
    return {};
  }
}

function extrairObjetoConfiguracao(valor: unknown): Record<string, unknown> {
  if (!valor || typeof valor !== 'object') return {};
  const objeto = valor as Record<string, unknown>;
  const settings = objeto['settings'];
  if (!settings || typeof settings !== 'object') return objeto;
  const settingsInterno = (settings as Record<string, unknown>)['settings'];
  return settingsInterno && typeof settingsInterno === 'object'
    ? settingsInterno as Record<string, unknown>
    : settings as Record<string, unknown>;
}

function lerBooleano(
  objeto: Record<string, unknown>,
  chaveCamel: string,
  chaveSnake: string,
  padrao: boolean
): boolean {
  const valor = objeto[chaveCamel] ?? objeto[chaveSnake];
  return typeof valor === 'boolean' ? valor : padrao;
}

function lerTexto(objeto: Record<string, unknown>, chaveCamel: string, chaveSnake: string): string {
  const valor = objeto[chaveCamel] ?? objeto[chaveSnake];
  return typeof valor === 'string' ? valor : '';
}
