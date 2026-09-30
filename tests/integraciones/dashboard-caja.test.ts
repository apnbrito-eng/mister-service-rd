import { describe, expect, it } from 'vitest';
import {
  resumenCajaDashboard,
  resumenGastosDashboard,
  rangoRD,
  type PeriodoCaja,
} from '../../src/utils/cajaDashboard';

const pago = (extra: Record<string, unknown> = {}) => ({
  id: 'p1',
  metodo: 'efectivo',
  monto: 100,
  fecha: '2026-09-30T12:00:00Z',
  verificado: true,
  ...extra,
});

const orden = (id: string, pagos: unknown[], extra: Record<string, unknown> = {}) => ({
  id,
  datos: { numero: `OS-${id}`, clienteNombre: 'C', pagos, ...extra },
});

// Anchor: miércoles 30 sep 2026 (RD), 18:00 hora RD → 22:00 UTC.
// Sep 1 2026 es martes, así que la semana de anclaje empieza el lunes 28 sep.
const ahora = new Date('2026-09-30T22:00:00Z');

describe('rangoRD', () => {
  it('hoy = mismo día RD como desde y hasta', () => {
    expect(rangoRD('hoy', ahora)).toEqual({ desde: '2026-09-30', hasta: '2026-09-30' });
  });

  it('mes = día 01 del mes RD hasta hoy RD', () => {
    expect(rangoRD('mes', ahora)).toEqual({ desde: '2026-09-01', hasta: '2026-09-30' });
  });

  it('año = 01-01 hasta hoy RD', () => {
    expect(rangoRD('año', ahora)).toEqual({ desde: '2026-01-01', hasta: '2026-09-30' });
  });

  it('semana = lunes RD anclado en hoy (miércoles 30 sep → lunes 28 sep)', () => {
    expect(rangoRD('semana', ahora)).toEqual({ desde: '2026-09-28', hasta: '2026-09-30' });
  });

  it('semana en domingo retrocede 6 días al lunes anterior', () => {
    // Dom 4 oct 2026 (mismo cálculo: sep 28 lunes + 6 = dom 4).
    const domingo = new Date('2026-10-04T22:00:00Z');
    expect(rangoRD('semana', domingo)).toEqual({ desde: '2026-09-28', hasta: '2026-10-04' });
  });
});

