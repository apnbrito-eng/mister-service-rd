import { describe,it,expect } from 'vitest';
import { rangoQuincena } from '../../src/utils/comisiones';
import { vi } from 'vitest';
vi.mock('../../src/firebase/config', () => ({ db: {}, auth: {} }));
import { fechaPagoNomina, validarPreparacionNomina, corteGuardadoNomina } from '../../src/utils/corteNomina';
const inicio=new Date('2026-02-15T00:00:00-04:00');
const fin=new Date('2026-02-28T23:59:59.999-04:00');
describe('corte de nómina',()=>{
 it('programa 15 y 30, o último día de febrero',()=>{
  expect(fechaPagoNomina('2026-10-Q2')).toBe('2026-10-30');
  expect(fechaPagoNomina('2026-02-Q2')).toBe('2026-02-28');
  expect(fechaPagoNomina('2028-02-Q2')).toBe('2028-02-29');
  expect(fechaPagoNomina('2026-03-Q1')).toBe('2026-03-15');
 });
 it('mes de 31 días conserva corte del 29 y pago del 30',()=>{
  expect(rangoQuincena('2026-10-Q2').fin.toISOString()).toBe('2026-10-30T03:59:59.999Z');
  expect(fechaPagoNomina('2026-10-Q2')).toBe('2026-10-30');
 });
 it('no transforma el corte en fecha de pago',()=>{
  const corte=new Date('2026-02-26T23:00:00-04:00');
  expect(validarPreparacionNomina('2026-02-Q2',inicio,fin,{corteComisiones:corte,fechaPagoProgramada:'2026-02-28'})).toEqual({corteComisiones:corte,fechaPagoProgramada:'2026-02-28'});
 });
 it('bloquea cortes y pagos inválidos',()=>{
  expect(()=>validarPreparacionNomina('2026-02-Q2',inicio,fin,{corteComisiones:new Date('2026-03-01T00:00:00-04:00')})).toThrow();
  expect(()=>validarPreparacionNomina('2026-02-Q2',inicio,fin,{fechaPagoProgramada:'2026-02-30'})).toThrow();
  expect(()=>validarPreparacionNomina('2026-02-Q2',inicio,fin,{fechaPagoProgramada:'2026-02-20'})).toThrow();
 });
 it('borradores legacy mantienen corte y los corruptos bloquean',()=>{
  expect(corteGuardadoNomina({},inicio,fin)).toBe(fin);
  expect(()=>corteGuardadoNomina({corteComisiones:'mal'},inicio,fin)).toThrow();
  expect(corteGuardadoNomina({corteComisiones:new Date('2026-02-26T23:00:00-04:00')},inicio,fin).toISOString()).toBe('2026-02-27T03:00:00.000Z');
 });
});
