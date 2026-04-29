import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getAdminAuth, getAdminFirestore } from '../_lib/firebaseAdmin.js';

// Tipos de proveedor soportados
type Proveedor = 'Wialon' | 'Samsara' | 'Traccar' | 'Fleet Complete' | 'API Personalizada';

interface UbicacionResponse {
  vehiculoId: string;
  lat: number;
  lng: number;
  velocidad: number;
  rumbo: number;
  timestamp: string;
  enMovimiento: boolean;
}

/**
 * Whitelist de hostnames permitidos para el proxy.
 * Cualquier `apiUrl` que apunte fuera de este set se rechaza con 400.
 * Esto previene SSRF (escaneo de red interna, abuso del runtime de Vercel
 * como proxy abierto, etc.).
 *
 * TODO: Traccar/personalizada — si se necesita soportar hosts custom,
 * leer `config_gps/sistema.host` en runtime y agregarlo dinámicamente
 * (consultar con Jorge antes de habilitar). Por ahora solo proveedores
 * conocidos hardcodeados.
 */
const HOSTNAMES_PERMITIDOS: ReadonlySet<string> = new Set([
  'hst-api.wialon.com',
  'hst-api.wialon.host',
  'api.eu.samsara.com',
  'api.samsara.com',
  'api.us.samsara.com',
  'app.fleetcomplete.com',
]);

/**
 * Roles de personal interno autorizados a usar el proxy GPS.
 * Cualquier otro rol (o caller sin doc en `personal`/`usuarios`) → 403.
 */
const ROLES_AUTORIZADOS: ReadonlySet<string> = new Set([
  'administrador',
  'coordinadora',
  'secretaria',
  'operaria',
  'tecnico',
]);

/**
 * Serverless proxy para APIs externas de GPS.
 * Evita CORS haciendo el fetch desde el servidor de Vercel.
 *
 * Requiere autenticación: Authorization: Bearer <ID_TOKEN>
 * El caller debe ser staff con rol en ROLES_AUTORIZADOS.
 *
 * POST /api/gps/ubicacion
 * Body: { vehiculoId, apiUrl, apiKey, proveedor }
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Solo POST
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

  // 2) Inicializar Firebase Admin
  let auth: ReturnType<typeof getAdminAuth>;
  let db: ReturnType<typeof getAdminFirestore>;
  try {
    auth = getAdminAuth();
    db = getAdminFirestore();
  } catch (err) {
    console.error('[gps/ubicacion] Error inicializando Firebase Admin:', err);
    return res.status(500).json({ error: 'Error interno de autenticación' });
  }

  // 3) Verificar el ID token
  let decodedToken: Awaited<ReturnType<typeof auth.verifyIdToken>>;
  try {
    decodedToken = await auth.verifyIdToken(idToken);
  } catch (err) {
    const code = (err as { code?: string })?.code;
    if (code === 'auth/id-token-expired' || code === 'auth/argument-error') {
      return res
        .status(401)
        .json({ error: 'Token de sesión inválido o expirado. Vuelve a iniciar sesión.' });
    }
    return res.status(401).json({ error: 'Token inválido' });
  }

  // 4) Verificar rol del caller (usuarios/{uid} → personal por uid → personal por email)
  const callerUid = decodedToken.uid;
  const callerEmail = decodedToken.email;
  let rolCaller: string | null = null;

  try {
    const usuarioSnap = await db.collection('usuarios').doc(callerUid).get();
    if (usuarioSnap.exists) {
      const data = usuarioSnap.data();
      if (data && typeof data.rol === 'string') {
        rolCaller = data.rol;
      }
    }
  } catch (err) {
    console.error('[gps/ubicacion] Error leyendo usuarios/{uid}:', err);
  }

  if (!rolCaller) {
    try {
      const byUid = await db.collection('personal').where('uid', '==', callerUid).limit(1).get();
      if (!byUid.empty) {
        const data = byUid.docs[0].data();
        if (typeof data.rol === 'string') rolCaller = data.rol;
      }
    } catch {
      /* no-op */
    }
  }

  if (!rolCaller && callerEmail) {
    try {
      const byEmail = await db
        .collection('personal')
        .where('email', '==', callerEmail.toLowerCase())
        .limit(1)
        .get();
      if (!byEmail.empty) {
        const data = byEmail.docs[0].data();
        if (typeof data.rol === 'string') rolCaller = data.rol;
      }
    } catch {
      /* no-op */
    }
  }

  if (!rolCaller || !ROLES_AUTORIZADOS.has(rolCaller)) {
    return res.status(403).json({ error: 'No autorizado para usar el proxy GPS' });
  }

  // 5) Validar body
  const { vehiculoId, apiUrl, apiKey, proveedor } = (req.body || {}) as {
    vehiculoId?: unknown;
    apiUrl?: unknown;
    apiKey?: unknown;
    proveedor?: unknown;
  };

  if (
    typeof vehiculoId !== 'string' ||
    typeof apiUrl !== 'string' ||
    typeof apiKey !== 'string' ||
    typeof proveedor !== 'string' ||
    !vehiculoId ||
    !apiUrl ||
    !apiKey ||
    !proveedor
  ) {
    return res.status(400).json({
      error: 'Faltan parámetros requeridos: vehiculoId, apiUrl, apiKey, proveedor',
    });
  }

  // 6) Validar hostname contra whitelist (anti-SSRF)
  let hostname: string;
  try {
    hostname = new URL(apiUrl).hostname.toLowerCase();
  } catch {
    return res.status(400).json({ error: 'apiUrl no es una URL válida' });
  }

  if (!HOSTNAMES_PERMITIDOS.has(hostname)) {
    return res
      .status(400)
      .json({ error: `Hostname no permitido: ${hostname}` });
  }

  try {
    // Construir URL según proveedor
    const url = buildUrl(apiUrl, vehiculoId, proveedor);
    const headers = buildHeaders(apiKey, proveedor);

    // Fetch con timeout de 15 segundos
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    const response = await fetch(url, {
      method: 'GET',
      headers,
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      return res.status(response.status).json({
        error: `API GPS respondió ${response.status}: ${text.substring(0, 200)}`,
      });
    }

    const data = await response.json();
    const ubicacion = normalizarRespuesta(data, proveedor as Proveedor, vehiculoId);

    return res.status(200).json(ubicacion);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error desconocido';

    if (message.includes('abort')) {
      return res.status(504).json({ error: 'Timeout: la API GPS no respondió en 15 segundos' });
    }

    console.error('[gps/ubicacion] proxy error:', err);
    return res.status(500).json({ error: 'Error del proxy GPS' });
  }
}

