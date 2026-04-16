import type { VercelRequest, VercelResponse } from '@vercel/node';

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
 * Serverless proxy para APIs externas de GPS.
 * Evita CORS haciendo el fetch desde el servidor de Vercel.
 *
 * POST /api/gps/ubicacion
 * Body: { vehiculoId, apiUrl, apiKey, proveedor }
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Solo POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { vehiculoId, apiUrl, apiKey, proveedor } = req.body || {};

  if (!vehiculoId || !apiUrl || !apiKey || !proveedor) {
    return res.status(400).json({
      error: 'Faltan parámetros requeridos: vehiculoId, apiUrl, apiKey, proveedor',
    });
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

    console.error('GPS proxy error:', err);
    return res.status(500).json({ error: `Error del proxy GPS: ${message.substring(0, 200)}` });
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
