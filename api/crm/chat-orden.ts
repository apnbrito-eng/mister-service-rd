import type { VercelRequest, VercelResponse } from '@vercel/node';
import { FieldValue } from 'firebase-admin/firestore';
import { accesoEquipo, ErrorAcceso } from '../_lib/accesoEquipo.js';
import { telefonoClienteMovil } from '../_lib/accesoOrdenTecnico.js';
import { ordenAbiertaChat } from '../_lib/rutaChatOrden.js';
const oficina = ['administrador', 'coordinadora', 'secretaria', 'operaria'];
const idValido = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= 200 && !v.includes('/');
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store');
  if (!['GET', 'POST'].includes(req.method || '')) return res.status(405).json({ error: 'Método no permitido' });
  try {
    const { db, uid, rol } = await accesoEquipo(req);
    if (!oficina.includes(rol)) throw new ErrorAcceso(403, 'Solo la oficina puede gestionar el vínculo del chat.');
    const body = req.body || {}, ordenId = req.method === 'GET' ? req.query.ordenId : body.ordenId;
    if (!idValido(ordenId)) throw new ErrorAcceso(400, 'Indica una orden válida.');
    const result = await db.runTransaction(async tx => {
      const orden = (await tx.get(db.collection('ordenes_servicio').doc(ordenId))).data();
      if (!orden) throw new ErrorAcceso(404, 'Orden no encontrada.');
      const telefono = telefonoClienteMovil(orden.clienteTelefono);
      if (!telefono) throw new ErrorAcceso(400, 'La orden no tiene un teléfono válido.');
      const ref = db.collection('crm_chat_rutas').doc(telefono);
      const ruta = (await tx.get(ref)).data();
      const version = Number(ruta?.version || 0);
      if (req.method === 'GET') return { version, ordenActiva: ruta?.ordenId || null, activa: ruta?.ordenId === ordenId && ordenAbiertaChat(orden) };
      if (body.version !== version) throw new ErrorAcceso(409, 'Otra persona cambió el vínculo. Actualiza antes de continuar.');
      if (!['activar', 'pausar', 'compartir', 'ocultar'].includes(body.accion)) throw new ErrorAcceso(400, 'Acción no válida.');
      if (!ordenAbiertaChat(orden)) throw new ErrorAcceso(409, 'La orden ya está cerrada o eliminada.');
      if (body.accion === 'compartir' || body.accion === 'ocultar') {
        if (!idValido(body.wamid)) throw new ErrorAcceso(400, 'Selecciona un mensaje.');
        const mensajeRef = db.collection('whatsapp_mensajes_inbox').doc(body.wamid);
        const mensaje = (await tx.get(mensajeRef)).data();
        if (!mensaje || mensaje.wa_id !== telefono) throw new ErrorAcceso(403, 'El mensaje no corresponde al cliente.');
        if (mensaje.ordenId && mensaje.ordenId !== ordenId) throw new ErrorAcceso(409, 'El mensaje ya pertenece a otra orden.');
        if (mensaje.tipo !== 'text' || typeof mensaje.contenido?.texto !== 'string') throw new ErrorAcceso(400, 'Solo se comparten textos. Los comprobantes e imágenes se gestionan como evidencia de oficina.');
        tx.update(mensajeRef, { ordenId, visibleTecnico: body.accion === 'compartir', compartidoPor: uid, compartidoEn: FieldValue.serverTimestamp() });
      } else {
        if (body.accion === 'pausar' && ruta?.ordenId !== ordenId) throw new ErrorAcceso(409, 'Esta orden no tiene el vínculo activo.');
        tx.set(ref, { ordenId: body.accion === 'activar' ? ordenId : null, desdeMs: Date.now(), version: version + 1, actualizadoPor: uid, actualizadoEn: FieldValue.serverTimestamp() });
      }
      tx.create(db.collection('crm_chat_eventos').doc(), { ordenId, telefono, accion: body.accion, wamid: body.wamid || null, actorUid: uid, fecha: FieldValue.serverTimestamp(), ordenAnterior: ruta?.ordenId || null });
      return { ok: true };
    });
    return res.status(200).json(result);
  } catch (err) {
    if (err instanceof ErrorAcceso) return res.status(err.status).json({ error: err.message });
    return res.status(500).json({ error: 'No se pudo gestionar el vínculo del chat.' });
  }
}
