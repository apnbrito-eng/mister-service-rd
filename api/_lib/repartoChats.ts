import type { Firestore, Transaction } from 'firebase-admin/firestore';
import { FieldValue } from 'firebase-admin/firestore';
import { elegirResponsable } from '../../src/utils/repartoChats.js';
/** Reads only; caller commits the cursor together with the incoming message. */
export async function prepararReparto(db: Firestore, tx: Transaction) {
  const fechaRD = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santo_Domingo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const ref = db.collection('config').doc('reparto_chats');
  const [cursor, personas, ponches] = await Promise.all([
    tx.get(ref), tx.get(db.collection('usuarios').where('rol', 'in', ['secretaria', 'operaria'])), tx.get(db.collection('ponches').where('fechaRD', '==', fechaRD)),
  ]);
  const elegida = elegirResponsable(personas.docs.map(d => ({ uid: d.id, nombre: d.data().nombre || 'Responsable', rol: d.data().rol, activo: d.data().activo, eliminado: d.data().eliminado })), ponches.docs.map(d => ({ personalUid: d.data().personalUid, tipo: d.data().tipo, timestampMs: d.data().timestamp?.toMillis?.() || 0 })), cursor.data()?.ultimaUid);
  return elegida ? { ...elegida, aplicar: () => tx.set(ref, { ultimaUid: elegida.uid, fechaRD, actualizadoEn: FieldValue.serverTimestamp() }, { merge: true }) } : null;
}
