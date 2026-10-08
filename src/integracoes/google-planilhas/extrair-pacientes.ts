import { normalizarTelefoneTribemd } from '../../desenvolvedor/tribemd-dados.js';
import { validarCpf } from '../../paciente/validar-cpf.js';
import type { MapeadorColunasPlanilha, MapaColunasPlanilha, PacientePlanilha, ResultadoExtracaoPlanilha } from './types.js';

const CAMPOS = ['nome', 'cpf', 'email', 'telefone'] as const;
type Campo = typeof CAMPOS[number];

/** Aceita apenas rótulos completos; frases de instruções e valores ficam de fora. */
export function campoCabecalhoPlanilha(valor: string): Campo | null {
  const rotulo = valor.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[:*]/g, '').trim().replace(/\s+/g, ' ');
  const rotulos: Record<Campo, RegExp> = {
    nome: /^(?:nome(?: completo| do paciente| do cliente)?|paciente|cliente|name|full name|patient name)$/,
    cpf: /^(?:cpf(?: do paciente| do cliente)?|cadastro de pessoa fisica)$/,
    email: /^(?:e-?mail(?: do paciente| do cliente)?|endereco de e-?mail)$/,
    telefone: /^(?:telefone(?: celular| do paciente| do cliente| de contato)?|contatos?|celular|whatsapp|whats app|fone|phone|mobile)$/,
  };
  return CAMPOS.find(campo => rotulos[campo].test(rotulo)) ?? null;
}

export function sanitizarCabecalhoPlanilha(cabecalho: string[]): string[] {
  if (!cabecalho.length || cabecalho.length > 52) throw new Error('Quantidade de colunas inválida (máximo 52).');
  return cabecalho.map(rotulo => typeof rotulo === 'string' && rotulo.length <= 100 && campoCabecalhoPlanilha(rotulo) ? rotulo.trim() : '');
}

export function validarMapaColunasPlanilha(valor: unknown, cabecalho: string[]): MapaColunasPlanilha {
  if (!valor || typeof valor !== 'object' || Array.isArray(valor)) throw new Error('Mapa de colunas inválido.');
  const mapa = valor as Record<string, unknown>;
  if (Object.keys(mapa).length !== CAMPOS.length || Object.keys(mapa).some(chave => !CAMPOS.includes(chave as Campo))) throw new Error('Mapa de colunas deve conter somente nome, cpf, email e telefone.');
  const completado = { ...mapa };
  const usados = new Set<number>();
  for (const campo of CAMPOS) {
    const indice = mapa[campo];
    if (indice === null) continue;
    if (typeof indice !== 'number' || !Number.isInteger(indice) || indice < 0 || indice >= cabecalho.length || usados.has(indice) || campoCabecalhoPlanilha(cabecalho[indice]) !== campo) throw new Error('Mapa de colunas contém índice inválido ou rótulo incompatível.');
    usados.add(indice);
  }
  // O LLM pode omitir um título que a aplicação já conhece. Uma única coluna
  // compatível determina o índice; colunas duplicadas continuam sem escolha.
  for (const campo of CAMPOS) {
    if (completado[campo] !== null) continue;
    const candidatos = cabecalho.map((rotulo, indice) => campoCabecalhoPlanilha(rotulo) === campo ? indice : -1).filter(indice => indice >= 0);
    if (candidatos.length === 1 && !usados.has(candidatos[0])) {
      completado[campo] = candidatos[0];
      usados.add(candidatos[0]);
    }
  }
  if (completado.telefone === null && completado.cpf === null) throw new Error('Mapa de colunas precisa identificar telefone ou CPF.');
  return { nome: completado.nome as number | null, cpf: completado.cpf as number | null, email: completado.email as number | null, telefone: completado.telefone as number | null };
}

