// Executar no terminal do MESMO container web. Não inicia navegador, IA, banco ou worker.
import 'dotenv/config';
import { validarConfiguracaoTesteTribemd } from '../src/desenvolvedor/tribemd-configuracao.ts';
const resultado=validarConfiguracaoTesteTribemd(process.env);
console.log(JSON.stringify({
 ativo:process.env.TRIBEMD_TESTE_ATIVO==='true',
 configuracaoValida:resultado.ok,
 pendencias:resultado.ok?[]:resultado.pendencias,
},null,2));
