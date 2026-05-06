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

/**
 * Suscribe a notificaciones del usuario. Hace queries DUALES (`userId` y
 * `destinatarioId`) y mergea para tolerar docs pre-migración. Después de
 * correr `scripts/migrar-notificaciones-userid.ts` y un commit follow-up
 * podemos colapsar a una sola query por `userId`.
 */
export function suscribirNotificaciones(
  userId: string,
  callback: (notifs: Notificacion[]) => void
): () => void {
  const qNuevo = query(
    collection(db, 'notificaciones'),
    where('userId', '==', userId)
  );
  const qLegacy = query(
    collection(db, 'notificaciones'),
    where('destinatarioId', '==', userId)
  );

  const dedup = new Map<string, Notificacion>();
  const emitir = () => {
    const notifs = Array.from(dedup.values());
    notifs.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    callback(notifs.slice(0, 50));
  };
  const aplicarSnap = (snap: import('firebase/firestore').QuerySnapshot) => {
    snap.docChanges().forEach((change) => {
      if (change.type === 'removed') {
        dedup.delete(change.doc.id);
      } else {
        const data = change.doc.data();
        dedup.set(change.doc.id, {
          id: change.doc.id,
          ...data,
          createdAt: data.createdAt?.toDate?.() || new Date(),
          leidaEn: data.leidaEn?.toDate?.(),
        } as Notificacion);
      }
    });
    emitir();
  };
  const unsubNuevo = onSnapshot(qNuevo, aplicarSnap);
  const unsubLegacy = onSnapshot(qLegacy, aplicarSnap);
  return () => {
    unsubNuevo();
    unsubLegacy();
  };
}

export async function marcarLeida(notifId: string): Promise<void> {
  await updateDoc(doc(db, 'notificaciones', notifId), {
    leida: true,
    leidaEn: Timestamp.now(),
  });
}

export async function marcarTodasLeidas(userId: string): Promise<void> {
  // Queries duales (single-field) para tolerar docs pre-migración. Filtramos
  // 'leida' en cliente para evitar índice compuesto.
  const qNuevo = query(
    collection(db, 'notificaciones'),
    where('userId', '==', userId)
  );
  const qLegacy = query(
    collection(db, 'notificaciones'),
    where('destinatarioId', '==', userId)
  );
  const [snapNuevo, snapLegacy] = await Promise.all([
    getDocs(qNuevo),
    getDocs(qLegacy),
  ]);
  const dedup = new Map<string, import('firebase/firestore').QueryDocumentSnapshot>();
  for (const d of snapNuevo.docs) dedup.set(d.id, d);
  for (const d of snapLegacy.docs) dedup.set(d.id, d);
  const pendientes = Array.from(dedup.values()).filter((d) => d.data().leida === false);
  if (pendientes.length === 0) return;
  const batch = writeBatch(db);
  pendientes.forEach((d) => {
    batch.update(d.ref, { leida: true, leidaEn: Timestamp.now() });
  });
  await batch.commit();
}
