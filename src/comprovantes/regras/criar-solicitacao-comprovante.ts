/**
 * Criação de solicitação de nota fiscal a partir de comprovante de pagamento validado.
 * Isola as regras de vinculação do comprovante à solicitação fiscal, verificação de CPF
 * do paciente (com solicitação humanizada direta se faltar) e aplicação da preferência
 * de data de consulta configurada pelo médico.
 */

import type pg from 'pg';
import type { ComprovantePendenteEmissao } from './filtrar-comprovantes-sem-nota.js';
import type { EnviarMensagemPaciente } from '../../whatsapp/enviar-mensagem-paciente.js';

export interface EntradaCriarSolicitacaoComprovante {
  medicoId: string;
  pacienteId: string;
  instanciaNome: string;
  comprovante: ComprovantePendenteEmissao;
  preferenciaData?: 'mesma_do_comprovante' | 'perguntar_uma_a_uma';
}

export interface ResultadoCriarSolicitacaoComprovante {
  solicitacaoId: string;
  aguardandoCpf: boolean;
  aguardandoDataConsulta: boolean;
  mensagemCpfEnviada: boolean;
}

export async function criarSolicitacaoComprovante(
  pool: pg.Pool,
  enviadorMensagem: EnviarMensagemPaciente,
  entrada: EntradaCriarSolicitacaoComprovante
): Promise<ResultadoCriarSolicitacaoComprovante> {
  const client = await pool.connect();
  try {
    await client.query('begin');

    // 1. Verifica se médico possui CRM cadastrado
    const medRes = await client.query('select crm from medicos where id = $1', [entrada.medicoId]);
    const crmMedico = medRes.rows[0]?.crm;
    const aguardandoDadosProfissionais = !crmMedico;

    // 2. Busca dados do paciente
    const pacRes = await client.query(
      'select id, nome, telefone, cpf_cnpj_hash from pacientes where id = $1 and medico_id = $2',
      [entrada.pacienteId, entrada.medicoId]
    );
    const paciente = pacRes.rows[0];
    if (!paciente) {
      throw new Error(`Paciente ${entrada.pacienteId} não encontrado para o médico ${entrada.medicoId}`);
    }

    const temCpf = Boolean(paciente.cpf_cnpj_hash);
    let mensagemCpfEnviada = false;

    // 3. Se faltar CPF, dispara mensagem direta (parecendo o médico, sem dizer que é IA)
    if (!temCpf && paciente.telefone) {
      const primeiroNome = paciente.nome?.trim().split(/\s+/)[0] || '';
      const saudacao = primeiroNome ? `Olá, ${primeiroNome}!` : 'Olá!';
      const texto = `${saudacao} Para eu emitir sua nota fiscal da consulta, você poderia me confirmar seu CPF por favor?`;

      try {
        const envio = await enviadorMensagem.enviarTexto({
          instanciaNome: entrada.instanciaNome,
          contatoTelefone: paciente.telefone,
          texto
        });
        mensagemCpfEnviada = envio.sucesso === true;

        // Marca a conversa como aguardando CPF
        await client.query(
          `update whatsapp_conversas
           set aguardando_cpf_desde = now()
           where paciente_id = $1 and medico_id = $2`,
          [entrada.pacienteId, entrada.medicoId]
        );
      } catch (err) {
        console.warn('[criarSolicitacaoComprovante] Erro ao enviar pedido de CPF:', err);
      }
    }

    // 4. Determina regras de data de consulta
    const preferencia = entrada.preferenciaData ?? 'mesma_do_comprovante';
    const dataConsulta = entrada.comprovante.dataPagamento || new Date().toISOString().slice(0, 10);
    const aguardandoData = preferencia === 'perguntar_uma_a_uma';
    const datasTexto = aguardandoData ? null : dataConsulta;

    // 5. Insere solicitação de nota
    const sqlSolicitacao = `
      insert into solicitacoes_nota (
        medico_id, paciente_id, xdesc_serv, valor_servico_centavos, ctrib_nac,
        fila, status, origem, aguardando_data_consulta, aguardando_dados_profissionais, datas_consulta_texto
      )
      values ($1, $2, $3, $4, '040101', null, 'pendente', 'automatico_pagamento', $5, $6, $7)
      returning id
    `;

    const { rows } = await client.query(sqlSolicitacao, [
      entrada.medicoId,
      entrada.pacienteId,
      'Consulta médica',
      entrada.comprovante.valorCentavos,
      aguardandoData,
      aguardandoDadosProfissionais,
      datasTexto
    ]);

    const solicitacaoId = rows[0].id;

    // 6. Vincula serviço fiscal se houver
    await client.query(
      `with candidatos as (
        select f.*, count(*) over () as quantidade from medico_servicos_fiscais f
        where f.medico_id = $2 and f.padrao and f.ativo and f.ctrib_nac = '040101')
      update solicitacoes_nota s set servico_fiscal_id = f.id, cnbs = f.cnbs
      from candidatos f where s.id = $1 and s.medico_id = $2 and f.quantidade = 1`,
      [solicitacaoId, entrada.medicoId]
    );

    await client.query('commit');

    return {
      solicitacaoId,
      aguardandoCpf: !temCpf,
      aguardandoDataConsulta: aguardandoData,
      mensagemCpfEnviada
    };
  } catch (erro) {
    await client.query('rollback');
    throw erro;
  } finally {
    client.release();
  }
}
