import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createHash } from 'node:crypto';
import { getAppCheck } from 'firebase-admin/app-check';
import { getAdminApp, getAdminAuth, getAdminFirestore } from '../_lib/firebaseAdmin.js';
import { normalizarUsuario } from '../_lib/accesosUsuarios.js';

const fallo = 'Usuario o contraseña incorrectos.';
/** Los alias y correos se resuelven en servidor, nunca en un directorio público. */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido.' });
  try {
    const appCheck = req.headers['x-firebase-appcheck'];
    if (typeof appCheck !== 'string' || appCheck.length > 8192) return res.status(401).json({ error: 'Recarga la página para verificar la aplicación.' });
    try { await getAppCheck(getAdminApp()).verifyToken(appCheck); }
    catch { return res.status(401).json({ error: 'No se pudo verificar la aplicación.' }); }
    const b = req.body;
    if (!b || typeof b !== 'object' || typeof b.usuario !== 'string' || b.usuario.length > 254 || !['entrar', 'recuperar'].includes(b.accion)) return res.status(400).json({ error: 'Revisa los datos.' });
    const recuperar = b.accion === 'recuperar';
    if (!recuperar && (typeof b.password !== 'string' || b.password.length > 256 || !b.password)) return res.status(400).json({ error: fallo });
    const entrada = b.usuario.trim().toLowerCase();
    const db = getAdminFirestore(), auth = getAdminAuth();
    const ventana = Math.floor(Date.now() / 900000);
    // Vercel sobreescribe este header; el límite por alias también protege IP rotativa.
    const ip = String(req.headers['x-vercel-forwarded-for'] ?? req.socket?.remoteAddress ?? 'sin-ip');
    const refs = ['usuario:' + entrada, 'ip:' + ip].map(v => db.doc(`rate_limits/acceso_${createHash('sha256').update(v).digest('hex')}_${ventana}`));
    const permitido = await db.runTransaction(async tx => {
      const docs = await Promise.all(refs.map(r => tx.get(r)));
      if (docs.some((d, i) => (d.data()?.intentos ?? 0) >= (i === 0 ? 10 : 50))) return false;
      refs.forEach((r, i) => tx.set(r, { intentos: (docs[i].data()?.intentos ?? 0) + 1, expira: new Date((ventana + 2) * 900000) }));
      return true;
    });
    if (!permitido) { res.setHeader('Retry-After', '900'); return res.status(429).json({ error: 'Demasiados intentos. Intenta más tarde.' }); }
    let uid = '';
    if (entrada.includes('@')) {
      try { uid = (await auth.getUserByEmail(entrada)).uid; } catch { /* respuesta uniforme */ }
    } else {
      try { uid = String((await db.doc(`accesos_alias/${normalizarUsuario(entrada)}`).get()).data()?.uid ?? ''); } catch { /* respuesta uniforme */ }
    }
    const perfil = uid ? (await db.doc(`usuarios/${uid}`).get()).data() : undefined;
    const control = uid ? (await db.doc(`gestion_accesos/${uid}`).get()).data() : undefined;
    const user = uid ? await auth.getUser(uid).catch(() => null) : null;
    const vigente = !!perfil && perfil.activo !== false && perfil.eliminado !== true && user && !user.disabled;
    const apiKey = process.env.VITE_FIREBASE_API_KEY;
    if (!apiKey) return res.status(503).json({ error: 'El servicio de acceso aún no está configurado.' });
    const postFirebase = (accion: string, body: object) => fetch(`https://identitytoolkit.googleapis.com/v1/accounts:${accion}?key=${encodeURIComponent(apiKey)}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Firebase-AppCheck': appCheck }, body: JSON.stringify(body), signal: AbortSignal.timeout(15000),
    });
    if (recuperar) {
      if (vigente && user.email && control?.recuperacion === true && (perfil.rol === 'administrador' || perfil.rol === 'coordinadora' && control.supervisora === true)) {
        const resultado = await postFirebase('sendOobCode', { requestType: 'PASSWORD_RESET', email: user.email });
        if (!resultado.ok) throw new Error('Recuperación no disponible');
      }
      return res.status(200).json({ mensaje: 'Si la cuenta tiene recuperación habilitada, recibirá un enlace en su correo. El resto del personal debe contactar a gerencia o supervisión.' });
    }
    if (!vigente || !user.email) return res.status(401).json({ error: fallo });
    const resultado = await postFirebase('signInWithPassword', { email: user.email, password: b.password, returnSecureToken: true });
    const datos = await resultado.json() as { localId?: string };
    if (!resultado.ok || datos.localId !== uid) return res.status(401).json({ error: fallo });
    // Releer tras validar la clave para no conceder acceso a una baja concurrente.
    const actual = (await db.doc(`usuarios/${uid}`).get()).data();
    if (!actual || actual.activo === false || actual.eliminado === true || (await auth.getUser(uid)).disabled) return res.status(401).json({ error: fallo });
    return res.status(200).json({ token: await auth.createCustomToken(uid) });
  } catch {
    // No registrar request, claves, tokens ni respuestas del proveedor.
    return res.status(503).json({ error: 'No se pudo completar el acceso. Intenta nuevamente.' });
  }
}
