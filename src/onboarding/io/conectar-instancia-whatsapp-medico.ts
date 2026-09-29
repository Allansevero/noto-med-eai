/**
 * Gerenciador de conexão da instância individual do WhatsApp do médico na Evolution API.
 * Cria a instância dedicada, configura os webhooks da aplicação Notomed e devolve
 * o QR Code (para desktop) ou Pairing Code (para celular) nativo (seção 1 e 7 do plano).
 */

import type pg from 'pg';
import { configurarSincronizacaoHistorico } from './configurar-sincronizacao-historico.js';

export type IniciarConexaoWhatsappInput = {
  medicoId: string;
  telefoneConsultorio?: string;
  evolutionUrl: string;
  evolutionApiKey: string;
  appWebhookUrl: string;
  webhookSecret: string;
};

export type ResultadoConexaoWhatsapp = {
  ok: boolean;
  nomeInstancia: string;
  status: string;
  qrcodeBase64?: string | null;
  pairingCode?: string | null;
};

function formatarTelefonePareamento(telefone?: string): string | undefined {
  const digitos = telefone?.replace(/\D/g, '') || '';
  if (!digitos) return undefined;
  if ((digitos.length === 10 || digitos.length === 11) && !digitos.startsWith('55')) {
    return `55${digitos}`;
  }
  return digitos;
}

