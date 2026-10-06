import { arrayUnion, doc, runTransaction, Timestamp } from 'firebase/firestore';
import type { OrdenServicio, Usuario } from '../types';
import { db } from '../firebase/config';
import { crearRegistroAuditoria, parseOrden } from '../utils';
import { puedeGestionarRespuestaPresupuesto } from '../utils/presupuestoOrden';

/** Confirma el servicio comunicado al cliente, sin alterar cierre, vigencia ni importe. */
export async function confirmarSoloChequeoCliente(orden: OrdenServicio, usuario: Usuario, uid: string): Promise<void> {
  const ref = doc(db, 'ordenes_servicio', orden.id);
  await runTransaction(db, async tx => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('La orden no existe.');
    const actual = parseOrden(snap.id, snap.data());
    if (!uid || !puedeGestionarRespuestaPresupuesto(actual, usuario.rol, uid)) throw new Error('No tienes permiso para confirmar este chequeo.');
    if (!actual.soloChequeo || actual.chequeoConfirmacionEstado !== 'pendiente') throw new Error('El chequeo no está pendiente de confirmación.');
    if (!actual.precioChequeo || actual.precioChequeo !== orden.precioChequeo) throw new Error('El importe cambió. Revisa la orden antes de confirmar.');
    tx.update(ref, {
      chequeoConfirmacionEstado: 'confirmado', chequeoConfirmadoPor: uid,
      chequeoConfirmadoEn: Timestamp.now(), updatedAt: Timestamp.now(),
      auditoria: arrayUnion(crearRegistroAuditoria(usuario.nombre, 'marcar_chequeo', `Confirmó con el cliente solo chequeo por RD$${actual.precioChequeo}.`, 'chequeoConfirmacionEstado', 'pendiente', 'confirmado')),
    });
  });
}
