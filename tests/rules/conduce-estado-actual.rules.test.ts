import { beforeAll, afterAll, beforeEach, expect, it } from 'vitest';
import { doc, getDoc, getDocs, collection, runTransaction, updateDoc } from 'firebase/firestore';
import { iniciarEntorno, entorno, resetearConPerfiles, sembrar, como, UID } from './helpers';
import { calcularEmisionActual } from '../../src/utils/cotizacionConduce';
beforeAll(async () => { await iniciarEntorno(); });
afterAll(async () => { await entorno().cleanup(); });
beforeEach(async () => { await resetearConPerfiles(); await sembrar('ordenes_servicio/o1', { fase: 'trabajo_realizado', precioFinal: 100, pagos: [{ id: 'p1', monto: 100, verificado: true }] }); });
// Ensayo del helper transaccional usado por el modal; no monta el componente.
async function emitir(id: string, concurrente?: Record<string, unknown>) {
  let alterada = false;
  const db = como(UID.admin);
  await runTransaction(db, async tx => {
    const ordenRef = doc(db, 'ordenes_servicio/o1');
    const actual = (await tx.get(ordenRef)).data()!;
    if (concurrente && !alterada) { alterada = true; await updateDoc(ordenRef, concurrente); }
    const resultado = calcularEmisionActual(actual, 100);
    tx.set(doc(db, 'facturas', id), { estado: resultado.estadoConduce, total: 100 });
    tx.update(ordenRef, { facturada: true, montoPagado: resultado.montoPagado, estadoPago: resultado.estadoPago });
  });
}
it('pago no confirmado insertado durante emisión fuerza relectura y no emite', async () => {
  await expect(emitir('cg1', { pagos: [{ id: 'p2', monto: 100, verificado: false }] })).rejects.toThrow('sin confirmar');
  expect((await getDocs(collection(como(UID.admin), 'facturas'))).empty).toBe(true);
});
it('cancelación concurrente no se convierte en cierre', async () => {
  await expect(emitir('cg1', { fase: 'cancelado' })).rejects.toThrow('anulada');
  expect((await getDoc(doc(como(UID.admin), 'ordenes_servicio/o1'))).data()?.fase).toBe('cancelado');
  expect((await getDocs(collection(como(UID.admin), 'facturas'))).empty).toBe(true);
});
it('dos emisiones conservan un solo conduce', async () => {
  const resultados = await Promise.allSettled([emitir('cg1'), emitir('cg2')]);
  expect(resultados.filter(r => r.status === 'fulfilled')).toHaveLength(1);
  expect((await getDocs(collection(como(UID.admin), 'facturas'))).size).toBe(1);
});
