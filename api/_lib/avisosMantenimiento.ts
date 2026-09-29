import { createHash } from 'node:crypto';
import { Timestamp, type Firestore } from 'firebase-admin/firestore';
const fechaRD = (fecha: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santo_Domingo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(fecha);
const oficina = (p: FirebaseFirestore.DocumentData | undefined) => p && p.activo !== false && p.eliminado !== true && ['administrador', 'coordinadora', 'secretaria', 'operaria'].includes(p.rol);
/** Solo avisos internos. Cada ocurrencia y destinatario comparte un ID estable. */
export async function generarAvisosMantenimiento(db: Firestore, ahora = new Date()) {
  const hoy = fechaRD(ahora);
  const items = await db.collection('mantenimiento').where('activo', '==', true).get();
  let creados = 0;
  for (const item of items.docs) {
    const cantidad = await db.runTransaction(async tx => {
      const actual = (await tx.get(item.ref)).data();
      const fecha = actual?.proximaFecha?.toDate?.();
      if (!actual?.activo || !(fecha instanceof Date) || !Number.isFinite(fecha.getTime()) || fechaRD(fecha) > hoy) return 0;
      const [usuarios, cliente, cartera] = await Promise.all([
        tx.get(db.collection('usuarios').where('rol', 'in', ['administrador', 'coordinadora'])),
        typeof actual.clienteId === 'string' && actual.clienteId && !actual.clienteId.includes('/') ? tx.get(db.doc(`clientes/${actual.clienteId}`)) : Promise.resolve(null),
        typeof actual.clienteId === 'string' && actual.clienteId && !actual.clienteId.includes('/') ? tx.get(db.doc(`crm_clientes/${actual.clienteId}`)) : Promise.resolve(null),
      ]);
      const destinos = new Set(usuarios.docs.filter(d => oficina(d.data())).map(d => d.id));
      const ficha = cliente?.data();
      if (!ficha || ficha.eliminado === true) return 0;
      const responsableId = cartera?.data()?.responsableId;
      if (typeof responsableId === 'string' && /^[\w.-]{1,160}$/.test(responsableId)) {
        const responsable = await tx.get(db.doc(`usuarios/${responsableId}`));
        if (oficina(responsable.data())) destinos.add(responsable.id);
      }
      const periodo = fechaRD(fecha);
      const refs = [...destinos].map(uid => ({ uid, ref: db.doc(`notificaciones/mantenimiento_${createHash('sha256').update(JSON.stringify([item.id, periodo, uid])).digest('hex')}`) }));
      const existentes = await Promise.all(refs.map(r => tx.get(r.ref)));
      let n = 0;
      refs.forEach((r, i) => { if (existentes[i].exists) return; tx.create(r.ref, {
        userId: r.uid, tipo: 'mantenimiento_pendiente', mantenimientoId: item.id,
        titulo: 'Mantenimiento por contactar', mensaje: `${String(actual.clienteNombre || 'Cliente').slice(0, 200)} · ${String(actual.equipoTipo || '').slice(0, 100)} · ${periodo}`,
        leida: false, createdAt: Timestamp.fromDate(ahora),
      }); n++; });
      return n;
    });
    creados += cantidad;
  }
  return { creados };
}
