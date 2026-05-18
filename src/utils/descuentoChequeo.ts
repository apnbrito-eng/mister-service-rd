/**
 * Helpers puros para el descuento automático por chequeo previo (SPRINT-178).
 *
 * Regla de negocio (OK Jorge 2026-05-18):
 *  - Si el cliente tuvo un cierre `tipo: solo_chequeo` del mismo `equipoTipo`
 *    en los últimos 30 días, el monto del chequeo se aplica como descuento
 *    a la nueva cotización al aprobar precio.
 *  - Edge case 2+ chequeos vigentes: aplica solo el MÁS RECIENTE.
 *  - Solo cotizaciones aprobadas post-deploy (no retroactivo).
 *  - Override manual: solo admin/coord con audit log.
 *  - Matching: `clienteId + equipoTipo` (sin equipoModelo).
 *
 * Este módulo NO toca Firestore. Solo formula los campos a persistir y los
 * cálculos. Los 3 handlers de `handleAprobarPrecio` (Ordenes.tsx, OrdenDetalle.tsx,
 * AgendaDia.tsx) llaman a estos helpers para mantener el cálculo idéntico
 * (cazador P-011 evita divergencia entre los 3 handlers).
 */

import { Timestamp } from 'firebase/firestore';

/**
 * Días de vigencia del descuento por chequeo previo. Si Jorge decide cambiar
 * la regla en el futuro, modificar acá (constante única).
 */
export const VIGENCIA_CHEQUEO_DIAS = 30;

/**
 * Calcula el precio final post-descuento. Nunca permite precio negativo
 * (si descuento > precio, el resultado es 0).
 *
 * Es una función pura — sin side effects, sin acceso a Firestore.
 */
export function calcularDescuentoChequeo(
  precioBase: number,
  descuentoMonto: number,
): { precioConDescuento: number; descuentoAplicado: number } {
  const desc = Math.max(0, Math.min(descuentoMonto, precioBase));
  return {
    precioConDescuento: Math.max(0, precioBase - desc),
    descuentoAplicado: desc,
  };
}

/**
 * Días restantes de vigencia desde la fecha del cierre del chequeo.
 * Retorna número negativo si el chequeo ya está vencido.
 */
export function diasRestantesVigencia(fechaCierre: Date | Timestamp): number {
  const fc = fechaCierre instanceof Timestamp ? fechaCierre.toDate() : fechaCierre;
  const ahora = new Date();
  const transcurridos = Math.floor((ahora.getTime() - fc.getTime()) / (1000 * 60 * 60 * 24));
  return VIGENCIA_CHEQUEO_DIAS - transcurridos;
}

/**
 * True si el chequeo todavía está dentro de los 30 días de vigencia.
 */
export function chequeoVigente(fechaCierre: Date | Timestamp): boolean {
  return diasRestantesVigencia(fechaCierre) > 0;
}

/**
 * Resultado de buscar un chequeo vigente para un cliente/equipo.
 * Devuelto por `buscarChequeoVigentePorCliente` en `ordenes.service.ts`.
 */
export interface ChequeoVigenteInfo {
  ordenId: string;
  ordenNumero: string;
  fechaCierre: Date;
  montoChequeo: number;
  vigente: boolean;
  diasRestantes: number;
}

/**
 * Construye el subset de campos `descuentoChequeoPrevio*` listos para escribir
 * a `ordenes_servicio` o `facturas`. Strip-undefined defensivo: si un campo
 * opcional está vacío, no se incluye en el output (Firestore rechaza undefined).
 *
 * El caller debe pasar `aplicadoPor` como `auth.uid` (NO `userProfile.id` —
 * ver gotcha CLAUDE.md "userProfile.id NO siempre es auth.uid").
 *
 * @param chequeo Info del chequeo origen (de `buscarChequeoVigentePorCliente`).
 * @param montoFinalDescuento Monto efectivamente aplicado (puede ser menor que
 *   `chequeo.montoChequeo` si el precio base era inferior).
 * @param override `true` si admin/coord aplicó sobre chequeo vencido o custom.
 *   `false` u omitido si fue auto.
 * @param motivoOverride Obligatorio si `override=true`. Texto libre.
 * @param aplicadoPor auth.uid del usuario que aprobó (solo si override).
 */
export function construirCamposDescuentoChequeo(args: {
  chequeo: { ordenId: string; fechaCierre: Date | Timestamp };
  montoFinalDescuento: number;
  override?: boolean;
  motivoOverride?: string;
  aplicadoPor?: string;
}): Record<string, unknown> {
  const { chequeo, montoFinalDescuento, override, motivoOverride, aplicadoPor } = args;
  const fechaTs = chequeo.fechaCierre instanceof Timestamp
    ? chequeo.fechaCierre
    : Timestamp.fromDate(chequeo.fechaCierre);
  const out: Record<string, unknown> = {
    descuentoChequeoPrevioId: chequeo.ordenId,
    descuentoChequeoPrevioMonto: montoFinalDescuento,
    descuentoChequeoPrevioFecha: fechaTs,
  };
  if (override === true) {
    out.descuentoChequeoPrevioOverride = true;
    if (motivoOverride && motivoOverride.trim().length > 0) {
      out.descuentoChequeoPrevioMotivoOverride = motivoOverride.trim();
    }
    if (aplicadoPor && aplicadoPor.length > 0) {
      out.descuentoChequeoPrevioAplicadoPor = aplicadoPor;
    }
  }
  return out;
}

/**
 * Construye un mensaje de detalle para audit log + historial de la orden.
 * Usado por los 3 handlers de aprobación para mantener mensaje consistente.
 */
export function describirDescuentoChequeo(args: {
  ordenNumero: string;
  montoDescuento: number;
  fechaChequeo: Date | Timestamp;
  override: boolean;
  motivoOverride?: string;
}): string {
  const { ordenNumero, montoDescuento, fechaChequeo, override, motivoOverride } = args;
  const fc = fechaChequeo instanceof Timestamp ? fechaChequeo.toDate() : fechaChequeo;
  const fechaStr = fc.toLocaleDateString('es-DO', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const montoStr = `RD$${montoDescuento.toLocaleString('es-DO')}`;
  const tipo = override ? ' (override manual)' : ' (auto)';
  const motivo = override && motivoOverride ? ` — motivo: ${motivoOverride}` : '';
  return `Descuento por chequeo previo${tipo}: ${montoStr} (origen ${ordenNumero} del ${fechaStr})${motivo}`;
}
