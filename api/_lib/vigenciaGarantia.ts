/** Una sola interpretación de vigencia para consulta y reclamo público. */
export function fechaGarantia(value: unknown): Date | null {
  try {
    let date: unknown = value;
    if (typeof value === 'string') date = new Date(value);
    else if (value && typeof value === 'object' && 'toDate' in value && typeof value.toDate === 'function') date = value.toDate();
    return date instanceof Date && Number.isFinite(date.getTime()) ? date : null;
  } catch { return null; }
}

export function resolverVigenciaGarantia(factura: Record<string, any>, orden: Record<string, any> | null, ahora = new Date()) {
  const garantia = factura.garantia || {};
  const inicioFecha = fechaGarantia(orden?.cierreServicio?.fechaCierre) || fechaGarantia(garantia.inicioFecha);
  // Un vencimiento explícito inválido no debe reactivar una garantía heredada.
  const finFecha = fechaGarantia(orden?.garantiaVencimiento ?? garantia.finFecha);
  const tiempoDias = typeof orden?.periodoGarantiaDias === 'number' ? orden.periodoGarantiaDias : garantia.tiempoDias;
  let estado = typeof garantia.estado === 'string' ? garantia.estado : 'vigente';
  if (estado === 'vigente') {
    if (!finFecha || (inicioFecha && inicioFecha > finFecha) || tiempoDias === 0) estado = 'por_confirmar';
    else if (ahora > finFecha) estado = 'expirada';
    else if (inicioFecha && ahora < inicioFecha) estado = 'por_confirmar';
  }
  return {
    inicioFecha, finFecha, estado,
    tiempoDias: typeof tiempoDias === 'number' && Number.isFinite(tiempoDias) ? Math.max(0, tiempoDias) : 0,
    diasRestantes: finFecha ? Math.max(0, Math.ceil((finFecha.getTime() - ahora.getTime()) / 86400000)) : 0,
    reclamadaEn: fechaGarantia(garantia.reclamadaEn),
  };
}
