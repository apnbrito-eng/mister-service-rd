import type { VercelRequest, VercelResponse } from '@vercel/node';
import { accesoEquipo, ErrorAcceso } from '../_lib/accesoEquipo.js';
import { accesoOrdenTecnico } from '../_lib/accesoOrdenTecnico.js';
import { exigirAppMovil } from '../_lib/appMovilVerificada.js';
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Método no permitido' });
  try {
    await exigirAppMovil(req);
    const { db, uid, rol } = await accesoEquipo(req);
    if (rol !== 'tecnico') throw new ErrorAcceso(403, 'Acceso exclusivo del técnico asignado');
    const { ordenId, telefono } = await accesoOrdenTecnico(db, uid, req.query.ordenId);
    const [entrada, salida] = await Promise.all([
      // @safe-orderby: el webhook persiste timestampRecibido al crear cada mensaje entrante.
      db.collection('whatsapp_mensajes_inbox').where('ordenId', '==', ordenId).where('visibleTecnico', '==', true).orderBy('timestampRecibido', 'desc').limit(40).get(),
      // @safe-orderby: whatsapp/send persiste createdAt al crear el mensaje saliente.
      db.collection('whatsapp_mensajes_outbox').where('ordenId', '==', ordenId).where('visibleTecnico', '==', true).orderBy('createdAt', 'desc').limit(40).get(),
    ]);
    // Una reasignación durante la consulta también invalida la respuesta.
    await accesoOrdenTecnico(db, uid, ordenId);
    const mensajes = [
      ...entrada.docs.filter(d => d.data().wa_id === telefono && d.data().visibleTecnico === true).map(d => ({ id: d.id, entrada: true, texto: String(d.data().contenido?.texto || '[Archivo recibido]'), fecha: d.data().timestampRecibido?.toMillis?.() || 0, autor: 'Cliente', estado: 'recibido' })),
      ...salida.docs.filter(d => d.data().wa_id === telefono && d.data().visibleTecnico === true).map(d => ({ id: d.id, entrada: false, texto: String(d.data().texto || '[Documento o plantilla]'), fecha: d.data().createdAt?.toMillis?.() || 0, autor: String(d.data().creadoPorNombre || 'Oficina'), estado: String(d.data().estado || 'queued') })),
    ].sort((a,b) => a.fecha - b.fecha);
    return res.status(200).json({ telefono, mensajes });
  } catch (err) {
    if (err instanceof ErrorAcceso) return res.status(err.status).json({ error: err.message });
    return res.status(500).json({ error: 'No se pudo cargar el chat de la orden.' });
  }
}
