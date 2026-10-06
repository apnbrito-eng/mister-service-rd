import { test } from 'node:test';
import assert from 'node:assert/strict';
import { prepararAceptacionEfectivo, prepararEntregaEfectivo } from '../../src/utils/efectivoResponsabilidad.ts';
const tecnico = { uid: 'tec', rol: 'tecnico', nombre: 'Técnico' };
const oficina = { uid: 'op', rol: 'operaria', nombre: 'Operaria' };
const orden = { tecnicoId: 'tec', operariaId: 'op', pagos: [{ id: 'p1', monto: 4500, metodo: 'efectivo', recibidoPorId: 'tec', requiereAceptacionEfectivo: true, verificado: false }] };
test('aceptación exacta, entrega física independiente de verificación e idempotencia', () => {
  const aceptaciones = prepararAceptacionEfectivo(orden, 'p1', 4500, tecnico, 123)!;
  const aceptada = { ...orden, efectivoAceptaciones: aceptaciones };
  assert.equal(prepararAceptacionEfectivo(aceptada, 'p1', 4500, tecnico, 456), null);
  const entregas = prepararEntregaEfectivo(aceptada, 'p1', 4500, oficina, 456)!;
  assert.equal(prepararEntregaEfectivo({ ...aceptada, efectivoEntregas: entregas }, 'p1', 4500, oficina, 789), null);
  assert.equal(orden.pagos[0].verificado, false);
  assert.deepEqual(entregas.p1, { monto: 4500, entregadoEn: 456, entregadoPor: 'op', entregadoPorNombre: 'Operaria' });
});
test('rechaza actor distinto, inactivo, precio cambiado y duplicado', () => {
  assert.throws(() => prepararAceptacionEfectivo(orden, 'p1', 4500, oficina, 1));
  assert.throws(() => prepararAceptacionEfectivo(orden, 'p1', 4500, { ...tecnico, uid: 'otro' }, 1));
  assert.throws(() => prepararAceptacionEfectivo(orden, 'p1', 4500, { ...tecnico, activo: false }, 1));
  assert.throws(() => prepararAceptacionEfectivo(orden, 'p1', 4400, tecnico, 1));
  assert.throws(() => prepararAceptacionEfectivo({ ...orden, pagos: [...orden.pagos, ...orden.pagos] }, 'p1', 4500, tecnico, 1));
});
test('oficina no recibe antes de aceptación, ni técnico entrega a sí mismo, ni otro equipo', () => {
  assert.throws(() => prepararEntregaEfectivo(orden, 'p1', 4500, oficina, 1));
  const aceptada = { ...orden, efectivoAceptaciones: prepararAceptacionEfectivo(orden, 'p1', 4500, tecnico, 1) };
  assert.throws(() => prepararEntregaEfectivo(aceptada, 'p1', 4500, tecnico, 2));
  assert.throws(() => prepararEntregaEfectivo(aceptada, 'p1', 4500, { ...oficina, uid: 'otra' }, 2));
  assert.throws(() => prepararEntregaEfectivo({ ...aceptada, efectivoEntregas: { p1: { monto: 300 } } }, 'p1', 4500, oficina, 2));
});
test('legacy no se declara aceptado; transferencia y eliminado rechazados', () => {
  assert.throws(() => prepararAceptacionEfectivo({ ...orden, pagos: [{ ...orden.pagos[0], requiereAceptacionEfectivo: false }] }, 'p1', 4500, tecnico, 1));
  assert.throws(() => prepararAceptacionEfectivo({ ...orden, pagos: [{ ...orden.pagos[0], metodo: 'transferencia' }] }, 'p1', 4500, tecnico, 1));
  assert.throws(() => prepararAceptacionEfectivo({ ...orden, eliminada: true }, 'p1', 4500, tecnico, 1));
});
