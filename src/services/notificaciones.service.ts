import {
  addDoc, collection, doc, getDocs, onSnapshot, query, updateDoc,
  where, writeBatch, Timestamp,
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { Notificacion } from '../types';

/**
 * Crea una notificación. Garantiza el shape `userId` (auth.uid del
 * destinatario) — la rule de Firestore `notificaciones` filtra read/update
 * por `userId == request.auth.uid`. Si llega un objeto con el campo legacy
 * `destinatarioId` o sin `userId`, lo log-eamos en runtime para detectarlo
 * antes de que se manifieste como "notificación invisible".
 *
 * Histórico: SPRINT-127 (2026-05-10) consolidó esta validación cinturón+
 * tirantes. El cazador determinístico P-007 ya bloquea reintroducir
 * `destinatarioId` en callers nuevos, pero este warn cubre el caso runtime
 * (p.ej. callers que reciben `data` por interfaz untyped).
 */
export async function crearNotificacion(
  data: Omit<Notificacion, 'id' | 'createdAt' | 'leida'>
): Promise<void> {
  // Sanity checks runtime — no rompemos producción, solo gritamos en consola
  // si el shape se desvía del contrato (userId requerido, destinatarioId no
  // debe ser escrito por callers nuevos).
  if (!data.userId || typeof data.userId !== 'string') {
    console.warn(
      '[notificaciones] crearNotificacion sin userId — la notificación quedará invisible para su destinatario (rule filtra por userId == auth.uid). data=',
      data
    );
  }
  if ((data as { destinatarioId?: unknown }).destinatarioId !== undefined) {
    console.warn(
      '[notificaciones] crearNotificacion recibió `destinatarioId` (campo legacy deprecated). Renombrar a `userId` en el caller. data=',
      data
    );
  }
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
 * SPRINT-118 (`b781f80`, 2026-05-08) todos los empleados afectados quedaron
 * migrados a `userId`. La query legacy `destinatarioId` se mantiene como
 * red de seguridad por si aparecen docs huérfanos no detectados; el cleanup
 * profundo (B2) requiere correr `scripts/auditoria-notis-legacy-todos.ts`
 * con service-account y confirmar 0 docs sin `userId` — sprint follow-up.
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
