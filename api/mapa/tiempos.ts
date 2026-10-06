import type { VercelRequest, VercelResponse } from '@vercel/node';
import { accesoEquipo, ErrorAcceso } from '../_lib/accesoEquipo.js';

const OFICINA = new Set(['administrador', 'coordinadora', 'operaria', 'secretaria']);
interface Punto { lat: number; lng: number }
const valido = (p: unknown): p is Punto => {
  if (!p || typeof p !== 'object') return false;
  const x = p as Punto;
  return Number.isFinite(x.lat) && Number.isFinite(x.lng) && Math.abs(x.lat) <= 90 && Math.abs(x.lng) <= 180 && !(x.lat === 0 && x.lng === 0);
};

/** Routes se activa explícitamente en servidor, con límite autorizado de solicitudes.
 * No persiste rutas ni geometrías de Google en Firestore. Cada intento reserva cuota
 * ANTES de consultar al proveedor; los timeouts también consumen esa reserva.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });
  const estimado = (motivo: string) => res.status(200).json({ tramos: null, fuente: 'estimado', motivo });
  try {
    const acceso = await accesoEquipo(req);
    if (!OFICINA.has(acceso.rol)) return res.status(403).json({ error: 'Tu perfil no tiene acceso al mapa.' });
    const perfil = (await acceso.db.collection('usuarios').doc(acceso.uid).get()).data();
    if (perfil?.permisosPersonalizados && perfil.permisosSistema?.ordenesVer !== true) {
      return res.status(403).json({ error: 'No tienes permiso para consultar órdenes.' });
    }
    let body: unknown = req.body;
    if (typeof body === 'string') {
      try { body = JSON.parse(body); }
      catch { return res.status(400).json({ error: 'JSON inválido.' }); }
    }
    if (!body || typeof body !== 'object' || Array.isArray(body)) return res.status(400).json({ error: 'Solicitud inválida.' });
    const { puntos, trafico } = body as { puntos?: unknown; trafico?: unknown };
    if (!Array.isArray(puntos) || puntos.length < 2 || puntos.length > 9 || !puntos.every(valido) || (trafico !== undefined && typeof trafico !== 'boolean')) {
      return res.status(400).json({ error: 'Se necesitan de 2 a 9 coordenadas válidas y una preferencia de tráfico válida.' });
    }
    const clave = process.env.GOOGLE_ROUTES_KEY;
    const tope = Number(process.env.GOOGLE_ROUTES_LIMITE_MENSUAL || 0);
    if (process.env.GOOGLE_ROUTES_ENABLED !== 'true' || !clave || !Number.isSafeInteger(tope) || tope <= 0) return estimado('sin_configurar');
    const mes = new Date().toISOString().slice(0, 7);
    const ref = acceso.db.collection('config_mapa').doc(`uso_${mes}`);
    const reservado = await acceso.db.runTransaction(async tx => {
      const data = (await tx.get(ref)).data();
      const uso = Number(data?.solicitudes ?? 0);
      if (!Number.isSafeInteger(uso) || uso < 0 || uso >= tope) return false;
      tx.set(ref, { solicitudes: uso + 1, actualizado: Date.now() }, { merge: true });
      return true;
    });
    if (!reservado) return estimado('tope_mensual');
    const ll = (p: Punto) => ({ location: { latLng: { latitude: p.lat, longitude: p.lng } } });
    const respuesta = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
      method: 'POST', signal: AbortSignal.timeout(8000),
      headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': clave,
        'X-Goog-FieldMask': 'routes.legs.distanceMeters,routes.legs.duration,routes.polyline.encodedPolyline' },
      body: JSON.stringify({ origin: ll(puntos[0]), destination: ll(puntos[puntos.length - 1]),
        intermediates: puntos.slice(1, -1).map(ll), travelMode: 'DRIVE',
        routingPreference: trafico ? 'TRAFFIC_AWARE' : 'TRAFFIC_UNAWARE',
        languageCode: 'es', regionCode: 'DO', units: 'METRIC' }),
    });
    if (!respuesta.ok) return estimado('proveedor_no_disponible');
    const data = await respuesta.json() as { routes?: { legs?: { distanceMeters?: number; duration?: string }[]; polyline?: { encodedPolyline?: string } }[] };
    const route = data.routes?.[0];
    const legs = route?.legs;
    if (!legs || legs.length !== puntos.length - 1 || !legs.every(l => Number.isFinite(l.distanceMeters) && l.distanceMeters! >= 0 && /^\d+(\.\d+)?s$/.test(l.duration ?? ''))) return estimado('sin_ruta');
    return res.status(200).json({ fuente: 'google', calculadoEn: Date.now(),
      tramos: legs.map(l => ({ km: l.distanceMeters! / 1000, min: Number.parseFloat(l.duration!) / 60 })),
      polilinea: route?.polyline?.encodedPolyline ?? null });
  } catch (error) {
    if (error instanceof ErrorAcceso) return res.status(error.status).json({ error: error.message });
    return estimado('no_disponible');
  }
}
