import type { VercelRequest, VercelResponse } from '@vercel/node';
import { accesoEquipo, ErrorAcceso } from '../_lib/accesoEquipo.js';
import { resolverEnlaceMapa } from '../_lib/resolverEnlaceMapa.js';
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({error:'Método no permitido.'});
  try {
    const acceso = await accesoEquipo(req);
    if (!['administrador','coordinadora','operaria','secretaria'].includes(acceso.rol)) return res.status(403).json({error:'No tienes acceso a la ubicación del cliente.'});
    const perfil = (await acceso.db.collection('usuarios').doc(acceso.uid).get()).data();
    if (perfil?.permisosPersonalizados && perfil.permisosSistema?.clientesModificar !== true && perfil.permisosSistema?.clientesCrear !== true) return res.status(403).json({error:'No tienes permiso para registrar o modificar clientes.'});
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    if (typeof body?.enlace !== 'string') return res.status(400).json({error:'Pega un enlace de Google Maps.'});
    return res.status(200).json({enlace:await resolverEnlaceMapa(body.enlace)});
  } catch (error) {
    if (error instanceof ErrorAcceso) return res.status(error.status).json({error:error.message});
    return res.status(400).json({error:'No se pudo resolver el enlace. Abre Google Maps y copia el enlace completo del lugar.'});
  }
}
