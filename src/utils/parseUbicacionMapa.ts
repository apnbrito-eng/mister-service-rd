import { tieneCoord } from './geo';
import type { UbicacionVehiculo } from '../types';
/** No sustituir fecha ausente por ahora: convertiría una posición vieja en GPS vivo. */
export function parseUbicacionMapa(id: string, raw: Record<string, unknown>): UbicacionVehiculo | null {
  if (raw.jornadaActiva === false || !tieneCoord(raw as { lat?: number; lng?: number })) return null;
  const valor = raw.timestamp as { toDate?: () => Date } | Date | undefined;
  let timestamp = new Date(NaN);
  try {
    if (valor instanceof Date) timestamp = valor;
    else if (typeof valor?.toDate === 'function') timestamp = valor.toDate();
  } catch { /* una fecha inválida permanece inválida */ }
  return {
    vehiculoId: typeof raw.vehiculoId === 'string' ? raw.vehiculoId : id,
    tecnicoId: typeof raw.tecnicoId === 'string' ? raw.tecnicoId : '',
    tecnicoNombre: typeof raw.tecnicoNombre === 'string' ? raw.tecnicoNombre : undefined,
    lat: typeof raw.lat === 'number' ? raw.lat : NaN,
    lng: typeof raw.lng === 'number' ? raw.lng : NaN,
    velocidad: typeof raw.velocidad === 'number' && Number.isFinite(raw.velocidad) ? raw.velocidad : 0,
    rumbo: typeof raw.rumbo === 'number' && Number.isFinite(raw.rumbo) ? raw.rumbo : 0,
    timestamp, enMovimiento: raw.enMovimiento === true,
    direccionAproximada: typeof raw.direccionAproximada === 'string' ? raw.direccionAproximada : undefined,
  };
}
