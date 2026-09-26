import type { VercelRequest, VercelResponse } from '@vercel/node';
import { accesoEquipo, ErrorAcceso } from '../_lib/accesoEquipo.js';
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store');
  if (!['GET', 'POST'].includes(req.method || '')) return res.status(405).json({ error: 'Método no permitido.' });
  try {
    const { db, uid, rol } = await accesoEquipo(req);
    if (!['administrador', 'coordinadora', 'secretaria', 'operaria'].includes(rol)) throw new ErrorAcceso(403, 'Bandeja de oficina.');
    const col = db.collection('usuarios').doc(uid).collection('preferencias_chat');
    if (req.method === 'GET') { const docs = await col.get(); return res.json({ items: docs.docs.map(d => ({ waId: d.id, ...d.data() })) }); }
    const b = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    if (!b || typeof b.waId !== 'string' || !/^\d{7,16}$/.test(b.waId)) throw new ErrorAcceso(400, 'Chat inválido.');
    if (!(await db.collection('whatsapp_conversaciones').doc(b.waId).get()).exists) throw new ErrorAcceso(404, 'Chat no disponible.');
    const cambio: Record<string, unknown> = {};
    for (const key of ['favorito', 'silenciado']) if (typeof b[key] === 'boolean') cambio[key] = b[key];
    if (typeof b.lista === 'string') cambio.lista = b.lista.trim().slice(0, 60);
    if (b.accion === 'ocultar') cambio.ocultoHastaMs = Date.now();
    if (b.accion === 'vaciar') cambio.vaciadoHastaMs = Date.now();
    if (b.accion === 'restaurar') { cambio.ocultoHastaMs = 0; cambio.vaciadoHastaMs = 0; }
    if (!Object.keys(cambio).length) throw new ErrorAcceso(400, 'Acción inválida.');
    await col.doc(b.waId).set(cambio, { merge: true });
    return res.json({ ok: true });
  } catch (e) { return res.status(e instanceof ErrorAcceso ? e.status : 500).json({ error: e instanceof ErrorAcceso ? e.message : 'No se pudieron actualizar las preferencias.' }); }
}
