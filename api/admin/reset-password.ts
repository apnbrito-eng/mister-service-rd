import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getAdminAuth } from '../_lib/firebaseAdmin';

/**
 * POST /api/admin/reset-password
 * Body: { idToken: string, targetEmail: string, newPassword: string }
 *
 * Cambia la contraseña de un usuario directamente (sin email de recuperación).
 * Solo usuarios con rol "administrador" pueden ejecutar esta acción.
 *
 * Validaciones:
 *  1. idToken válido (Firebase ID token del admin que hace la llamada)
 *  2. El caller debe tener custom claim `rol: 'administrador'` o
 *     existir en la colección `personal` con rol administrador.
 *  3. targetEmail debe ser un usuario existente.
 *  4. newPassword debe tener mínimo 8 caracteres.
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

  try {
    const auth = getAdminAuth();

    // 1. Verificar el ID token del caller
    const decoded = await auth.verifyIdToken(idToken);
    const callerUid = decoded.uid;
    const callerEmail = decoded.email;

    // 2. Verificar rol administrador (vía Firestore personal o custom claim)
    let isAdmin = decoded.rol === 'administrador' || decoded.admin === true;

    if (!isAdmin) {
      // Fallback: consultar colección personal por uid o email
      const { getFirestore } = await import('firebase-admin/firestore');
      const { getAdminApp } = await import('../_lib/firebaseAdmin');
      const db = getFirestore(getAdminApp());

      // Buscar por uid primero
      const byUid = await db.collection('personal').where('uid', '==', callerUid).limit(1).get();
      if (!byUid.empty) {
        const data = byUid.docs[0].data();
        if (data.rol === 'administrador') isAdmin = true;
      }

      // Fallback por email
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

    // Errores de token Firebase
    if (code === 'auth/id-token-expired' || code === 'auth/argument-error') {
      return res.status(401).json({ error: 'Token de sesión inválido o expirado. Vuelve a iniciar sesión.' });
    }

    console.error('reset-password error:', err);
    return res.status(500).json({ error: `Error: ${message.substring(0, 200)}` });
  }
}
