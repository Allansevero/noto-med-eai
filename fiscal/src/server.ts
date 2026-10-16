/**
 * Inicializador de runtime do serviço /fiscal.
 * Responsável exclusivo por vincular a porta HTTP e gerenciar sinais de processo.
 */

import { carregarFiscalConfig } from './config/fiscal-config.js';
import { criarAppFiscal } from './app.js';

const config = carregarFiscalConfig();
const app = criarAppFiscal(config);

const server = app.listen(config.porta, () => {
  console.info(`[Serviço Fiscal] Rodando na porta ${config.porta}`);
});

const finalizar = () => {
  console.info('[Serviço Fiscal] Encerrando graciosamente...');
  server.close(() => {
    console.info('[Serviço Fiscal] Encerrado com sucesso.');
    process.exit(0);
  });
};

process.on('SIGTERM', finalizar);
process.on('SIGINT', finalizar);
