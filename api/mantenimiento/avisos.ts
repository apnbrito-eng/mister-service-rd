import { generarAvisosChequeo } from '../_lib/avisosChequeo.js';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { timingSafeEqual } from 'node:crypto';
import { getAdminFirestore } from '../_lib/firebaseAdmin.js';
import { generarAvisosMantenimiento } from '../_lib/avisosMantenimiento.js';
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Método no permitido' });
  const esperado = process.env.CRON_SECRET ? `Bearer ${process.env.CRON_SECRET}` : '';
  const recibido = req.headers.authorization;
  if (!esperado || typeof recibido !== 'string' || Buffer.byteLength(esperado) !== Buffer.byteLength(recibido) || !timingSafeEqual(Buffer.from(esperado), Buffer.from(recibido))) return res.status(401).json({ error: 'No autorizado' });
  try { const db = getAdminFirestore(); const mantenimiento = await generarAvisosMantenimiento(db); const chequeo = await generarAvisosChequeo(db); return res.status(200).json({ ...mantenimiento, chequeo }); }
  catch { console.error('[mantenimiento/avisos] Fallo de generación', { codigo: 'MANTENIMIENTO_AVISOS_ERROR' }); return res.status(503).json({ error: 'No se pudieron preparar los avisos.' }); }
}
