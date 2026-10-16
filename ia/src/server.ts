/**
 * Inicializador de runtime do serviço /ia.
 * Vincula a porta HTTP (padrão 3002) e gerencia os sinais de finalização graciosa.
 */

import { carregarIaConfig } from './config/ia-config.js';
import { criarAppIa } from './app.js';

const config = carregarIaConfig();
const app = criarAppIa(config);

const server = app.listen(config.porta, () => {
  console.info(`[Serviço de IA] Rodando na porta ${config.porta}`);
});

const finalizar = () => {
  console.info('[Serviço de IA] Encerrando graciosamente...');
  server.close(() => {
    console.info('[Serviço de IA] Encerrado com sucesso.');
    process.exit(0);
  });
};

process.on('SIGTERM', finalizar);
process.on('SIGINT', finalizar);
