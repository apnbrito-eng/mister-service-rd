import type { Firestore } from 'firebase-admin/firestore';
import { ErrorAcceso } from './accesoEquipo.js';
export function telefonoClienteMovil(raw: unknown) {
  let digits = typeof raw === 'string' ? raw.replace(/\D/g, '') : '';
  if (digits.length === 10) digits = '1' + digits;
  return /^1\d{10}$/.test(digits) ? digits : null;
}
export function validarAsignacionTecnico(orden: Record<string, unknown> | undefined, ids: string[], destinatario?: string) {
  if (!orden || typeof orden.tecnicoId !== 'string' || !ids.includes(orden.tecnicoId)) throw new ErrorAcceso(403, 'La orden ya no está asignada a este técnico.');
  if (orden.eliminado === true || orden.eliminada === true) throw new ErrorAcceso(403, 'La orden fue eliminada.');
  if (['cerrado', 'cancelado', 'trabajo_realizado', 'facturada'].includes(String(orden.fase)) || orden.facturada === true) throw new ErrorAcceso(403, 'La orden está cerrada para el técnico.');
  const telefono = telefonoClienteMovil(orden.clienteTelefono);
  if (!telefono || (destinatario && destinatario !== telefono)) throw new ErrorAcceso(403, 'El destinatario no pertenece a esta orden.');
  return telefono;
}
export async function accesoOrdenTecnico(db: Firestore, uid: string, ordenId: unknown, destinatario?: string, exigirContacto = false) {
  if (typeof ordenId !== 'string' || !ordenId || ordenId.includes('/') || ordenId.length > 150) throw new ErrorAcceso(400, 'Indica una orden válida.');
  const perfil = (await db.collection('usuarios').doc(uid).get()).data();
  if (!perfil || perfil.rol !== 'tecnico' || perfil.activo === false || perfil.eliminado === true) throw new ErrorAcceso(403, 'La cuenta técnica no está activa.');
  if (exigirContacto && !(perfil.permisosPersonalizados === true ? perfil.permisosSistema?.tecnicoPuedeContactarCliente === true : !perfil.permisosSistema && perfil.permisos?.puedeContactarCliente === true)) throw new ErrorAcceso(403, 'La oficina debe habilitar tu permiso para contactar al cliente.');
  const personal = await db.collection('personal').where('uid', '==', uid).limit(2).get();
  const ids = [uid, ...personal.docs.filter(p => p.data().activo !== false && p.data().eliminado !== true).map(p => p.id)];
  const orden = (await db.collection('ordenes_servicio').doc(ordenId).get()).data();
  const telefono = validarAsignacionTecnico(orden, ids, destinatario);
  return { ordenId, telefono, orden: orden! };
}
