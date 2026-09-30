import { beforeEach, describe, expect, it, vi } from 'vitest';
const estado = vi.hoisted(() => ({ docs: new Map<string, any>(), cola: Promise.resolve() }));
vi.mock('../../src/firebase/config', () => ({ db: {} }));
vi.mock('firebase/firestore', () => {
  const snap = (ref: string) => ({ exists: () => estado.docs.has(ref), data: () => estado.docs.get(ref) });
  return { doc: (_: unknown, col: string, id: string) => `${col}/${id}`, getDoc: async (ref: string) => snap(ref), Timestamp: { now: () => 1 }, runTransaction: async (_: unknown, fn: any) => {
    const siguiente = estado.cola.then(async () => {
      const writes: Array<() => void> = [];
      const result = await fn({ get: async (ref: string) => snap(ref), update: (ref: string, data: any) => writes.push(() => estado.docs.set(ref, { ...estado.docs.get(ref), ...data })), set: (ref: string, data: any) => writes.push(() => estado.docs.set(ref, data)) });
      writes.forEach(w => w()); return result;
    }); estado.cola = siguiente.catch(() => {}); return siguiente;
  } };
});
import { completarConsumoConduce } from '../../src/services/consumoConduce.service';
beforeEach(() => { estado.docs.clear(); estado.cola = Promise.resolve(); estado.docs.set('facturas/f1', { inventarioPendiente: true, items: [{ tipoItem: 'pieza', piezaInventarioId: 'p1', cantidad: 2 }] }); estado.docs.set('piezas_inventario/p1', { stockActual: 5 }); });
describe('consumo idempotente después del conduce', () => {
  it('dos solicitudes y reintento consumen una sola vez', async () => {
    await Promise.all([completarConsumoConduce('f1', 'admin'), completarConsumoConduce('f1', 'admin')]);
    await completarConsumoConduce('f1', 'admin');
    expect(estado.docs.get('piezas_inventario/p1').stockActual).toBe(3);
    expect([...estado.docs.keys()].filter(k => k.startsWith('movimientos_inventario/'))).toHaveLength(1);
    expect(estado.docs.get('facturas/f1').inventarioPendiente).toBe(false);
    expect([...estado.docs.keys()].filter(k => k.startsWith('comisiones/'))).toHaveLength(0);
  });
  it('stock insuficiente conserva pendiente sin salida ni saldo negativo', async () => {
    estado.docs.set('piezas_inventario/p1', { stockActual: 1 });
    await expect(completarConsumoConduce('f1', 'admin')).rejects.toThrow('Stock insuficiente');
    expect(estado.docs.get('piezas_inventario/p1').stockActual).toBe(1);
    expect(estado.docs.get('facturas/f1').inventarioPendiente).toBe(true);
  });
  it('reintento con otra cantidad rechaza inconsistencia histórica', async () => {
    await completarConsumoConduce('f1', 'admin');
    estado.docs.get('facturas/f1').items[0].cantidad = 3;
    estado.docs.get('facturas/f1').inventarioPendiente = true;
    await expect(completarConsumoConduce('f1', 'admin')).rejects.toThrow('no coincide');
    expect(estado.docs.get('piezas_inventario/p1').stockActual).toBe(3);
  });
});
