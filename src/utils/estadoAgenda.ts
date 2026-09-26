import type { OrdenServicio } from '../types';

/** Preparar una cita en oficina no significa que el técnico haya iniciado. */
export function visitaEnProgreso(orden: Pick<OrdenServicio, 'fase' | 'inicioChequeo'>): boolean {
  if (['trabajo_realizado', 'cerrado', 'cancelado'].includes(orden.fase)) return false;
  if (['en_diagnostico', 'en_cotizacion', 'aprobado'].includes(orden.fase)) return true;
  return !!orden.inicioChequeo && ['agendado', 'en_gestion'].includes(orden.fase);
}
