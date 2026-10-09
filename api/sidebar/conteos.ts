import type { VercelRequest, VercelResponse } from '@vercel/node';
import { accesoEquipo, ErrorAcceso } from '../_lib/accesoEquipo.js';
import { exigirAppCheck } from '../_lib/firebaseAdmin.js';
import { obtenerConteosSidebar } from '../_lib/conteosSidebar.js';
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Método no permitido.' });
  try {
    await exigirAppCheck(req);
    const { db, uid } = await accesoEquipo(req);
    const perfil = (await db.collection('usuarios').doc(uid).get()).data();
    return res.json(await obtenerConteosSidebar(db, perfil || {}));
  } catch (error) {
    if (error instanceof ErrorAcceso) return res.status(error.status).json({ error: error.message });
    if (error instanceof Error && 'status' in error && error.status === 403) return res.status(403).json({ error: 'App Check requerido o inválido.' });
    return res.status(500).json({ error: 'No se pudieron consultar los totales.' });
  }
}
