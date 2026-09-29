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
