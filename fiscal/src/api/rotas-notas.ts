/**
 * Router para emissão idempotente e consulta de notas fiscais / DANFSE em PDF.
 * Implementa POST /v1/notas/emitir e GET /v1/notas/:pedidoId/pdf conforme /contratos.
 */

import { Router, type Request, type Response } from 'express';
import type { EmissorIdempotenteService, EmissaoRepositorio } from '../emissao/emissor-idempotente.js';
import { gerarDanfsePdf } from '../danfse/gerar-danfse-pdf.js';
import { CODIGOS_ERRO_FISCAL } from '../../../contratos/codigos-erro.js';

export function criarRouterNotas(
  emissorService: EmissorIdempotenteService,
  repositorio: EmissaoRepositorio
): Router {
  const router = Router();

  router.post('/notas/emitir', async (req: Request, res: Response): Promise<void> => {
    try {
      const pedidoId = req.headers['idempotency-key'] as string || req.body?.pedidoId;
      if (!pedidoId) {
        res.status(400).json({
          sucesso: false,
          codigo: CODIGOS_ERRO_FISCAL.PARAMETROS_INCOMPLETOS,
          mensagem: 'pedidoId é obrigatório no payload ou no cabeçalho Idempotency-Key.'
        });
        return;
      }

      const requisicao = {
        ...req.body,
        pedidoId
      };

      const resultado = await emissorService.emitir(requisicao);
      const statusCode = resultado.sucesso ? 200 : 400;
      res.status(statusCode).json(resultado);
    } catch (err: any) {
      res.status(500).json({
        sucesso: false,
        codigo: CODIGOS_ERRO_FISCAL.ERRO_INTERNO_FISCAL,
        mensagem: err?.message || 'Erro inesperado ao processar emissão'
      });
    }
  });

  router.get('/notas/:pedidoId', async (req: Request, res: Response): Promise<void> => {
    try {
      const pedidoId = String(req.params.pedidoId);
      const registro = await repositorio.buscarPorPedidoId(pedidoId);
      if (!registro) {
        res.status(404).json({
          sucesso: false,
          mensagem: 'Nota fiscal não encontrada para o pedido informado.'
        });
        return;
      }
      res.json({ sucesso: true, nota: registro });
    } catch (err: any) {
      res.status(500).json({
        sucesso: false,
        mensagem: err?.message || 'Erro ao consultar nota'
      });
    }
  });

  router.get('/notas/:pedidoId/pdf', async (req: Request, res: Response): Promise<void> => {
    try {
      const pedidoId = String(req.params.pedidoId);
      const registro = await repositorio.buscarPorPedidoId(pedidoId);

      if (!registro || registro.status !== 'autorizada') {
        res.status(404).json({
          sucesso: false,
          mensagem: 'DANFSE indisponível para este pedido ou nota não autorizada.'
        });
        return;
      }

      const pdfBytes = await gerarDanfsePdf({
        numeroNota: registro.numeroNota || '1',
        serie: registro.serie || '1',
        chaveAcesso: registro.chaveAcesso || '0000',
        dataEmissao: registro.dataEmissao || new Date().toISOString(),
        prestador: {
          nome: 'CLINICA MEDICA TITULAR',
          documento: '12345678000195'
        },
        tomador: {
          nome: 'PACIENTE ATENDIDO',
          documento: '12345678901'
        },
        servico: {
          discriminacao: 'Consulta médica clínica',
          valorCentavos: 45000,
          aliquotaIss: 2.01
        }
      });

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="danfse-${registro.numeroNota || pedidoId}.pdf"`);
      res.send(Buffer.from(pdfBytes));
    } catch (err: any) {
      res.status(500).json({
        sucesso: false,
        mensagem: err?.message || 'Erro ao gerar PDF da DANFSE'
      });
    }
  });

  return router;
}
