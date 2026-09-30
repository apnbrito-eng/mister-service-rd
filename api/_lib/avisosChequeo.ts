import { soloChequeoDisponible } from '../../src/utils/soloChequeoDisponible.js';
import { createHash } from 'node:crypto';
import { Timestamp, type Firestore } from 'firebase-admin/firestore';
/** Reutiliza el cron de mantenimiento. Nunca contacta clientes ni reabre órdenes. */
export async function generarAvisosChequeo(db: Firestore, ahora = new Date()) {
  const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santo_Domingo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(ahora);
  const candidatas = await db.collection('ordenes_servicio').where('soloChequeo', '==', true).get();
  let creados = 0;
  for (const candidata of candidatas.docs) {
    creados += await db.runTransaction(async tx => {
      const orden = (await tx.get(candidata.ref)).data();
      const s = orden?.seguimientoChequeo;
      if (!orden || !soloChequeoDisponible(orden) || !s || s.resultado === 'no_interesado' || typeof s.proximaFecha !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s.proximaFecha) || s.proximaFecha > hoy || !/^[\w.-]{1,160}$/.test(s.responsableUid || '')) return 0;
      const fecha = new Date(`${s.proximaFecha}T12:00:00-04:00`);
      if (!Number.isFinite(fecha.getTime()) || fecha.toISOString().slice(0, 10) !== s.proximaFecha) return 0;
      const responsable = (await tx.get(db.doc(`usuarios/${s.responsableUid}`))).data();
      if (!responsable || responsable.activo === false || responsable.eliminado === true || !['administrador', 'coordinadora', 'secretaria', 'operaria'].includes(responsable.rol)) return 0;
      const personal = await tx.get(db.collection('personal').where('uid', '==', s.responsableUid));
      if (personal.size !== 1) return 0;
      const empleado = personal.docs[0].data();
      if (empleado.activo === false || empleado.eliminado === true || !['administrador', 'coordinadora', 'secretaria', 'operaria'].includes(empleado.rol)) return 0;
      const key = createHash('sha256').update(JSON.stringify([candidata.id, s.proximaFecha, s.responsableUid])).digest('hex');
      const ref = db.doc(`notificaciones/chequeo_${key}`);
      if ((await tx.get(ref)).exists) return 0;
      tx.create(ref, { userId: s.responsableUid, tipo: 'recordatorio', ordenId: candidata.id, titulo: 'Solo chequeo por contactar', mensaje: `Orden ${String(orden.numero || candidata.id)} · gestión prevista ${s.proximaFecha}`, leida: false, createdAt: Timestamp.fromDate(ahora) });
      return 1;
    });
  }
  return { creados };
}
