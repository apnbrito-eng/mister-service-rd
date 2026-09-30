/** Fecha de negocio en RD, independiente de la zona del dispositivo. */
export function fechaCalendarioRD(fecha: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santo_Domingo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(fecha);
}
export function fechaProgramadaRD(valor: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(valor)) return null;
  const fecha = new Date(`${valor}T12:00:00-04:00`);
  return Number.isFinite(fecha.getTime()) && fechaCalendarioRD(fecha) === valor ? fecha : null;
}
export function estadoFechaMantenimiento(fecha: Date, ahora = new Date()): 'hoy' | 'vencido' | 'proximo' {
  const a = fechaCalendarioRD(fecha), b = fechaCalendarioRD(ahora);
  return a < b ? 'vencido' : a === b ? 'hoy' : 'proximo';
}

/** Avanza meses civiles RD y limita al último día del mes; no usa la zona del navegador. */
export function sumarMesesMantenimientoRD(fecha: Date, meses: number): Date {
  if (!Number.isFinite(fecha.getTime()) || !Number.isInteger(meses) || meses <= 0) throw new Error('Fecha o frecuencia de mantenimiento inválida');
  const [anio, mes, dia] = fechaCalendarioRD(fecha).split('-').map(Number);
  const destino = new Date(Date.UTC(anio, mes - 1 + meses, 1));
  const ultimo = new Date(Date.UTC(destino.getUTCFullYear(), destino.getUTCMonth() + 1, 0)).getUTCDate();
  return fechaProgramadaRD(`${destino.getUTCFullYear()}-${String(destino.getUTCMonth() + 1).padStart(2, '0')}-${String(Math.min(dia, ultimo)).padStart(2, '0')}`)!;
}
