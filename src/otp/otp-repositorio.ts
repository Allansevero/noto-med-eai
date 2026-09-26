/**
 * Porta de persistência para `otp_verificacoes`. Isola a camada de banco de dados
 * (Supabase/Postgres) dos casos de uso de OTP, permitindo troca de ORM/driver
 * e testes com repositório em memória sem subir banco real.
 */

export interface OtpRegistro {
  id: string;
  telefone: string;
  codigoHash: string;
  tentativas: number;
  expiraEm: Date;
  verificadoEm: Date | null;
  criadoEm: Date;
}

export interface CriarOtpParams {
  telefone: string;
  codigoHash: string;
  expiraEm: Date;
  criadoEm?: Date;
}

export interface OtpRepositorio {
  salvar(params: CriarOtpParams): Promise<OtpRegistro>;
  buscarUltimoPorTelefone(telefone: string): Promise<OtpRegistro | null>;
  incrementarTentativas(id: string): Promise<void>;
  marcarVerificado(id: string, verificadoEm?: Date): Promise<void>;
}
