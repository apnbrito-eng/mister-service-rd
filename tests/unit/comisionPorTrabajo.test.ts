import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  crearSnapshotTrabajo,
  finalizarTrabajo,
  idDevengoDeterminista,
  calcularBaseComision,
  calcularMontoComision,
  calcularLiquidacionOrden,
  type PagoVerificadoTrabajo,
} from '../../src/utils/comisionPorTrabajo.ts';

const entradaBase = {
  ordenId: 'OS2026001',
  trabajoId: 'T1',
  tecnicoUid: 'uidTec1',
  porcentajeComisionFicha: 10,
  importeCobrado: 5000,
  costoMateriales: 500,
  creadoEn: 1_700_000_000_000,
};

test('snapshot congela porcentaje de ficha y no se altera por cambios posteriores', () => {
  const original = crearSnapshotTrabajo({ ...entradaBase });
  assert.equal(original.porcentajeComision, 10);
  assert.equal(Object.isFrozen(original), true);
  // Simular cambio de ficha: la ficha ahora paga 20 %. Un snapshot nuevo del
  // mismo trabajo queda prohibido por ordenId+trabajoId repetidos (el adaptador
  // transaccional no permitiría duplicar); aquí probamos que la vieja referencia
  // es realmente inmutable ante cualquier intento de mutación directa.
  assert.throws(() => {
    (original as unknown as { porcentajeComision: number }).porcentajeComision = 20;
  }, /./);
  assert.equal(original.porcentajeComision, 10);
  // Y que un snapshot nuevo (de otro trabajo) con porcentaje distinto no toca
  // al anterior.
  const otro = crearSnapshotTrabajo({ ...entradaBase, trabajoId: 'T2', porcentajeComisionFicha: 20 });
  assert.equal(otro.porcentajeComision, 20);
  assert.equal(original.porcentajeComision, 10);
  // Mutar la entrada tampoco afecta al snapshot (snapshot es copia).
  const entradaMut = { ...entradaBase };
  const snap = crearSnapshotTrabajo(entradaMut);
  entradaMut.porcentajeComisionFicha = 99;
  entradaMut.importeCobrado = 1;
  assert.equal(snap.porcentajeComision, 10);
  assert.equal(snap.importeCobrado, 5000);
});

test('finalizarTrabajo produce nuevo snapshot inmutable; original intacto; idempotente', () => {
  const snap = crearSnapshotTrabajo(entradaBase);
  assert.equal(snap.finalizado, false);
  const terminado = finalizarTrabajo(snap);
  assert.equal(terminado.finalizado, true);
  assert.equal(snap.finalizado, false);
  assert.equal(Object.isFrozen(terminado), true);
  // Idempotente: aplicar sobre uno ya terminado devuelve el mismo objeto.
  assert.equal(finalizarTrabajo(terminado), terminado);
});

test('varios técnicos por orden: cada trabajo lleva su propio devengo con tecnicoUid propio', () => {
  const trabajoA = finalizarTrabajo(crearSnapshotTrabajo({
    ordenId: 'OS1', trabajoId: 'A', tecnicoUid: 'tecA',
    porcentajeComisionFicha: 10, importeCobrado: 5000, costoMateriales: 500, creadoEn: 1,
  }));
  const trabajoB = finalizarTrabajo(crearSnapshotTrabajo({
    ordenId: 'OS1', trabajoId: 'B', tecnicoUid: 'tecB',
    porcentajeComisionFicha: 8, importeCobrado: 3000, costoMateriales: 0, creadoEn: 2,
  }));
  const resultado = calcularLiquidacionOrden({
    ordenId: 'OS1', totalOrden: 8000,
    trabajos: [trabajoA, trabajoB],
    pagos: [{ id: 'p1', monto: 8000, verificado: true }],
  });
  assert.equal(resultado.estado, 'liquidable');
  assert.equal(resultado.devengos.length, 2);
  const porId = new Map(resultado.devengos.map(d => [d.trabajoId, d]));
  assert.equal(porId.get('A')!.tecnicoUid, 'tecA');
  assert.equal(porId.get('A')!.montoComision, 450); // (5000-500) * 10% = 450
  assert.equal(porId.get('B')!.tecnicoUid, 'tecB');
  assert.equal(porId.get('B')!.montoComision, 240); // 3000 * 8% = 240
});

