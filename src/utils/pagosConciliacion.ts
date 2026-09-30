import { fechaFinanciera } from './fechaFinanciera';
/** No convierte datos incompletos en pagos confirmados ni inventa fecha o ID. */
export function incidenciasPago(pago: Record<string, unknown>, pagos: Record<string, unknown>[]): string[] {
  const avisos: string[] = [];
  if (typeof pago.id !== 'string' || !pago.id.trim() || pagos.filter(p => p?.id === pago.id).length !== 1) avisos.push('Identificador ausente o duplicado');
  if (!fechaFinanciera(pago.fecha)) avisos.push('Fecha no verificable');
  if (typeof pago.monto !== 'number' || !Number.isFinite(pago.monto) || pago.monto <= 0) avisos.push('Importe inválido');
  if (!['efectivo', 'transferencia', 'tarjeta', 'link', 'otro'].includes(String(pago.metodo))) avisos.push('Método no verificable');
  return avisos;
}
export function pagosSinConfirmacion(pagos: Record<string, unknown>[]) {
  return pagos.flatMap((pago, indice) => pago && typeof pago === 'object' && pago.verificado !== true ? [{ pago, indice, incidencias: incidenciasPago(pago, pagos) }] : []);
}

export function huellaPago(pago: Record<string, unknown>): string {
  return JSON.stringify(Object.fromEntries(Object.entries(pago).sort(([a], [b]) => a.localeCompare(b))));
}
