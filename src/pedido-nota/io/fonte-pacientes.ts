/**
 * Porta de busca de pacientes para a cascata de resolução (Supabase, Google Sheets, WhatsApp).
 * Permite adicionar novas fontes sem alterar as regras de negócio de emissão de nota.
 */

import type { PacienteEncontrado, TermoBuscaPaciente } from '../tipos.js';

export interface FontePacientes {
  readonly nomeFonte: string;
  buscar(medicoId: string, termo: TermoBuscaPaciente): Promise<PacienteEncontrado[]>;
}