test('cierre parcial de servicios bloquea devengos: pendiente y cero', () => {
  const trabajoA = finalizarTrabajo(crearSnapshotTrabajo({
    ordenId: 'OS2', trabajoId: 'A', tecnicoUid: 'tecA',
    porcentajeComisionFicha: 10, importeCobrado: 5000, costoMateriales: 0, creadoEn: 1,
  }));
  const trabajoB = crearSnapshotTrabajo({
    ordenId: 'OS2', trabajoId: 'B', tecnicoUid: 'tecB',
    porcentajeComisionFicha: 10, importeCobrado: 3000, costoMateriales: 0, creadoEn: 2,
  });
  const resultado = calcularLiquidacionOrden({
    ordenId: 'OS2', totalOrden: 8000,
    trabajos: [trabajoA, trabajoB],
    pagos: [{ id: 'p1', monto: 8000, verificado: true }],
  });
  assert.equal(resultado.estado, 'pendiente');
  if (resultado.estado === 'pendiente') assert.equal(resultado.motivo, 'trabajos_sin_finalizar');
  assert.equal(resultado.devengos.length, 0);
});

test('cobro parcial bloquea devengos: pendiente y cero', () => {
  const trabajoA = finalizarTrabajo(crearSnapshotTrabajo({
    ordenId: 'OS3', trabajoId: 'A', tecnicoUid: 'tecA',
    porcentajeComisionFicha: 10, importeCobrado: 5000, costoMateriales: 0, creadoEn: 1,
  }));
  const trabajoB = finalizarTrabajo(crearSnapshotTrabajo({
    ordenId: 'OS3', trabajoId: 'B', tecnicoUid: 'tecB',
    porcentajeComisionFicha: 10, importeCobrado: 3000, costoMateriales: 0, creadoEn: 2,
  }));
  const resultado = calcularLiquidacionOrden({
    ordenId: 'OS3', totalOrden: 8000,
    trabajos: [trabajoA, trabajoB],
    pagos: [
      { id: 'p1', monto: 4000, verificado: true }, // verificado
      { id: 'p2', monto: 4000, verificado: false }, // NO verificado → no cuenta
    ],
  });
  assert.equal(resultado.estado, 'pendiente');
  if (resultado.estado === 'pendiente') assert.equal(resultado.motivo, 'cobro_total_incompleto');
  assert.equal(resultado.devengos.length, 0);
  assert.equal(resultado.totalCobradoVerificado, 4000);
  assert.equal(resultado.totalImporte, 8000);
});

test('cálculo individual: base = importe - costo; monto = base * porcentaje', () => {
  const snap = crearSnapshotTrabajo({
    ordenId: 'OS4', trabajoId: 'T', tecnicoUid: 'tec',
    porcentajeComisionFicha: 12, importeCobrado: 10000, costoMateriales: 2500, creadoEn: 1,
  });
  assert.equal(calcularBaseComision(snap), 7500);
  assert.equal(calcularMontoComision(snap), 900); // 7500 * 12% = 900
});

test('piso cero: si materiales superan importe, base y comisión son 0', () => {
  const snap = crearSnapshotTrabajo({
    ordenId: 'OS5', trabajoId: 'T', tecnicoUid: 'tec',
    porcentajeComisionFicha: 15, importeCobrado: 100, costoMateriales: 500, creadoEn: 1,
  });
  assert.equal(calcularBaseComision(snap), 0);
  assert.equal(calcularMontoComision(snap), 0);
});

test('IDs de trabajo repetidos dentro de una orden son rechazados', () => {
  const t1 = finalizarTrabajo(crearSnapshotTrabajo({
    ordenId: 'OS6', trabajoId: 'DUP', tecnicoUid: 'tecA',
    porcentajeComisionFicha: 10, importeCobrado: 1000, costoMateriales: 0, creadoEn: 1,
  }));
  const t2 = finalizarTrabajo(crearSnapshotTrabajo({
    ordenId: 'OS6', trabajoId: 'DUP', tecnicoUid: 'tecB',
    porcentajeComisionFicha: 10, importeCobrado: 2000, costoMateriales: 0, creadoEn: 2,
  }));
  assert.throws(() => calcularLiquidacionOrden({
    ordenId: 'OS6', totalOrden: 3000, trabajos: [t1, t2], pagos: [{ id: 'p1', monto: 3000, verificado: true }],
  }), /trabajoId repetido/);
});

test('trabajos que apuntan a otra orden son rechazados como conflicto', () => {
  const t1 = finalizarTrabajo(crearSnapshotTrabajo({
    ordenId: 'OS7', trabajoId: 'A', tecnicoUid: 'tec',
    porcentajeComisionFicha: 10, importeCobrado: 1000, costoMateriales: 0, creadoEn: 1,
  }));
  assert.throws(() => calcularLiquidacionOrden({
    ordenId: 'OSOTRA', totalOrden: 1000, trabajos: [t1], pagos: [{ id: 'p1', monto: 1000, verificado: true }],
  }), /pertenece a otra orden/);
});

