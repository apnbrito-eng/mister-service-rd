import { Timestamp } from 'firebase/firestore';
import { addDays, differenceInDays } from 'date-fns';
import type { OrdenServicio } from '../types';

/**
 * Helpers puros para el sistema de garantía (SPRINT-135a, 2026-05-11).
 *
 * Diseñados para ser fácilmente testeables y sin efectos secundarios. Las
 * funciones tratan `Timestamp` y `Date` indistintamente — `OrdenServicio.fechaCierre`
 * y `garantiaVencimiento` pueden venir como cualquiera de los dos según el origen
 * del read (Firestore real vs mock).
 *
 * Convenciones del negocio (confirmadas con Jorge 2026-05-11):
 * - Período por defecto: 60 días.
 * - El período se computa desde `fechaCierre` (no desde `fechaServicio`).
 * - Para órdenes legacy sin `garantiaVencimiento`, se computa al vuelo desde
 *   `fechaCierre + periodoGarantiaDias` (o + 60 si tampoco hay período).
 */

/** Período de garantía por defecto en días (decisión Jorge 2026-05-11). */
export const PERIODO_GARANTIA_DEFAULT_DIAS = 60;

/** Convierte `Timestamp | Date | undefined` a `Date | null`. */
function aDate(valor: Timestamp | Date | undefined | null): Date | null {
  if (!valor) return null;
  if (valor instanceof Date) return valor;
  // Timestamp Firestore
  if (typeof (valor as Timestamp).toDate === 'function') {
    try {
      return (valor as Timestamp).toDate();
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Calcula la fecha de vencimiento de la garantía a partir de la fecha de cierre.
 *
 * @example
 * calcularVencimiento(new Date('2026-05-11'), 60) // → Date('2026-07-10')
 */
export function calcularVencimiento(fechaCierre: Date, dias: number): Date {
  return addDays(fechaCierre, dias);
}

/**
 * Devuelve la fecha de vencimiento de la garantía de una orden.
 *
 * Si `garantiaVencimiento` ya está poblada (post-SPRINT-135a), la usa. Si no
 * (orden legacy), computa `cierreServicio.fechaCierre + (periodoGarantiaDias ?? default)`.
 *
 * @returns `Date | null` — null si la orden no tiene cierreServicio todavía.
 */
export function vencimientoDeOrden(orden: OrdenServicio): Date | null {
  // Caso preferido: campo persistido en SPRINT-135a en adelante.
  const persistido = aDate(orden.garantiaVencimiento);
  if (persistido) return persistido;
  // Fallback legacy: computar desde cierreServicio.fechaCierre.
  const cierre = orden.cierreServicio?.fechaCierre
    ? aDate(orden.cierreServicio.fechaCierre as Date | Timestamp)
    : null;
  if (!cierre) return null;
  const dias = orden.periodoGarantiaDias ?? PERIODO_GARANTIA_DEFAULT_DIAS;
  return calcularVencimiento(cierre, dias);
}

/**
 * Días restantes hasta el vencimiento de la garantía. Negativo si ya expiró.
 *
 * @returns 0 si la orden no tiene cierre (no hay garantía emitida).
 */
export function diasRestantes(orden: OrdenServicio): number {
  const venc = vencimientoDeOrden(orden);
  if (!venc) return 0;
  const ahora = new Date();
  return differenceInDays(venc, ahora);
}

/**
 * ¿La orden está dentro del período de garantía válido?
 *
 * Retorna true si:
 * - Hay un vencimiento computable (orden cerrada con fecha conocida), Y
 * - La fecha actual es ≤ vencimiento.
 *
 * Retorna false si:
 * - La orden no tiene cierre todavía (no hay garantía emitida).
 * - La fecha actual es > vencimiento (expiró).
 */
export function estaDentroDePeriodo(orden: OrdenServicio): boolean {
  const venc = vencimientoDeOrden(orden);
  if (!venc) return false;
  return Date.now() <= venc.getTime();
}