/** Construye la URL de la API según el proveedor */
function buildUrl(apiUrl: string, vehiculoId: string, proveedor: string): string {
  const base = apiUrl.replace(/\/$/, ''); // quitar trailing slash

  switch (proveedor) {
    case 'Wialon':
      return `${base}/avl_evts?sid=${vehiculoId}`;
    case 'Samsara':
      return `${base}/fleet/vehicles/${vehiculoId}/locations/most_recent`;
    case 'Traccar':
      return `${base}/api/positions?deviceId=${vehiculoId}`;
    case 'Fleet Complete':
      return `${base}/vehicles/${vehiculoId}/position`;
    default: // API Personalizada
      return `${base}/vehicles/${vehiculoId}/location`;
  }
}

/** Construye los headers según el proveedor */
function buildHeaders(apiKey: string, proveedor: string): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  };

  switch (proveedor) {
    case 'Wialon':
      // Wialon usa token en query string, no en header
      break;
    case 'Samsara':
      headers['Authorization'] = `Bearer ${apiKey}`;
      break;
    case 'Traccar':
      headers['Authorization'] = `Basic ${apiKey}`;
      break;
    default:
      headers['Authorization'] = `Bearer ${apiKey}`;
  }

  return headers;
}

/** Normaliza la respuesta de cada proveedor al formato estándar */
function normalizarRespuesta(
  data: Record<string, unknown>,
  proveedor: Proveedor,
  vehiculoId: string
): UbicacionResponse {
  const d = data;
  const pos = (d.pos || d.position) as Record<string, unknown> | undefined;
  const location = d.location as Record<string, unknown> | undefined;

  switch (proveedor) {
    case 'Wialon':
      return {
        vehiculoId,
        lat: Number(pos?.y) || 0,
        lng: Number(pos?.x) || 0,
        velocidad: Number(d.speed) || 0,
        rumbo: Number(d.course) || 0,
        timestamp: d.time ? new Date(Number(d.time) * 1000).toISOString() : new Date().toISOString(),
        enMovimiento: Number(d.speed) > 0,
      };
    case 'Samsara':
      return {
        vehiculoId,
        lat: Number(location?.latitude) || 0,
        lng: Number(location?.longitude) || 0,
        velocidad: Number(d.speedMilesPerHour) * 1.60934 || 0,
        rumbo: Number(d.heading) || 0,
        timestamp: d.time ? new Date(String(d.time)).toISOString() : new Date().toISOString(),
        enMovimiento: Number(d.speedMilesPerHour) > 0,
      };
    case 'Traccar': {
      // Traccar devuelve un array de positions — tomar la primera
      const item = Array.isArray(data) ? (data[0] as Record<string, unknown>) : d;
      return {
        vehiculoId,
        lat: Number(item.latitude) || 0,
        lng: Number(item.longitude) || 0,
        velocidad: Number(item.speed) * 1.852 || 0, // nudos → km/h
        rumbo: Number(item.course) || 0,
        timestamp: item.deviceTime ? new Date(String(item.deviceTime)).toISOString() : new Date().toISOString(),
        enMovimiento: Number(item.speed) > 0,
      };
    }
    default:
      return {
        vehiculoId,
        lat: Number(d.lat) || 0,
        lng: Number(d.lng) || 0,
        velocidad: Number(d.speed || d.velocidad) || 0,
        rumbo: Number(d.heading || d.rumbo) || 0,
        timestamp: d.timestamp ? new Date(String(d.timestamp)).toISOString() : new Date().toISOString(),
        enMovimiento: Number(d.speed || d.velocidad) > 0,
      };
  }
}
