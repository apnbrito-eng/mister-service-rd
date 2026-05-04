/**
 * Helpers para construir URLs de Google Maps a partir de coordenadas GPS.
 *
 * En desktop, los enlaces abren Google Maps en el browser. En iOS/Android
 * el sistema operativo intercepta el `https://...maps...` y abre la app
 * nativa de Maps si está instalada (sin handling adicional acá).
 */

export interface CoordsGPS {
  lat: number;
  lng: number;
}

/**
 * Valida que un objeto coords tenga `lat` y `lng` numéricos finitos.
 *
 * Importante: rechaza explícitamente NaN porque algunos clientes legacy
 * importados desde el CSV histórico tenían coords mal parseadas que
 * llegaban como NaN. Acepta `0`/`0` (algunos sistemas usan 0,0 como
 * default falso) — la decisión de tratarlos como inválidos queda al caller.
 */
function coordsValidos(coords: CoordsGPS | null | undefined): coords is CoordsGPS {
  if (!coords) return false;
  if (typeof coords.lat !== 'number' || typeof coords.lng !== 'number') return false;
  if (isNaN(coords.lat) || isNaN(coords.lng)) return false;
  return true;
}

/**
 * Construye URL de Google Maps con direcciones desde la ubicación actual
 * del usuario hasta las coordenadas destino. Retorna `null` si las coords
 * son inválidas (no presentes, no numéricas, NaN).
 *
 * @example
 *   googleMapsDirectionsUrl({ lat: 18.45, lng: -69.93 })
 *   // → "https://www.google.com/maps/dir/?api=1&destination=18.45,-69.93"
 */
export function googleMapsDirectionsUrl(
  coords: CoordsGPS | null | undefined,
): string | null {
  if (!coordsValidos(coords)) return null;
  return `https://www.google.com/maps/dir/?api=1&destination=${coords.lat},${coords.lng}`;
}

/**
 * URL para "Ver en mapa" (sin direcciones, solo el pin del destino).
 * Útil cuando solo se quiere mostrar la ubicación, sin iniciar navegación.
 */
export function googleMapsViewUrl(
  coords: CoordsGPS | null | undefined,
): string | null {
  if (!coordsValidos(coords)) return null;
  return `https://maps.google.com/?q=${coords.lat},${coords.lng}`;
}

/**
 * Construye un objeto `CoordsGPS` a partir de campos sueltos `lat` y `lng`
 * (el shape histórico usado en `Cliente` y `OrdenServicio`). Retorna
 * `undefined` si cualquiera de los dos falta o es inválido. Pensado para
 * llamadas concisas tipo `coordsFromLatLng(c.lat, c.lng)`.
 */
export function coordsFromLatLng(
  lat: number | null | undefined,
  lng: number | null | undefined,
): CoordsGPS | undefined {
  if (typeof lat !== 'number' || typeof lng !== 'number') return undefined;
  if (isNaN(lat) || isNaN(lng)) return undefined;
  return { lat, lng };
}
