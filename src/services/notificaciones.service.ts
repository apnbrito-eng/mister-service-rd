import {
  addDoc, collection, doc, getDocs, onSnapshot, query, updateDoc,
  where, writeBatch, Timestamp,
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { Notificacion } from '../types';

export async function crearNotificacion(
  data: Omit<Notificacion, 'id' | 'createdAt' | 'leida'>
): Promise<void> {
  const clean = Object.fromEntries(
    Object.entries(data).filter(([, v]) => v !== undefined)
  );
  await addDoc(collection(db, 'notificaciones'), {
    ...clean,
    leida: false,
    createdAt: Timestamp.now(),
  });
}

export function suscribirNotificaciones(
  destinatarioId: string,
  callback: (notifs: Notificacion[]) => void
): () => void {
  const q = query(
    collection(db, 'notificaciones'),
    where('destinatarioId', '==', destinatarioId)
  );
  return onSnapshot(q, (snap) => {
    const notifs = snap.docs.map(d => {
      const data = d.data();
      return {
        id: d.id,
        ...data,
        createdAt: data.createdAt?.toDate?.() || new Date(),
        leidaEn: data.leidaEn?.toDate?.(),
      } as Notificacion;
    });
    notifs.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    callback(notifs.slice(0, 50));
  });
}

export async function marcarLeida(notifId: string): Promise<void> {
  await updateDoc(doc(db, 'notificaciones', notifId), {
    leida: true,
    leidaEn: Timestamp.now(),
  });
}

export async function marcarTodasLeidas(destinatarioId: string): Promise<void> {
  // Query por destinatarioId (single-field). Filtrar 'leida' en cliente para evitar índice compuesto.
  const q = query(
    collection(db, 'notificaciones'),
    where('destinatarioId', '==', destinatarioId)
  );
  const snap = await getDocs(q);
  const pendientes = snap.docs.filter(d => d.data().leida === false);
  if (pendientes.length === 0) return;
  const batch = writeBatch(db);
  pendientes.forEach(d => {
    batch.update(d.ref, { leida: true, leidaEn: Timestamp.now() });
  });
  await batch.commit();
}
