import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getAdminAuth, getAdminFirestore } from '../_lib/firebaseAdmin.js';

/**
 * POST /api/admin/cambiar-correo
 * Headers: Authorization: Bearer <idToken>
 * Body: { uid: string, nuevoEmail: string, motivo: string }
 *
 * Cambia el email de un usuario en Firebase Authentication y sincroniza
 * `usuarios/{uid}` y `personal` (docs cuyo `uid` coincide con el objetivo).
 * Solo usuarios con `rol === 'administrador'` (verificado contra `usuarios/{uid}`).
 * Escribe un registro en `auditoria_admin`.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // 1) Auth: token en header Authorization: Bearer <idToken>
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token requerido (Authorization: Bearer <idToken>)' });
  }
  const idToken = authHeader.substring(7).trim();
  if (!idToken) {
    return res.status(401).json({ error: 'Token vacío' });
  }

  let auth: ReturnType<typeof getAdminAuth>;
  let db: ReturnType<typeof getAdminFirestore>;
  try {
    auth = getAdminAuth();
    db = getAdminFirestore();
  } catch (err) {
    const m = err instanceof Error ? err.message : 'Error desconocido';
    return res.status(500).json({ error: `Error inicializando Firebase Admin: ${m}` });
  }

  let decodedToken: Awaited<ReturnType<typeof auth.verifyIdToken>>;
  try {
    decodedToken = await auth.verifyIdToken(idToken);
  } catch (err) {
    const code = (err as { code?: string })?.code;
    if (code === 'auth/id-token-expired' || code === 'auth/argument-error') {
      return res.status(401).json({ error: 'Token de sesión inválido o expirado. Vuelve a iniciar sesión.' });
    }
    return res.status(401).json({ error: 'Token inválido' });
  }

  // 2) Verificar que el solicitante es administrador estricto
  let solicitanteEsAdmin = false;
  try {
    const solicitanteSnap = await db.collection('usuarios').doc(decodedToken.uid).get();
    if (solicitanteSnap.exists && solicitanteSnap.data()?.rol === 'administrador') {
      solicitanteEsAdmin = true;
    }
  } catch (err) {
    console.error('[cambiar-correo] Error leyendo usuarios/{uid}:', err);
  }

  // Fallback: también aceptar si está en `personal` con rol administrador y su uid/email coincide.
  if (!solicitanteEsAdmin) {
    try {
      const byUid = await db.collection('personal').where('uid', '==', decodedToken.uid).limit(1).get();
      if (!byUid.empty && byUid.docs[0].data()?.rol === 'administrador') {
        solicitanteEsAdmin = true;
      }
    } catch {
      /* no-op */
    }
  }
  if (!solicitanteEsAdmin && decodedToken.email) {
    try {
      const byEmail = await db
        .collection('personal')
        .where('email', '==', decodedToken.email.toLowerCase())
        .limit(1)
        .get();
      if (!byEmail.empty && byEmail.docs[0].data()?.rol === 'administrador') {
        solicitanteEsAdmin = true;
      }
    } catch {
      /* no-op */
    }
  }

  if (!solicitanteEsAdmin) {
    return res.status(403).json({ error: 'Solo el administrador puede cambiar correos' });
  }

  // 3) Validar body
  const body = (req.body ?? {}) as { uid?: unknown; nuevoEmail?: unknown; motivo?: unknown };
  const uidObjetivo = typeof body.uid === 'string' ? body.uid.trim() : '';
  const nuevoEmailRaw = typeof body.nuevoEmail === 'string' ? body.nuevoEmail : '';
  const motivoRaw = typeof body.motivo === 'string' ? body.motivo : '';

  if (!uidObjetivo) {
    return res.status(400).json({ error: 'uid requerido' });
  }
  if (uidObjetivo === 'existing') {
    return res.status(400).json({ error: 'uid no resoluble; resetear contraseña primero' });
  }
  const emailNorm = nuevoEmailRaw.toLowerCase().trim();
  if (!emailNorm || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailNorm)) {
    return res.status(400).json({ error: 'Email inválido' });
  }
  const motivo = motivoRaw.trim();
  if (motivo.length < 5) {
    return res.status(400).json({ error: 'Motivo del cambio requerido (mínimo 5 caracteres)' });
  }

  try {
    // 4) Leer email anterior ANTES del update (para el audit log)
    let emailAnterior: string | null = null;
    try {
      const userActual = await auth.getUser(uidObjetivo);
      emailAnterior = userActual.email ?? null;
    } catch (err) {
      const code = (err as { code?: string })?.code;
      if (code === 'auth/user-not-found') {
        return res.status(404).json({ error: 'Usuario no encontrado en Firebase Auth.' });
      }
      throw err;
    }

    // 5) Actualizar Firebase Auth
    await auth.updateUser(uidObjetivo, {
      email: emailNorm,
      emailVerified: false,
    });

    // 6) Sincronizar usuarios/{uid}
    await db.collection('usuarios').doc(uidObjetivo).set(
      {
        email: emailNorm,
        updatedAt: new Date(),
      },
      { merge: true },
    );

    // 7) Sincronizar personal where uid == uidObjetivo
    try {
      const personalSnap = await db.collection('personal').where('uid', '==', uidObjetivo).get();
      for (const docSnap of personalSnap.docs) {
        await docSnap.ref.set(
          {
            email: emailNorm,
            updatedAt: new Date(),
          },
          { merge: true },
        );
      }
    } catch (syncErr) {
      console.warn('[cambiar-correo] Sync a personal falló (no bloquea):', syncErr);
    }

    // 8) Audit log
    try {
      const auditPayload: Record<string, unknown> = {
        accion: 'cambiar_correo_usuario',
        solicitanteUid: decodedToken.uid,
        solicitanteEmail: decodedToken.email ?? null,
        objetivoUid: uidObjetivo,
        objetivoTipo: 'usuario',
        cambios: { email: { antes: emailAnterior, despues: emailNorm } },
        motivo,
        timestamp: new Date(),
      };
      await db.collection('auditoria_admin').add(auditPayload);
    } catch (auditErr) {
      console.warn('[cambiar-correo] Audit log falló (no bloquea el response):', auditErr);
    }

    return res.status(200).json({
      ok: true,
      mensaje: 'Email actualizado. El usuario deberá usar el nuevo correo para iniciar sesión.',
    });
  } catch (err: unknown) {
    const code = (err as { code?: string })?.code;
    if (code === 'auth/email-already-exists') {
      return res.status(409).json({ error: 'Este email ya está en uso por otro usuario.' });
    }
    if (code === 'auth/user-not-found') {
      return res.status(404).json({ error: 'Usuario no encontrado en Firebase Auth.' });
    }
    if (code === 'auth/invalid-email') {
      return res.status(400).json({ error: 'Email inválido según Firebase.' });
    }
    const message = err instanceof Error ? err.message : 'Error desconocido';
    console.error('[cambiar-correo] Error:', err);
    return res.status(500).json({ error: `Error: ${message.substring(0, 300)}`, code });
  }
}
