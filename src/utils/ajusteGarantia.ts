/** Plan puro: conserva el historial y el total compatible con nómina. */
export function planificarAjusteGarantia(comision: Record<string, any>, evento: Record<string, any>) {
  const existentes = comision.ajustesGarantia;
  if (existentes !== undefined && !Array.isArray(existentes)) throw new Error('El historial de ajustes requiere revisión.');
  const historial: Record<string, any>[] = existentes ? [...existentes] : [];
  const legacy = comision.descuentoPorGarantia;
  if (!existentes && legacy) {
    if (!legacy.ordenIdReasignada || !Number.isFinite(legacy.monto) || legacy.monto > 0) throw new Error('El ajuste anterior requiere revisión administrativa.');
    historial.push(legacy);
  }
  if (!evento.ordenIdReasignada || !Number.isFinite(evento.monto) || evento.monto >= 0) throw new Error('El ajuste no tiene un importe válido.');
  if (historial.some(e => !e || !e.ordenIdReasignada || !Number.isFinite(e.monto) || e.monto > 0)) throw new Error('El historial de ajustes requiere revisión.');
  if (new Set(historial.map(e => e.ordenIdReasignada)).size !== historial.length) throw new Error('El historial contiene garantías duplicadas.');
  const previo = historial.find(e => e.ordenIdReasignada === evento.ordenIdReasignada);
  if (previo) {
    if (previo.monto !== evento.monto) throw new Error('Las piezas cambiaron después del ajuste. Administración debe revisar la diferencia.');
    return null; // reintento: no duplica ni modifica la liquidación
  }
  if (comision.estadoLiquidacion !== 'pendiente' || comision.estaAnulada === true) throw new Error('La comisión ya está liquidada o anulada; requiere revisión administrativa.');
  if (historial.length >= 100) throw new Error('El historial requiere revisión antes de añadir otro ajuste.');
  const anteriorTotal = historial.reduce((sum,e) => sum + e.monto, 0);
  if (existentes && Math.abs(anteriorTotal - (legacy?.monto ?? 0)) > 0.005) throw new Error('El total de ajustes no coincide con el historial.');
  historial.push(evento);
  return {
    ajustesGarantia: historial,
    descuentoPorGarantia: { ...evento, monto: Math.round((anteriorTotal + evento.monto) * 100) / 100,
      motivo: historial.length > 1 ? `Garantías — ${historial.length} ajustes acumulados` : evento.motivo },
  };
}
