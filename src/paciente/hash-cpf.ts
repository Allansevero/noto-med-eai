/**
 * Geração de hash indexável de CPF/CNPJ usando HMAC-SHA256 com pepper.
 * Permite busca exata e verificação de unicidade no banco de dados
 * sem expor o documento em texto puro (seção 4.1 do plano e schema).
 */

import { createHmac } from 'node:crypto';

export function gerarHashCpf(cpf: string, pepper: string): string {
  const digitos = cpf.replace(/\D/g, '');
  return createHmac('sha256', pepper).update(digitos).digest('hex');
}