describe('resumenCajaDashboard — semántica de caja compartida con proyectarCobrosCaja', () => {
  it('abonos de la misma orden en fechas distintas se imputan a la fecha real del pago', () => {
    // 3000 en sept + 7000 en octubre → el resumen del mes de sept solo ve 3000.
    const ordenes = [orden('a', [
      pago({ id: 'ab1', monto: 3000, fecha: '2026-09-15T12:00:00-04:00' }),
      pago({ id: 'ab2', monto: 7000, fecha: '2026-10-05T12:00:00-04:00' }),
    ])];
    const mes = resumenCajaDashboard(ordenes, 'mes', ahora);
    expect(mes.totalConfirmado).toBe(3000);
    expect(mes.pagosConfirmados).toBe(1);
    expect(mes.pagosPendientes).toBe(0);
  });

  it('conduce marcado pagada sin pagos[] verificados NO genera ingreso de caja', () => {
    // El estado documental del conduce (`pagada`) y `montoPagado` denormalizado
    // no cuentan como caja — sólo cuenta la subestructura `pagos[]`.
    const ordenes = [orden('a', [], { estado: 'pagada', total: 5000, montoPagado: 5000 })];
    const r = resumenCajaDashboard(ordenes, 'mes', ahora);
    expect(r.totalConfirmado).toBe(0);
    expect(r.pagosConfirmados).toBe(0);
    expect(r.incidencias).toHaveLength(0);
  });

  it('pago no verificado va a pendiente, no a confirmado', () => {
    const ordenes = [orden('a', [pago({ verificado: false })])];
    const r = resumenCajaDashboard(ordenes, 'mes', ahora);
    expect(r.totalConfirmado).toBe(0);
    expect(r.totalPendiente).toBe(100);
    expect(r.pagosPendientes).toBe(1);
    expect(r.pagosConfirmados).toBe(0);
  });

  it('IDs duplicados dentro de la misma orden se declaran incidencia y no suman', () => {
    const ordenes = [orden('a', [pago(), pago({ monto: 200 })])];
    const r = resumenCajaDashboard(ordenes, 'mes', ahora);
    expect(r.totalConfirmado).toBe(0);
    expect(r.pagosConfirmados).toBe(0);
    expect(r.incidencias).toHaveLength(2);
    expect(r.incidencias.every(i => /repetido/i.test(i.motivo))).toBe(true);
  });

  it.each([null, undefined, '', '2026-13-40', 'sin-fecha'])(
    'pago sin fecha válida (%s) se declara incidencia',
    fecha => {
      const ordenes = [orden('a', [pago({ fecha })])];
      const r = resumenCajaDashboard(ordenes, 'mes', ahora);
      expect(r.totalConfirmado).toBe(0);
      expect(r.pagosConfirmados).toBe(0);
      expect(r.incidencias).toHaveLength(1);
      expect(r.incidencias[0].motivo).toMatch(/Fecha/);
    },
  );

  it('límite RD medianoche: 03:59:59Z pertenece al día RD anterior, 04:00:00Z al día RD siguiente', () => {
    const ordenes = [orden('a', [
      pago({ id: 'p1', fecha: '2026-09-30T03:59:59Z' }),
      pago({ id: 'p2', fecha: '2026-09-30T04:00:00Z' }),
    ])];
    const r = resumenCajaDashboard(ordenes, 'hoy', ahora);
    expect(r.movimientos.map(m => m.pagoId)).toEqual(['p2']);
    expect(r.totalConfirmado).toBe(100);
  });

  it('rango hoy aísla el día RD y excluye días previos y futuros', () => {
    const ordenes = [orden('a', [
      pago({ id: 'ayer', fecha: '2026-09-29T18:00:00-04:00' }),
      pago({ id: 'hoy', fecha: '2026-09-30T10:00:00-04:00' }),
      pago({ id: 'manana', fecha: '2026-10-01T10:00:00-04:00' }),
    ])];
    const r = resumenCajaDashboard(ordenes, 'hoy', ahora);
    expect(r.movimientos.map(m => m.pagoId)).toEqual(['hoy']);
  });

  it('no proyecta ingresos futuros aunque el pago esté verificado', () => {
    const ordenes = [orden('a', [pago({ fecha: '2027-01-05T12:00:00-04:00' })])];
    const r = resumenCajaDashboard(ordenes, 'año', ahora);
    expect(r.totalConfirmado).toBe(0);
    expect(r.pagosConfirmados).toBe(0);
  });

  it('montoPagado / total denormalizados del doc no se suman al total de caja', () => {
    const ordenes = [orden('a', [pago()], { montoPagado: 999999, total: 999999, estado: 'pagada' })];
    const r = resumenCajaDashboard(ordenes, 'mes', ahora);
    expect(r.totalConfirmado).toBe(100);
  });

  it('orden eliminada con pago mantiene incidencia y no suma al confirmado', () => {
    const ordenes = [orden('a', [pago()], { eliminada: true })];
    const r = resumenCajaDashboard(ordenes, 'mes', ahora);
    expect(r.totalConfirmado).toBe(0);
    expect(r.incidencias).toHaveLength(1);
    expect(r.incidencias[0].motivo).toMatch(/eliminada/i);
  });

  it('mezcla efectivo + transferencia + link + tarjeta suma todos los métodos válidos', () => {
    const ordenes = [orden('a', [
      pago({ id: 'ef', metodo: 'efectivo', monto: 10 }),
      pago({ id: 'tr', metodo: 'transferencia', bancoId: 'b1', monto: 20 }),
      pago({ id: 'tj', metodo: 'tarjeta', bancoId: 'b1', monto: 30 }),
      pago({ id: 'lk', metodo: 'link', bancoId: 'b1', monto: 40 }),
    ])];
    const r = resumenCajaDashboard(ordenes, 'mes', ahora);
    expect(r.totalConfirmado).toBe(100);
    expect(r.pagosConfirmados).toBe(4);
  });

  it.each<PeriodoCaja>(['hoy', 'semana', 'mes', 'año'])(
    'todos los períodos devuelven desde/hasta consistentes con rangoRD (%s)',
    periodo => {
      const r = resumenCajaDashboard([], periodo, ahora);
      const esperado = rangoRD(periodo, ahora);
      expect({ desde: r.desde, hasta: r.hasta }).toEqual(esperado);
      // hasta nunca excede hoy RD → no se proyecta futuro.
      expect(r.hasta <= '2026-09-30').toBe(true);
    },
  );

  it('el proyector NO lee subcolección espejo — un pagos[] con un item vs suma denormalizada', () => {
    // Aunque la orden tenga un espejo hipotético en montoPagado/total, la caja
    // sólo suma pagos[] (una copia). Duplicidad = 100, no 200.
    const ordenes = [orden('a', [pago()], { montoPagado: 100, total: 100, estado: 'pagada' })];
    const r = resumenCajaDashboard(ordenes, 'mes', ahora);
    expect(r.totalConfirmado).toBe(100);
    expect(r.pagosConfirmados).toBe(1);
  });
});

