import type { VercelRequest, VercelResponse } from '@vercel/node';

/**
 * POST /api/admin/reset-password
 * Body: { idToken: string, targetEmail: string, newPassword: string }
 *
 * Cambia la contraseña de un usuario directamente (sin email de recuperación).
 * Solo usuarios con rol "administrador" pueden ejecutar esta acción.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Carga diferida de firebase-admin para que cualquier error de init
  // se devuelva como JSON en vez de crashear el módulo (FUNCTION_INVOCATION_FAILED)
  let admin: typeof import('firebase-admin');
  try {
    admin = await import('firebase-admin');
  } catch (err) {
    const m = err instanceof Error ? err.message : 'Error desconocido';
    return res.status(500).json({ error: `No se pudo cargar firebase-admin: ${m}` });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { idToken, targetEmail, newPassword } = req.body || {};

  if (!idToken || typeof idToken !== 'string') {
    return res.status(400).json({ error: 'Falta idToken' });
  }
  if (!targetEmail || typeof targetEmail !== 'string') {
    return res.status(400).json({ error: 'Falta targetEmail' });
  }
  if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 8) {
    return res.status(400).json({ error: 'La nueva contraseña debe tener al menos 8 caracteres' });
  }

  // Inicializar app si no existe
  try {
    if (!admin.apps.length) {
      const projectId = process.env.FIREBASE_PROJECT_ID;
      const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
      const privateKeyRaw = process.env.FIREBASE_PRIVATE_KEY;

      if (!projectId || !clientEmail || !privateKeyRaw) {
        return res.status(500).json({
          error: 'Faltan variables de entorno: FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY',
          debug: {
            hasProjectId: !!projectId,
            hasClientEmail: !!clientEmail,
            hasPrivateKey: !!privateKeyRaw,
          },
        });
      }

      const privateKey = privateKeyRaw.replace(/\\n/g, '\n');
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId,
          clientEmail,
          privateKey,
        }),
        projectId,
      });
    }
  } catch (err) {
    const m = err instanceof Error ? err.message : 'Error desconocido';
    return res.status(500).json({ error: `Error inicializando Firebase Admin: ${m}` });
  }

  try {
    const auth = admin.auth();

    // 1. Verificar el ID token del caller
    const decoded = await auth.verifyIdToken(idToken);
    const callerUid = decoded.uid;
    const callerEmail = decoded.email;

    // 2. Verificar rol administrador
    let isAdmin =
      (decoded as Record<string, unknown>).rol === 'administrador' ||
      (decoded as Record<string, unknown>).admin === true;

    if (!isAdmin) {
      const db = admin.firestore();

      const byUid = await db.collection('personal').where('uid', '==', callerUid).limit(1).get();
      if (!byUid.empty) {
        const data = byUid.docs[0].data();
        if (data.rol === 'administrador') isAdmin = true;
      }

      if (!isAdmin && callerEmail) {
        const byEmail = await db
          .collection('personal')
          .where('email', '==', callerEmail.toLowerCase())
          .limit(1)
          .get();
        if (!byEmail.empty) {
          const data = byEmail.docs[0].data();
          if (data.rol === 'administrador') isAdmin = true;
        }
      }
    }

    if (!isAdmin) {
      return res.status(403).json({ error: 'Solo un administrador puede cambiar contraseñas directamente' });
    }

    // 3. Buscar el usuario destino por email
    let targetUser;
    try {
      targetUser = await auth.getUserByEmail(targetEmail.trim().toLowerCase());
    } catch {
      return res.status(404).json({ error: `No existe usuario con email ${targetEmail}` });
    }

    // 4. Cambiar la contraseña
    await auth.updateUser(targetUser.uid, { password: newPassword });

    return res.status(200).json({
      ok: true,
      message: `Contraseña actualizada para ${targetEmail}`,
      uid: targetUser.uid,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error desconocido';
    const code = (err as { code?: string })?.code;

    if (code === 'auth/id-token-expired' || code === 'auth/argument-error') {
      return res.status(401).json({ error: 'Token de sesión inválido o expirado. Vuelve a iniciar sesión.' });
    }

    console.error('reset-password error:', err);
    return res.status(500).json({ error: `Error: ${message.substring(0, 300)}`, code });
  }
}
