import { fechaFinanciera } from './fechaFinanciera';

export interface PreparacionNomina { corteComisiones?: Date; fechaPagoProgramada?: string }

/** Fecha civil RD; el pago programado no equivale a pago realizado. */
export function fechaPagoNomina(quincena: string): string {
  if (!/^\d{4}-(0[1-9]|1[0-2])-Q[12]$/.test(quincena)) throw new Error('Quincena inválida');
  const [y,m,q] = quincena.split('-');
  const dia = q === 'Q1' ? 15 : Math.min(30, new Date(Date.UTC(Number(y),Number(m),0)).getUTCDate());
  return `${y}-${m}-${String(dia).padStart(2,'0')}`;
}

export function validarPreparacionNomina(quincena: string, inicio: Date, fin: Date, opciones: PreparacionNomina = {}) {
  const corte = opciones.corteComisiones ?? fin;
  const pago = opciones.fechaPagoProgramada ?? fechaPagoNomina(quincena);
  if (!(corte instanceof Date) || !Number.isFinite(corte.getTime()) || corte < inicio || corte > fin) throw new Error('El corte debe estar dentro del período de la nómina');
  const fecha = new Date(`${pago}T12:00:00-04:00`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(pago) || !Number.isFinite(fecha.getTime()) || fecha.toISOString().slice(0,10) !== pago || !pago.startsWith(quincena.slice(0,7))) throw new Error('Fecha de pago inválida para esta nómina');
  if (corte > new Date(`${pago}T23:59:59.999-04:00`)) throw new Error('El pago no puede programarse antes del corte');
  return { corteComisiones: corte, fechaPagoProgramada: pago };
}

/** Los borradores anteriores mantienen su límite original. Un dato inválido bloquea el cierre. */
export function corteGuardadoNomina(raw: Record<string, unknown>, inicio: Date, fin: Date): Date {
  if (raw.corteComisiones == null) return fin;
  const corte = fechaFinanciera(raw.corteComisiones);
  if (!corte || corte < inicio || corte > fin) throw new Error('Corte de comisiones inválido; revisar la nómina');
  return corte;
}
