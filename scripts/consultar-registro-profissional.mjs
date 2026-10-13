import { config } from '../src/config.js';
import { GoogleConsultaRegistro } from '../src/cadastro/google-registro.js';

const args = process.argv.slice(2);
const exibirDiagnostico = args.includes('--diagnostico');
const nome = args.filter(arg => !['--help', '--diagnostico'].includes(arg)).join(' ').trim();
if (!nome || args.includes('--help')) {
  console.log('Uso: npm run consultar:registro -- "Nome completo do médico" [--diagnostico]');
  process.exitCode = args.includes('--help') ? 0 : 2;
} else if (/^CRM\s/iu.test(nome)) {
  console.error('Informe somente o nome completo. O adaptador acrescenta CRM à pesquisa automaticamente.');
  process.exitCode = 2;
} else {
  console.error('A consulta Google/Serper pode consumir créditos. O comando não grava no banco.');
  const diagnostico = [];
  const consulta = new GoogleConsultaRegistro({
    serperApiKey: config.serperApiKey,
    nvidiaApiKey: config.nvidiaApiKey,
    modelo: config.nvidiaModel,
    ...(exibirDiagnostico ? { diagnosticar: evento => diagnostico.push(evento) } : {})
  });
  const resultado = await consulta.buscar(nome);
  process.stdout.write(`${JSON.stringify(exibirDiagnostico ? { ...resultado, diagnostico } : resultado, null, 2)}\n`);
  if (resultado.estado !== 'consultado') process.exitCode = 1;
}
