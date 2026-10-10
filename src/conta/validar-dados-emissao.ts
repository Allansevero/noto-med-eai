/** Identidade exigida na emissão; não comprova habilitação junto ao conselho. */
const ufs = new Set('AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split(' '));
const limpar = (valor: string) => valor.trim().replace(/\s+/g, ' ');
export function nomeProfissionalValido(valor: unknown): boolean {
  if (typeof valor !== 'string') return false;
  const nome = limpar(valor).replace(/^dr(?:a)?\.?\s+/i, '');
  if (nome.length > 200 || !/^[\p{L}][\p{L}\p{M}'’ -]+$/u.test(nome)) return false;
  const partes = nome.split(' ');
  if (partes.length < 2 || partes.filter(p => p.length >= 2).length < 2) return false;
  return !/\b(médico|medico|nome|completo|null|undefined|teste|test|paciente|emitir|emita|preciso|nota|cpf|consulta|cadastro|sem|não|nao|informado|informar|obrigado|bom|dia|boa|tarde|noite)\b/i.test(nome.normalize('NFD').replace(/\p{M}/gu,''));
}
export function normalizarCrm(valor: unknown): string | null {
  if (typeof valor !== 'string') return null;
  const texto = limpar(valor).toUpperCase();
  const invertido = texto.match(/^(?:CRM\s*[/: -]?\s*)?([A-Z]{2})\s*[:/ -]?\s*(\d{1,12})$/);
  if (invertido) return ufs.has(invertido[1]) && /[1-9]/.test(invertido[2]) ? `${invertido[2]}/${invertido[1]}` : null;
  const resultado = texto.replace(/^CRM\s*:?\s*/, '').match(/^(\d{1,12})(?:\s*[\/-]?\s*([A-Z]{2}))?$/);
  if (!resultado || !/[1-9]/.test(resultado[1]) || (resultado[2] && !ufs.has(resultado[2]))) return null;
  return resultado[1] + (resultado[2] ? `/${resultado[2]}` : '');
}
export function dadosProfissionaisCompletos(valor: {nomeCompleto?:unknown;nome_completo?:unknown;crm?:unknown}): boolean {
  return nomeProfissionalValido(valor.nomeCompleto ?? valor.nome_completo) && normalizarCrm(valor.crm) !== null;
}
export function interpretarRespostaProfissional(texto:string, perfil:{nomeCompleto:unknown;crm:unknown}):{nome?:string;crm?:string;rqe?:string} {
  const dados: {nome?:string;crm?:string;rqe?:string} = {};
  if (texto.length > 1000) return dados;
  const linhas = texto.trim().split(/\r?\n/);
  const rotulados = linhas.map(l => l.match(/^\s*(nome(?: completo)?|crm|rqe)\s*:\s*(.*?)\s*$/i));
  if (rotulados.every(Boolean)) {
    const vistos = new Set<string>();
    for (const linha of rotulados) {
      const campo = linha![1].toLowerCase().startsWith('nome') ? 'nome' : linha![1].toLowerCase();
      if (vistos.has(campo)) return {};
      vistos.add(campo);
      const valor = limpar(linha![2]);
      if (campo === 'nome' && !nomeProfissionalValido(perfil.nomeCompleto) && nomeProfissionalValido(valor)) dados.nome = valor;
      if (campo === 'crm' && !normalizarCrm(perfil.crm)) { const crm = normalizarCrm(valor); if (crm) dados.crm = crm; }
      if (campo === 'rqe' && /^\d{1,12}$/.test(valor) && /[1-9]/.test(valor)) dados.rqe = valor;
    }
  } else if (linhas.length === 1 && !texto.includes(':')) {
    if (!nomeProfissionalValido(perfil.nomeCompleto) && nomeProfissionalValido(texto)) dados.nome = limpar(texto);
    else if (nomeProfissionalValido(perfil.nomeCompleto) && !normalizarCrm(perfil.crm)) { const crm = normalizarCrm(texto); if (crm) dados.crm = crm; }
  }
  return dados;
}
