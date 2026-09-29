import type { VercelRequest, VercelResponse } from '@vercel/node';
import { beforeEach, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ docs: new Map<string, Record<string, unknown>>(), id: 0 }));
vi.mock('../../api/_lib/accesoEquipo', () => ({
  ErrorAcceso: class extends Error { constructor(public status: number, mensaje: string) { super(mensaje); } },
  accesoEquipo: async () => ({ uid: 'qa', rol: 'operaria', db: {
    collection: (nombre: string) => ({ doc: (id = `id${++state.id}`) => ({ id, path: `${nombre}/${id}` }) }),
    runTransaction: async (fn: (tx: unknown) => Promise<unknown>) => fn({
      get: async (r: { path: string }) => ({ exists: state.docs.has(r.path), data: () => state.docs.get(r.path) }),
      set: (r: { path: string }, d: Record<string, unknown>) => state.docs.set(r.path, d),
      create: (r: { path: string }, d: Record<string, unknown>) => state.docs.set(r.path, d),
    }),
  } }),
}));
import handler from '../../api/ai/conocimiento';
async function enviar(body: unknown) {
  let code = 200; let data: Record<string, unknown> = {};
  const res = { setHeader: vi.fn(), status: (c: number) => { code = c; return res; }, json: (d: unknown) => { data = d as Record<string, unknown>; return res; } };
  await handler({ method: 'POST', body } as VercelRequest, res as unknown as VercelResponse); return { code, data };
}
beforeEach(() => { state.docs.clear(); state.id = 0; });
const aporte = { accion: 'crear', titulo: 'Limpieza general', contenido: 'Procedimiento general para revisión del equipo.', requestId: 'qa-request-123' };
it('reintento después de respuesta perdida devuelve mismo aporte sin consumir cuota ni duplicar auditoría', async () => {
  const primera = await enviar(aporte), segunda = await enviar(aporte);
  expect(primera.code).toBe(201); expect(segunda.code).toBe(200); expect(segunda.data.id).toBe(primera.data.id);
  expect([...state.docs.keys()].filter(k => k.startsWith('conocimiento_equipo/'))).toHaveLength(1);
  expect([...state.docs.keys()].filter(k => k.startsWith('auditoria_admin/'))).toHaveLength(1);
  expect([...state.docs.entries()].find(([k]) => k.startsWith('rate_limits/qa_conocimiento_'))![1].total).toBe(1);
});
it('el mismo requestId no puede cambiar el contenido de una propuesta', async () => {
  await enviar(aporte);
  expect((await enviar({ ...aporte, titulo: 'Otro procedimiento' })).code).toBe(409);
});
it('el creador anterior sin requestId sigue creando aportes pendientes', async () => {
  const { requestId: _id, ...anterior } = aporte;
  expect((await enviar(anterior)).code).toBe(201);
  expect([...state.docs.entries()].find(([k]) => k.startsWith('conocimiento_equipo/'))![1].estado).toBe('pendiente');
});
