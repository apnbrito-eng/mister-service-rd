import { createHash } from 'node:crypto';

export interface FranjaLlegada { inicio: string; fin: string }
export function validarFranja(valor: unknown): FranjaLlegada {
  const f = valor as Partial<FranjaLlegada> | null;
  const hora = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
  if (!f || typeof f.inicio !== 'string' || typeof f.fin !== 'string' || !hora.test(f.inicio) || !hora.test(f.fin) || f.fin <= f.inicio) throw new Error('La franja debe tener inicio y fin válidos, dentro del mismo día.');
  return { inicio: f.inicio, fin: f.fin };
}
export function siguienteDiaLaboralRD(ahora = new Date()): string {
  const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santo_Domingo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(ahora);
  const fecha = new Date(`${hoy}T12:00:00-04:00`);
  fecha.setUTCDate(fecha.getUTCDate() + 1);
  if (fecha.getUTCDay() === 0) fecha.setUTCDate(fecha.getUTCDate() + 1);
  return fecha.toISOString().slice(0, 10);
}
export function versionHorario(ordenId: string, fecha: string, franja: FranjaLlegada, telefono: string): string {
  return createHash('sha256').update(JSON.stringify([ordenId, fecha, validarFranja(franja), telefono])).digest('hex').slice(0, 24);
}
export function payloadRespuesta(ordenId: string, version: string, accion: 'aceptar' | 'reagendar' | 'cancelar'): string {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(ordenId) || !/^[a-f0-9]{24}$/.test(version)) throw new Error('Identidad de cita inválida.');
  return `cita:${ordenId}:${version}:${accion}`;
}
export function leerRespuestaCita(payload: string) {
  const match = /^cita:([A-Za-z0-9_-]{1,128}):([a-f0-9]{24}):(aceptar|reagendar|cancelar)$/.exec(payload);
  return match ? { ordenId: match[1], version: match[2], accion: match[3] as 'aceptar' | 'reagendar' | 'cancelar' } : null;
}
