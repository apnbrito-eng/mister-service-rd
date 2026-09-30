import { beforeAll, afterAll, beforeEach, expect, it, vi } from 'vitest';
import { doc, getDoc, getDocs, collection } from 'firebase/firestore';
import { iniciarEntorno, entorno, resetearConPerfiles, sembrar, como, UID } from './helpers';
const contexto = vi.hoisted(() => ({ db: undefined as unknown }));
vi.mock('../../src/firebase/config', () => ({ get db() { return contexto.db; } }));
import { completarConsumoConduce } from '../../src/services/consumoConduce.service';
beforeAll(async () => { await iniciarEntorno(); });
afterAll(async () => { await entorno().cleanup(); });
beforeEach(async () => {
  await resetearConPerfiles(); contexto.db = como(UID.admin);
  await sembrar('facturas/cg1', { inventarioPendiente: true, items: [{ tipoItem: 'pieza', piezaInventarioId: 'p1', cantidad: 2 }] });
  await sembrar('piezas_inventario/p1', { stockActual: 5, nombre: 'Motor' });
});
it('dos solicitudes concurrentes y reintento dejan una salida y stock exacto', async () => {
  await Promise.all([completarConsumoConduce('cg1', 'Admin'), completarConsumoConduce('cg1', 'Admin')]);
  await completarConsumoConduce('cg1', 'Admin');
  expect((await getDoc(doc(como(UID.admin), 'piezas_inventario/p1'))).data()?.stockActual).toBe(3);
  expect((await getDocs(collection(como(UID.admin), 'movimientos_inventario'))).size).toBe(1);
  expect((await getDoc(doc(como(UID.admin), 'facturas/cg1'))).data()?.inventarioPendiente).toBe(false);
});
it('stock insuficiente conserva pendiente sin movimiento', async () => {
  await sembrar('piezas_inventario/p1', { stockActual: 1 });
  await expect(completarConsumoConduce('cg1', 'Admin')).rejects.toThrow('Stock insuficiente');
  expect((await getDocs(collection(como(UID.admin), 'movimientos_inventario'))).empty).toBe(true);
  expect((await getDoc(doc(como(UID.admin), 'facturas/cg1'))).data()?.inventarioPendiente).toBe(true);
});
it('técnico no puede consumir stock desde conduce', async () => {
  contexto.db = como(UID.tecnico);
  await expect(completarConsumoConduce('cg1', 'Tecnico')).rejects.toThrow();
  expect((await getDoc(doc(como(UID.admin), 'piezas_inventario/p1'))).data()?.stockActual).toBe(5);
});
