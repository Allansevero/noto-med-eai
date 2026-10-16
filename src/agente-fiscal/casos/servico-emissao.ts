/** Ponte dos casos fiscais para a fila existente, sem liberar outras solicitações. */
import type pg from 'pg';
import { createHmac } from 'node:crypto';
import { gerarHashCpf } from '../../paciente/hash-cpf.js';
import { normalizarTelefone } from '../../paciente/normalizar-telefone.js';
import { validarCpf } from '../../paciente/validar-cpf.js';
import { ehNomeCivilValido } from '../../paciente/regras/validar-nome-civil.js';

export interface CandidatoEmissaoCaso {
  pacienteTelefone: string;
  pacienteNome?: string | null;
  valorCentavos: number;
  dataConsulta?: string | null;
  dataConsultaIso?: string | null;
}
export type CampoFaltanteEmissao = 'cpf' | 'nome' | 'dataConsulta';

function dataIso(valor?: string | null): string | null {
  if (!valor) return null;
  const br = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(valor.trim());
  const iso = br ? `${br[3]}-${br[2]!.padStart(2, '0')}-${br[1]!.padStart(2, '0')}` : valor.trim();
  if (!/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2}))?$/.test(iso)) return null;
  const dia = iso.slice(0, 10);
  const instante = Date.parse(dia);
  if (!Number.isFinite(instante) || new Date(instante).toISOString().slice(0, 10) !== dia ||
      !Number.isFinite(Date.parse(iso))) return null;
  return dia;
}

export class ServicoEmissaoCasos {
  constructor(
    private readonly pool: pg.Pool,
    private readonly pepper: string,
    private readonly chaveCriptografia: string
  ) {}

  async preparar(medicoId: string, candidato: CandidatoEmissaoCaso): Promise<{
    pacienteId: string; pacienteNome: string; impressaoDados: string; camposFaltantes: CampoFaltanteEmissao[];
  }> {
    const telefone = normalizarTelefone(candidato.pacienteTelefone);
    if (!telefone) throw new Error('Telefone do paciente inválido.');
    const client = await this.pool.connect();
    try {
      await client.query('begin');
      await client.query('select pg_advisory_xact_lock(hashtextextended($1, 0))', [`paciente:${medicoId}:${telefone}`]);
      const { rows } = await client.query(
        `select id, nome, cpf_cnpj_hash, pgp_sym_decrypt(cpf_cnpj_encriptado, $3) as cpf
         from pacientes where medico_id = $1 and
         (case when length(regexp_replace(telefone, '[^0-9]', '', 'g')) in (10, 11)
           then '55' || regexp_replace(telefone, '[^0-9]', '', 'g')
           else regexp_replace(telefone, '[^0-9]', '', 'g') end) = $2
         for update`, [medicoId, telefone, this.chaveCriptografia]);
      if (rows.length > 1) throw new Error('Mais de um paciente corresponde ao telefone; revisar cadastro.');
      let paciente = rows[0];
      if (!paciente) {
        const nome = ehNomeCivilValido(candidato.pacienteNome) ? candidato.pacienteNome!.trim() : null;
        const criado = await client.query(
          `insert into pacientes (medico_id, telefone, nome, origem_cadastro)
           values ($1, $2, $3, 'agente_fiscal')
           on conflict (medico_id, telefone) do update set telefone = excluded.telefone
           returning id, nome, cpf_cnpj_hash, pgp_sym_decrypt(cpf_cnpj_encriptado, $4) as cpf`,
          [medicoId, telefone, nome, this.chaveCriptografia]);
        paciente = criado.rows[0];
      }
      const camposFaltantes: CampoFaltanteEmissao[] = [];
      if (!validarCpf(paciente.cpf)) camposFaltantes.push('cpf');
      if (!ehNomeCivilValido(paciente.nome)) camposFaltantes.push('nome');
      if (!dataIso(candidato.dataConsultaIso || candidato.dataConsulta)) camposFaltantes.push('dataConsulta');
      await client.query('commit');
      return { pacienteId: paciente.id, pacienteNome: paciente.nome ?? '',
        impressaoDados: this.impressaoDados(paciente), camposFaltantes };
    } catch (erro) {
      await client.query('rollback');
      throw erro;
    } finally { client.release(); }
  }

