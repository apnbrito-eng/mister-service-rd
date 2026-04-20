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
  const t = texto.trim();

  // Formato: ?q=lat,lng
  const mQ = t.match(/[?&]q=(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (mQ) return { lat: parseFloat(mQ[1]), lng: parseFloat(mQ[2]) };

  // Formato: ?ll=lat,lng (Apple Maps, Waze)
  const mLl = t.match(/[?&]ll=(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (mLl) return { lat: parseFloat(mLl[1]), lng: parseFloat(mLl[2]) };

  // Formato: /maps/@lat,lng
  const mAt = t.match(/maps\/[^@]*@(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (mAt) return { lat: parseFloat(mAt[1]), lng: parseFloat(mAt[2]) };

  // Formato: /maps/place/.../@lat,lng
  const mPlace = t.match(/\/@(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (mPlace) return { lat: parseFloat(mPlace[1]), lng: parseFloat(mPlace[2]) };

  // Texto plano "lat,lng" (ej: compartir ubicación WhatsApp)
  const mPuro = t.match(/^(-?\d{1,3}\.\d+),\s*(-?\d{1,3}\.\d+)$/);
  if (mPuro) return { lat: parseFloat(mPuro[1]), lng: parseFloat(mPuro[2]) };

  // "lat: X, lng: Y"
  const mLatLng = t.match(/lat[:\s]+(-?\d+\.\d+).*?lng[:\s]+(-?\d+\.\d+)/i);
  if (mLatLng) return { lat: parseFloat(mLatLng[1]), lng: parseFloat(mLatLng[2]) };

  return null;
}

/**
 * Reverse geocoding vía Nominatim (OpenStreetMap) — devuelve dirección legible.
 * Toma solo los primeros 3 componentes para evitar strings excesivamente largos.
 */
export async function reverseGeocode(lat: number, lng: number): Promise<string | null> {
  try {
    const resp = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&accept-language=es`,
      { headers: { 'Accept-Language': 'es' } },
    );
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
export function cargarGooglePlaces(apiKey: string | undefined): Promise<boolean> {
  return new Promise(resolve => {
    const w = window as unknown as { google?: { maps?: { places?: unknown } } };
    if (w.google?.maps?.places) {
      resolve(true);
      return;
    }
    if (!apiKey) {
      resolve(false);
      return;
    }
    const existing = document.getElementById('google-places-script');
    if (existing) {
      // Ya se está cargando, esperar
      const check = setInterval(() => {
        if (w.google?.maps?.places) {
          clearInterval(check);
          resolve(true);
        }
      }, 100);
      setTimeout(() => {
        clearInterval(check);
        resolve(!!w.google?.maps?.places);
      }, 10000);
      return;
    }
    const script = document.createElement('script');
    script.id = 'google-places-script';
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places&language=es`;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve(!!w.google?.maps?.places);
    script.onerror = () => resolve(false);
    document.head.appendChild(script);
  });
}
