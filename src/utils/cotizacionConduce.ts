/** Valida presupuesto en cada frontera; una referencia no representa aprobación. */
export function validarCotizacionParaConduce(cotizacion: Record<string, unknown> | undefined, ordenId: string): void {
  if (!cotizacion) throw new Error('La cotización vinculada ya no existe.');
  if (cotizacion.estado !== 'aceptada') throw new Error('La cotización debe estar aceptada antes de emitir el conduce.');
  if (cotizacion.ordenId !== ordenId) throw new Error('La cotización no corresponde a esta orden.');
  if (cotizacion.convertida === true || cotizacion.facturaId) throw new Error('Esta cotización ya tiene un conduce.');
}

/** Se ejecuta con la lectura transaccional, nunca con el snapshot del formulario. */
export function calcularEmisionActual(orden: Record<string, any>, totalConduce: number, pagoNuevo?: Record<string, any> | null) {
  if (orden.eliminada || orden.fase === 'cancelado' || orden.estadoSimple === 'cancelado' || orden.estado === 'cancelado') throw new Error('La orden está anulada o eliminada. No puede emitirse el conduce.');
  if (orden.facturada === true) throw new Error('CONDUCE_YA_EMITIDO');
  const pagos: Array<Record<string, any>> = Array.isArray(orden.pagos) ? [...orden.pagos] : [];
  if (pagos.some(p => !p || typeof p !== 'object')) throw new Error('Hay registros de pago inválidos. Revisa la orden.');
  if (pagoNuevo && !pagos.some(p => p.id && p.id === pagoNuevo.id)) pagos.push(pagoNuevo);
  if (pagos.some(p => p.verificado !== true)) throw new Error('Hay pagos sin confirmar. Revisa los pagos actuales antes de emitir el conduce.');
  if (pagos.some(p => typeof p.monto !== 'number' || !Number.isFinite(p.monto) || p.monto < 0)) throw new Error('Hay importes de pago inválidos. Revisa la orden.');
  const montoPagado = Math.round(pagos.reduce((sum, p) => sum + Number(p.monto), 0) * 100) / 100;
  if (pagoNuevo && montoPagado > totalConduce) throw new Error('Los pagos actuales superan el total del conduce. Recarga y revisa el pago nuevo.');
  const totalOrden = Number(orden.precioFinal ?? orden.precioAprobado ?? orden.precioSugerido ?? 0);
  return { pagos, montoPagado, estadoPago: totalOrden > 0 && montoPagado >= totalOrden ? 'completo' : montoPagado > 0 ? 'parcial' : 'pendiente', estadoConduce: montoPagado >= totalConduce ? 'pagada' : 'emitida' };
}

export function totalComisionesConduce(comisiones: Array<Record<string, any>>): number {
  return Math.round(comisiones.filter(c => !c.estaAnulada && c.estadoLiquidacion !== 'anulada').reduce((sum, c) => {
    const base = Number(c.comisionMonto || 0); const ajuste = Number(c.descuentoPorGarantia?.monto || 0);
    if (!Number.isFinite(base) || !Number.isFinite(ajuste)) throw new Error('La comisión contiene un importe inválido.');
    return sum + base + ajuste;
  }, 0) * 100) / 100;
}
