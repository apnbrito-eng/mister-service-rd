import { Cliente, OrdenServicio } from '../types';

/** Infiere la zona de República Dominicana desde coordenadas lat/lng. */
export function inferirZona(lat?: number, lng?: number): string | null {
  if (typeof lat !== 'number' || typeof lng !== 'number') return null;
  if (isNaN(lat) || isNaN(lng)) return null;

  // Distrito Nacional
  if (lat >= 18.43 && lat <= 18.52 && lng >= -69.98 && lng <= -69.85)
    return 'Distrito Nacional';
  // Santo Domingo Norte
  if (lat > 18.52 && lat <= 18.65 && lng >= -70.0 && lng <= -69.85)
    return 'Santo Domingo Norte';
  // Santo Domingo Este
  if (lat >= 18.43 && lat <= 18.6 && lng > -69.85 && lng <= -69.55)
    return 'Santo Domingo Este';
  // Santo Domingo Oeste
  if (lat >= 18.43 && lat <= 18.65 && lng > -70.2 && lng < -69.98)
    return 'Santo Domingo Oeste';
  // Santiago
  if (lat >= 19.35 && lat <= 19.55 && lng >= -70.8 && lng <= -70.6)
    return 'Santiago';
  // La Vega
  if (lat >= 19.15 && lat <= 19.35 && lng >= -70.6 && lng <= -70.4)
    return 'La Vega';
  // Puerto Plata
  if (lat >= 19.7 && lat <= 19.85 && lng >= -70.8 && lng <= -70.5)
    return 'Puerto Plata';
  // Punta Cana
  if (lat >= 18.4 && lat <= 18.75 && lng >= -68.6 && lng <= -68.3)
    return 'Punta Cana';
  return 'Otro';
}

/** Zona de una orden. Prioridad: cliente.zona manual > coords de la orden > coords del cliente. */
export function zonaDeOrden(orden: OrdenServicio, cliente?: Cliente | null): string | null {
  if (cliente?.zona) return cliente.zona;
  if (typeof orden.clienteLat === 'number' && typeof orden.clienteLng === 'number') {
    return inferirZona(orden.clienteLat, orden.clienteLng);
  }
  if (cliente && typeof cliente.lat === 'number' && typeof cliente.lng === 'number') {
    return inferirZona(cliente.lat, cliente.lng);
  }
  return null;
}

/** Color tailwind sugerido para mostrar la zona (visual en popups/badges). */
export function zonaColor(zona?: string | null): string {
  switch (zona) {
    case 'Distrito Nacional': return 'text-blue-700';
    case 'Santo Domingo Norte': return 'text-green-700';
    case 'Santo Domingo Este': return 'text-violet-700';
    case 'Santo Domingo Oeste': return 'text-orange-700';
    case 'Santiago': return 'text-pink-700';
    case 'La Vega': return 'text-teal-700';
    case 'Puerto Plata': return 'text-sky-700';
    case 'Punta Cana': return 'text-amber-700';
    default: return 'text-gray-500';
  }
}

/**
 * Color hex para un pin de mapa coloreado por zona. A diferencia de `zonaColor`
 * (que devuelve clases tailwind para texto), este se usa con Leaflet (DivIcon /
 * circleMarker / fillColor) y se mantiene sincronizado con la paleta visual.
 */
export function colorZonaPin(zona?: string | null): string {
  switch (zona) {
    case 'Distrito Nacional': return '#3b82f6';
    case 'Santo Domingo Norte': return '#10b981';
    case 'Santo Domingo Este': return '#eab308';
    case 'Santo Domingo Oeste': return '#f97316';
    case 'Santiago': return '#a855f7';
    case 'La Vega': return '#14b8a6';
    case 'Puerto Plata': return '#0ea5e9';
    case 'Punta Cana': return '#f59e0b';
    case 'Otro': return '#64748b';
    default: return '#9ca3af';
  }
}

/**
 * Color hex para un pin coloreado por antigüedad de último servicio.
 * Recibe meses transcurridos (puede ser null si no hay registro).
 *  - null: gris (sin registro)
 *  - < 3 meses: verde (cliente activo)
 *  - 3-6 meses: amarillo
 *  - 6-12 meses: naranja
 *  - > 12 meses: rojo (frío)
 */
export function colorAntiguedadPin(meses: number | null): string {
  if (meses === null) return '#9ca3af';
  if (meses < 3) return '#10b981';
  if (meses < 6) return '#eab308';
  if (meses < 12) return '#f97316';
  return '#ef4444';
}

/** Etiqueta humana del rango de antigüedad correspondiente al pin. */
export function etiquetaAntiguedadPin(meses: number | null): string {
  if (meses === null) return 'Sin registro';
  if (meses < 3) return 'Menos de 3 meses';
  if (meses < 6) return '3 a 6 meses';
  if (meses < 12) return '6 a 12 meses';
  return 'Más de 12 meses';
}
