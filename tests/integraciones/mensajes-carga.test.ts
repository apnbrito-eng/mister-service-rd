import { describe, it, expect, vi } from 'vitest';
const f = vi.hoisted(() => ({ listeners: [] as any[], queries: [] as any[] }));
vi.mock('../../src/firebase/config', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
  collection: (_: unknown, name: string) => name, doc: vi.fn(), updateDoc: vi.fn(), addDoc: vi.fn(), Timestamp: class {},
  where: (...x: unknown[]) => ['where', ...x], orderBy: (...x: unknown[]) => ['orderBy', ...x], limit: (n: number) => ['limit', n],
  query: (...x: unknown[]) => { f.queries.push(x); return x; },
  onSnapshot: (_: unknown, next: any, error: any) => { f.listeners.push({ next, error }); return vi.fn(); },
}));
import { suscribirMensajes, suscribirConversaciones } from '../../src/services/whatsappInbox.service';
it('limita ambos historiales y espera ambas respuestas antes de dibujar', () => {
  const cb = vi.fn(), error = vi.fn();
  const stop = suscribirMensajes('2025550100', cb, 50, error);
  expect(f.queries.every(q => q.some((x: any) => x[0] === 'limit' && x[1] === 50))).toBe(true);
  f.listeners[0].next({ docs: [] }); expect(cb).not.toHaveBeenCalled();
  f.listeners[1].next({ docs: [] }); expect(cb).toHaveBeenCalledWith([]);
  f.listeners[0].error(new Error('sin red')); expect(error).toHaveBeenCalled(); stop();
});

it('ordena las conversaciones antes de limitar y refleja cambios en vivo', () => {
  const cb = vi.fn(); const stop = suscribirConversaciones(cb, undefined, 25);
  const q = f.queries.at(-1);
  expect(q).toContainEqual(['orderBy', 'ultimaActividad', 'desc']);
  expect(q).toContainEqual(['limit', 25]);
  const next = f.listeners.at(-1).next;
  const doc = (id: string, ms: number, preview: string) => ({ id, data: () => ({ ultimaActividad: new Date(ms), ultimoMensajeEntrante: { preview } }) });
  next({ docs: [doc('a', 1000, 'antes'), doc('b', 2000, 'hola')] });
  expect(cb.mock.calls.at(-1)[0].map((x: any) => x.id)).toEqual(['b', 'a']);
  next({ docs: [doc('a', 3000, 'nuevo'), doc('b', 2000, 'hola')] });
  expect(cb.mock.calls.at(-1)[0][0].ultimoMensajeEntrante.preview).toBe('nuevo'); stop();
});