test('valores inválidos en el snapshot: porcentajes y montos son rechazados', () => {
  const base = entradaBase;
  assert.throws(() => crearSnapshotTrabajo({ ...base, porcentajeComisionFicha: -1 }), /porcentaje/);
  assert.throws(() => crearSnapshotTrabajo({ ...base, porcentajeComisionFicha: 100.01 }), /porcentaje/);
  assert.throws(() => crearSnapshotTrabajo({ ...base, porcentajeComisionFicha: Number.NaN }), /porcentaje/);
  assert.throws(() => crearSnapshotTrabajo({ ...base, porcentajeComisionFicha: Number.POSITIVE_INFINITY }), /porcentaje/);
  assert.throws(() => crearSnapshotTrabajo({ ...base, porcentajeComisionFicha: 10.123 }), /2 decimales/);
  assert.throws(() => crearSnapshotTrabajo({ ...base, importeCobrado: -1 }), /importeCobrado/);
  assert.throws(() => crearSnapshotTrabajo({ ...base, importeCobrado: Number.NaN }), /importeCobrado/);
  assert.throws(() => crearSnapshotTrabajo({ ...base, importeCobrado: Number.POSITIVE_INFINITY }), /importeCobrado/);
  assert.throws(() => crearSnapshotTrabajo({ ...base, importeCobrado: 10.001 }), /centavos/);
  assert.throws(() => crearSnapshotTrabajo({ ...base, costoMateriales: -0.01 }), /costoMateriales/);
  assert.throws(() => crearSnapshotTrabajo({ ...base, costoMateriales: Number.NaN }), /costoMateriales/);
  assert.throws(() => crearSnapshotTrabajo({ ...base, ordenId: '' }), /ordenId/);
  assert.throws(() => crearSnapshotTrabajo({ ...base, trabajoId: '' }), /trabajoId/);
  assert.throws(() => crearSnapshotTrabajo({ ...base, tecnicoUid: '' }), /tecnicoUid/);
  assert.throws(() => crearSnapshotTrabajo({ ...base, ordenId: 'con/barra' }), /ordenId/);
  assert.throws(() => crearSnapshotTrabajo({ ...base, trabajoId: 'con_guion' }), /trabajoId/);
  assert.throws(() => crearSnapshotTrabajo({ ...base, tecnicoUid: 'con espacio' }), /tecnicoUid/);
  assert.throws(
    () => crearSnapshotTrabajo({ ...base, finalizado: 'true' as unknown as boolean }),
    /finalizado/,
  );
});

test('pagos inválidos son rechazados por la liquidación', () => {
  const t = finalizarTrabajo(crearSnapshotTrabajo({
    ordenId: 'OS8', trabajoId: 'T', tecnicoUid: 'tec',
    porcentajeComisionFicha: 10, importeCobrado: 1000, costoMateriales: 0, creadoEn: 1,
  }));
  const liquidar = (pagos: unknown) => calcularLiquidacionOrden({
    ordenId: 'OS8', totalOrden: 1000, trabajos: [t], pagos: pagos as unknown as readonly PagoVerificadoTrabajo[],
  });
  assert.throws(() => liquidar([{ id: 'p1', monto: -10, verificado: true }]), /monto/);
  assert.throws(() => liquidar([{ id: '', monto: 1000, verificado: true }]), /id/);
  assert.throws(() => liquidar([{ id: 'p1', monto: 1000, verificado: true }, { id: 'p1', monto: 500, verificado: true }]), /id/);
  assert.throws(() => liquidar([{ id: 'p1', monto: 10.001, verificado: true }]), /centavos/);
  assert.throws(() => liquidar([{ id: 'p1', monto: 1000, verificado: 'si' }]), /verificado/);
});

test('estabilidad del ID determinista de devengo', () => {
  const a = idDevengoDeterminista('OS9', 'TA');
  const b = idDevengoDeterminista('OS9', 'TA');
  assert.equal(a, b);
  assert.notEqual(a, idDevengoDeterminista('OS9', 'TB'));
  assert.notEqual(a, idDevengoDeterminista('OTRA', 'TA'));
  // El prefijo "trabajo_" distingue el namespace de "orden_" y "manual_".
  assert.ok(a.startsWith('trabajo_'));
  // IDs con caracteres prohibidos lanzan: no deben colar colisiones.
  assert.throws(() => idDevengoDeterminista('A/B', 'C'), /ordenId/);
  assert.throws(() => idDevengoDeterminista('A', 'B_C'), /trabajoId/);
});

