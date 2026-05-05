import type { MetodoPago } from '../types';

/**
 * Labels en español para los métodos de pago. Centralizado acá para que los
 * componentes que renderizan métodos de pago (Facturas, OrdenDetalle,
 * ModalEditarOrdenAdmin, FacturaCrearModal, etc.) lo importen sin duplicar.
 *
 * Mantener sincronizado con `MetodoPago` en `src/types/index.ts`.
 */
export const METODO_PAGO_LABELS: Record<MetodoPago, string> = {
  efectivo: 'Efectivo',
  transferencia: 'Transferencia',
  tarjeta: 'Tarjeta',
  link: 'Link',
  otro: 'Otro',
};

/**
 * Clases de Tailwind por método de pago para chips/badges. Mantener
 * sincronizado con `METODO_PAGO_LABELS`.
 */
export const METODO_PAGO_COLORS: Record<MetodoPago, string> = {
  efectivo: 'bg-green-100 text-green-700',
  transferencia: 'bg-blue-100 text-blue-700',
  tarjeta: 'bg-purple-100 text-purple-700',
  link: 'bg-indigo-100 text-indigo-700',
  otro: 'bg-gray-100 text-gray-700',
};
