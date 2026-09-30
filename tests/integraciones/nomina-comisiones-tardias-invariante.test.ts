import { expect, it } from 'vitest';
import { analizarNominaTardia } from '../../scripts/invariantes/check-nomina-comisiones-tardias';
it('detecta exclusión histórica y creación aleatoria dentro de generación', () => {
 const resultado=analizarNominaTardia('export function generarLiquidacion(){ const pendientes=datos.filter(c=>c.fechaCobro >= inicio); return addDoc(coleccion,pendientes); }');
 expect(resultado.hits).toHaveLength(2);
});
it('permite clasificar atrasos manteniendo recuperación y limita alcance a nómina', () => {
 expect(analizarNominaTardia('export function generarLiquidacion(){ return datos.filter(c=>c.fechaCobro <= fin); } function ajena(){ return addDoc(c,d); }').status).toBe('pass');
});
it('protege revisión de cuotas y descubrimiento de nuevas conciliaciones', () => {
 expect(analizarNominaTardia('export function recalcularEmpleadoLiquidacion(){ const totalDevengado = 3000; } export function actualizarConciliacionLiquidacion(){ return raw.comisionesSinEmpleado; }').hits).toHaveLength(2);
});
