import { soloChequeoDisponible } from '../utils/soloChequeoDisponible';
import { collection, doc, runTransaction, Timestamp, arrayUnion, getDocs, query, where } from 'firebase/firestore';
import { auth, db } from '../firebase/config';
import { fechaProgramadaRD } from '../utils/fechaMantenimiento';
export interface SeguimientoChequeo {
  responsableUid: string;
  proximaFecha: string;
  resultado: 'pendiente' | 'contactado' | 'interesado' | 'no_interesado';
  nota: string;
}
/** Gestión comercial independiente del cierre técnico y de los importes. */
export async function guardarSeguimientoChequeo(ordenId: string, gestion: SeguimientoChequeo) {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Inicia sesión para registrar el seguimiento.');
  if (!['pendiente', 'contactado', 'interesado', 'no_interesado'].includes(gestion.resultado) || !/^[\w.-]{1,160}$/.test(gestion.responsableUid) || !fechaProgramadaRD(gestion.proximaFecha) || gestion.nota.trim().length < 5) throw new Error('Selecciona responsable, fecha y una nota de al menos 5 caracteres.');
  const normalizada: SeguimientoChequeo = { responsableUid: gestion.responsableUid, proximaFecha: gestion.proximaFecha, resultado: gestion.resultado, nota: gestion.nota.trim() };
  const destinos = gestion.responsableUid === uid ? null : await getDocs(query(collection(db, 'personal'), where('uid', '==', gestion.responsableUid)));
  if (destinos && destinos.size !== 1) throw new Error('El responsable requiere un vínculo único de personal con su cuenta.');
  const responsableRef = destinos ? destinos.docs[0].ref : doc(db, 'usuarios', uid);
  const referencia = doc(db, 'ordenes_servicio', ordenId);
  const notificacion = doc(collection(db, 'notificaciones'));
  return runTransaction(db, async tx => {
    const [orden, responsable, actor] = await Promise.all([tx.get(referencia), tx.get(responsableRef), tx.get(doc(db, 'usuarios', uid))]);
    const oficina = (datos: Record<string, unknown> | undefined) => datos && datos.activo !== false && datos.eliminado !== true && ['administrador', 'coordinadora', 'secretaria', 'operaria'].includes(String(datos.rol));
    if ((destinos && responsable.data()?.uid !== gestion.responsableUid) || !oficina(responsable.data()) || !oficina(actor.data())) throw new Error('El responsable y quien registra deben tener una cuenta de oficina activa.');
    if (!orden.exists() || !soloChequeoDisponible(orden.data())) throw new Error('La orden ya no está disponible como solo chequeo.');
    const anterior = orden.data().seguimientoChequeo;
    if (anterior && ['responsableUid', 'proximaFecha', 'resultado', 'nota'].every(k => anterior[k] === normalizada[k as keyof SeguimientoChequeo])) return;
    const registro = { ...normalizada, actualizadoPor: uid, actualizadoAt: Timestamp.now() };
    tx.update(referencia, { seguimientoChequeo: registro, historialSeguimientoChequeo: arrayUnion(registro) });
    tx.set(notificacion, { userId: gestion.responsableUid, tipo: 'recordatorio', titulo: 'Seguimiento de solo chequeo', mensaje: `Orden ${orden.data().numero || ordenId}: próxima gestión ${gestion.proximaFecha}. ${gestion.nota.trim()}`, ordenId, leida: false, createdAt: Timestamp.now() });
  });
}
