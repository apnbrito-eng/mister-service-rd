import type { VercelRequest } from '@vercel/node';
import { initializeApp, getApps, cert, type App } from 'firebase-admin/app';
import { getAppCheck } from 'firebase-admin/app-check';
import { getAuth, type Auth } from 'firebase-admin/auth';
import { getFirestore, FieldValue, type Firestore } from 'firebase-admin/firestore';

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
 *
 * Sprint pre-C2 (instrumentación): además del logueo a stdout (Vercel
 * retiene ~1h en plan Hobby), persistimos el resultado en la colección
 * `app_check_audit` para tener métricas validables 24-48h. La escritura
 * es **best-effort**: si falla, NO rompe el endpoint. Ver
 * `escribirAuditAppCheck()` abajo.
 *
 * El identificador del endpoint para el audit se infiere de `req.url`
 * (por ejemplo `/api/garantia/abc123` → `garantia`). NO usamos `referer`
 * porque puede contener tokens en query strings (PII).
 */
export async function verificarAppCheck(
  req: VercelRequest,
): Promise<VerificarAppCheckResult> {
  const headerRaw = req.headers['x-firebase-appcheck'];
  const headerValue = Array.isArray(headerRaw) ? headerRaw[0] : headerRaw;
  let resultado: VerificarAppCheckResult;
  if (typeof headerValue !== 'string' || headerValue.length === 0) {
    resultado = { ok: false, reason: 'no-token' };
  } else {
    try {
      getAdminApp();
      const verified = await getAppCheck().verifyToken(headerValue);
      resultado = { ok: true, appId: verified.appId };
    } catch {
      resultado = { ok: false, reason: 'invalid-token' };
    }
  }
  // Audit log best-effort. No await — corre fire-and-forget para no
  // sumar latencia al endpoint. Si falla, console.warn sin PII.
  void escribirAuditAppCheck(req, inferirEndpoint(req), resultado);
  return resultado;
}

/**
 * Deriva un identificador coarse del endpoint a partir de `req.url`.
 *
 * Ejemplos:
 *   /api/garantia/abc123              → 'garantia'
 *   /api/portal-cliente/abc123        → 'portal-cliente'
 *   /api/portal-cliente/abc123/posponer → 'portal-cliente/posponer'
 *   /api/feedback/abc123              → 'feedback'
 *   /api/gps/ubicacion?id=...         → 'gps/ubicacion'
 *
 * Se asume que el primer segmento bajo `/api/` identifica al endpoint
 * (es la convención del repo). El segmento siguiente, si NO se ve como
 * un token (longitud >= 16), también se incluye — esto captura el sufijo
 * de subrutas como `/posponer`. Tokens (long string aleatorio) NO se
 * incluyen — son PII potencial.
 */
function inferirEndpoint(req: VercelRequest): string {
  const url = typeof req.url === 'string' ? req.url : '';
  const sinQuery = url.split('?')[0] ?? '';
  const partes = sinQuery.split('/').filter(p => p.length > 0);
  // Esperado: ['api', '<endpoint>', '<token>?', '<sufijo>?']
  const idxApi = partes.indexOf('api');
  if (idxApi === -1) return 'desconocido';
  const principal = partes[idxApi + 1];
  if (!principal) return 'desconocido';
  // Si hay un sufijo después del token (3er segmento), incluirlo.
  const tercer = partes[idxApi + 2];
  const cuarto = partes[idxApi + 3];
  // Heurística: el token de portal cliente es >= 16 chars random hex.
  // Si `tercer` parece token y existe `cuarto`, agregamos `cuarto`.
  if (typeof tercer === 'string' && tercer.length >= 16 && typeof cuarto === 'string') {
    return `${principal}/${cuarto}`;
  }
  // Si `tercer` NO parece token (ej. `/api/gps/ubicacion`), incluirlo
  // como parte del endpoint.
  if (typeof tercer === 'string' && tercer.length < 16 && tercer.length > 0) {
    return `${principal}/${tercer}`;
  }
  return principal;
}

/**
 * Escribe un doc en `app_check_audit` con el resultado de la verificación.
 *
 * Best-effort: cualquier error se traga con un `console.warn` (sin PII).
 * Llamada con `void` desde `verificarAppCheck` para no bloquear el endpoint.
 *
 * NO PII en el doc: nada de token (ni truncado), email, uid o referer.
 * Solo metadata de transporte (ip, user-agent truncado) + resultado.
 */
async function escribirAuditAppCheck(
  req: VercelRequest,
  endpoint: string,
  resultado: VerificarAppCheckResult,
): Promise<void> {
  try {
    const db = getAdminFirestore();
    const ip = obtenerIp(req);
    const uaRaw = req.headers['user-agent'];
    const uaValue = Array.isArray(uaRaw) ? uaRaw[0] : uaRaw;
    const userAgent =
      typeof uaValue === 'string' ? uaValue.substring(0, 200) : '';
    const payload: Record<string, unknown> = {
      endpoint,
      ok: resultado.ok,
      reason: resultado.reason ?? null,
      appId: resultado.appId ?? null,
      ip,
      userAgent,
      timestamp: FieldValue.serverTimestamp(),
    };
    const limpio = Object.fromEntries(
      Object.entries(payload).filter(([, v]) => v !== undefined),
    );
    await db.collection('app_check_audit').add(limpio);
  } catch (err) {
    // Sin PII — solo el message del error.
    const m = err instanceof Error ? err.message : 'error desconocido';
    console.warn('[app_check_audit] escritura falló (no bloquea):', m.substring(0, 200));
  }
}

/**
 * Extrae la IP del request a partir de los headers del proxy de Vercel.
 * Prioriza `x-forwarded-for` (puede traer lista separada por comas — toma
 * la primera). Fallback a `x-real-ip`. Si nada hay, string vacío.
 */
function obtenerIp(req: VercelRequest): string {
  const xff = req.headers['x-forwarded-for'];
  const xffValue = Array.isArray(xff) ? xff[0] : xff;
  if (typeof xffValue === 'string' && xffValue.length > 0) {
    const primera = xffValue.split(',')[0]?.trim() ?? '';
    if (primera.length > 0) return primera;
  }
  const xri = req.headers['x-real-ip'];
  const xriValue = Array.isArray(xri) ? xri[0] : xri;
  if (typeof xriValue === 'string' && xriValue.length > 0) {
    return xriValue;
  }
  return '';
}
