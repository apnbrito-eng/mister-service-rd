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
