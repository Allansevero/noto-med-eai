import dotenv from 'dotenv';
dotenv.config();

async function main() {
  const baseUrl = process.env.EVOLUTION_API_URL.replace(/\/+$/, '');
  const apiKey = process.env.EVOLUTION_GLOBAL_API_KEY;
  const appUrl = process.env.APP_URL || 'https://notomed-web.6t32my.easypanel.host';
  const webhookUrl = `${appUrl}/webhook/evolution`;
  const webhookSecret = process.env.EVOLUTION_WEBHOOK_SECRET || apiKey;

  console.log('Configurando webhook para notomed_oficial...');
  console.log('URL de destino:', webhookUrl);

  const res = await fetch(`${baseUrl}/webhook/set/notomed_oficial`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: apiKey
    },
    body: JSON.stringify({
      webhook: {
        enabled: true,
        url: webhookUrl,
        headers: {
          'apikey': apiKey,
          'x-webhook-secret': webhookSecret
        },
        webhookByEvents: false,
        events: ['MESSAGES_UPSERT', 'CONNECTION_UPDATE']
      }
    })
  });

  const data = await res.json();
  console.log('Resposta Evolution:', JSON.stringify(data, null, 2));

  // Verifica
  const check = await fetch(`${baseUrl}/webhook/find/notomed_oficial`, {
    headers: { apikey: apiKey }
  });
  console.log('Webhook atual no Evolution:', await check.json());
}

main().catch(console.error);
