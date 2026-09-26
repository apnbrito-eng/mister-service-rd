import type { VercelRequest } from '@vercel/node';
import { getAdminAuth, getAdminFirestore } from './firebaseAdmin.js';
import { ROLES_EQUIPO } from './conocimiento.js';
export class ErrorAcceso extends Error { constructor(public status: number, mensaje: string) { super(mensaje); } }
export async function accesoEquipo(req: VercelRequest) {
  const bearer = req.headers.authorization;
  if (typeof bearer !== 'string' || !bearer.startsWith('Bearer ')) throw new ErrorAcceso(401, 'Inicia sesión para continuar.');
  let usuario;
  try { usuario = await getAdminAuth().verifyIdToken(bearer.slice(7), true); }
  catch { throw new ErrorAcceso(401, 'Tu sesión venció. Vuelve a entrar.'); }
  const db = getAdminFirestore();
  const perfil = (await db.collection('usuarios').doc(usuario.uid).get()).data();
  if (!perfil || !ROLES_EQUIPO.includes(perfil.rol) || perfil.activo === false || perfil.eliminado === true) throw new ErrorAcceso(403, 'Tu perfil no tiene acceso.');
  return { db, uid: usuario.uid, rol: String(perfil.rol), iaHabilitada: perfil.iaHabilitada !== false };
}
