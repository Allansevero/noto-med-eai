/**
 * Implementação PostgreSQL da porta `AtendimentoRepositorio`.
 * Executa queries parametrizadas com encriptação simétrica de CPF via pgcrypto
 * e gerencia conversas, agendamentos e fila de notas fiscais na VPS (seções 2, 3 e 4.1).
 */

import type pg from 'pg';
import type {
  AtendimentoRepositorio,
  InstanciaRegistro,
  ConversaRegistro,
  PacienteRegistro,
  MedicoDadosRegistro,
  ConsultaEmAbertoRegistro,
  SolicitacaoAguardandoDataRegistro
} from '../../atendimento/atendimento-repositorio.js';
import type { RespostaRapidaModelo } from '../../whatsapp/casar-resposta-rapida.js';
import { gerarVariantesTelefoneBrasileiro } from '../../whatsapp/variantes-telefone-brasileiro.js';
import { montarDescricaoServico } from '../../emissao/montar-descricao-servico.js';
import { dadosProfissionaisCompletos } from '../../conta/validar-dados-emissao.js';

export class PostgresAtendimentoRepositorio implements AtendimentoRepositorio {
  constructor(
    private readonly pool: pg.Pool,
    private readonly chaveCriptografia: string
  ) {}

  async buscarInstanciaPorNome(nomeInstancia: string): Promise<InstanciaRegistro | null> {
    const sql = `
      select id, medico_id, nome_instancia, oficial
      from whatsapp_instancias
      where nome_instancia = $1
      limit 1
    `;
    const { rows } = await this.pool.query(sql, [nomeInstancia]);
    if (rows.length === 0) return null;
    return {
      id: rows[0].id,
      medicoId: rows[0].medico_id,
      nomeInstancia: rows[0].nome_instancia,
      oficial: rows[0].oficial
    };
  }

  async buscarOuCriarConversa(instanciaId: string, medicoId: string | null, contatoTelefone: string): Promise<ConversaRegistro> {
    const sqlBusca = `
      select id, instancia_id, medico_id, contato_telefone, paciente_id, aguardando_cpf_desde
      from whatsapp_conversas
      where instancia_id = $1 and contato_telefone = $2
      limit 1
    `;
    const { rows: rowsBusca } = await this.pool.query(sqlBusca, [instanciaId, contatoTelefone]);
    if (rowsBusca.length > 0) {
      if (!rowsBusca[0].medico_id && medicoId) {
        await this.pool.query(`update whatsapp_conversas set medico_id = $2 where id = $1`, [rowsBusca[0].id, medicoId]);
        rowsBusca[0].medico_id = medicoId;
      }
      return {
        id: rowsBusca[0].id,
        instanciaId: rowsBusca[0].instancia_id,
        medicoId: rowsBusca[0].medico_id,
        contatoTelefone: rowsBusca[0].contato_telefone,
        pacienteId: rowsBusca[0].paciente_id,
        aguardandoCpfDesde: rowsBusca[0].aguardando_cpf_desde ? new Date(rowsBusca[0].aguardando_cpf_desde) : null
      };
    }

    const sqlInsere = `
      insert into whatsapp_conversas (instancia_id, medico_id, contato_telefone, ultima_mensagem_em)
      values ($1, $2, $3, now())
      returning id, instancia_id, medico_id, contato_telefone, paciente_id, aguardando_cpf_desde
    `;
    const { rows: rowsInsere } = await this.pool.query(sqlInsere, [instanciaId, medicoId, contatoTelefone]);
    return {
      id: rowsInsere[0].id,
      instanciaId: rowsInsere[0].instancia_id,
      medicoId: rowsInsere[0].medico_id,
      contatoTelefone: rowsInsere[0].contato_telefone,
      pacienteId: rowsInsere[0].paciente_id,
      aguardandoCpfDesde: null
    };
  }

  async buscarRespostasRapidasMedico(medicoId: string): Promise<RespostaRapidaModelo[]> {
    const sql = `
      select tipo, texto_modelo
      from medico_respostas_rapidas
      where medico_id = $1
    `;
    const { rows } = await this.pool.query(sql, [medicoId]);
    return rows.map((r) => ({
      tipo: r.tipo as 'agendado' | 'emissao',
      textoModelo: r.texto_modelo
    }));
  }