  async salvarDados(params: {
    medicoId: string; pacienteId: string;
    dados: { cpf?: string; nome?: string; dataConsulta?: string };
  }): Promise<void> {
    const { medicoId, pacienteId, dados } = params;
    const cpf = dados.cpf?.replace(/\D/g, '');
    const nome = dados.nome?.trim().replace(/\s+/g, ' ');
    if (dados.cpf !== undefined && !validarCpf(cpf)) throw new Error('CPF inválido.');
    if (dados.nome !== undefined && !ehNomeCivilValido(nome)) throw new Error('Informe o nome civil completo.');
    // A data é persistida no próprio caso pelo coordenador, nunca no paciente.
    if (dados.dataConsulta !== undefined && !dataIso(dados.dataConsulta)) throw new Error('Data da consulta inválida.');
    const { rows } = await this.pool.query(
      `update pacientes set
         nome = coalesce($3, nome),
         nome_validado = case
           when ($3::text is not null and $3 is distinct from nome)
             or ($4::text is not null and $4 is distinct from cpf_cnpj_hash) then false
           else nome_validado end,
         cpf_cnpj_hash = coalesce($4, cpf_cnpj_hash),
         cpf_cnpj_encriptado = case when $5::text is not null then pgp_sym_encrypt($5, $6)
           else cpf_cnpj_encriptado end,
         atualizado_em = now()
       where id = $2 and medico_id = $1 returning id`,
      [medicoId, pacienteId, nome ?? null, cpf ? gerarHashCpf(cpf, this.pepper) : null,
        cpf ?? null, this.chaveCriptografia]);
    if (!rows.length) throw new Error('Paciente não pertence ao médico.');
  }

