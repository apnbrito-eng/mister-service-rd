import type { Firestore, Transaction } from 'firebase-admin/firestore';
import { ErrorAcceso } from './accesoEquipo.js';
export async function operariaDeTecnico(db: Firestore, tx: Transaction, tecnicoUid: string) {
  const personal = await tx.get(db.collection('personal').where('uid', '==', tecnicoUid).limit(1));
  const directo = personal.empty ? (await tx.get(db.collection('personal').doc(tecnicoUid))).data() : personal.docs[0].data();
  const id = directo?.operariaId;
  if (typeof id !== 'string' || !/^[\w.-]{1,160}$/.test(id)) throw new ErrorAcceso(409, 'Configura la operaria responsable de este técnico en Personal antes de asignarlo.');
  let uid = id;
  let perfil = (await tx.get(db.collection('usuarios').doc(uid))).data();
  if (!perfil) {
    const persona = (await tx.get(db.collection('personal').doc(id))).data();
    if (typeof persona?.uid === 'string') { uid = persona.uid; perfil = (await tx.get(db.collection('usuarios').doc(uid))).data(); }
  }
  if (!perfil || !['operaria', 'secretaria'].includes(perfil.rol) || perfil.activo === false || perfil.eliminado) throw new ErrorAcceso(409, 'La responsable del técnico no tiene una cuenta activa.');
  return { uid, nombre: String(perfil.nombre || 'Responsable') };
}
