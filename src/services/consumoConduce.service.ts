import { doc, getDoc, runTransaction, Timestamp } from 'firebase/firestore';
import { db } from '../firebase/config';

/** Cada salida corresponde a una línea inmutable del conduce. Un reintento no descuenta otra vez. */
export async function completarConsumoConduce(facturaId: string, usuario: string): Promise<void> {
  const facturaRef = doc(db, 'facturas', facturaId);
  const factura = (await getDoc(facturaRef)).data();
  if (!factura) throw new Error('El conduce no existe.');
  // No reprocesar documentos históricos sin marca: podrían tener salidas legacy.
  if (factura.inventarioPendiente !== true) return;
  const items = Array.isArray(factura.items) ? factura.items : [];
  for (let indice = 0; indice < items.length; indice++) {
    const item = items[indice];
    if (item.tipoItem !== 'pieza' || !item.piezaInventarioId) continue;
    const cantidad = Number(item.cantidad);
    if (!Number.isFinite(cantidad) || cantidad <= 0) throw new Error('Cantidad de pieza inválida; revisar el conduce.');
    await runTransaction(db, async tx => {
      const movimientoRef = doc(db, 'movimientos_inventario', `conduce-${facturaId}-${indice}`);
      const piezaRef = doc(db, 'piezas_inventario', item.piezaInventarioId);
      const [actualSnap, movimientoSnap, piezaSnap] = await Promise.all([tx.get(facturaRef), tx.get(movimientoRef), tx.get(piezaRef)]);
      const actual = actualSnap.data(); const pieza = piezaSnap.data(); const movimiento = movimientoSnap.data();
      const linea = actual?.items?.[indice];
      if (!linea || linea.piezaInventarioId !== item.piezaInventarioId || Number(linea.cantidad) !== cantidad) throw new Error('Las piezas del conduce cambiaron; requiere conciliación.');
      if (movimiento) {
        if (movimiento.piezaId !== item.piezaInventarioId || movimiento.cantidad !== cantidad) throw new Error('El movimiento no coincide con el conduce; requiere conciliación.');
        return;
      }
      const stock = Number(pieza?.stockActual);
      if (!pieza || !Number.isFinite(stock) || stock < cantidad) throw new Error('Stock insuficiente. Revisa Inventario y vuelve a completar el consumo.');
      const ahora = Timestamp.now();
      tx.update(piezaRef, { stockActual: stock - cantidad, updatedAt: ahora });
      tx.set(movimientoRef, { piezaId: item.piezaInventarioId, piezaNombre: pieza.nombre || item.descripcion || '', tipo: 'salida', cantidad, motivo: 'venta_orden', usuario, fecha: ahora, facturaId, ordenId: actual?.ordenId || '', ordenNumero: actual?.numero || '' });
    });
  }
  await runTransaction(db, async tx => {
    const actual = (await tx.get(facturaRef)).data();
    if (!actual || JSON.stringify(actual.items || []) !== JSON.stringify(items)) throw new Error('El conduce cambió; revisa el consumo.');
    const refs = items.map((item: Record<string, unknown>, indice: number) => item.tipoItem === 'pieza' && item.piezaInventarioId ? doc(db, 'movimientos_inventario', `conduce-${facturaId}-${indice}`) : null).filter(Boolean);
    for (const ref of refs) { if (!(await tx.get(ref!)).exists()) throw new Error('Quedan piezas pendientes de registrar.'); }
    tx.update(facturaRef, { inventarioPendiente: false, inventarioCompletadoAt: Timestamp.now() });
  });
}
