import { describe, expect, it } from 'vitest';
import * as router from '../src/cofre/router.js';
import type { CofreTribemd } from '../src/cofre/tribemd-cofre.js';
type Estado = Awaited<ReturnType<CofreTribemd['status']>>['estado'];
const estados = { vazio: false, salvo: false, conectando: false, conectado: true, desconectado: false, atencao: false } satisfies Record<Estado, boolean>;
describe('todos os estados do status real do cofre', () => {
  for (const [estado, conectada] of Object.entries(estados)) it(estado, () => {
    const status = { salvo: estado !== 'vazio', ativo: true, estado, verificadoEm: null, codigo: null, consultasDisponiveis: null };
    expect((router as any).mapearStatusAgenda(status)).toEqual({ nome: estado === 'vazio' ? null : 'tribemd', conectada });
  });
  it('conectado com ativo false preserva desconexão e não retorna credenciais', () => {
    expect((router as any).mapearStatusAgenda({ salvo: true, ativo: false, estado: 'conectado', verificadoEm: null, codigo: null, consultasDisponiveis: null }))
      .toEqual({ nome: 'tribemd', conectada: false });
  });
});
