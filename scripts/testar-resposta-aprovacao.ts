/**
 * Script de teste da Resposta do Médico ao Agente Acionador.
 * Simula a resposta afirmativa do médico ("Pode emitir!"), recuperando
 * o candidato da memória contextual e enfileirando a nota fiscal.
 */

import pg from 'pg';
import dotenv from 'dotenv';
import { PostgresCandidatosNotaRepositorio } from '../src/agente-fiscal/io/postgres-candidatos-nota-repositorio.js';
import { processarRespostaAprovacaoMedico } from '../src/agente-fiscal/fluxos/processar-resposta-aprovacao-medico.js';

dotenv.config();

const DATABASE_URL = process.env.DATABASE_URL;
const APP_PEPPER = process.env.APP_PEPPER || 'pepper-padrao';

async function main() {
  console.log('=== Testando Processamento da Resposta do Médico com Memória Contextual ===\n');

  const pool = new pg.Pool({ connectionString: DATABASE_URL });
  const medicoId = '423647ba-bace-49b8-8faf-f26201c7cb1e'; // Dra. Bruna Botter

  const repositorio = new PostgresCandidatosNotaRepositorio(pool, APP_PEPPER);

  // 1. Simular mensagem de aprovação enviada pelo médico
  const respostaTexto = process.argv[2] || 'Pode emitir!';
  console.log(`Simulando resposta do médico: "${respostaTexto}"\n`);

  const resultado = await processarRespostaAprovacaoMedico(medicoId, respostaTexto, {
    repositorio
  });

  if (!resultado.processado) {
    console.log('❌ Resposta não processada:', resultado.motivo);
  } else if (resultado.acao === 'emissao_enfileirada') {
    console.log('✅ SUCESSO! Nota fiscal enfileirada a partir da memória contextual:');
    console.log(`- ID da Solicitação de Nota: ${resultado.solicitacaoId}`);
    console.log(`- Paciente: ${resultado.pacienteNome}`);
    console.log(`- Resposta do Noto enviada ao Médico: "${resultado.mensagemResposta}"`);

    // Consultar a solicitação criada no banco
    const sol = await pool.query('select * from solicitacoes_nota where id = $1', [resultado.solicitacaoId]);
    console.log('\nRegistro gravado na fila de emissão:');
    console.log({
      id: sol.rows[0].id,
      medico_id: sol.rows[0].medico_id,
      paciente_id: sol.rows[0].paciente_id,
      valor_servico_centavos: sol.rows[0].valor_servico_centavos,
      xdesc_serv: sol.rows[0].xdesc_serv,
      status: sol.rows[0].status,
      fila: sol.rows[0].fila,
      origem: sol.rows[0].origem
    });
  } else if (resultado.acao === 'emissao_recusada') {
    console.log('ℹ Emissão cancelada conforme solicitação do médico.');
    console.log(`- Resposta do Noto: "${resultado.mensagemResposta}"`);
  }

  await pool.end();
}

main().catch(console.error);
