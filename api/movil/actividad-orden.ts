import type { VercelRequest, VercelResponse } from '@vercel/node';
import { accesoEquipo, ErrorAcceso } from '../_lib/accesoEquipo.js';
import { FieldValue } from 'firebase-admin/firestore';
import { identidadActividad, oficinaActividad } from '../_lib/actividadOrdenAcceso.js';
const acciones: Record<string, string> = { abrir: 'Abrió la orden', llamar: 'Pulsó llamar al cliente (contacto no confirmado)', whatsapp: 'Abrió WhatsApp (envío no confirmado)', ubicacion: 'Consultó la ubicación del servicio', salida: 'Salió hacia el cliente' };
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });
  try {
    const { db, uid, rol } = await accesoEquipo(req);
    let body; try { body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body; } catch { throw new ErrorAcceso(400, 'Solicitud inválida'); }
    const { ordenId, accion, intentoId } = body || {};
    if (typeof ordenId !== 'string' || !/^[\w-]{1,150}$/.test(ordenId) || typeof accion !== 'string' || !Object.prototype.hasOwnProperty.call(acciones, accion) || typeof intentoId !== 'string' || !/^[\w-]{8,80}$/.test(intentoId)) throw new ErrorAcceso(400, 'Acción inválida');
    const ref = db.doc(`ordenes_servicio/${ordenId}`), evento = ref.collection('actividad').doc(`${uid}_${intentoId}`);
    await db.runTransaction(async tx => {
      const [snap, previo, perfil, personal, destinatarios] = await Promise.all([tx.get(ref), tx.get(evento), tx.get(db.doc(`usuarios/${uid}`)), tx.get(db.collection('personal')), tx.get(db.collection('usuarios').where('rol', 'in', ['administrador', 'coordinadora', 'operaria', 'secretaria']))]);
      const personas = personal.docs.map(d => ({ id: d.id, data: d.data() }));
      const o = snap.data(), u = perfil.data();
      if (!u || u.activo === false || u.eliminado === true || u.rol !== rol || !o || o.eliminada) throw new ErrorAcceso(403, 'Orden no disponible');
      const tecnico = rol === 'tecnico' && identidadActividad(uid, u, personas).ids.has(o.tecnicoId);
      const oficina = oficinaActividad(uid, u, personas, o);
      if (!tecnico && !oficina) throw new ErrorAcceso(403, 'No tienes acceso a esta orden');
      if (accion === 'salida' && (!tecnico || ['cerrado','cancelado','trabajo_realizado'].includes(o.fase) || o.enStandby || o.visitaFallida || o.visitaCancelada)) throw new ErrorAcceso(409, 'La orden no permite iniciar traslado');
      if (previo.exists) return;
      const fecha = FieldValue.serverTimestamp();
      tx.create(evento, { accion, detalle: acciones[accion], actorUid: uid, actorNombre: u.nombre || rol, fecha });
      if (accion === 'salida') tx.update(ref, { salidaTecnico: { uid, fecha }, updatedAt: fecha });
      for (const d of destinatarios.docs) {
        const p = d.data();
        if (!oficinaActividad(d.id, p, personas, o)) continue;
        tx.set(db.collection('notificaciones').doc(`${evento.id}_${d.id}`), { userId:d.id, tipo:'actividad_orden', titulo:acciones[accion], mensaje:`${u.nombre || 'Personal'} · ${o.clienteNombre || ''} · ${o.numero || ordenId}`, ordenId, leida:false, createdAt:fecha });
      }
    });
    return res.status(200).json({ ok:true });
  } catch (e) { return res.status(e instanceof ErrorAcceso ? e.status : 500).json({error:e instanceof ErrorAcceso ? e.message : 'No se pudo registrar la acción'}); }
}
