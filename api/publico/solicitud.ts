import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getAppCheck } from 'firebase-admin/app-check';
import { getAdminApp, getAdminFirestore } from '../_lib/firebaseAdmin.js';
import { ErrorCitaPublica } from '../_lib/citaPublica.js';
import { registrarSolicitudPublica } from '../_lib/solicitudPublica.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Método no permitido' });
  try {
    const token = req.headers['x-firebase-appcheck'];
    if (typeof token !== 'string' || token.length > 8192) return res.status(401).json({ ok: false, error: 'No pudimos verificar la solicitud. Recarga la página e inténtalo de nuevo.' });
    try { await getAppCheck(getAdminApp()).verifyToken(token); }
    catch { return res.status(401).json({ ok: false, error: 'No pudimos verificar la solicitud. Recarga la página e inténtalo de nuevo.' }); }
    if (typeof req.body === 'string' && Buffer.byteLength(req.body, 'utf8') > 65536) throw new ErrorCitaPublica(400, 'datos_invalidos', 'Revisa los datos de la solicitud.');
    let body: unknown; try { body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body; } catch { throw new ErrorCitaPublica(400, 'datos_invalidos', 'Revisa los datos de la solicitud.'); }
    if (body && typeof body === 'object' && 'honeypot' in body && typeof body.honeypot === 'string' && body.honeypot.trim()) return res.status(200).json({ ok: true });
    const resultado = await registrarSolicitudPublica(getAdminFirestore(), body);
    if ('limitado' in resultado) { res.setHeader('Retry-After', '3600'); return res.status(429).json({ ok: false, error: 'Estamos recibiendo muchas solicitudes. Conserva tus datos e inténtalo más tarde.' }); }
    return res.status(200).json(resultado);
  } catch (error) {
    if (error instanceof ErrorCitaPublica) return res.status(error.status).json({ ok: false, error: error.message });
    console.error('[publico/solicitud] fallo inesperado', { codigo: 'SOLICITUD_PUBLICA_ERROR' });
    return res.status(503).json({ ok: false, error: 'No pudimos registrar tu solicitud. Inténtalo de nuevo.' });
  }
}
