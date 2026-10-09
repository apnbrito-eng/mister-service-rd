import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import { ErrorAcceso } from './accesoEquipo.js';

export function autorizarCartera(rol: string, perfil: Record<string, unknown> | undefined) {
  if (!['administrador', 'coordinadora', 'secretaria', 'operaria'].includes(rol) || !perfil || perfil.activo === false || perfil.eliminado === true) throw new ErrorAcceso(403, 'No tienes permiso para gestionar carteras.');
  const permisos = perfil.permisosSistema as Record<string, unknown> | undefined;
  if (perfil.permisosPersonalizados === true && permisos?.clientesModificar !== true) throw new ErrorAcceso(403, 'El permiso de modificar clientes está desactivado.');
}

export type EquipoCartera = 'A' | 'B';
export function validarTraslado(destino: unknown, motivo: unknown) {
  if (destino !== 'A' && destino !== 'B') throw new ErrorAcceso(400, 'Selecciona equipo A o B.');
  if (typeof motivo !== 'string' || motivo.trim().length < 5 || motivo.trim().length > 500) throw new ErrorAcceso(400, 'Escribe un motivo de 5 a 500 caracteres.');
  return { destino, motivo: motivo.trim() } as { destino: EquipoCartera; motivo: string };
}
/** Cursor and assignment are committed together; retries never consume another turn. */
export async function asignarCartera(db: Firestore, clienteId: string, actorUid: string) {
  const ref = db.collection('clientes').doc(clienteId);
  const cursorRef = db.collection('config').doc('reparto_carteras');
  return db.runTransaction(async tx => {
    const [cliente, cursor, actor] = await Promise.all([tx.get(ref), tx.get(cursorRef), tx.get(db.collection('usuarios').doc(actorUid))]);
    if (!cliente.exists || cliente.data()?.eliminado || cliente.data()?.mergedaCon) throw new ErrorAcceso(404, 'Cliente no disponible.');
    const telefono = cliente.data()?.telefonoNormalizado;
    if (typeof telefono === 'string' && telefono) {
      const mismos = await tx.get(db.collection('clientes').where('telefonoNormalizado', '==', telefono));
      if (mismos.docs.some(d => d.id !== clienteId && !d.data().eliminado && !d.data().mergedaCon)) throw new ErrorAcceso(409, 'Hay varios clientes con este teléfono. Revisa la identidad antes de asignar cartera.');
    }
    const actual = cliente.data()?.carteraEquipo;
    if (actual === 'A' || actual === 'B') return actual as EquipoCartera;
    const destino: EquipoCartera = cursor.data()?.ultimoEquipo === 'A' ? 'B' : 'A';
    const fecha = FieldValue.serverTimestamp();
    tx.update(ref, { carteraEquipo: destino, carteraAsignadaPor: actorUid, carteraAsignadaEn: fecha, carteraOrigen: 'alta' });
    tx.set(cursorRef, { ultimoEquipo: destino, actualizadoEn: fecha });
    tx.create(ref.collection('cartera_historial').doc('alta'), { anteriorEquipo: null, nuevoEquipo: destino, actorUid, actorNombre: String(actor.data()?.nombre || actorUid), timestamp: fecha, motivo: 'Asignación alternada de cliente nuevo', puntoAccion: 'alta', origen: 'alta' });
    return destino;
  });
}
export async function trasladarCartera(db: Firestore, clienteId: string, actorUid: string, destino: EquipoCartera, motivo: string, solicitudId: string) {
  const ref = db.collection('clientes').doc(clienteId);
  const historialRef = ref.collection('cartera_historial').doc(solicitudId);
  return db.runTransaction(async tx => {
    const [cliente, historial, actor] = await Promise.all([tx.get(ref), tx.get(historialRef), tx.get(db.collection('usuarios').doc(actorUid))]);
    if (historial.exists) {
      const previo = historial.data();
      if (previo?.actorUid !== actorUid || previo?.nuevoEquipo !== destino || previo?.motivo !== motivo) throw new ErrorAcceso(409, 'Identificador de solicitud ya utilizado.');
      return { equipo: destino, repetido: true };
    }
    if (!cliente.exists || cliente.data()?.eliminado || cliente.data()?.mergedaCon) throw new ErrorAcceso(404, 'Cliente no disponible.');
    const origen = cliente.data()?.carteraEquipo;
    if (origen !== 'A' && origen !== 'B') throw new ErrorAcceso(409, 'Este cliente necesita asignación inicial antes del traslado.');
    if (origen === destino) throw new ErrorAcceso(409, 'El cliente ya pertenece a ese equipo.');
    const fecha = FieldValue.serverTimestamp();
    tx.update(ref, { carteraEquipo: destino, carteraAsignadaPor: actorUid, carteraAsignadaEn: fecha, carteraOrigen: 'traslado' });
    tx.create(historialRef, { anteriorEquipo: origen, nuevoEquipo: destino, actorUid, actorNombre: String(actor.data()?.nombre || actorUid), timestamp: fecha, motivo, puntoAccion: 'clientes', origen: 'traslado' });
    return { equipo: destino, repetido: false };
  });
}
