import { describe, expect, it } from 'vitest';
import { planificarAjusteGarantia } from '../../src/utils/ajusteGarantia';
const evento = (id='g1', monto=-100) => ({ ordenIdReasignada:id, monto, motivo:'Garantía — 10% de piezas' });
const pendiente = {estadoLiquidacion:'pendiente', comisionMonto:1500};
describe('Historial de ajustes de garantía', () => {
 it('mantiene la comisión original y registra el primer descuento', () => {
  const plan=planificarAjusteGarantia(pendiente,evento())!;
  expect(plan.descuentoPorGarantia.monto).toBe(-100);
  expect(plan.ajustesGarantia).toHaveLength(1);
  expect(plan).not.toHaveProperty('comisionMonto'); expect(plan).not.toHaveProperty('estaAnulada');
 });
 it('reintentar la misma garantía no vuelve a descontar', () => {
  const previo=planificarAjusteGarantia(pendiente,evento())!;
  expect(planificarAjusteGarantia({...pendiente,...previo},evento())).toBeNull();
 });
 it('dos garantías distintas se acumulan conservando ambas', () => {
  const previo=planificarAjusteGarantia(pendiente,evento())!;
  const nuevo=planificarAjusteGarantia({...pendiente,...previo},evento('g2',-50))!;
  expect(nuevo.descuentoPorGarantia.monto).toBe(-150);
  expect(nuevo.ajustesGarantia.map(e=>e.ordenIdReasignada)).toEqual(['g1','g2']);
 });
 it('preserva un descuento anterior al historial nuevo', () => {
  const p=planificarAjusteGarantia({...pendiente,descuentoPorGarantia:evento('vieja',-250)},evento())!;
  expect(p.descuentoPorGarantia.monto).toBe(-350); expect(p.ajustesGarantia).toHaveLength(2);
 });
 it('detecta una garantía legacy ya aplicada', () => {
  expect(planificarAjusteGarantia({...pendiente,descuentoPorGarantia:evento()},evento())).toBeNull();
 });
 it('no altera una comisión liquidada', () => {
  expect(()=>planificarAjusteGarantia({...pendiente,estadoLiquidacion:'liquidada'},evento())).toThrow('liquidada');
 });
 it('no altera una comisión anulada', () => {
  expect(()=>planificarAjusteGarantia({...pendiente,estaAnulada:true},evento())).toThrow('anulada');
 });
 it('un cambio posterior de importe exige revisión en vez de sustituir el descuento', () => {
  expect(()=>planificarAjusteGarantia({...pendiente,descuentoPorGarantia:evento()},evento('g1',-200))).toThrow('cambiaron');
 });
 it('no acumula sobre un total incompatible con su historial', () => {
  expect(()=>planificarAjusteGarantia({...pendiente,ajustesGarantia:[evento()],descuentoPorGarantia:evento('g1',-900)},evento('g2'))).toThrow('no coincide');
 });
 it.each([NaN,Infinity,0,100])('rechaza importe inválido %s', monto=>{
  expect(()=>planificarAjusteGarantia(pendiente,evento('g1',monto))).toThrow('importe');
 });
});
