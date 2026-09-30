/**
 * Puente entre el proyector de cobros compartido (`proyectarCobrosCaja`)
 * y el Dashboard.
 *
 * Los módulos financieros nuevos (Facturas, Gastos, EstadoResultado,
 * ReporteAvanzado, Rendimiento, seguimientoMarketing, CierreDia) leen
 * caja desde `pagos[]` de órdenes por fecha del pago. El Dashboard
 * mostraba ingresos desde `facturas.estado === 'pagada'` (semántica
 * documental), lo que producía cifras distintas para el mismo mes. Este
 * helper unifica la fuente sin ampliar el alcance: sigue siendo el mismo
 * proyector, con rango RD (UTC-4) y sin ingresos futuros.
 *
 * Contrato:
 * - `bancoId=undefined` — incluye efectivo + todos los bancos.
 * - `hasta` = hoy RD siempre (no proyecta futuro).
 * - Anclaje RD independiente del TZ del runner (usa aritmética sobre el
 *   día RD `YYYY-MM-DD`, no `startOfWeek/Month/Year` local).
 * - Devuelve `movimientos` e `incidencias` para que el consumidor
 *   muestre saldo provisional/pendiente sin ocultar evidencia.
 *
 * Gastos:
 * - `resumenGastosDashboard` usa el MISMO `rangoRD` que los cobros
 *   (mismo día RD, sin fugas de TZ) y valida `fecha` con
 *   `fechaFinanciera` (nunca sustituye una fecha ausente por "hoy") y
 *   `monto` numérico finito positivo. Todo gasto que no pase la
 *   validación emite `IncidenciaGasto` en lugar de sumar cero
 *   silencioso.
 */

import {
  proyectarCobrosCaja,
  diaCobroRD,
  type OrdenCobrosCruda,
  type IncidenciaCobro,
  type MovimientoCobro,
} from './movimientosCobros';
import { fechaFinanciera } from './fechaFinanciera';

export type PeriodoCaja = 'hoy' | 'semana' | 'mes' | 'año';

export interface RangoCaja { desde: string; hasta: string }

/** Devuelve `desde`/`hasta` como `YYYY-MM-DD` en día RD. `hasta` es hoy RD. */
export function rangoRD(periodo: PeriodoCaja, ahora: Date): RangoCaja {
  const hasta = diaCobroRD(ahora);
  if (periodo === 'hoy') return { desde: hasta, hasta };
  if (periodo === 'mes') return { desde: `${hasta.slice(0, 7)}-01`, hasta };
  if (periodo === 'año') return { desde: `${hasta.slice(0, 4)}-01-01`, hasta };
  // Semana: lunes RD anclado en `hasta` (aritmética UTC pura sobre el día RD
  // para no depender del TZ del proceso, ej. runner CI en UTC).
  const [y, m, d] = hasta.split('-').map(Number);
  const hoyRDComoUTC = new Date(Date.UTC(y, m - 1, d));
  const dow = hoyRDComoUTC.getUTCDay(); // 0=domingo..6=sábado
  const diffLunes = dow === 0 ? 6 : dow - 1;
  const lunes = new Date(hoyRDComoUTC.getTime() - diffLunes * 86400000);
  return { desde: lunes.toISOString().slice(0, 10), hasta };
}

export interface ResumenCajaDashboard {
  totalConfirmado: number;
  totalPendiente: number;
  pagosConfirmados: number;
  pagosPendientes: number;
  incidencias: IncidenciaCobro[];
  movimientos: MovimientoCobro[];
  desde: string;
  hasta: string;
}

export function resumenCajaDashboard(
  ordenes: OrdenCobrosCruda[],
  periodo: PeriodoCaja,
  ahora: Date,
): ResumenCajaDashboard {
  const { desde, hasta } = rangoRD(periodo, ahora);
  const proy = proyectarCobrosCaja(ordenes, undefined, desde, hasta);
  let confirmados = 0;
  let pendientes = 0;
  for (const mov of proy.movimientos) {
    if (mov.confirmado) confirmados++;
    else pendientes++;
  }
  return {
    totalConfirmado: proy.totalConfirmado,
    totalPendiente: proy.totalPendiente,
    pagosConfirmados: confirmados,
    pagosPendientes: pendientes,
    incidencias: proy.incidencias,
    movimientos: proy.movimientos,
    desde,
    hasta,
  };
}

// ────────────────────────────────────────────────────────────────────
// Gastos: espejo del contrato de cobros para el mismo gráfico
// ────────────────────────────────────────────────────────────────────

/** Doc crudo de `gastos` para el Dashboard (sin `parseOrden`-style
 *  normalización que reemplace fechas ausentes por `new Date()`). */
export interface GastoCrudo { id: string; datos: Record<string, unknown> }

export interface IncidenciaGasto {
  clave: string;
  gastoId: string;
  descripcion: string;
  motivo: string;
}

export interface MovimientoGasto {
  clave: string;
  gastoId: string;
  descripcion: string;
  monto: number;
  fecha: Date;
  categoria: string;
  metodoPago: string;
}

export interface ResumenGastosDashboard {
  total: number;
  gastosCount: number;
  incidencias: IncidenciaGasto[];
  movimientos: MovimientoGasto[];
  desde: string;
  hasta: string;
}

const asString = (v: unknown): string => (typeof v === 'string' ? v : '');

/** Suma gastos del período RD; nunca imputa fecha "hoy" ni monto 0
 *  como si fueran válidos. Todo lo inválido queda en `incidencias`. */
export function resumenGastosDashboard(
  gastos: GastoCrudo[],
  periodo: PeriodoCaja,
  ahora: Date,
): ResumenGastosDashboard {
  const { desde, hasta } = rangoRD(periodo, ahora);
  const movimientos: MovimientoGasto[] = [];
  const incidencias: IncidenciaGasto[] = [];

  for (const g of gastos) {
    const datos = g.datos || {};
    const descripcion = asString(datos.descripcion) || `Gasto ${g.id}`;

    const fecha = fechaFinanciera(datos.fecha);
    // Una fecha válida fuera del período no afecta su cobertura.
    if (fecha) {
      const dia = diaCobroRD(fecha);
      if (dia < desde || dia > hasta) continue;
    }
    const monto = typeof datos.monto === 'number' ? datos.monto : Number.NaN;
    const montoValido = Number.isFinite(monto) && monto > 0;

    const motivos: string[] = [];
    if (!fecha) motivos.push('Fecha ausente o inválida (sin período asignable)');
    if (!montoValido) motivos.push('Monto inválido (no numérico, cero o negativo)');

    if (motivos.length > 0) {
      incidencias.push({
        clave: `${g.id}:incidencia`,
        gastoId: g.id,
        descripcion,
        motivo: motivos.join('. '),
      });
      continue;
    }

    // Rango: `fecha` ya está validada; filtrar por día RD.
    const dia = diaCobroRD(fecha as Date);
    if (dia < desde || dia > hasta) continue;

    movimientos.push({
      clave: `${g.id}:${dia}`,
      gastoId: g.id,
      descripcion,
      monto: monto as number,
      fecha: fecha as Date,
      categoria: asString(datos.categoria),
      metodoPago: asString(datos.metodoPago),
    });
  }

  // Sumar en centavos para evitar drift de coma flotante.
  const total = movimientos.reduce((s, m) => s + Math.round(m.monto * 100), 0) / 100;

  return {
    total,
    gastosCount: movimientos.length,
    incidencias,
    movimientos,
    desde,
    hasta,
  };
}
