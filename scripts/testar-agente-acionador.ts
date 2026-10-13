/**
 * Script de teste do Agente Fiscal Acionador de Notas.
 * Realiza a varredura ativa de hoje para trás no histórico de conversas do médico,
 * identifica um candidato real sem nota emitida, correlaciona a data da consulta
 * agendada antes do pagamento e envia a solicitação humanizada de aprovação ao médico.
 */

import pg from 'pg';
import dotenv from 'dotenv';
import { PostgresCandidatosNotaRepositorio } from '../src/agente-fiscal/io/postgres-candidatos-nota-repositorio.js';
import { varrerESolicitarAprovacao } from '../src/agente-fiscal/fluxos/varrer-e-solicitar-aprovacao.js';
import { EvolutionApiClient } from '../src/io/evolution/evolution-api-client.js';

dotenv.config();

const DATABASE_URL = process.env.DATABASE_URL;
const APP_PEPPER = process.env.APP_PEPPER || 'pepper-padrao';
const EVOLUTION_API_URL = process.env.EVOLUTION_API_URL?.includes('evolution:8080')
  ? 'https://notomed-evolution.6t32my.easypanel.host'
  : (process.env.EVOLUTION_API_URL || 'https://notomed-evolution.6t32my.easypanel.host');
const EVOLUTION_GLOBAL_API_KEY = process.env.EVOLUTION_GLOBAL_API_KEY || '';
const EVOLUTION_OFFICIAL_INSTANCE_NAME = process.env.EVOLUTION_OFFICIAL_INSTANCE_NAME || 'notomed_oficial';

async function main() {
  console.log('=== Iniciando Calibração e Teste do Agente Acionador de Notas ===\n');

  const pool = new pg.Pool({ connectionString: DATABASE_URL });

  // 1. Localizar o médico cadastrado (Dra. Bruna Botter / telefone 51981936133)
  const medRes = await pool.query(`
    select m.id, m.nome_completo, u.telefone
    from medicos m
    join usuarios u on u.id = m.usuario_id
    where u.telefone like '%51981936133%' or u.telefone like '%5181936133%'
    limit 1
  `);

  let medico = medRes.rows[0];
  if (!medico) {
    const medFallback = await pool.query(`select m.id, m.nome_completo, u.telefone from medicos m join usuarios u on u.id = m.usuario_id limit 1`);
    medico = medFallback.rows[0];
  }

  if (!medico) {
    console.error('Nenhum médico encontrado no banco.');
    await pool.end();
    return;
  }

  console.log(`Médico identificado: ${medico.nome_completo} (ID: ${medico.id}, Telefone: ${medico.telefone})`);

  // 2. Instanciar Repositório e Adaptador de Mensagens
  const repositorio = new PostgresCandidatosNotaRepositorio(pool, APP_PEPPER);
  const enviadorMensagem = new EvolutionApiClient(
    EVOLUTION_API_URL,
    EVOLUTION_GLOBAL_API_KEY,
    EVOLUTION_OFFICIAL_INSTANCE_NAME
  );

  // 3. Executar a varredura com iniciativa do agente
  console.log('Executando varredura ativa de conversas e comprovantes...');
  
  // Opcional: passar telefone de destino caso deseje receber no número oficial do Noto para o teste
  const telefoneDestino = process.argv[2] || medico.telefone || '5551993527271';

  const resultado = await varrerESolicitarAprovacao(medico.id, {
    repositorio,
    enviarMensagem: enviadorMensagem,
    instanciaNome: EVOLUTION_OFFICIAL_INSTANCE_NAME,
    telefoneDestinoSobrescrito: telefoneDestino
  });

  console.log('\n--- Resultado da Operação do Agente ---');
  if (!resultado.ok) {
    console.error('Falha na execução:', resultado.motivo, resultado.erro || '');
  } else if (resultado.status === 'nenhum_candidato_pendente') {
    console.log('Status:', resultado.mensagem);
  } else if (resultado.status === 'candidato_encontrado_e_notificado' || resultado.status === 'candidato_encontrado_pendente_conexao_whatsapp') {
    console.log('✅ Candidato encontrado com inteligência contextual e persistido na memória!\n');
    console.log('Dados Extraídos com Inteligência Contextual:');
    console.log(`- Nome do Paciente: ${resultado.candidato.pacienteNome}`);
    console.log(`- WhatsApp do Paciente: ${resultado.candidato.pacienteTelefone}`);
    console.log(`- Valor do Pagamento: R$ ${resultado.candidato.valorFormatado}`);
    console.log(`- Data da Consulta (Agendada antes do pagamento): ${resultado.candidato.dataConsulta}`);
    console.log(`- Evidência da Consulta: "${resultado.candidato.origemEvidencia.trechoConsulta || 'Identificada no contexto anterior'}"`);
    console.log(`- Evidência do Pagamento: "${resultado.candidato.origemEvidencia.trechoPagamento}"\n`);
    console.log('Mensagem Humanizada Preparada para o Médico:');
    console.log(`"${resultado.mensagemEnviada}"\n`);
    console.log(`Destinatário (WhatsApp): ${resultado.destinatarioTelefone}`);
    if (resultado.status === 'candidato_encontrado_pendente_conexao_whatsapp') {
      console.log(`ℹ Aviso de Entrega: ${(resultado as any).avisoConexao}`);
    } else {
      console.log('✅ Mensagem entregue com sucesso via WhatsApp!');
    }
    console.log('✅ Estado salvo na memória contextual para aguardar a aprovação do médico.');
  }

  await pool.end();
}

main().catch((err) => {
  console.error('Erro no script de teste:', err);
  process.exit(1);
});
