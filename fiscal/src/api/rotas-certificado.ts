/**
 * Router para upload, extração e custódia segura do certificado digital A1.
 * Implementa o endpoint POST /v1/onboarding/certificado conforme /contratos.
 * Nunca expõe o arquivo binário nem a senha em logs ou no retorno HTTP.
 */

import { Router, type Request, type Response } from 'express';
import { extrairChavesCertificado } from '../certificado/extrair-chaves-certificado.js';
import { consolidarParametrosFiscais } from '../tributacao/parametros-tributarios.js';
import { CODIGOS_ERRO_FISCAL } from '../../../contratos/codigos-erro.js';

export interface CertificadoRepositorioPort {
  salvarCertificadoCriptografado(dados: {
    medicoId: string;
    arquivoBuffer: Buffer;
    senhaCertificado: string;
    validoAte: Date;
    documentoTitular: string;
  }): Promise<void>;
}

export function criarRouterCertificado(repositorio?: CertificadoRepositorioPort): Router {
  const router = Router();

  router.post('/onboarding/certificado', async (req: Request, res: Response): Promise<void> => {
    try {
      const { medicoId, arquivoBase64, senha } = req.body || {};

      if (!medicoId || !arquivoBase64 || !senha) {
        res.status(400).json({
          sucesso: false,
          codigo: CODIGOS_ERRO_FISCAL.PARAMETROS_INCOMPLETOS,
          mensagem: 'medicoId, arquivoBase64 e senha são obrigatórios.'
        });
        return;
      }

      let bufferCertificado: Buffer;
      try {
        bufferCertificado = Buffer.from(arquivoBase64, 'base64');
      } catch {
        res.status(400).json({
          sucesso: false,
          codigo: CODIGOS_ERRO_FISCAL.ARQUIVO_CORROMPIDO,
          mensagem: 'O arquivo informado não é um Base64 válido.'
        });
        return;
      }

      let chaves;
      try {
        chaves = extrairChavesCertificado(bufferCertificado, senha);
      } catch (err: any) {
        res.status(400).json({
          sucesso: false,
          codigo: CODIGOS_ERRO_FISCAL.SENHA_INVALIDA,
          mensagem: `Certificado A1 ou senha inválidos: ${err?.message || 'falha ao abrir arquivo'}`
        });
        return;
      }

      if (chaves.validoAte && chaves.validoAte.getTime() < Date.now()) {
        res.status(400).json({
          sucesso: false,
          codigo: CODIGOS_ERRO_FISCAL.CERTIFICADO_EXPIRADO,
          mensagem: 'O certificado digital A1 informado já está vencido.'
        });
        return;
      }

      const documentoTitular = chaves.documentoTitular || '';
      const ehPj = documentoTitular.length === 14;

      if (repositorio) {
        await repositorio.salvarCertificadoCriptografado({
          medicoId,
          arquivoBuffer: bufferCertificado,
          senhaCertificado: senha,
          validoAte: chaves.validoAte || new Date(),
          documentoTitular
        });
      }

      const parametrosFiscaisSugeridos = consolidarParametrosFiscais({});

      res.status(200).json({
        sucesso: true,
        titular: {
          nome: chaves.nomeTitular || 'TITULAR DO CERTIFICADO',
          tipo: ehPj ? 'PJ' : 'PF',
          cnpj: ehPj ? documentoTitular : undefined,
          cpf: !ehPj ? documentoTitular : undefined,
          validadeAte: (chaves.validoAte || new Date()).toISOString()
        },
        parametrosFiscaisSugeridos,
        referenciaAdnEncontrada: false
      });
    } catch (erro: any) {
      res.status(500).json({
        sucesso: false,
        codigo: CODIGOS_ERRO_FISCAL.ERRO_INTERNO_FISCAL,
        mensagem: erro?.message || 'Erro interno ao processar certificado A1'
      });
    }
  });

  return router;
}
