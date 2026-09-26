import type { Firestore, Transaction } from 'firebase-admin/firestore';
import { ErrorAcceso } from './accesoEquipo.js';
import { telefonoClienteMovil } from './accesoOrdenTecnico.js';
export function ordenAbiertaChat(o: Record<string, unknown> | undefined) {
  return !!o && o.eliminado !== true && o.eliminada !== true && o.facturada !== true && !['cerrado', 'cancelado', 'trabajo_realizado', 'facturada'].includes(String(o.fase));
}
export async function rutaMensajeEntrante(db: Firestore, tx: Transaction, telefono: string, fecha: Date) {
  const ruta = (await tx.get(db.collection('crm_chat_rutas').doc(telefono))).data();
  if (!ruta?.ordenId || typeof ruta.ordenId !== 'string' || ruta.ordenId.includes('/') || !Number.isFinite(ruta.desdeMs) || fecha.getTime() < ruta.desdeMs) return null;
  const orden = (await tx.get(db.collection('ordenes_servicio').doc(ruta.ordenId))).data();
  return ordenAbiertaChat(orden) && telefonoClienteMovil(orden?.clienteTelefono) === telefono ? ruta.ordenId as string : null;
}
export async function exigirRutaChat(db: Firestore, telefono: string, ordenId: string) {
  const ruta = (await db.collection('crm_chat_rutas').doc(telefono).get()).data();
  if (ruta?.ordenId !== ordenId) throw new ErrorAcceso(409, 'La oficina debe activar el chat para esta orden antes de enviar mensajes.');
}