  async buscarPacientePorId(pacienteId: string): Promise<PacienteRegistro | null> {
    const sql = `
      select id, medico_id, telefone, nome, nome_validado, cpf_cnpj_hash, email, data_nascimento
      from pacientes
      where id = $1
      limit 1
    `;
    const { rows } = await this.pool.query(sql, [pacienteId]);
    if (rows.length === 0) return null;
    return {
      id: rows[0].id,
      medicoId: rows[0].medico_id,
      telefone: rows[0].telefone,
      nome: rows[0].nome,
      nomeValidado: Boolean(rows[0].nome_validado),
      cpfHash: rows[0].cpf_cnpj_hash,
      email: rows[0].email,
      dataNascimento: rows[0].data_nascimento ? new Date(rows[0].data_nascimento) : null
    };
  }

  async buscarPacientePorTelefone(medicoId: string, telefone: string): Promise<PacienteRegistro | null> {
    const sql = `
      select id, medico_id, telefone, nome, nome_validado, cpf_cnpj_hash, email, data_nascimento
      from pacientes
      where medico_id = $1 and telefone = $2
      limit 1
    `;
    const { rows } = await this.pool.query(sql, [medicoId, telefone]);
    if (rows.length === 0) return null;
    return {
      id: rows[0].id,
      medicoId: rows[0].medico_id,
      telefone: rows[0].telefone,
      nome: rows[0].nome,
      nomeValidado: Boolean(rows[0].nome_validado),
      cpfHash: rows[0].cpf_cnpj_hash,
      email: rows[0].email,
      dataNascimento: rows[0].data_nascimento ? new Date(rows[0].data_nascimento) : null
    };
  }

  async buscarPacientePorCpfHash(medicoId: string, cpfHash: string): Promise<PacienteRegistro | null> {
    const sql = `
      select id, medico_id, telefone, nome, nome_validado, cpf_cnpj_hash, email, data_nascimento
      from pacientes
      where medico_id = $1 and cpf_cnpj_hash = $2
      order by nome_validado desc, atualizado_em desc
      limit 1
    `;
    const { rows } = await this.pool.query(sql, [medicoId, cpfHash]);
    if (rows.length === 0) return null;
    return {
      id: rows[0].id,
      medicoId: rows[0].medico_id,
      telefone: rows[0].telefone,
      nome: rows[0].nome,
      nomeValidado: Boolean(rows[0].nome_validado),
      cpfHash: rows[0].cpf_cnpj_hash,
      email: rows[0].email,
      dataNascimento: rows[0].data_nascimento ? new Date(rows[0].data_nascimento) : null
    };
  }

  async criarPacienteMinimo(params: {
    medicoId: string;
    telefone: string;
    nome?: string | null;
    email?: string | null;
    cpfHash?: string | null;
    cpf?: string | null;
    origemCadastro?: string;
  }): Promise<PacienteRegistro> {
    const sql = `
      insert into pacientes (medico_id, telefone, nome, email, cpf_cnpj_hash, cpf_cnpj_encriptado, origem_cadastro)
      values ($1, $2, $3, $4, $5, case when $7::text is not null then pgp_sym_encrypt($7, $8) else null end, coalesce($6, 'conversa'))
      on conflict (medico_id, telefone) do update set
        nome = case
          when pacientes.nome_validado = true then pacientes.nome
          when pacientes.nome is not null and trim(pacientes.nome) != '' and upper(trim(pacientes.nome)) != 'PACIENTE'
          then pacientes.nome
          else coalesce(excluded.nome, pacientes.nome)
        end,
        email = coalesce(excluded.email, pacientes.email),
        cpf_cnpj_hash = coalesce(excluded.cpf_cnpj_hash, pacientes.cpf_cnpj_hash),
        cpf_cnpj_encriptado = coalesce(excluded.cpf_cnpj_encriptado, pacientes.cpf_cnpj_encriptado)
      returning id, medico_id, telefone, nome, nome_validado, cpf_cnpj_hash, email
    `;
    const values = [
      params.medicoId,
      params.telefone,
      params.nome,
      params.email,
      params.cpfHash,
      params.origemCadastro,
      params.cpf ?? null,
      this.chaveCriptografia
    ];
    const { rows } = await this.pool.query(sql, values);
    return {
      id: rows[0].id,
      medicoId: rows[0].medico_id,
      telefone: rows[0].telefone,
      nome: rows[0].nome,
      nomeValidado: Boolean(rows[0].nome_validado),
      cpfHash: rows[0].cpf_cnpj_hash,
      email: rows[0].email
    };
  }

