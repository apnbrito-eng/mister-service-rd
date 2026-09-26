import { createHash } from 'node:crypto';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { accesoEquipo, ErrorAcceso } from '../_lib/accesoEquipo.js';
import { operariaDeTecnico } from '../_lib/equipoResponsable.js';
import { ordenAbiertaChat } from '../_lib/rutaChatOrden.js';
import { normalizarTelefono } from '../../src/utils/crm.js';
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido.' });
  try {
    const { db, uid, rol } = await accesoEquipo(req);
    if (!['administrador', 'coordinadora', 'secretaria', 'operaria'].includes(rol)) throw new ErrorAcceso(403, 'Solo oficina puede cambiar el equipo.');
    const b = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    if (!b || ![b.ordenId, b.tecnicoId, b.requestId].every(x => typeof x === 'string' && /^[\w.-]{1,160}$/.test(x))) throw new ErrorAcceso(400, 'Asignación inválida.');
    const hash = createHash('sha256').update(JSON.stringify([b.ordenId, b.tecnicoId, b.tecnicoAnterior || '', b.fechaCita || null, b.duracionMin || null])).digest('hex');
    const result = await db.runTransaction(async tx => {
      const ref = db.collection('ordenes_servicio').doc(b.ordenId);
      const crmRef = db.collection("crm_ordenes").doc(b.ordenId);
      const crmAnterior = await tx.get(crmRef);
      const actor = (await tx.get(db.collection("usuarios").doc(uid))).data();
      if (actor?.permisosPersonalizados && actor.permisosSistema?.ordenesEditar !== true) throw new ErrorAcceso(403, "No tienes permiso para editar la agenda.");
      const evento = ref.collection('cambios_asignacion').doc(b.requestId);
      const [snap, previo, tecnico] = await Promise.all([tx.get(ref), tx.get(evento), tx.get(db.collection('usuarios').doc(b.tecnicoId))]);
      if (previo.exists) { if (previo.data()?.actorId !== uid || previo.data()?.hash !== hash) throw new ErrorAcceso(409, 'Operación reutilizada.'); return { ok: true }; }
      const o = snap.data();
      if (!ordenAbiertaChat(o)) throw new ErrorAcceso(409, 'La orden ya no admite cambios de asignación.');
      if ((o!.tecnicoId || '') !== (b.tecnicoAnterior || '')) throw new ErrorAcceso(409, 'Otro usuario cambió el técnico. Actualiza la orden.');
      if (!tecnico.exists || tecnico.data()?.rol !== 'tecnico' || tecnico.data()?.activo === false || tecnico.data()?.eliminado) throw new ErrorAcceso(400, 'Técnico no disponible.');
      const responsable = await operariaDeTecnico(db, tx, b.tecnicoId);
      const tel = normalizarTelefono(o!.clienteTelefono);
      const chats = tel.length === 10 ? await tx.get(db.collection('whatsapp_conversaciones').where('wa_id', 'in', [tel, '1' + tel])) : null;
      const estados = chats ? await Promise.all(chats.docs.map(d => tx.get(db.collection('crm_atencion').doc(d.id)))) : [];
      const fecha = b.fechaCita ? new Date(b.fechaCita) : o!.fechaCita?.toDate?.();
      const duracion = Number(b.duracionMin || o!.duracionMin || 60);
      if (!fecha || !Number.isFinite(fecha.getTime()) || !Number.isFinite(duracion) || duracion < 1 || duracion > 1440) throw new ErrorAcceso(400, 'Fecha o duración inválida.');
      const otras = await tx.get(db.collection('ordenes_servicio').where('tecnicoId', '==', b.tecnicoId));
      if (otras.docs.some(d => { const x = d.data(), inicio = x.fechaCita?.toMillis?.(); return d.id !== b.ordenId && ordenAbiertaChat(x) && typeof inicio === 'number' && fecha.getTime() < inicio + (Number(x.duracionMin) || 60) * 60000 && inicio < fecha.getTime() + duracion * 60000; })) throw new ErrorAcceso(409, 'El técnico tiene otra cita en ese horario.');
      tx.update(ref, { tecnicoId: b.tecnicoId, tecnicoNombre: tecnico.data()!.nombre || 'Técnico', operariaId: responsable.uid, operariaNombre: responsable.nombre, responsableId: responsable.uid, responsableNombre: responsable.nombre, fechaCita: Timestamp.fromDate(fecha), duracionMin: duracion, updatedAt: FieldValue.serverTimestamp() });
      tx.set(crmRef, { responsableId: responsable.uid, responsableNombre: responsable.nombre, revision: null, version: (crmAnterior.data()?.version || 0) + 1 }, { merge: true });
      for (const [i, chat] of (chats?.docs || []).entries()) {
        tx.update(chat.ref, { asignadaA: responsable.uid });
        tx.set(db.collection('crm_atencion').doc(chat.id), { responsableId: responsable.uid, responsableNombre: responsable.nombre, traspaso: null, pendiente: true, version: (estados[i].data()?.version || 0) + 1, actualizadoEn: FieldValue.serverTimestamp() }, { merge: true });
        tx.set(db.collection('crm_chat_rutas').doc(chat.id), { ordenId: b.ordenId, desdeMs: Date.now(), actualizadoPor: uid }, { merge: true });
      }
      tx.create(evento, { actorId: uid, hash, tecnicoId: b.tecnicoId, tecnicoAnterior: o!.tecnicoId || null, operariaId: responsable.uid, fecha: FieldValue.serverTimestamp() });
      for (const userId of [responsable.uid, b.tecnicoId]) tx.create(db.collection('notificaciones').doc(), { userId, tipo: 'orden_asignada', titulo: 'Cita asignada', mensaje: 'Tienes una cita asignada. Revisa los detalles.', ordenId: b.ordenId, leida: false, createdAt: FieldValue.serverTimestamp() });
      return { ok: true };
    });
    return res.json(result);
  } catch (e) { return res.status(e instanceof ErrorAcceso ? e.status : 500).json({ error: e instanceof ErrorAcceso ? e.message : 'No se pudo cambiar el equipo.' }); }
}
