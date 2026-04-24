import type { VercelRequest, VercelResponse } from '@vercel/node';

/**
 * POST /api/admin/reset-password
 * Body: { idToken: string, targetEmail: string, newPassword: string }
 *
 * Cambia la contraseña de un usuario directamente (sin email de recuperación).
 * Solo usuarios con rol "administrador" pueden ejecutar esta acción.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
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

  // Carga modular de firebase-admin v12 (subpath imports = compatibles con ESM)
  let initializeApp: typeof import('firebase-admin/app').initializeApp;
  let getApps: typeof import('firebase-admin/app').getApps;
  let cert: typeof import('firebase-admin/app').cert;
  let getAuth: typeof import('firebase-admin/auth').getAuth;
  let getFirestore: typeof import('firebase-admin/firestore').getFirestore;
  try {
    const appMod = await import('firebase-admin/app');
    const authMod = await import('firebase-admin/auth');
    const fsMod = await import('firebase-admin/firestore');
    initializeApp = appMod.initializeApp;
    getApps = appMod.getApps;
    cert = appMod.cert;
    getAuth = authMod.getAuth;
    getFirestore = fsMod.getFirestore;
  } catch (err) {
    const m = err instanceof Error ? err.message : 'Error desconocido';
    return res.status(500).json({ error: `No se pudo cargar firebase-admin: ${m}` });
  }

  // Inicializar app si no existe
  try {
    if (getApps().length === 0) {
      const projectId = process.env.FIREBASE_PROJECT_ID;
      const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
      const privateKeyRaw = process.env.FIREBASE_PRIVATE_KEY;

      if (!projectId || !clientEmail || !privateKeyRaw) {
        return res.status(500).json({
          error: 'Faltan variables de entorno',
          debug: {
            hasProjectId: !!projectId,
            hasClientEmail: !!clientEmail,
            hasPrivateKey: !!privateKeyRaw,
            projectIdValue: projectId || null,
            clientEmailValue: clientEmail || null,
            privateKeyLength: privateKeyRaw ? privateKeyRaw.length : 0,
          },
        });
      }

      const privateKey = privateKeyRaw.replace(/\\n/g, '\n');
      initializeApp({
        credential: cert({
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
    const auth = getAuth();

    // 1. Verificar el ID token del caller
    const decoded = await auth.verifyIdToken(idToken);
    const callerUid = decoded.uid;
    const callerEmail = decoded.email;

    // 2. Verificar rol administrador
    let isAdmin =
      (decoded as Record<string, unknown>).rol === 'administrador' ||
      (decoded as Record<string, unknown>).admin === true;

    if (!isAdmin) {
      const db = getFirestore();

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

    // 5. Audit log (best-effort, no bloquea el response principal)
    try {
      const db = getFirestore();
      await db.collection('auditoria_admin').add({
        accion: 'reset_password',
        solicitanteUid: callerUid,
        solicitanteEmail: callerEmail ?? null,
        objetivoUid: targetUser.uid,
        objetivoEmail: targetUser.email ?? targetEmail.trim().toLowerCase(),
        objetivoTipo: 'usuario',
        motivo: 'Reset de contraseña por administrador',
        timestamp: new Date(),
      });
    } catch (auditErr) {
      console.warn('[reset-password] Audit log falló:', auditErr);
    }

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
