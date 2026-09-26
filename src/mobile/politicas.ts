export type MuestraGPS = { lat: number; lng: number; precision: number; capturadaEn: number; simulada: boolean };
export function muestraValida(value: unknown, ahora = Date.now()): value is MuestraGPS {
  if (!value || typeof value !== 'object') return false;
  const m = value as MuestraGPS;
  return [m.lat, m.lng, m.precision, m.capturadaEn].every(Number.isFinite) &&
    Math.abs(m.lat) <= 90 && Math.abs(m.lng) <= 180 && m.precision >= 0 && m.precision <= 100000 &&
    m.capturadaEn <= ahora + 60000 && m.capturadaEn >= ahora - 86400000 && typeof m.simulada === 'boolean';
}
export function estadoUbicacion(capturadaEn?: number | null, ahora = Date.now()) {
  if (!capturadaEn || ahora - capturadaEn > 900000 || capturadaEn > ahora + 60000) return 'sin datos';
  return ahora - capturadaEn <= 120000 ? 'reciente' : 'retrasada';
}
export function origenApiMovil(raw: string | undefined): string {
  if (!raw) throw new Error('Falta configurar el servidor de la app móvil.');
  const url = new URL(raw);
  if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error('El servidor móvil debe ser un origen HTTPS sin credenciales ni rutas.');
  return url.origin;
}
