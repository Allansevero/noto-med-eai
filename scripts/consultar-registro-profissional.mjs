import { config } from '../src/config.js';
import { GoogleConsultaRegistro } from '../src/cadastro/google-registro.js';

const nome = process.argv.slice(2).join(' ').trim();
if (!nome || process.argv.includes('--help')) {
  console.log('Uso: npm run consultar:registro -- "Nome completo do médico"');
  process.exitCode = nome ? 0 : 2;
} else {
  console.error('A consulta Google/Serper pode consumir créditos. O comando não grava no banco.');
  const consulta = new GoogleConsultaRegistro({
    serperApiKey: config.serperApiKey,
    nvidiaApiKey: config.nvidiaApiKey,
    modelo: config.nvidiaModel
  });
  const resultado = await consulta.buscar(nome);
  process.stdout.write(`${JSON.stringify(resultado, null, 2)}\n`);
  if (resultado.estado !== 'consultado') process.exitCode = 1;
}
