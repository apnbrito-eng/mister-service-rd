import type { FaseOrden } from '../types';
import type { PasoVisible } from './progresoOrden';

export type EstadoChip = PasoVisible | 'garantia' | 'atrasada' | 'standby' | 'neutro';

/** Solo presentación: nunca infiere llegada, pago ni cambia una fase. */
export const CLASES_CHIP: Record<EstadoChip, string> = {
  agendada: 'bg-[var(--ms-chip-agendada-fondo)] text-ms-accion',
  en_camino: 'bg-[var(--ms-chip-camino-fondo)] text-ms-accion',
  en_sitio: 'bg-[var(--ms-chip-sitio-fondo)] text-ms-accion',
  diagnostico: 'bg-paso-3 text-white',
  trabajando: 'bg-paso-4 text-white',
  cobro: 'bg-ms-accion text-white',
  cerrada: 'bg-ms-exito text-white',
  garantia: 'bg-ms-garantia text-white',
  atrasada: 'bg-[var(--ms-chip-atraso-fondo)] text-[var(--ms-chip-atraso-texto)] border border-ms-advertencia',
  standby: 'bg-[var(--ms-chip-neutro-fondo)] text-[var(--ms-chip-neutro-texto)]',
  neutro: 'bg-[var(--ms-chip-neutro-fondo)] text-[var(--ms-chip-neutro-texto)]',
};

/** Colorea la fase existente conservando su etiqueta; no sustituye progresoOrden. */
export function estadoChipDeFase(fase: FaseOrden | 'reactivada_post_chequeo'): EstadoChip {
  switch (fase) {
    case 'agendado': return 'agendada';
    case 'en_diagnostico':
    case 'en_cotizacion': return 'diagnostico';
    case 'aprobado': return 'trabajando';
    case 'trabajo_realizado': return 'cobro';
    case 'cerrado': return 'cerrada';
    case 'garantia_reclamada': return 'garantia';
    default: return 'neutro';
  }
}