  async atualizarCpfPaciente(params: {
    pacienteId: string;
    cpfHash: string;
    cpf?: string | null;
    nome?: string | null;
    dataNascimento?: Date | null;
    nomeValidado?: boolean;
  }): Promise<void> {
    const sql = `
      update pacientes
      set cpf_cnpj_hash = $2,
          cpf_cnpj_encriptado = case when $5::text is not null then pgp_sym_encrypt($5, $6) else cpf_cnpj_encriptado end,
          nome = case
            when pacientes.nome_validado = true then pacientes.nome
            when $7::boolean = true then coalesce($3, pacientes.nome)
            else coalesce($3, pacientes.nome)
          end,
          nome_validado = case
            when pacientes.nome_validado = true then true
            else coalesce($7, false)
          end,
          data_nascimento = coalesce($4, data_nascimento),
          atualizado_em = now()
      where id = $1
    `;
    await this.pool.query(sql, [
      params.pacienteId,
      params.cpfHash,
      params.nome,
      params.dataNascimento,
      params.cpf ?? null,
      this.chaveCriptografia,
      Boolean(params.nomeValidado)
    ]);
  }


  async vincularPacienteConversa(conversaId: string, pacienteId: string): Promise<void> {
    const sql = `update whatsapp_conversas set paciente_id = $2 where id = $1`;
    await this.pool.query(sql, [conversaId, pacienteId]);
  }

  async marcarAguardandoCpf(conversaId: string, aguardandoDesde: Date | null): Promise<void> {
    const sql = `update whatsapp_conversas set aguardando_cpf_desde = $2 where id = $1`;
    await this.pool.query(sql, [conversaId, aguardandoDesde]);
  }

  async criarAgendamento(params: {
    medicoId: string;
    pacienteId: string;
    conversaId: string;
    dataHora: Date;
    valorConsultaCentavos?: number | null;
  }): Promise<{ id: string }> {
    const sql = `
      insert into agendamentos (medico_id, paciente_id, conversa_id, data_hora, valor_consulta_centavos, status, origem)
      values ($1, $2, $3, $4, $5, 'agendado', 'whatsapp_comando')
      returning id
    `;
    const { rows } = await this.pool.query(sql, [
      params.medicoId,
      params.pacienteId,
      params.conversaId,
      params.dataHora,
      params.valorConsultaCentavos
    ]);
    return { id: rows[0].id };
  }

  async buscarConsultasEmAberto(medicoId: string, pacienteId: string): Promise<ConsultaEmAbertoRegistro[]> {
    const sql = `
      select a.id, a.data_hora, a.valor_consulta_centavos
      from agendamentos a
      where a.medico_id = $1
        and a.paciente_id = $2
        and a.status in ('agendado', 'confirmado', 'realizado')
        and not exists (
          select 1
          from solicitacao_nota_agendamentos sna
          join solicitacoes_nota sn on sn.id = sna.solicitacao_id
          where sna.agendamento_id = a.id
            and sn.status not in ('erro', 'excecao')
        )
      order by a.data_hora asc
    `;
    const { rows } = await this.pool.query(sql, [medicoId, pacienteId]);
    return rows.map((r) => ({
      id: r.id,
      dataHora: new Date(r.data_hora),
      valorConsultaCentavos: r.valor_consulta_centavos
    }));
  }

  async buscarDadosMedico(medicoId: string): Promise<MedicoDadosRegistro | null> {
    const sql = `
      select m.id, m.nome_completo, m.especialidade, m.crm, m.rqe,
             coalesce(msf.ctrib_nac, '') as ctrib_nac_padrao,
             u.telefone
      from medicos m
      join usuarios u on u.id = m.usuario_id
      left join medico_servicos_fiscais msf on msf.medico_id = m.id and msf.padrao = true and msf.ativo = true
      where m.id = $1
      limit 1
    `;
    const { rows } = await this.pool.query(sql, [medicoId]);
    if (rows.length === 0) return null;
    return {
      id: rows[0].id,
      nomeCompleto: rows[0].nome_completo,
      especialidade: rows[0].especialidade,
      crm: rows[0].crm,
      rqe: rows[0].rqe,
      ctribNacPadrao: rows[0].ctrib_nac_padrao,
      telefone: rows[0].telefone
    };
  }

