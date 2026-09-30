import { doc, runTransaction, Timestamp } from 'firebase/firestore';
import { db } from '../firebase/config';

/** Una ocurrencia conserva su identidad incluso si dos oficinas la generan a la vez. */
export function idOrdenMantenimiento(mantenimientoId: string, fecha: Date): string {
  if (!Number.isFinite(fecha.getTime())) throw new Error('Revisa la fecha del mantenimiento.');
  return `mantenimiento-${encodeURIComponent(mantenimientoId)}-${fecha.getTime()}`;
}
export async function generarOcurrenciaMantenimiento(id: string, fecha: Date, siguiente: Date, payload: Record<string, unknown>, frecuencia: string) {
  const ordenId = idOrdenMantenimiento(id, fecha);
  return runTransaction(db, async tx => {
    const ordenRef = doc(db, 'ordenes_servicio', ordenId);
    const mantenimientoRef = doc(db, 'mantenimiento', id);
    const [orden, mantenimiento] = await Promise.all([tx.get(ordenRef), tx.get(mantenimientoRef)]);
    if (orden.exists()) return { ordenId, numero: String(orden.data().numero), creada: false };
    if (!mantenimiento.exists()) throw new Error('El mantenimiento ya no existe.');
    const actual = mantenimiento.data();
    if (actual.frecuencia !== frecuencia || actual.activo === false || actual.proximaFecha?.toDate?.().getTime() !== fecha.getTime()) throw new Error('La programación cambió. Actualiza la lista antes de generar.');
    if (!actual.clienteId || actual.clienteId !== payload.clienteId || (actual.tecnicoId || '') !== (payload.tecnicoId || '') || actual.equipoTipo !== payload.equipoTipo) throw new Error('Los datos del mantenimiento cambiaron. Actualiza la lista.');
    const limpio = Object.fromEntries(Object.entries({ ...payload, mantenimientoId: id }).filter(([, valor]) => valor !== undefined));
    tx.set(ordenRef, limpio);
    tx.update(mantenimientoRef, { proximaFecha: Timestamp.fromDate(siguiente), updatedAt: Timestamp.now() });
    return { ordenId, numero: String(payload.numero), creada: true };
  });
}
