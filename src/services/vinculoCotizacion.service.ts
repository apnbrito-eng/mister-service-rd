import { arrayUnion, collection, deleteField, doc, runTransaction, Timestamp } from 'firebase/firestore';
import { auth, db } from '../firebase/config';

function validarOrden(datos: Record<string, unknown>, cotizacionId: string) {
  if (datos.facturada || datos.eliminada || ['cancelado', 'cerrado', 'completado'].includes(String(datos.fase)) || ['cancelado', 'completado'].includes(String(datos.estadoSimple)) || datos.estado === 'cancelado') throw new Error('La orden ya fue emitida, cerrada o anulada.');
  if (datos.cotizacionId && datos.cotizacionId !== cotizacionId) throw new Error('La orden ya tiene otra cotización. Abre la existente o desvincúlala explícitamente.');
}

/** Lee ambos extremos antes de escribir. Un borrador nunca reemplaza otro vínculo. */
export async function guardarCotizacionVinculada(datos: Record<string, unknown>, id?: string, ordenIdEsperada?: string) {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Inicia sesión nuevamente.');
  const ref = id ? doc(db, 'cotizaciones', id) : doc(collection(db, 'cotizaciones'));
  await runTransaction(db, async tx => {
    const anterior = id ? await tx.get(ref) : null;
    if (id && !anterior?.exists()) throw new Error('La cotización ya no existe.');
    const raw = anterior?.data() || {};
    if (id && ordenIdEsperada !== undefined && String(raw.ordenId || '') !== ordenIdEsperada) throw new Error('El vínculo de la cotización cambió. Recarga antes de guardar.');
    if (id && datos.ordenId !== undefined && String(datos.ordenId || '') !== String(raw.ordenId || '')) throw new Error('El vínculo de la cotización cambió. Recarga y usa la acción explícita de vincular.');
    if (raw.convertida || raw.facturaId) throw new Error('El conduce ya fue emitido; la cotización no puede modificarse.');
    if (raw.ordenId && datos.ordenId && raw.ordenId !== datos.ordenId) throw new Error('Desvincula primero la orden anterior.');
    const ordenId = String(raw.ordenId || datos.ordenId || '');
    const ordenRef = ordenId ? doc(db, 'ordenes_servicio', ordenId) : null;
    const orden = ordenRef ? await tx.get(ordenRef) : null;
    if (ordenRef) {
      if (!orden?.exists()) throw new Error('La orden ya no existe.');
      validarOrden(orden.data(), ref.id);
      if (datos.clienteId && orden.data().clienteId !== datos.clienteId) throw new Error('El cliente no coincide con la orden.');
    }
    const payload = Object.fromEntries(Object.entries({ ...datos, ...(ordenId ? { ordenId } : {}), updatedAt: Timestamp.now() }).filter(([,v]) => v !== undefined));
    if (id) tx.update(ref, payload); else tx.set(ref, payload);
    if (ordenRef) tx.update(ordenRef, { cotizacionId: ref.id, updatedAt: Timestamp.now() });
  });
  return ref.id;
}

/** Desvincular conserva la cotización y registra quién y por qué liberó la orden. */
export async function desvincularCotizacion(id: string, motivo: string, eliminar = false) {
  const uid = auth.currentUser?.uid;
  if (!uid || !motivo.trim()) throw new Error('Indica el motivo e inicia sesión.');
  await runTransaction(db, async tx => {
    const ref = doc(db, 'cotizaciones', id);
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('La cotización ya no existe.');
    const cot = snap.data();
    if (cot.convertida || cot.facturaId) throw new Error('No puedes desvincular ni eliminar una cotización con conduce emitido.');
    const ordenRef = cot.ordenId ? doc(db, 'ordenes_servicio', cot.ordenId) : null;
    const orden = ordenRef ? await tx.get(ordenRef) : null;
    if (ordenRef && !orden?.exists()) throw new Error('La orden vinculada no existe: requiere conciliación.');
    if (orden?.exists()) {
      validarOrden(orden.data(), id);
      if (orden.data().cotizacionId !== id) throw new Error('El vínculo de la orden cambió: requiere conciliación.');
    }
    const auditoria = { cotizacionId: id, ordenId: cot.ordenId || '', motivo: motivo.trim(), usuarioId: uid, fecha: Timestamp.now(), accion: eliminar ? 'eliminar_cotizacion' : 'desvincular_cotizacion' };
    if (ordenRef) tx.update(ordenRef, { cotizacionId: deleteField(), auditoriaCotizaciones: arrayUnion(auditoria), updatedAt: Timestamp.now() });
    if (eliminar) tx.delete(ref);
    else tx.update(ref, { ordenId: deleteField(), auditoriaVinculos: arrayUnion(auditoria), updatedAt: Timestamp.now() });
  });
}
