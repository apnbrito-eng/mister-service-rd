import type { Firestore } from 'firebase-admin/firestore';
import { claveBot } from './presupuestoBotServicio.js';
import { enteroSeguro } from './politicaBotServicio.js';
const refTrabajo = (db: Firestore, id: string) => {
  if (!/^[a-f0-9]{64}$/.test(id)) throw new Error('Trabajo inválido');
  return db.doc(`bot_servicio_sim_trabajos/${id}`);
};
/** Cola durable aislada, sin integración con webhook ni Meta. */
export async function encolarTrabajoBot(db: Firestore, entrada: { phoneNumberId: string; wamid: string; clienteId: string }, ahora = Date.now()) {
  if (!/^\d{1,30}$/.test(entrada.phoneNumberId) || !entrada.wamid || entrada.wamid.length > 256 || !entrada.clienteId || entrada.clienteId.length > 128) throw new Error('Mensaje inválido');
  const id = claveBot(JSON.stringify([entrada.phoneNumberId, entrada.wamid]));
  await db.runTransaction(async tx => {
    const ref = refTrabajo(db, id), sesion = db.doc(`bot_servicio_sim_sesiones/${claveBot(entrada.clienteId)}`);
    const [previo, s] = await Promise.all([tx.get(ref), tx.get(sesion)]);
    if (previo.exists) {
      if (previo.data()?.clienteId !== entrada.clienteId) throw new Error('Mensaje reutilizado para otro cliente');
      return;
    }
    tx.set(ref, { ...entrada, epoch: s.data()?.epoch ?? 0, estado: s.data()?.pausado ? 'cancelado' : 'pendiente', intentos: 0, creadoMs: ahora, sesionPath: sesion.path });
  });
  return id;
}
export async function reclamarTrabajoBot(db: Firestore, id: string, trabajador: string, ahora = Date.now(), leaseMs = 60_000) {
  if (!trabajador || trabajador.length > 128 || !enteroSeguro(leaseMs, 1) || leaseMs > 300_000) throw new Error('Lease inválido');
  return db.runTransaction(async tx => {
    const ref = refTrabajo(db, id), snap = await tx.get(ref), j = snap.data();
    if (!j) throw new Error('Trabajo inexistente');
    const s = (await tx.get(db.doc(j.sesionPath))).data();
    if (!['pendiente', 'procesando'].includes(j.estado)) return null;
    if (s?.pausado || (s?.epoch ?? 0) !== j.epoch) { tx.update(ref, { estado: 'cancelado' }); return null; }
    if (s?.trabajoActivo && s.trabajoActivo !== id && s.leaseHastaMs > ahora) return null;
    if (!['pendiente', 'procesando'].includes(j.estado) || (j.estado === 'procesando' && j.leaseHastaMs > ahora)) return null;
    if (j.intentos >= 3) { tx.update(ref, { estado: 'agotado' }); return null; }
    const intento = j.intentos + 1;
    tx.update(ref, { estado: 'procesando', trabajador, intento, intentos: intento, leaseHastaMs: ahora + leaseMs });
    tx.set(db.doc(j.sesionPath), { epoch: j.epoch, pausado: false, trabajoActivo: id, intentoActivo: intento, leaseHastaMs: ahora + leaseMs }, { merge: true });
    return { id, intento, epoch: j.epoch, trabajador };
  });
}
/** La operación externa futura debe marcar ambigua ANTES de salir: jamás reintentar un envío incierto. */
export async function finalizarTrabajoBot(db: Firestore, token: { id: string; intento: number; epoch: number; trabajador: string }, estado: 'completado' | 'ambiguo', ahora = Date.now()) {
  return db.runTransaction(async tx => {
    const ref = refTrabajo(db, token.id), j = (await tx.get(ref)).data();
    if (!j) throw new Error('Trabajo inexistente');
    const s = (await tx.get(db.doc(j.sesionPath))).data();
    if (j.estado === estado && j.trabajador === token.trabajador && j.intento === token.intento && j.epoch === token.epoch) return;
    if (s?.trabajoActivo !== token.id || s?.intentoActivo !== token.intento || j.estado !== 'procesando' || j.trabajador !== token.trabajador || j.intento !== token.intento || j.epoch !== token.epoch ||
      j.leaseHastaMs <= ahora || s?.pausado || (s?.epoch ?? 0) !== j.epoch) throw new Error('Trabajo perdió autorización');
    tx.update(ref, { estado, terminadoMs: ahora });
    tx.set(db.doc(j.sesionPath), { trabajoActivo: null, leaseHastaMs: 0, pausado: estado === 'ambiguo', epoch: j.epoch + (estado === 'ambiguo' ? 1 : 0) }, { merge: true });
  });
}
export async function pausarPorHumanoBot(db: Firestore, clienteId: string, actorUid: string, ahora = Date.now()) {
  if (!clienteId || clienteId.length > 128 || !actorUid || actorUid.length > 128) throw new Error('Actor o cliente inválido');
  await db.runTransaction(async tx => {
    const ref = db.doc(`bot_servicio_sim_sesiones/${claveBot(clienteId)}`), s = (await tx.get(ref)).data();
    tx.set(ref, { epoch: (s?.epoch ?? 0) + 1, pausado: true, actorUid, actualizadoMs: ahora });
  });
}
