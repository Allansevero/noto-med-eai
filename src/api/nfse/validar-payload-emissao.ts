/**
 * Validação pura de payloads de entrada da API de emissão de NFS-e.
 * Isola todas as verificações de tipo, limites de tamanho e consistência de CPF
 * sem tocar no banco de dados ou em bibliotecas de I/O, garantindo testes diretos e rápidos.
 */

import { validarCpf } from '../../paciente/validar-cpf.js';
import type {
  SolicitacaoEmissaoApiPayload,
  SolicitacaoEmissaoValidada,
  ErroDetalhadoApi
} from './nfse-api-types.js';

export type ResultadoValidacaoPayload =
  | { ok: true; dados: SolicitacaoEmissaoValidada }
  | { ok: false; erro: ErroDetalhadoApi };

export function validarPayloadEmissao(payload: unknown): ResultadoValidacaoPayload {
  if (!payload || typeof payload !== 'object') {
    return {
      ok: false,
      erro: {
        codigo: 'requisicao_invalida',
        mensagem: 'Corpo da requisição deve ser um objeto JSON válido',
        correcao: 'Envie um objeto com os campos ref, medicoId, valor e paciente'
      }
    };
  }

  const p = payload as Partial<SolicitacaoEmissaoApiPayload>;
  const erroRef = validarReferencia(p.ref);
  if (erroRef) return { ok: false, erro: erroRef };

  const erroMedico = validarIdentificadorMedico(p.medicoId);
  if (erroMedico) return { ok: false, erro: erroMedico };

  const erroValor = validarValorServico(p.valor);
  if (erroValor) return { ok: false, erro: erroValor };

  const erroPaciente = validarDadosPaciente(p.paciente);
  if (erroPaciente) return { ok: false, erro: erroPaciente };

  const cpfLimpo = (p.paciente?.cpf || '').replace(/\D/g, '');
  const valorCentavos = Math.round(Number(p.valor) * 100);

  return {
    ok: true,
    dados: {
      ref: String(p.ref).trim(),
      medicoId: String(p.medicoId).trim(),
      valorCentavos,
      paciente: {
        cpfLimpo,
        nome: String(p.paciente?.nome).trim(),
        email: p.paciente?.email ? String(p.paciente.email).trim() : null,
        telefone: p.paciente?.telefone ? String(p.paciente.telefone).trim() : null
      },
      discriminacao: p.discriminacao ? String(p.discriminacao).trim() : null,
      datasConsultas: p.datasConsultas ? String(p.datasConsultas).trim() : null
    }
  };
}

function validarReferencia(ref: unknown): ErroDetalhadoApi | null {
  if (!ref || typeof ref !== 'string' || ref.trim().length === 0) {
    return {
      codigo: 'requisicao_invalida',
      campo: 'ref',
      mensagem: 'O parâmetro "ref" é obrigatório e não pode ser vazio',
      correcao: 'Informe uma referência única na query string (?ref=...) ou no corpo da requisição'
    };
  }
  if (ref.trim().length > 100) {
    return {
      codigo: 'requisicao_invalida',
      campo: 'ref',
      mensagem: 'O parâmetro "ref" não pode exceder 100 caracteres',
      correcao: 'Reduza o tamanho da referência informada'
    };
  }
  return null;
}

function validarIdentificadorMedico(medicoId: unknown): ErroDetalhadoApi | null {
  if (!medicoId || typeof medicoId !== 'string' || medicoId.trim().length === 0) {
    return {
      codigo: 'requisicao_invalida',
      campo: 'medicoId',
      mensagem: 'O campo "medicoId" é obrigatório',
      correcao: 'Informe o ID do médico/prestador cadastrado'
    };
  }
  return null;
}

function validarValorServico(valor: unknown): ErroDetalhadoApi | null {
  if (valor === undefined || valor === null || typeof valor !== 'number' || isNaN(valor) || valor <= 0) {
    return {
      codigo: 'requisicao_invalida',
      campo: 'valor',
      mensagem: 'O campo "valor" deve ser um número maior que zero',
      correcao: 'Informe o valor monetário do serviço em reais (ex: 350.00)'
    };
  }
  return null;
}

function validarDadosPaciente(paciente: unknown): ErroDetalhadoApi | null {
  if (!paciente || typeof paciente !== 'object') {
    return {
      codigo: 'requisicao_invalida',
      campo: 'paciente',
      mensagem: 'O objeto "paciente" é obrigatório',
      correcao: 'Informe os dados do tomador do serviço com nome e CPF'
    };
  }

  const pac = paciente as Partial<SolicitacaoEmissaoApiPayload['paciente']>;
  if (!pac.nome || typeof pac.nome !== 'string' || pac.nome.trim().length < 2) {
    return {
      codigo: 'requisicao_invalida',
      campo: 'paciente.nome',
      mensagem: 'O nome do paciente é obrigatório e deve ter pelo menos 2 caracteres',
      correcao: 'Informe o nome civil completo do paciente'
    };
  }

  if (!pac.cpf || !validarCpf(pac.cpf)) {
    return {
      codigo: 'requisicao_invalida',
      campo: 'paciente.cpf',
      mensagem: 'CPF do paciente é inválido ou não informado',
      correcao: 'Informe um CPF válido com 11 dígitos para o tomador do serviço'
    };
  }

  return null;
}
