export type OrdenConCobros = { eliminada?: boolean; pagos?: { verificado?: boolean; monto: number; fecha: Date }[] };

/** Caja por fecha del pago: un cierre o una entrega del técnico no genera otro ingreso. */
export function ingresosConfirmados(ordenes: readonly OrdenConCobros[], desde: Date, hasta: Date): number {
  return ordenes.reduce((total, orden) => {
    if (orden.eliminada) return total;
    return total + (orden.pagos || []).reduce((suma, pago) => {
      if (pago.verificado !== true || !Number.isFinite(pago.monto) || pago.monto <= 0 || !(pago.fecha instanceof Date)) return suma;
      return pago.fecha >= desde && pago.fecha <= hasta ? suma + pago.monto : suma;
    }, 0);
  }, 0);
}
