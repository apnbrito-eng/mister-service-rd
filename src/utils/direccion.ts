import { tieneCoord } from './geo';
import { cargarGoogleMaps } from './cargarGoogleMaps';
/**
 * Utilidades para parsear direcciones y coordenadas desde distintos formatos
 * (URL de Google Maps, texto plano "lat,lng", "share location" de WhatsApp, etc.)
 */

export interface Coords {
  lat: number;
  lng: number;
}

/**
 * Detecta coordenadas en texto. Soporta:
 *   - https://maps.google.com/?q=18.49,-70.00
 *   - https://www.google.com/maps/@18.49,-70.00,17z
 *   - https://www.google.com/maps/place/.../@18.49,-70.00,17z
 *   - https://goo.gl/maps/xxxx (no expande, retorna null)
 *   - "18.49, -70.00"
 *   - "lat: 18.49, lng: -70.00"
 *   - URLs de apple maps: "maps.apple.com/?ll=18.49,-70.00"
 *   - Strings con "https://waze.com/ul?ll=18.49,-70.00"
 */
export function detectarCoordenadasURL(texto: string): Coords | null {
  if (!texto) return null;
  let t = texto.trim();
  try { t = decodeURIComponent(t); } catch { /* Conservar texto si no está codificado correctamente. */ }
  const numero = '([+-]?\\d{1,3}(?:\\.\\d+)?)';
  const par = `${numero}\\s*[,;]\\s*${numero}`;
  // El pin del lugar tiene prioridad sobre el centro de la cámara (@lat,lng).
  const patrones = [
    new RegExp(`!3d${numero}!4d${numero}`),
    new RegExp(`[?&](?:q|query|ll|destination|center)=${par}`, 'i'),
    new RegExp(`geo:${par}`, 'i'),
    new RegExp(`lat(?:itud|itude)?[:=\\s]+${numero}.*?(?:lng|lon|longitud|longitude)[:=\\s]+${numero}`, 'i'),
    new RegExp(`^\\(?${par}\\)?$`),
    new RegExp(`/@${par}`),
  ];
  for (const patron of patrones) {
    const m = t.match(patron);
    if (m) {
      const punto = { lat: Number(m[1]), lng: Number(m[2]) };
      return tieneCoord(punto) ? punto : null;
    }
  }
  return null;
}

/**
 * Reverse geocoding vía Nominatim (OpenStreetMap) — devuelve dirección legible.
 * Toma solo los primeros 3 componentes para evitar strings excesivamente largos.
 */
export async function reverseGeocode(lat: number, lng: number): Promise<string | null> {
  if (!tieneCoord({ lat, lng })) return null;
  try {
    const resp = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&accept-language=es`,
      { headers: { 'Accept-Language': 'es' }, signal: AbortSignal.timeout(5000) },
    );
    if (!resp.ok) return null;
    const data = await resp.json();
    const raw = (data?.display_name || '').toString();
    if (!raw) return null;
    return raw.split(',').slice(0, 3).join(',').trim();
  } catch {
    return null;
  }
}

/**
 * Carga el script de Google Places (una sola vez). Resuelve cuando `window.google.maps.places`
 * está disponible. Si ya está cargado, resuelve inmediatamente.
 */
export async function cargarGooglePlaces(apiKey: string | undefined): Promise<boolean> {
  if (!await cargarGoogleMaps(apiKey)) return false;
  return Boolean(window.google?.maps?.places);
}
