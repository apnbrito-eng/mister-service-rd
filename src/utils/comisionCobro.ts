import { fechaFinanciera } from './fechaFinanciera.js';
/** Reglas de cobro para liberar una comisión; no depende de Firebase ni de la custodia del efectivo. */
export type PoliticaCobroComision = { exigirVerificacion: boolean };
// Jorge, 03/10/2026: trabajo terminado y pago final confirmado por oficina.
export const POLITICA_COBRO_COMISION: PoliticaCobroComision = { exigirVerificacion: true };

export function cobroCompletoParaComision(orden: Record<string, unknown> | undefined, politica: PoliticaCobroComision): boolean {
  if (!orden || orden.eliminada === true || orden.soloChequeo === true) return false;
  const total = orden.precioFinal;
  if (typeof total !== 'number' || !Number.isFinite(total) || total <= 0 || !Array.isArray(orden.pagos)) return false;
  const ids = new Set<string>();
  let cobrado = 0;
  for (const pago of orden.pagos) {
    if (!pago || typeof pago !== 'object' || typeof pago.id !== 'string' || !pago.id || ids.has(pago.id) ||
        typeof pago.monto !== 'number' || !Number.isFinite(pago.monto) || pago.monto <= 0) return false;
    ids.add(pago.id);
    if (!politica.exigirVerificacion || pago.verificado === true) cobrado += Math.round(pago.monto * 100);
  }
  return cobrado >= Math.round(total * 100);
}

/** Misma quincena de negocio, con zona RD explícita para servidor y navegador. */
export function quincenaCobroRD(fecha: Date): string {
  const partes = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santo_Domingo', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(fecha);
  const parte = (nombre: string) => Number(partes.find(p => p.type === nombre)!.value);
  let anio = parte('year'), mes = parte('month');
  const dia = parte('day');
  if (dia >= 30) { mes++; if (mes > 12) { mes = 1; anio++; } }
  return `${anio}-${String(mes).padStart(2, '0')}-${dia >= 15 && dia < 30 ? 'Q2' : 'Q1'}`;
}

export function montoComisionCoincide(comision: Record<string, unknown>, orden: Record<string, unknown>): boolean {
  return typeof comision.precioFinal === 'number' && Number.isFinite(comision.precioFinal) && comision.precioFinal > 0 &&
    typeof orden.precioFinal === 'number' && Number.isFinite(orden.precioFinal) && Math.round(comision.precioFinal * 100) === Math.round(orden.precioFinal * 100);
}

/** Solo libera registros nuevos retenidos. Nunca altera comisiones históricas o liquidadas. */
export function prepararLiberacionComision(
  comision: Record<string, unknown> | undefined,
  orden: Record<string, unknown>,
  ahora: unknown,
  fecha: Date,
  politica: PoliticaCobroComision,
): Record<string, unknown> | null {
  if (!comision || comision.estadoLiquidacion !== 'retenida_por_cobro' || comision.estaAnulada || comision.liquidacionId ||
      !montoComisionCoincide(comision, orden) || !['cerrado', 'trabajo_realizado'].includes(String(orden.fase)) || !cobroCompletoParaComision(orden, politica)) return null;
  return { estadoLiquidacion: 'pendiente', cobroLiberadoEn: ahora, fechaCobro: ahora, quincenaAsignada: quincenaCobroRD(fecha), updatedAt: ahora };
}

/** Carga cada orden una sola vez. El caller de nómina debe suministrar tx.get, antes de escribir. */
export async function leerOrdenesDeComisiones(
  comisiones: Record<string, unknown>[],
  leerOrden: (ordenId: string) => Promise<Record<string, unknown> | undefined>,
): Promise<Map<string, Record<string, unknown> | undefined>> {
  const ids = [...new Set(comisiones.flatMap(c => typeof c.ordenId === 'string' && c.ordenId && !c.ordenId.startsWith('factura-manual-') ? [c.ordenId] : []))];
  const ordenes = await Promise.all(ids.map(async id => [id, await leerOrden(id)] as const));
  return new Map(ordenes);
}

/** No usar estadoPago o montoPagado del borrador de nómina: revisar los pagos de la orden leída. */
export function comisionConCobroCompleto(
  comision: Record<string, unknown>,
  ordenes: Map<string, Record<string, unknown> | undefined>,
  politica: PoliticaCobroComision,
): boolean {
  if (comision.estaAnulada || comision.estadoLiquidacion === 'anulada' || comision.estadoLiquidacion === 'retenida_por_cobro') return false;
  // Los conduces manuales no tienen orden real; su flujo no se modifica en este alcance.
  if (typeof comision.ordenId === 'string' && comision.ordenId.startsWith('factura-manual-')) return true;
  if (typeof comision.ordenId !== 'string' || !comision.ordenId) return false;
  const orden = ordenes.get(comision.ordenId);
  return !!orden && montoComisionCoincide(comision, orden) && ['cerrado', 'trabajo_realizado'].includes(String(orden.fase)) && cobroCompletoParaComision(orden, politica);
}

/** Fecha demostrable para nómina: un saldo confirmado después del devengo nunca entra a un período anterior.
 * Legacy sin sello exige fecha de verificación de cada abono; no se inventa con fecha de registro.
 */
export function fechaElegibleComision(
  comision: Record<string, unknown>,
  ordenes: Map<string, Record<string, unknown> | undefined>,
  politica: PoliticaCobroComision,
): Date | undefined {
  const devengo = fechaFinanciera(comision.fechaCobro);
  if (!devengo || !comisionConCobroCompleto(comision, ordenes, politica)) return undefined;
  if (String(comision.ordenId).startsWith('factura-manual-')) return devengo;
  const orden = ordenes.get(String(comision.ordenId))!;
  const sello = fechaFinanciera(comision.cobroLiberadoEn);
  const pagos = (orden.pagos as Record<string, unknown>[]).filter(p => p.verificado === true);
  const fechas = pagos.map(p => fechaFinanciera(p.verificadoAt));
  if (!sello && fechas.some(f => !f)) return undefined;
  return new Date(Math.max(devengo.getTime(), sello?.getTime() || 0, ...fechas.flatMap(f => f ? [f.getTime()] : [])));
}
