/**
 * Helpers compartidos de KPIs (dinero / nómina).
 *
 * SPRINT-REPORTING-1 (2026-05-25): centraliza definiciones que antes
 * vivían duplicadas entre Dashboard, EstadoResultado, MetricasMensuales
 * y Nomina. Si una fórmula cambia (ej: cómo se calcula "Ingresos del
 * mes"), cambia EN UN SOLO LUGAR y todas las vistas siguen alineadas.
 *
 * El cambio funcional clave del sprint: las funciones de ingresos
 * EXCLUYEN explícitamente las facturas en estado `anulada` (antes
 * Dashboard.tsx:363 filtraba `estado === 'pagada'` que ya las excluye
 * indirectamente, pero EstadoResultado.tsx:50 las filtraba con el patrón
 * `if (f.estado === 'anulada') return;`. Si una factura `pagada` se
 * marca como `anulada` mediante el botón de Facturas.tsx:183, antes
 * Dashboard seguía sumándola hasta que `estadoPago` cambiara. Ahora
 * EXCLUYE `anulada` explícitamente — más robusto a edge cases).
 *
 * No hardcodea regla de quincena ni base de comisión (esas son
 * decisiones de Jorge bloqueadas en BLOQUEOS.md hasta su OK).
 */

import type { Factura } from '../types';

/**
 * Ingresos del periodo: suma del `total` de facturas con `estado === 'pagada'`
 * y `fechaPago >= desde` (y < hasta si se especifica). Excluye explícitamente
 * facturas con `estado === 'anulada'` (defense in depth).
 *
 * Si `hasta` no se pasa, no hay límite superior (toda fecha >= desde).
 */
export function ingresosFacturasPagadas(
  facturas: Factura[],
  desde: Date,
  hasta?: Date,
): number {
  return facturas
    .filter(f => f.estado === 'pagada') // por construcción excluye 'anulada' (estados mutuamente excluyentes en EstadoFactura)
    .filter(f => {
      if (!f.fechaPago) return false;
      if (f.fechaPago < desde) return false;
      if (hasta && f.fechaPago > hasta) return false;
      return true;
    })
    .reduce((s, f) => s + (f.total || 0), 0);
}

/**
 * Conduces emitidos del periodo: suma del `total` de facturas con
 * `fechaEmision >= desde`. Cuenta TODAS (emitidas + pagadas) pero
 * EXCLUYE `anulada` — semántica del KPI "Conduces emitidos este mes"
 * de Dashboard.tsx (SPRINT-162 docstring).
 */
export function conducesEmitidosMonto(
  facturas: Factura[],
  desde: Date,
  hasta?: Date,
): number {
  return facturas
    .filter(f => f.estado !== 'anulada')
    .filter(f => {
      if (!f.fechaEmision) return false;
      if (f.fechaEmision < desde) return false;
      if (hasta && f.fechaEmision > hasta) return false;
      return true;
    })
    .reduce((s, f) => s + (f.total || 0), 0);
}

/**
 * Cuenta de conduces emitidos en el periodo (excluye anuladas).
 */
export function conducesEmitidosCount(
  facturas: Factura[],
  desde: Date,
  hasta?: Date,
): number {
  return facturas
    .filter(f => f.estado !== 'anulada')
    .filter(f => {
      if (!f.fechaEmision) return false;
      if (f.fechaEmision < desde) return false;
      if (hasta && f.fechaEmision > hasta) return false;
      return true;
    })
    .length;
}