  async buscarMedicoPorTelefone(telefone: string): Promise<MedicoDadosRegistro | null> {
    const variantes = gerarVariantesTelefoneBrasileiro(telefone);
    if (variantes.length === 0) return null;
    const sql = `
      select m.id, m.nome_completo, m.especialidade, m.crm, m.rqe,
             coalesce(msf.ctrib_nac, '') as ctrib_nac_padrao,
             u.telefone
      from medicos m
      join usuarios u on u.id = m.usuario_id
      left join medico_servicos_fiscais msf on msf.medico_id = m.id and msf.padrao = true and msf.ativo = true
      where regexp_replace(u.telefone, '\\D', '', 'g') = any($1::text[])
      limit 2
    `;
    const { rows } = await this.pool.query(sql, [variantes]);
    if (rows.length !== 1) return null;
    return {
      id: rows[0].id,
      nomeCompleto: rows[0].nome_completo,
      especialidade: rows[0].especialidade,
      crm: rows[0].crm,
      rqe: rows[0].rqe,
      ctribNacPadrao: rows[0].ctrib_nac_padrao,
      telefone: rows[0].telefone
    };
  }

  async criarSolicitacaoNota(params: {
    medicoId: string;
    pacienteId: string;
    xdescServ: string;
    valorServicoCentavos: number;
    ctribNac: string;
    fila: 'pronta' | 'pendente_cadastro' | null;
    aguardandoDataConsulta?: boolean;
    aguardandoDadosProfissionais?: boolean;
    datasConsultaTexto?: string;
    agendamentoIds?: string[];
  }): Promise<{ id: string }> {
    const client = await this.pool.connect();
    try {
      await client.query('begin');
      const sqlSolicitacao = `
        insert into solicitacoes_nota (
          medico_id, paciente_id, xdesc_serv, valor_servico_centavos, ctrib_nac,
          fila, status, origem, aguardando_data_consulta, aguardando_dados_profissionais, datas_consulta_texto
        )
        values ($1, $2, $3, $4, $5, $6, 'pendente', 'whatsapp_comando', $7, $8, $9)
        returning id
      `;
      const { rows } = await client.query(sqlSolicitacao, [
        params.medicoId,
        params.pacienteId,
        params.xdescServ,
        params.valorServicoCentavos,
        params.ctribNac,
        params.fila,
        Boolean(params.aguardandoDataConsulta),
        Boolean(params.aguardandoDadosProfissionais),
        params.datasConsultaTexto ?? null
      ]);
      const solicitacaoId = rows[0].id;
      // Snapshot somente quando existe exatamente um serviço ativo compatível.
      await client.query(`with candidatos as (
        select f.*, count(*) over () as quantidade from medico_servicos_fiscais f
        where f.medico_id = $2 and f.padrao and f.ativo and f.ctrib_nac = $3)
        update solicitacoes_nota s set servico_fiscal_id = f.id, cnbs = f.cnbs
        from candidatos f where s.id = $1 and s.medico_id = $2 and f.quantidade = 1`,
        [solicitacaoId, params.medicoId, params.ctribNac]);

      if (params.agendamentoIds) {
        for (const agendamentoId of params.agendamentoIds) {
          await client.query(
            `insert into solicitacao_nota_agendamentos (solicitacao_id, agendamento_id) values ($1, $2)`,
            [solicitacaoId, agendamentoId]
          );
        }
      }

      await client.query('commit');
      return { id: solicitacaoId };
    } catch (err) {
      await client.query('rollback');
      throw err;
    } finally {
      client.release();
    }
  }

  async buscarSolicitacaoAguardandoData(medicoId: string, pacienteId?: string): Promise<SolicitacaoAguardandoDataRegistro | null> {
    const params: any[] = [medicoId];
    let filtroPaciente = '';
    if (pacienteId) {
      params.push(pacienteId);
      filtroPaciente = `and sn.paciente_id = $2`;
    }
    const sql = `
      select sn.id, sn.medico_id, sn.paciente_id, sn.valor_servico_centavos, sn.ctrib_nac, sn.criado_em,
             coalesce(p.nome, 'Paciente') as nome_paciente,
             u.telefone as telefone_medico
      from solicitacoes_nota sn
      join pacientes p on p.id = sn.paciente_id
      join medicos m on m.id = sn.medico_id
      join usuarios u on u.id = m.usuario_id
      where sn.medico_id = $1
        and sn.aguardando_data_consulta = true
        and sn.status = 'pendente'
        ${filtroPaciente}
      order by sn.criado_em desc
      limit 1
    `;
    const { rows } = await this.pool.query(sql, params);
    if (rows.length === 0) return null;
    return {
      id: rows[0].id,
      medicoId: rows[0].medico_id,
      pacienteId: rows[0].paciente_id,
      nomePaciente: rows[0].nome_paciente,
      telefoneMedico: rows[0].telefone_medico,
      valorServicoCentavos: rows[0].valor_servico_centavos,
      ctribNac: rows[0].ctrib_nac,
      criadoEm: new Date(rows[0].criado_em)
    };
  }

