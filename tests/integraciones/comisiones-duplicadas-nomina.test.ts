import { expect, it } from 'vitest';
import { comisionesDuplicadasNomina } from '../../src/utils/comisionesDuplicadasNomina';
const personal = [{id:'p',uid:'u'},{id:'p2',uid:'u2'}];
const c = (id: string, tecnicoId='u', ordenId='o', extra={}) => ({ id, datos: { tecnicoId, ordenId, ...extra } });
it('resuelve uid y documento juntos, no agrupa técnicos distintos ni manuales por ítem', () => {
 expect(comisionesDuplicadasNomina([c('a'),c('b','p')],personal).get('p')).toEqual(['a','b']);
 expect(comisionesDuplicadasNomina([c('a'),c('b','u2')],personal).size).toBe(0);
 expect(comisionesDuplicadasNomina([c('a','u','factura-manual-x'),c('b','u','factura-manual-x')],personal).size).toBe(0);
});
it('ignora anuladas e histórico completamente liquidado; pendiente frente a liquidada exige revisión', () => {
 expect(comisionesDuplicadasNomina([c('a'),c('b','u','o',{estaAnulada:true})],personal).size).toBe(0);
 expect(comisionesDuplicadasNomina([c('a','u','o',{estadoLiquidacion:'liquidada'}),c('b','u','o',{estadoLiquidacion:'liquidada'})],personal).size).toBe(0);
 expect(comisionesDuplicadasNomina([c('a'),c('b','u','o',{estadoLiquidacion:'liquidada'})],personal).size).toBe(1);
 expect(comisionesDuplicadasNomina([c('a'),c('b')],[...personal,{id:'p3',uid:'u'}]).size).toBe(0);
});