export async function conectarInstanciaWhatsappMedico(
  pool: pg.Pool,
  input: IniciarConexaoWhatsappInput
): Promise<ResultadoConexaoWhatsapp> {
  const { medicoId, evolutionUrl, evolutionApiKey, appWebhookUrl, webhookSecret } = input;
  const baseUrl = evolutionUrl.replace(/\/+$/, '');
  const nomeInstancia = `medico_${medicoId.replace(/-/g, '').slice(0, 12)}`;
  let telefonePareamento = formatarTelefonePareamento(input.telefoneConsultorio);

  if (!telefonePareamento) {
    const telefoneSalvo = await pool.query(
      `select u.telefone
       from medicos m
       join usuarios u on u.id = m.usuario_id
       where m.id = $1
       limit 1`,
      [medicoId]
    );
    telefonePareamento = formatarTelefonePareamento(telefoneSalvo.rows[0]?.telefone);
  }

  let qrcodeBase64: string | null = null;
  let pairingCode: string | null = null;
  let status = 'connecting';
  let instanciaCriadaComHistorico = false;

  // 1. Tenta criar a instância na Evolution API (ou conectar se já existir)
  try {
    const bodyCreate: Record<string, any> = {
      instanceName: nomeInstancia,
      integration: 'WHATSAPP-BAILEYS',
      qrcode: !telefonePareamento,
      syncFullHistory: true
    };
    if (telefonePareamento) {
      bodyCreate.number = telefonePareamento;
    }

    const resCreate = await fetch(`${baseUrl}/instance/create`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: evolutionApiKey
      },
      body: JSON.stringify(bodyCreate)
    });

    const dataCreate = await resCreate.json().catch(() => ({}));
    instanciaCriadaComHistorico = resCreate.ok;
    if (dataCreate.qrcode?.base64) {
      qrcodeBase64 = dataCreate.qrcode.base64;
    }
    if (dataCreate.pairingCode) {
      pairingCode = dataCreate.pairingCode;
    }
  } catch (err) {
    // Continua para tentar /instance/connect caso já exista
  }

  // Garante a opção também em instâncias criadas antes desta implementação.
  let historicoConfigurado = false;
  try {
    historicoConfigurado = await configurarSincronizacaoHistorico({
      baseUrl,
      nomeInstancia,
      apiKey: evolutionApiKey
    });
  } catch {
    historicoConfigurado = false;
  }
  if (!instanciaCriadaComHistorico && !historicoConfigurado) {
    throw new Error(`Não foi possível ativar a sincronização de histórico da instância ${nomeInstancia}`);
  }

  // 2. Com telefone cadastrado, solicita explicitamente o codigo de pareamento.
  // Sem telefone, preserva o QR Code como alternativa.
  if ((telefonePareamento && !pairingCode) || (!telefonePareamento && !qrcodeBase64 && !pairingCode)) {
    try {
      const urlConnect = telefonePareamento
        ? `${baseUrl}/instance/connect/${nomeInstancia}?number=${telefonePareamento}`
        : `${baseUrl}/instance/connect/${nomeInstancia}`;

      const resConnect = await fetch(urlConnect, {
        method: 'GET',
        headers: { apikey: evolutionApiKey }
      });
      const dataConnect = await resConnect.json().catch(() => ({}));
      pairingCode = dataConnect.pairingCode || null;
      qrcodeBase64 = pairingCode ? null : (dataConnect.base64 || dataConnect.qrcode?.base64 || qrcodeBase64);
      if (dataConnect.instance?.state === 'open') {
        status = 'open';
      }
    } catch (err) {
      // Ignora falha de rede da Evolution se indisponível momentaneamente
    }
  }

  // 3. Normaliza prefixo base64 se presente
  if (qrcodeBase64 && !qrcodeBase64.startsWith('data:image')) {
    qrcodeBase64 = `data:image/png;base64,${qrcodeBase64}`;
  }

  // 4. Se não veio QR code, verifica se já está conectado na Evolution
  if (!qrcodeBase64 && !pairingCode && status !== 'open') {
    try {
      const resState = await fetch(`${baseUrl}/instance/connectionState/${nomeInstancia}`, {
        headers: { apikey: evolutionApiKey }
      });
      const dataState = await resState.json().catch(() => ({}));
      if (dataState.instance?.state === 'open') {
        status = 'open';
      }
    } catch {
      // Ignora erro de rede momentâneo
    }
  }

  // 5. Configura o webhook na Evolution para receber os comandos /agendado e /emissao
  let webhookConfigurado = false;
  try {
    const resWebhook = await fetch(`${baseUrl}/webhook/set/${nomeInstancia}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: evolutionApiKey
      },
      body: JSON.stringify({
        webhook: {
          enabled: true,
          url: `${appWebhookUrl.replace(/\/+$/, '')}/webhook/evolution`,
          headers: {
            'apikey': evolutionApiKey,
            'x-webhook-secret': webhookSecret || evolutionApiKey
          },
          webhookByEvents: false,
          events: [
            'MESSAGES_SET',
            'MESSAGES_UPSERT',
            'CHATS_SET',
            'CONTACTS_SET',
            'CONNECTION_UPDATE'
          ]
        }
      })
    });
    webhookConfigurado = resWebhook.ok || resWebhook.status === 201;
  } catch (err) {
    // Falha silenciosa no setWebhook
  }

  // 6. Salva ou atualiza a instância em whatsapp_instancias (coluna status com enum status_conexao_whatsapp)
  const statusDb = status === 'open' ? 'conectado' : 'pendente';
  const conectadoEm = status === 'open' ? new Date() : null;
  const sql = `
    insert into whatsapp_instancias (
      medico_id, conta_id, nome_instancia, oficial, status, conectado_em, webhook_configurado
    ) values (
      $1, (select conta_id from medicos where id = $1), $2, false, $3::status_conexao_whatsapp, $4, $5
    )
    on conflict (nome_instancia) do update set
      status = excluded.status,
      medico_id = excluded.medico_id,
      conta_id = coalesce(excluded.conta_id, whatsapp_instancias.conta_id),
      conectado_em = coalesce(excluded.conectado_em, whatsapp_instancias.conectado_em),
      webhook_configurado = excluded.webhook_configurado
    returning id
  `;
  await pool.query(sql, [medicoId, nomeInstancia, statusDb, conectadoEm, webhookConfigurado]);


  return {
    ok: true,
    nomeInstancia,
    status,
    qrcodeBase64,
    pairingCode
  };
}