  async atualizarDataDescricaoSolicitacao(params: {
    solicitacaoId: string;
    xdescServ: string;
    fila: 'pronta' | 'pendente_cadastro';
  }): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('begin');
      // Mesma ordem de locks da coleta profissional: médico antes da solicitação.
      const { rows } = await client.query(`select m.nome_completo, m.crm, m.rqe, m.especialidade
        from medicos m join solicitacoes_nota s on s.medico_id=m.id
        where s.id=$1 for update of m`, [params.solicitacaoId]);
      const medico = rows[0];
      const datas = params.xdescServ.match(/\bNAS DATAS\s+(.+)$/i)?.[1];
      if (medico && datas) {
        const descricao = montarDescricaoServico({nomeCompleto:medico.nome_completo ?? '',
          crm:medico.crm, rqe:medico.rqe, especialidade:medico.especialidade}, datas);
        await client.query(`update solicitacoes_nota s
          set xdesc_serv=$2, datas_consulta_texto=$4,
              aguardando_dados_profissionais=aguardando_dados_profissionais or $5,
              fila=case when aguardando_dados_profissionais or $5 then null else $3::fila_solicitacao_nota end,
              aguardando_data_consulta=false, atualizado_em=now()
          where s.id=$1 and s.status='pendente' and s.tentativas=0
            and s.bloqueada_em is null
            and not exists(select 1 from notas_fiscais n where n.solicitacao_id=s.id)
            and not exists(select 1 from investigacoes_emissao i where i.solicitacao_id=s.id)`,
          [params.solicitacaoId, descricao, params.fila, datas, !dadosProfissionaisCompletos(medico)]);
      }
      await client.query('commit');
    } catch (erro) {
      await client.query('rollback');
      throw erro;
    } finally {
      client.release();
    }
  }

  async liberarSolicitacoesPendentesCpf(medicoId: string, pacienteId: string): Promise<number> {
    const sql = `
      update solicitacoes_nota
      set fila = 'pronta'
      where medico_id = $1
        and paciente_id = $2
        and status = 'pendente'
        and tentativas = 0
        and bloqueada_em is null
        and not exists(select 1 from notas_fiscais n where n.solicitacao_id=solicitacoes_nota.id)
        and not exists(select 1 from investigacoes_emissao i where i.solicitacao_id=solicitacoes_nota.id)
        and not aguardando_dados_profissionais
        and not aguardando_data_consulta
        and (fila = 'pendente_cadastro' or fila is null)
    `;
    const res = await this.pool.query(sql, [medicoId, pacienteId]);
    return res.rowCount ?? 0;
  }

  async salvarMensagem(params: {
    conversaId: string;
    direcao: 'recebida' | 'enviada';
    tipoMensagem?: string;
    conteudo: string;
    payloadBruto?: unknown;
    comandoDetectado?: string | null;
  }): Promise<void> {
    const sql = `
      insert into whatsapp_mensagens (conversa_id, direcao, tipo_mensagem, conteudo, payload_bruto, comando_detectado, criado_em)
      values ($1, $2, coalesce($3, 'texto'), $4, $5, $6, now())
    `;
    await this.pool.query(sql, [
      params.conversaId,
      params.direcao,
      params.tipoMensagem || 'texto',
      params.conteudo,
      params.payloadBruto ? JSON.stringify(params.payloadBruto) : null,
      params.comandoDetectado || null
    ]);
  }

  async buscarMensagensRecentesConversa(conversaId: string, limite: number = 20): Promise<string[]> {
    const sql = `
      select conteudo
      from whatsapp_mensagens
      where conversa_id = $1 and conteudo is not null and trim(conteudo) != ''
      order by criado_em desc
      limit $2
    `;
    const { rows } = await this.pool.query(sql, [conversaId, limite]);
    return rows.map((r: { conteudo: string }) => r.conteudo).reverse();
  }
}
