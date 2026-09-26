import type { VercelRequest } from '@vercel/node';
import { getAppCheck } from 'firebase-admin/app-check';
import { getAdminApp } from './firebaseAdmin.js';
import { ErrorAcceso } from './accesoEquipo.js';
/** Rutas de sensores/dispositivos solo para las apps nativas registradas. */
export async function exigirAppMovil(req: VercelRequest) {
  const permitidas = (process.env.MOBILE_FIREBASE_APP_IDS || '').split(',').map(s => s.trim()).filter(Boolean);
  if (!permitidas.length) throw new ErrorAcceso(503, 'La validación de la app móvil está pendiente de configuración.');
  const token = req.headers['x-firebase-appcheck'];
  if (typeof token !== 'string' || !token) throw new ErrorAcceso(403, 'Abre esta función desde la app móvil verificada.');
  try {
    const result = await getAppCheck(getAdminApp()).verifyToken(token);
    if (!permitidas.includes(result.appId)) throw new Error('App no autorizada');
  } catch { throw new ErrorAcceso(403, 'No se pudo verificar la app. Actualízala y vuelve a entrar.'); }
}