// ────────────────────────────────────────────────────────────────────
// Gastos — contrato paralelo al de cobros: mismo `rangoRD`, misma
// política "nunca inventes fecha, nunca inventes monto". Los tests
// verifican el CONTRATO (qué entra al total, qué queda como incidencia),
// no la implementación del helper.
// ────────────────────────────────────────────────────────────────────

const gasto = (id: string, datos: Record<string, unknown>) => ({ id, datos });

describe('resumenGastosDashboard — contrato paralelo al de cobros', () => {
  it('suma únicamente gastos válidos del período RD; nada de fechas o montos inventados', () => {
    const gastos = [
      gasto('g1', { fecha: '2026-09-10T12:00:00-04:00', monto: 500, descripcion: 'Repuestos' }),
      gasto('g2', { fecha: '2026-09-25T12:00:00-04:00', monto: 200, descripcion: 'Combustible' }),
    ];
    const r = resumenGastosDashboard(gastos, 'mes', ahora);
    expect(r.total).toBe(700);
    expect(r.gastosCount).toBe(2);
    expect(r.incidencias).toHaveLength(0);
  });

  it.each([null, undefined, '', '2026-13-40', 'sin-fecha'])(
    'fecha inválida (%s) queda como incidencia, no imputa "hoy" ni suma cero silencioso',
    fecha => {
      const gastos = [gasto('g1', { fecha, monto: 500, descripcion: 'X' })];
      const r = resumenGastosDashboard(gastos, 'mes', ahora);
      expect(r.total).toBe(0);
      expect(r.gastosCount).toBe(0);
      expect(r.incidencias).toHaveLength(1);
      expect(r.incidencias[0].motivo).toMatch(/Fecha/);
      expect(r.incidencias[0].gastoId).toBe('g1');
    },
  );

  it.each([null, undefined, 'cero', 0, -1, NaN, Infinity])(
    'monto inválido (%s) queda como incidencia con motivo de monto',
    monto => {
      const gastos = [gasto('g1', { fecha: '2026-09-10T12:00:00-04:00', monto, descripcion: 'X' })];
      const r = resumenGastosDashboard(gastos, 'mes', ahora);
      expect(r.total).toBe(0);
      expect(r.gastosCount).toBe(0);
      expect(r.incidencias).toHaveLength(1);
      expect(r.incidencias[0].motivo).toMatch(/Monto/);
    },
  );

  it('gasto fuera del período RD no suma y tampoco emite incidencia (fecha válida, pero fuera de ventana)', () => {
    const gastos = [
      gasto('viejo', { fecha: '2026-08-10T12:00:00-04:00', monto: 500, descripcion: 'X' }),
      gasto('futuro', { fecha: '2026-10-05T12:00:00-04:00', monto: 500, descripcion: 'X' }),
    ];
    const r = resumenGastosDashboard(gastos, 'mes', ahora);
    expect(r.total).toBe(0);
    expect(r.gastosCount).toBe(0);
    expect(r.incidencias).toHaveLength(0);
  });

  it('límite RD medianoche: 03:59:59Z (día RD anterior) queda fuera de "hoy"; 04:00:00Z entra', () => {
    const gastos = [
      gasto('borde-antes', { fecha: '2026-09-30T03:59:59Z', monto: 10, descripcion: 'X' }),
      gasto('borde-despues', { fecha: '2026-09-30T04:00:00Z', monto: 20, descripcion: 'X' }),
    ];
    const r = resumenGastosDashboard(gastos, 'hoy', ahora);
    expect(r.total).toBe(20);
    expect(r.movimientos.map(m => m.gastoId)).toEqual(['borde-despues']);
  });

  it('mezcla válido + inválido en el mismo lote: total sólo suma válidos y expone TODAS las incidencias', () => {
    const gastos = [
      gasto('ok1', { fecha: '2026-09-10T12:00:00-04:00', monto: 100, descripcion: 'OK-1' }),
      gasto('sin-fecha', { fecha: null, monto: 999, descripcion: 'ROTA-fecha' }),
      gasto('sin-monto', { fecha: '2026-09-10T12:00:00-04:00', monto: 'x', descripcion: 'ROTA-monto' }),
      gasto('ok2', { fecha: '2026-09-11T12:00:00-04:00', monto: 50, descripcion: 'OK-2' }),
    ];
    const r = resumenGastosDashboard(gastos, 'mes', ahora);
    expect(r.total).toBe(150);
    expect(r.gastosCount).toBe(2);
    expect(r.incidencias).toHaveLength(2);
    const ids = r.incidencias.map(i => i.gastoId).sort();
    expect(ids).toEqual(['sin-fecha', 'sin-monto']);
  });

  it('suma en centavos: 0.1 + 0.2 devuelve exactamente 0.3 (no 0.30000000000000004)', () => {
    const gastos = [
      gasto('a', { fecha: '2026-09-10T12:00:00-04:00', monto: 0.1, descripcion: 'a' }),
      gasto('b', { fecha: '2026-09-11T12:00:00-04:00', monto: 0.2, descripcion: 'b' }),
    ];
    const r = resumenGastosDashboard(gastos, 'mes', ahora);
    expect(r.total).toBe(0.3);
  });

  it('lote vacío → total 0 con desde/hasta consistentes con rangoRD y sin incidencias', () => {
    const r = resumenGastosDashboard([], 'mes', ahora);
    expect(r.total).toBe(0);
    expect(r.gastosCount).toBe(0);
    expect(r.incidencias).toHaveLength(0);
    const esperado = rangoRD('mes', ahora);
    expect({ desde: r.desde, hasta: r.hasta }).toEqual(esperado);
  });

  it.each<PeriodoCaja>(['hoy', 'semana', 'mes', 'año'])(
    'usa el MISMO rangoRD que resumenCajaDashboard para el período %s',
    periodo => {
      const gr = resumenGastosDashboard([], periodo, ahora);
      const cr = resumenCajaDashboard([], periodo, ahora);
      // Contrato compartido: si desde/hasta divergieran entre caja y
      // gastos, el balance del Dashboard sumaría manzanas y peras.
      expect({ desde: gr.desde, hasta: gr.hasta })
        .toEqual({ desde: cr.desde, hasta: cr.hasta });
    },
  );

  it('gasto sin descripción se identifica por id (motivo legible siempre disponible)', () => {
    const gastos = [gasto('g1', { fecha: null, monto: 100 })];
    const r = resumenGastosDashboard(gastos, 'mes', ahora);
    expect(r.incidencias).toHaveLength(1);
    // Contrato: la incidencia debe permitir localizar el gasto en la UI
    // aún si el usuario nunca escribió descripción.
    expect(r.incidencias[0].gastoId).toBe('g1');
    expect(r.incidencias[0].motivo.length).toBeGreaterThan(0);
  });
});


describe('cobertura de gastos del período', () => {
  it('un monto inválido con fecha de otro mes no invalida este mes', () => {
    const r = resumenGastosDashboard([{id: 'anterior', datos: {fecha: '2026-08-10T12:00:00-04:00', monto: null}}], 'mes', ahora);
    expect(r.incidencias).toHaveLength(0);
    expect(r.total).toBe(0);
  });
});