export async function extrairPacientesPlanilha(valores: string[][], mapeador: MapeadorColunasPlanilha, limitado: boolean): Promise<ResultadoExtracaoPlanilha> {
  const indiceCabecalho = valores.slice(0, 10).findIndex(linha => {
    const campos = linha.map(campoCabecalhoPlanilha).filter((campo): campo is Campo => campo !== null);
    const distintos = new Set(campos);
    // Um título com apenas "Nome" não é suficiente. CPF/telefone isolados são tabelas válidas.
    return (distintos.has('cpf') || distintos.has('telefone')) && (distintos.size >= 2 || linha.filter(celula => celula.trim()).length === 1);
  });
  if (indiceCabecalho < 0) throw new Error('Não foi possível identificar um cabeçalho confiável nas primeiras dez linhas.');
  const cabecalho = sanitizarCabecalhoPlanilha(valores[indiceCabecalho]);
  const colunas = validarMapaColunasPlanilha(await mapeador.mapear([...cabecalho]), cabecalho);
  const pacientes: PacientePlanilha[] = [];
  for (let i = indiceCabecalho + 1; i < valores.length; i++) {
    const linha = valores[i];
    if (linha.every(celula => !celula.trim())) continue;
    const celula = (campo: Campo): string | null => {
      const indice = colunas[campo];
      return indice === null ? null : linha[indice]?.trim() || null;
    };
    const pendencias: string[] = [];
    let nome = celula('nome'), cpf = celula('cpf'), email = celula('email'), telefone = celula('telefone');
    if (nome && nome.length > 200) { nome = null; pendencias.push('nome_invalido'); }
    if (cpf) {
      if (cpf.length > 14 || !/^[\d.\-\s]+$/.test(cpf) || !validarCpf(cpf)) {
        // A planilha pode ter removido zeros ao tratar o documento como número.
        // Checksum válido é apenas uma hipótese; não comprova a identidade do paciente.
        const possivelZero = /^\d{1,10}$/.test(cpf) && validarCpf(cpf.padStart(11, '0'));
        cpf = null; pendencias.push(possivelZero ? 'cpf_possivel_zero_inicial' : 'cpf_invalido');
      }
      else cpf = cpf.replace(/\D/g, '');
    }
    if (email && (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) { email = null; pendencias.push('email_invalido'); }
    if (telefone) {
      const normalizado = telefone.length <= 32 && /^[+\d\s().-]+$/.test(telefone) ? normalizarTelefoneTribemd(telefone) : null;
      if (!normalizado || !/^55[1-9]\d(?:[2-5]\d{7}|9\d{8})$/.test(normalizado)) { telefone = null; pendencias.push('telefone_invalido'); }
      else telefone = normalizado;
    } else pendencias.push('telefone_ausente');
    pacientes.push({ linha: i + 1, nome, cpf, email, telefone, pendencias });
  }
  const porTelefone = new Map<string, PacientePlanilha[]>();
  for (const paciente of pacientes) if (paciente.telefone) {
    const grupo = porTelefone.get(paciente.telefone) ?? [];
    grupo.push(paciente); porTelefone.set(paciente.telefone, grupo);
  }
  for (const grupo of porTelefone.values()) {
    if (new Set(grupo.map(paciente => paciente.cpf).filter(Boolean)).size > 1) {
      for (const paciente of grupo) paciente.pendencias.push('telefone_cpf_conflitante');
    }
  }
  const porCpf = new Map<string, PacientePlanilha[]>();
  for (const paciente of pacientes) if (paciente.cpf) {
    const grupo = porCpf.get(paciente.cpf) ?? [];
    grupo.push(paciente); porCpf.set(paciente.cpf, grupo);
  }
  for (const grupo of porCpf.values()) {
    if (new Set(grupo.map(paciente => paciente.telefone).filter(Boolean)).size > 1) {
      for (const paciente of grupo) paciente.pendencias.push('cpf_telefones_conflitantes');
    }
  }
  return { pacientes, cabecalhosReconhecidos: cabecalho.filter(Boolean), cabecalhoLinha: indiceCabecalho + 1, colunas, linhasLidas: valores.length - indiceCabecalho - 1, limitado };
}
