/**
 * geo.ts — distancias y tiempos de manejo estimados. Un solo lugar para esto.
 * Destino: src/utils/geo.ts
 *
 * Reemplaza las copias que hay hoy de haversine en utils/rutas.ts, gps.service.ts,
 * capacidadAgenda.ts y mapaClientes.ts: esos archivos deben importar de aquí.
 */
export interface LatLng { lat: number; lng: number }

/** true solo si lat y lng son números válidos y caen en un rango real (descarta 0,0). */
export const tieneCoord = <X extends { lat?: number | null; lng?: number | null }>(x: X | null | undefined): x is X & LatLng =>
  !!x && typeof x.lat === 'number' && typeof x.lng === 'number' &&
  Number.isFinite(x.lat) && Number.isFinite(x.lng) &&
  Math.abs(x.lat) <= 90 && Math.abs(x.lng) <= 180 && !(x.lat === 0 && x.lng === 0);

/** Distancia en línea recta, en km. */
export function kmLineaRecta(a: LatLng, b: LatLng): number {
  const R = 6371, r = (x: number) => (x * Math.PI) / 180;
  const dLa = r(b.lat - a.lat), dLo = r(b.lng - a.lng);
  const h = Math.sin(dLa / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dLo / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(Math.min(1, Math.max(0, h))));
}

/** Estimación orientativa; no es distancia calculada por calles. */
export const kmEntre = (a: LatLng, b: LatLng): number => kmLineaRecta(a, b) * 1.3;

/** Metros en línea recta (para saber si la van está en la casa del cliente). */
export function metrosEntre(a: LatLng, b: LatLng): number {
  return kmLineaRecta(a, b) * 1000;
}

/**
 * Minutos de manejo cuando Google no responde: 4 min de arranque/parqueo + 22 km/h
 * (supuesto orientativo, no promedio medido). Siempre se muestra como «estimado».
 */
export function minutosManejoEstimado(km: number): number {
  if (km <= 0) return 0;
  return Math.round(4 + (km / 22) * 60);
}