test('precisión centavos: la comisión redondea medio centavo hacia arriba', () => {
  const snap = crearSnapshotTrabajo({
    ordenId: 'OS10', trabajoId: 'T', tecnicoUid: 'tec',
    porcentajeComisionFicha: 15, importeCobrado: 10.03, costoMateriales: 0, creadoEn: 1,
  });
  assert.equal(calcularBaseComision(snap), 10.03);
  // 10.03 * 0.15 = 1.5045 → 1.50 (redondeo al centavo más cercano).
  assert.equal(calcularMontoComision(snap), 1.50);
  const snap2 = crearSnapshotTrabajo({
    ordenId: 'OS10', trabajoId: 'T2', tecnicoUid: 'tec',
    porcentajeComisionFicha: 12.5, importeCobrado: 100, costoMateriales: 25.5, creadoEn: 1,
  });
  // base = 74.50; 74.50 * 0.125 = 9.3125 → 9.31
  assert.equal(calcularBaseComision(snap2), 74.5);
  assert.equal(calcularMontoComision(snap2), 9.31);
});

test('ordenes marcadas eliminada/soloChequeo quedan pendientes sin devengos', () => {
  const t = finalizarTrabajo(crearSnapshotTrabajo({
    ordenId: 'OS11', trabajoId: 'T', tecnicoUid: 'tec',
    porcentajeComisionFicha: 10, importeCobrado: 1000, costoMateriales: 0, creadoEn: 1,
  }));
  const base = { ordenId: 'OS11', totalOrden: 1000, trabajos: [t], pagos: [{ id: 'p1', monto: 1000, verificado: true }] };
  const eliminada = calcularLiquidacionOrden({ ...base, eliminada: true });
  assert.equal(eliminada.estado, 'pendiente');
  if (eliminada.estado === 'pendiente') assert.equal(eliminada.motivo, 'orden_eliminada');
  const chequeo = calcularLiquidacionOrden({ ...base, soloChequeo: true });
  assert.equal(chequeo.estado, 'pendiente');
  if (chequeo.estado === 'pendiente') assert.equal(chequeo.motivo, 'orden_solo_chequeo');
  const sinTrabajos = calcularLiquidacionOrden({ ordenId: 'OS11', totalOrden: 1000, trabajos: [], pagos: [] });
  assert.equal(sinTrabajos.estado, 'pendiente');
  if (sinTrabajos.estado === 'pendiente') assert.equal(sinTrabajos.motivo, 'orden_sin_trabajos');
});

test('resultado liquidable y sus devengos quedan congelados (no mutables)', () => {
  const t = finalizarTrabajo(crearSnapshotTrabajo({
    ordenId: 'OS12', trabajoId: 'T', tecnicoUid: 'tec',
    porcentajeComisionFicha: 10, importeCobrado: 1000, costoMateriales: 0, creadoEn: 1,
  }));
  const r = calcularLiquidacionOrden({
    ordenId: 'OS12', totalOrden: 1000, trabajos: [t], pagos: [{ id: 'p1', monto: 1000, verificado: true }],
  });
  assert.equal(Object.isFrozen(r), true);
  assert.equal(Object.isFrozen(r.devengos), true);
  assert.equal(r.devengos.length, 1);
  assert.equal(Object.isFrozen(r.devengos[0]), true);
  assert.throws(() => {
    (r.devengos[0] as unknown as { montoComision: number }).montoComision = 999;
  }, /./);
  assert.equal(r.devengos[0].montoComision, 100);
  assert.equal(r.devengos[0].comisionId, idDevengoDeterminista('OS12', 'T'));
});

 test('total autoritativo de orden bloquea cobro incompleto aunque trabajos estén cubiertos', () => {
 const t = finalizarTrabajo(crearSnapshotTrabajo(entradaBase));
 const r = calcularLiquidacionOrden({ordenId: t.ordenId, totalOrden: 6000, trabajos: [t], pagos: [{id:'p', monto:5000, verificado:true}]});
 assert.equal(r.estado, 'pendiente');
 assert.equal(r.devengos.length, 0);
 });
 test('documento externo mal formado y montos inseguros son rechazados', () => {
 const t = finalizarTrabajo(crearSnapshotTrabajo(entradaBase));
 for (const patch of [{finalizado:'sí'}, {tecnicoUid:''}, {porcentajeComision:10.123}]) {
 assert.throws(() => calcularLiquidacionOrden({ordenId:t.ordenId,totalOrden:5000,trabajos:[{...t,...patch} as unknown as typeof t],pagos:[{id:'p',monto:5000,verificado:true}]}));
 }
 assert.throws(() => crearSnapshotTrabajo({...entradaBase, importeCobrado: Number.MAX_SAFE_INTEGER}));
 });
