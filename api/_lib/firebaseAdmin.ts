import type { VercelRequest } from '@vercel/node';
import { initializeApp, getApps, cert, type App } from 'firebase-admin/app';
import { getAppCheck } from 'firebase-admin/app-check';
import { getAuth, type Auth } from 'firebase-admin/auth';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';

let adminApp: App | null = null;

/**
 * Inicializa (o reutiliza) la app de Firebase Admin SDK.
 * Las credenciales vienen de variables de entorno configuradas en Vercel:
 *  - FIREBASE_PROJECT_ID
 *  - FIREBASE_CLIENT_EMAIL
 *  - FIREBASE_PRIVATE_KEY (con \n literales que se convierten a saltos reales)
 */
export function getAdminApp(): App {
  if (adminApp) return adminApp;

  const existing = getApps();
  if (existing.length > 0) {
    adminApp = existing[0];
    return adminApp;
  }

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKeyRaw = process.env.FIREBASE_PRIVATE_KEY;

  if (!projectId || !clientEmail || !privateKeyRaw) {
    throw new Error(
      'Faltan variables de entorno: FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY'
    );
  }

  // Reemplazar \n literales por saltos reales (formato estándar para envs)
  const privateKey = privateKeyRaw.replace(/\\n/g, '\n');

  adminApp = initializeApp({
    credential: cert({
      projectId,
      clientEmail,
      privateKey,
    }),
    projectId,
  });

  return adminApp;
}

export function getAdminAuth(): Auth {
  return getAuth(getAdminApp());
}

export function getAdminFirestore(): Firestore {
  return getFirestore(getAdminApp());
}

export interface VerificarAppCheckResult {
  ok: boolean;
  appId?: string;
  reason?: 'no-token' | 'invalid-token';
}

/**
 * Verifica el header `X-Firebase-AppCheck` del request.
 *
 * Fase A del audit C3: el caller NO bloquea — solo loggea el resultado para
 * medir 24-48h de tráfico legítimo vs anónimo antes de pasar a hard
 * enforcement (fase B). Por eso esta función jamás throwa: cualquier fallo
 * vuelve como `ok: false` con el motivo.
 *
 * Importante: nunca loguear el token mismo (es un JWT con info de la app);
 * solo el `appId` cuando es válido o el `reason` cuando falla.
 */
export async function verificarAppCheck(
  req: VercelRequest,
): Promise<VerificarAppCheckResult> {
  const headerRaw = req.headers['x-firebase-appcheck'];
  const headerValue = Array.isArray(headerRaw) ? headerRaw[0] : headerRaw;
  if (typeof headerValue !== 'string' || headerValue.length === 0) {
    return { ok: false, reason: 'no-token' };
  }
  try {
    getAdminApp();
    const result = await getAppCheck().verifyToken(headerValue);
    return { ok: true, appId: result.appId };
  } catch {
    return { ok: false, reason: 'invalid-token' };
  }
}