  async enfileirar(params: {
    medicoId: string; pacienteId: string; casoId: string; candidato: CandidatoEmissaoCaso;
    solicitacaoId?: string | null;
    impressaoDados?: string;
  }): Promise<{ solicitacaoId: string }> {
    const { medicoId, pacienteId, casoId, candidato } = params;
    if (!casoId.trim()) throw new Error('Caso obrigatório para emissão.');
    const referencia = `caso:${casoId}`;
    const client = await this.pool.connect();
    try {
      await client.query('begin');
      await client.query('select pg_advisory_xact_lock(hashtextextended($1, 0))', [`${medicoId}:${referencia}`]);
      const existente = await client.query(
        `select id, paciente_id, origem, referencia_externa, status, fila,
                aguardando_confirmacao_medico, aguardando_cpf_medico,
                bloqueada_por_worker, bloqueada_em
         from solicitacoes_nota
         where medico_id = $1 and (referencia_externa = $2 or id = $3::uuid)
         for update`,
        [medicoId, referencia, params.solicitacaoId ?? null]);
      if (existente.rows.length > 1) throw new Error('Caso possui solicitações conflitantes; revisar vínculo.');
      const vinculada = existente.rows[0];
      if (params.solicitacaoId && vinculada?.id !== params.solicitacaoId) {
        throw new Error('Solicitação vinculada não pertence ao caso deste médico.');
      }
      if (vinculada) {
        if (vinculada.paciente_id !== pacienteId || vinculada.origem !== 'agente_fiscal') {
          throw new Error('Solicitação vinculada não corresponde ao paciente e à origem do caso.');
        }
        if (vinculada.referencia_externa?.startsWith('caso:') && vinculada.referencia_externa !== referencia) {
          throw new Error('Solicitação já vinculada a outro caso.');
        }
        // Repetir a aprovação nunca reabre falhas, emissões ou trabalho já entregue ao worker.
        if ((vinculada.status !== 'pendente' && vinculada.status !== 'pendente_cadastro') ||
            (vinculada.fila !== null && vinculada.fila !== 'pendente_cadastro') ||
            vinculada.bloqueada_por_worker || vinculada.bloqueada_em) {
          await client.query('commit');
          return { solicitacaoId: vinculada.id };
        }
        if (!vinculada.aguardando_confirmacao_medico && !vinculada.aguardando_cpf_medico) {
          throw new Error('Solicitação pendente não está aguardando aprovação ou CPF deste fluxo.');
        }
      }
      const dia = dataIso(candidato.dataConsultaIso || candidato.dataConsulta);
      if (!dia) throw new Error('Data da consulta inválida.');
      if (!Number.isSafeInteger(candidato.valorCentavos) || candidato.valorCentavos <= 0 || candidato.valorCentavos > 2147483647) {
        throw new Error('Valor do serviço inválido.');
      }
      const pacientes = await client.query(
        `select nome, telefone, cpf_cnpj_hash, pgp_sym_decrypt(cpf_cnpj_encriptado, $3) as cpf
         from pacientes where medico_id = $1 and id = $2 for update`,
        [medicoId, pacienteId, this.chaveCriptografia]);
      const paciente = pacientes.rows[0];
      if (!paciente || !normalizarTelefone(candidato.pacienteTelefone) ||
          normalizarTelefone(paciente.telefone) !== normalizarTelefone(candidato.pacienteTelefone)) {
        throw new Error('Paciente não corresponde ao caso deste médico.');
      }
      if (params.impressaoDados !== undefined && params.impressaoDados !== this.impressaoDados(paciente)) {
        throw new Error('CADASTRO_ALTERADO: nome ou CPF do paciente mudou após a pergunta; solicite nova aprovação.');
      }
      if (!validarCpf(paciente.cpf) || !ehNomeCivilValido(paciente.nome)) throw new Error('Cadastro fiscal do paciente incompleto.');
      const servicos = await client.query(
        `select f.id, f.ctrib_nac, f.cnbs, f.xdesc_serv, p.confirmado_pelo_medico,
                p.cclass_trib_padrao, p.cind_op_padrao
         from medico_servicos_fiscais f
         join medico_perfil_fiscal p on p.medico_id = f.medico_id
         where f.medico_id = $1 and f.ativo = true and f.padrao = true
         for share of f, p`, [medicoId]);
      const fiscal = servicos.rows[0];
      if (servicos.rows.length !== 1 || !fiscal.confirmado_pelo_medico ||
          !/^\d{6}$/.test(fiscal.ctrib_nac) || !fiscal.xdesc_serv?.trim() ||
          (fiscal.cnbs && !/^\d{9}$/.test(fiscal.cnbs))) {
        throw new Error('Revisar e confirmar o serviço fiscal padrão antes de emitir.');
      }
      const dataTexto = dia.split('-').reverse().join('/');
      if (vinculada) {
        await client.query(
          `update solicitacoes_nota set referencia_externa = $4, servico_fiscal_id = $5,
             valor_servico_centavos = $6, xdesc_serv = $7, ctrib_nac = $8, cnbs = $9,
             cclass_trib = $10, cind_op = $11, datas_consulta_texto = $12,
             status = 'pronta', fila = 'pronta', aguardando_confirmacao_medico = false,
             aguardando_cpf_medico = false, atualizado_em = now()
           where id = $1 and medico_id = $2 and paciente_id = $3`,
          [vinculada.id, medicoId, pacienteId, referencia, fiscal.id, candidato.valorCentavos,
            `${fiscal.xdesc_serv.trim()} — Consulta em ${dataTexto}`, fiscal.ctrib_nac,
            fiscal.cnbs ?? null, fiscal.cclass_trib_padrao ?? null, fiscal.cind_op_padrao ?? null, dataTexto]);
        await client.query('commit');
        return { solicitacaoId: vinculada.id };
      }
      // O worker continua responsável pelas políticas fiscais, certificado e transmissão.
      const inserida = await client.query(
        `insert into solicitacoes_nota (
           medico_id, paciente_id, referencia_externa, servico_fiscal_id,
           valor_servico_centavos, xdesc_serv, ctrib_nac, cnbs, cclass_trib, cind_op,
           datas_consulta_texto, origem, status, fila, tentativas,
           aguardando_confirmacao_medico, aguardando_cpf_medico
         ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'agente_fiscal','pronta','pronta',0,false,false)
         on conflict (medico_id, referencia_externa) where referencia_externa is not null do nothing
         returning id`,
        [medicoId, pacienteId, referencia, fiscal.id, candidato.valorCentavos,
          `${fiscal.xdesc_serv.trim()} — Consulta em ${dataTexto}`, fiscal.ctrib_nac,
          fiscal.cnbs ?? null, fiscal.cclass_trib_padrao ?? null, fiscal.cind_op_padrao ?? null, dataTexto]);
      let solicitacaoId = inserida.rows[0]?.id;
      if (!solicitacaoId) {
        const concorrente = await client.query(
          `select id from solicitacoes_nota where medico_id = $1 and referencia_externa = $2 and paciente_id = $3`,
          [medicoId, referencia, pacienteId]);
        solicitacaoId = concorrente.rows[0]?.id;
        if (!solicitacaoId) throw new Error('Referência do caso já utilizada por outro paciente.');
      }
      await client.query('commit');
      return { solicitacaoId };
    } catch (erro) {
      await client.query('rollback');
      throw erro;
    } finally { client.release(); }
  }

  /** O estado do caso recebe somente um HMAC, sem nome/CPF adicionais em texto puro. */
  private impressaoDados(paciente: { nome?: string | null; cpf_cnpj_hash?: string | null }): string {
    return createHmac('sha256', this.pepper)
      .update(JSON.stringify(['caso-fiscal-cadastro-v1', paciente.cpf_cnpj_hash ?? null, paciente.nome ?? null]))
      .digest('hex');
  }

  async consultarStatus(medicoId: string, solicitacaoId: string): Promise<{
    status: 'emitido' | 'falhou' | 'enfileirado'; erro: string | null;
  } | null> {
    const { rows } = await this.pool.query(
      `select status, fila, erro from solicitacoes_nota where medico_id = $1 and id = $2`,
      [medicoId, solicitacaoId]);
    if (!rows.length) return null;
    const registro = rows[0];
    const status = registro.status === 'emitida' ? 'emitido'
      : ['falhou', 'erro', 'excecao'].includes(registro.status) || registro.fila === 'excecao' ? 'falhou' : 'enfileirado';
    return { status, erro: registro.erro ?? null };
  }
}
