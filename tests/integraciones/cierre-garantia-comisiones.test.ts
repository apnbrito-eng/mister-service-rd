import { afterEach, describe, expect, it, vi } from 'vitest';
import { Timestamp } from 'firebase/firestore';
import type { OrdenServicio, ItemCotizacion } from '../../src/types';
vi.mock('../../src/firebase/config', () => ({ db: {} }));
import { calcularQuincenaActual, rangoQuincena, calcularDesgloseFactura, calcularComisionesProporcionales } from '../../src/utils/comisiones';
import { vencimientoDeOrden, estaDentroDePeriodo, diasRestantes } from '../../src/utils/garantia';
const orden = (data: object) => data as OrdenServicio;
const items = (data: object[]) => data as ItemCotizacion[];
afterEach(() => vi.useRealTimers());
describe('Garantía desde el cierre', () => {
 it('usa el vencimiento persistido aunque cambie el período del catálogo', () => {
  const fecha = new Date(2026, 10, 10);
  expect(vencimientoDeOrden(orden({ garantiaVencimiento: Timestamp.fromDate(fecha), periodoGarantiaDias: 1 }))).toEqual(fecha);
 });
 it('calcula 60 días para cierre antiguo sin período', () => {
  expect(vencimientoDeOrden(orden({ cierreServicio: { fechaCierre: new Date(2026, 4, 11, 12) } }))).toEqual(new Date(2026, 6, 10, 12));
 });
 it('no concede garantía a una orden sin cierre', () => {
  expect(vencimientoDeOrden(orden({}))).toBeNull();
  expect(estaDentroDePeriodo(orden({}))).toBe(false);
 });
 it('mantiene el límite exacto del vencimiento', () => {
  vi.useFakeTimers(); const fecha = new Date(2026, 8, 15, 12);
  const o = orden({ garantiaVencimiento: fecha });
  vi.setSystemTime(fecha); expect(estaDentroDePeriodo(o)).toBe(true);
  vi.setSystemTime(fecha.getTime() + 1); expect(estaDentroDePeriodo(o)).toBe(false);
 });
 it('descarta fechas dañadas sin mostrar NaN ni romper el formato', () => {
  const o = orden({ garantiaVencimiento: new Date(NaN) });
  expect(vencimientoDeOrden(o)).toBeNull(); expect(diasRestantes(o)).toBe(0);
 });
});
describe('Cálculos de cierre y comisiones sin escrituras', () => {
 it('resta impuesto y costo de piezas antes de calcular comisión', () => {
  expect(calcularDesgloseFactura({ total: 11800, porcentajeTecnico: 10, items: items([
   { tipoItem: 'pieza', precio: 3000, costoCompra: 1000, cantidad: 2 },
   { tipoItem: 'servicio', precio: 4000, cantidad: 1 },
  ]) })).toMatchObject({ subtotal: 10000, itbis: 1800, costoPiezas: 2000, gananciaNeta: 8000, comisionMonto: 800 });
 });
 it('no produce una comisión negativa cuando piezas exceden ingreso', () => {
  expect(calcularDesgloseFactura({ total: 118, porcentajeTecnico: 10, items: items([{tipoItem:'pieza', costoCompra:200, precio:250, cantidad:1}]) }).comisionMonto).toBe(0);
 });
 it('distribuye el margen entre técnicos sin incluir impuesto', () => {
  const result = calcularComisionesProporcionales({ totalConItbis:11800, costoPiezasTotal:2000,
   items:items([{tecnicoId:'t1', precio:6000, cantidad:1}, {tecnicoId:'t2', precio:4000, cantidad:1}]),
   getTecnico:id=>({nombre:id, porcentaje:10}) });
  expect(result.map(r=>r.monto)).toEqual([480,320]);
 });
 it.each([2024, 2026])('cada día de %i pertenece al rango de su quincena, incluso al final del día', (year) => {
  for(let month=0;month<12;month++) {
   const last = new Date(year,month+1,0).getDate();
   for(let day=1;day<=last;day++) {
    const fecha = new Date(year,month,day,23,59,59,999);
    const q = calcularQuincenaActual(fecha); const rango = rangoQuincena(q);
    expect(fecha.getTime(), `${fecha.toISOString()} fuera de ${q}`).toBeGreaterThanOrEqual(rango.inicio.getTime());
    expect(fecha.getTime(), `${fecha.toISOString()} fuera de ${q}`).toBeLessThanOrEqual(rango.fin.getTime());
   }
  }
 });
});
