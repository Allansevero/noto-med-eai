/**
 * Porta para consulta de CPF (nome completo e data de nascimento).
 * Mantida plugável para permitir a escolha posterior do fornecedor de dados
 * (Receita Federal, Serasa, BigDataCorp, etc.) sem alterar regras de negócio.
 */

export interface DadosConsultaCpf {
  nome: string;
  dataNascimento?: Date | null;
}

export interface ConsultaCpfProvider {
  consultar(cpf: string): Promise<DadosConsultaCpf | null>;
}
