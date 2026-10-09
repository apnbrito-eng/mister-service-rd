import type { VercelRequest, VercelResponse } from '@vercel/node';
import { accesoEquipo, ErrorAcceso } from '../_lib/accesoEquipo.js';
import { autorizarCartera, asignarCartera, trasladarCartera, validarTraslado } from '../_lib/carteraClientes.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido.' });
  try {
    const { db, uid, rol } = await accesoEquipo(req);
    const perfil = (await db.collection('usuarios').doc(uid).get()).data();
    autorizarCartera(rol, perfil);
    let body: Record<string, unknown>;
    try { body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body; } catch { throw new ErrorAcceso(400, 'Solicitud inválida.'); }
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new ErrorAcceso(400, 'Solicitud inválida.');
    const { clienteId, accion } = body;
    if (typeof clienteId !== 'string' || !/^[\w.-]{1,160}$/.test(clienteId)) throw new ErrorAcceso(400, 'Cliente inválido.');
    if (accion === 'asignar') return res.json({ equipo: await asignarCartera(db, clienteId, uid) });
    if (accion !== 'trasladar') throw new ErrorAcceso(400, 'Acción inválida.');
    const { destino, motivo } = validarTraslado(body.destino, body.motivo);
    if (typeof body.solicitudId !== 'string' || !/^[a-zA-Z0-9-]{16,80}$/.test(body.solicitudId)) throw new ErrorAcceso(400, 'Identificador de solicitud inválido.');
    return res.json(await trasladarCartera(db, clienteId, uid, destino, motivo, body.solicitudId));
  } catch (error) {
    if (error instanceof ErrorAcceso) return res.status(error.status).json({ error: error.message });
    console.error('[cartera] operación fallida');
    return res.status(500).json({ error: 'No se pudo actualizar la cartera. Vuelve a intentar.' });
  }
}
