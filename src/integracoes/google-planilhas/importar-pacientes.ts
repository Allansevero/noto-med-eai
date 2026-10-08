import type pg from 'pg';
import { validarCpf } from '../../paciente/validar-cpf.js';
import { gerarHashCpf } from '../../paciente/hash-cpf.js';
import { ehNomeCivilValido } from '../../paciente/regras/validar-nome-civil.js';
import type { PacientePlanilha, ResultadoImportacaoPlanilha } from './types.js';

interface RegistroPaciente {
  id: string;
  medico_id: string;
  telefone: string;
  nome: string | null;
  nome_validado: boolean;
  email: string | null;
  cpf_cnpj_hash: string | null;
  cpf_cnpj_encriptado: unknown | null;
}

const BUSCAR = `
  select id, medico_id, telefone, nome, nome_validado, email,
         cpf_cnpj_hash, cpf_cnpj_encriptado
  from pacientes
  where medico_id = $1 and (telefone = $2 or cpf_cnpj_hash = $3)
  order by id
  for update
`;
const INSERIR = `
  insert into pacientes
    (medico_id, telefone, nome, email, cpf_cnpj_hash, cpf_cnpj_encriptado, origem_cadastro)
  values ($1, $2, $3, $4, $5,
          case when $6::text is not null then pgp_sym_encrypt($6, $7) else null end,
          'google_planilhas')
  on conflict (medico_id, telefone) do nothing
  returning id
`;
const COMPLETAR = `
  update pacientes
  set nome = case when nome_validado = true then nome
                  when nullif(trim(nome), '') is null then coalesce($3, nome) else nome end,
      email = case when nullif(trim(email), '') is null then coalesce($4, email) else email end,
      cpf_cnpj_hash = coalesce(cpf_cnpj_hash, $5),
      cpf_cnpj_encriptado = case when cpf_cnpj_encriptado is null and $6::text is not null
                                then pgp_sym_encrypt($6, $7) else cpf_cnpj_encriptado end,
      atualizado_em = now()
  where id = $1 and medico_id = $2
`;

const texto = (valor: unknown): string | null => typeof valor === 'string' && valor.trim() ? valor.trim() : null;
const canonico = (valor: string): string => valor.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim().toLocaleLowerCase('pt-BR');

/** Requires an active transaction; the caller also locks the physician row. */
export async function importarPacientesPlanilha(
  client: pg.PoolClient,
  medicoId: string,
  pacientes: PacientePlanilha[],
  chave: string,
  pepper: string,
): Promise<ResultadoImportacaoPlanilha> {
  const resultado: ResultadoImportacaoPlanilha = { criados: 0, completados: 0, semAlteracao: 0, ignorados: [] };
  await client.query('select pg_advisory_xact_lock(hashtext($1))', [medicoId]);

  for (const paciente of pacientes) {
    const ignorar = (motivo: string): void => { resultado.ignorados.push({ linha: paciente.linha, motivo }); };
    if ([paciente.nome, paciente.email, paciente.cpf].some(valor => valor != null && typeof valor !== 'string')) {
      ignorar('Campos com formato inválido.'); continue;
    }
    const nome = texto(paciente.nome);
    const email = texto(paciente.email)?.toLowerCase() ?? null;
    const cpfInformado = texto(paciente.cpf);
    const telefone = paciente.telefone;
    if (!Array.isArray(paciente.pendencias) || paciente.pendencias.length > 0) {
      const motivos: Record<string, string> = {
        nome_invalido: 'Nome inválido.',
        cpf_invalido: 'CPF inválido. Confira o documento e formate a coluna como texto.',
        cpf_possivel_zero_inicial: 'O CPF pode ter perdido zeros iniciais na formatação numérica. Confira os 11 dígitos com o documento e salve a coluna como texto.',
        email_invalido: 'E-mail inválido.',
        telefone_invalido: 'Telefone inválido. Informe um número brasileiro com DDD.',
        telefone_ausente: 'Telefone ausente. Informe o WhatsApp do paciente com DDD.',
        telefone_cpf_conflitante: 'O mesmo telefone aparece com CPFs diferentes na planilha.',
        cpf_telefones_conflitantes: 'O mesmo CPF aparece com telefones diferentes na planilha.',
      };
      const detalhes = Array.isArray(paciente.pendencias)
        ? [...new Set(paciente.pendencias.map(codigo => Object.hasOwn(motivos, codigo) ? motivos[codigo] : 'Linha com pendências de validação.'))]
        : ['Linha com pendências de validação.'];
      ignorar(detalhes.join(' ')); continue;
    }
    if (typeof telefone !== 'string' || !/^55\d{10,11}$/.test(telefone)) {
      ignorar('Telefone brasileiro válido é obrigatório.'); continue;
    }
    if (nome && (nome.length > 255 || !ehNomeCivilValido(nome))) {
      ignorar('Nome civil inválido.'); continue;
    }
    if (email && (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) {
      ignorar('Email inválido.'); continue;
    }
    if (cpfInformado && (!/^[\d.\-\s]+$/.test(cpfInformado) || !validarCpf(cpfInformado))) {
      ignorar('CPF inválido.'); continue;
    }
    const cpf = cpfInformado?.replace(/\D/g, '') ?? null;
    const cpfHash = cpf ? gerarHashCpf(cpf, pepper) : null;
    let registros = (await client.query<RegistroPaciente>(BUSCAR, [medicoId, telefone, cpfHash])).rows;
    if (registros.length === 0) {
      const inserido = await client.query(INSERIR, [medicoId, telefone, nome, email, cpfHash, cpf, chave]);
      if (inserido.rows.length > 0) { resultado.criados++; continue; }
      // A WhatsApp flow can insert the same phone without taking our advisory lock.
      registros = (await client.query<RegistroPaciente>(BUSCAR, [medicoId, telefone, cpfHash])).rows;
    }
    if (registros.length !== 1 || registros[0].medico_id !== medicoId || registros[0].telefone !== telefone) {
      ignorar('CPF associado a outro telefone ou cadastro ambíguo.'); continue;
    }
    const existente = registros[0];
    if (cpfHash && ((existente.cpf_cnpj_hash && existente.cpf_cnpj_hash !== cpfHash)
      || (!existente.cpf_cnpj_hash && existente.cpf_cnpj_encriptado))) {
      ignorar('CPF conflitante com o cadastro existente.'); continue;
    }
    const nomeExistente = texto(existente.nome);
    const emailExistente = texto(existente.email);
    if (nome && nomeExistente && canonico(nome) !== canonico(nomeExistente)) {
      ignorar('Nome conflitante com o cadastro existente.'); continue;
    }
    if (email && emailExistente && email !== emailExistente.toLowerCase()) {
      ignorar('Email conflitante com o cadastro existente.'); continue;
    }
    const completarNome = Boolean(nome && !nomeExistente && !existente.nome_validado);
    const completarEmail = Boolean(email && !emailExistente);
    const completarCpf = Boolean(cpf && (!existente.cpf_cnpj_hash || !existente.cpf_cnpj_encriptado));
    if (!completarNome && !completarEmail && !completarCpf) { resultado.semAlteracao++; continue; }
    await client.query(COMPLETAR, [existente.id, medicoId, nome, email, cpfHash, cpf, chave]);
    resultado.completados++;
  }
  return resultado;
}
