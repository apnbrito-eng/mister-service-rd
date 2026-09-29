import { fechaFinanciera } from './fechaFinanciera';

export interface OrdenCobrosCruda { id: string; datos: Record<string, unknown> }
export interface MovimientoCobro {
  clave: string; ordenId: string; ordenNumero: string; cliente: string;
  pagoId: string; monto: number; fecha: Date; confirmado: boolean; referencia: string;
  ordenEliminada: boolean;
}
export interface IncidenciaCobro { clave: string; ordenId: string; ordenNumero: string; motivo: string }
const texto = (v: unknown) => typeof v === 'string' ? v : '';
const registro = (v: unknown): Record<string, unknown> => v && typeof v === 'object' ? v as Record<string, unknown> : {};
export const diaCobroRD = (fecha: Date) => new Date(fecha.getTime() - 4 * 3600000).toISOString().slice(0, 10);

/** Proyección de pagos[]; no lee ni suma el espejo de pagos en subcolecciones. */
export function proyectarCobrosBanco(ordenes: OrdenCobrosCruda[], bancoId: string, desde = '', hasta = '') {
  const movimientos: MovimientoCobro[] = [];
  const incidencias: IncidenciaCobro[] = [];
  const rangoInvalido = !!desde && !!hasta && desde > hasta;
  if (!bancoId || rangoInvalido) return { movimientos, incidencias, totalConfirmado: 0, totalPendiente: 0, rangoInvalido };
  for (const orden of ordenes) {
    const pagos = Array.isArray(orden.datos.pagos) ? orden.datos.pagos.map(registro) : [];
    const frecuencias = new Map<string, number>();
    for (const p of pagos) { const id = texto(p.id).trim(); if (id) frecuencias.set(id, (frecuencias.get(id) || 0) + 1); }
    pagos.forEach((p, indice) => {
      if (p.bancoId !== bancoId || p.metodo === 'efectivo') return;
      const fecha = fechaFinanciera(p.fecha);
      if (fecha) { const dia = diaCobroRD(fecha); if ((desde && dia < desde) || (hasta && dia > hasta)) return; }
      const id = texto(p.id).trim();
      const numero = texto(orden.datos.numero) || orden.id;
      const montoValido = typeof p.monto === 'number' && Number.isFinite(p.monto) && p.monto > 0;
      const metodoValido = p.metodo === 'transferencia' || p.metodo === 'tarjeta' || p.metodo === 'link' || p.metodo === 'otro';
      const motivos: string[] = [];
      if (orden.datos.eliminada === true) motivos.push('Orden eliminada con pago: requiere conciliación');
      if (!id) motivos.push('Pago sin identificador');
      if (id && (frecuencias.get(id) || 0) > 1) motivos.push('Identificador repetido en la orden; revisar todas sus copias');
      if (!fecha) motivos.push('Fecha de pago ausente o inválida (sin período asignable)');
      if (!montoValido) motivos.push('Monto inválido');
      if (!metodoValido) motivos.push('Método de pago inválido');
      if (p.verificado !== true && p.verificado !== false) motivos.push('Verificación desconocida');
      if (motivos.length) { incidencias.push({ clave: `${orden.id}:incidencia:${indice}`, ordenId: orden.id, ordenNumero: numero, motivo: motivos.join('. ') }); return; }
      movimientos.push({ clave: `${orden.id}:${id}`, ordenId: orden.id, ordenNumero: numero,
        cliente: texto(orden.datos.clienteNombre), pagoId: id, monto: p.monto as number,
        fecha: fecha!, confirmado: p.verificado === true, referencia: texto(p.referencia), ordenEliminada: orden.datos.eliminada === true });
    });
  }
  movimientos.sort((a, b) => b.fecha.getTime() - a.fecha.getTime() || a.clave.localeCompare(b.clave));
  const suma = (confirmado: boolean) => movimientos.filter(m => m.confirmado === confirmado).reduce((s, m) => s + Math.round(m.monto * 100), 0) / 100;
  const totalConfirmado = suma(true);
  return { movimientos, incidencias, totalConfirmado, totalPendiente: suma(false), rangoInvalido };
}
