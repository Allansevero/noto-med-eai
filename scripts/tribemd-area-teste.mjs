// Processo independente: não importa server/config do Noto e não conecta banco/IA/WhatsApp.
import { criarAreaTesteTribemd } from '../src/desenvolvedor/tribemd-teste-router.ts';
const obrigatoria=n=>{const v=process.env[n];if(!v)throw Error(`${n} ausente`);return v;};
const area=criarAreaTesteTribemd({token:obrigatoria('TRIBEMD_TESTE_TOKEN'),chave:obrigatoria('TRIBEMD_TESTE_CHAVE'),
 diretorio:obrigatoria('TRIBEMD_TESTE_DIRETORIO'),origem:obrigatoria('TRIBEMD_TESTE_ORIGEM'),
 chromium:process.env.CHROMIUM_EXECUTABLE_PATH||'/usr/bin/chromium-browser',xvfb:process.env.XVFB_EXECUTABLE_PATH});
const porta=Number(process.env.TRIBEMD_TESTE_PORTA||3100);
if(!Number.isInteger(porta)||porta<1||porta>65535)throw Error('TRIBEMD_TESTE_PORTA invalida');
const server=area.app.listen(porta,process.env.TRIBEMD_TESTE_HOST||'127.0.0.1',()=>console.info('[TribeMD teste] área iniciada; acesso protegido; nenhum dado de paciente em log.'));
let saindo=false;
async function sair(){if(saindo)return;saindo=true;server.close();await area.encerrar();server.closeAllConnections();}
for(const s of ['SIGINT','SIGTERM'])process.on(s,()=>{void sair().catch(()=>{process.exitCode=1;});});
