/**
 * Inferência heurística de especialidade médica a partir da descrição livre
 * de serviços do XML anterior. O resultado é apenas uma SUGESTÃO para a UI
 * exibir na tela de confirmação, nunca gravado sem a aprovação do médico.
 */

const ESPECIALIDADES_COMUNS = [
  'Psiquiatria',
  'Pediatria',
  'Dermatologia',
  'Cardiologia',
  'Ginecologia e Obstetrícia',
  'Ortopedia',
  'Oftalmologia',
  'Endocrinologia',
  'Neurologia',
  'Otorrinolaringologia',
  'Urologia',
  'Gastroenterologia',
  'Geriatria',
  'Cirurgia Geral',
  'Infectologia',
  'Clínica Médica'
];

export function inferirEspecialidadeDeXdescserv(xDescServ?: string | null): string | null {
  if (!xDescServ || typeof xDescServ !== 'string') return null;
  const textoLimpo = xDescServ.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  for (const esp of ESPECIALIDADES_COMUNS) {
    const espNorm = esp.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const radical = espNorm.slice(0, 7); // busca por prefixo (ex: PSIQUIAT, PEDIATR, DERMATO)
    if (textoLimpo.includes(radical)) {
      return esp;
    }
  }

  return null;
}
