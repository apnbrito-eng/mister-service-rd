import { expect, it } from 'vitest';
import { resumenOperativoDia } from '../../src/utils/resumenOperativoDia';
it('updatedAt no convierte una orden vieja en cierre del día', () => {
 const r = resumenOperativoDia([{ id: 'o', datos: { fase: 'cerrado', updatedAt: '2026-09-29' } }], [], '2026-09-29');
 expect(r.cerradas).toHaveLength(0); expect(r.incidencias[0]).toContain('fecha verificable');
});
it('cierre e historial verificables incluyen chequeo y excluyen día ajeno', () => {
 const r = resumenOperativoDia([
  { id: 'a', datos: { fase: 'cerrado', soloChequeo: true, cierreServicio: { fechaCierre: '2026-09-29T03:59:00Z' } } },
  { id: 'b', datos: { fase: 'cerrado', soloChequeo: true, historialFases: [{ fase: 'cerrado', timestamp: '2026-09-29T04:00:00Z' }] } },
 ], [], '2026-09-29');
 expect(r.cerradas.map(o => o.id)).toEqual(['b']); expect(r.chequeos).toHaveLength(1);
});
it('gastos registrados no se convierten en pagos y desconocidos no van a hoy', () => {
 const r = resumenOperativoDia([], [{ id: 'g1', datos: { fecha: '2026-09-29', monto: 100, metodoPago: 'efectivo' } }, { id: 'g2', datos: { monto: 300 } }, { id: 'g3', datos: { fecha: '2026-09-29', monto: -10 } }], '2026-09-29');
 expect(r.totalGastos).toBe(100); expect(r.gastos).toHaveLength(1); expect(r.incidencias).toHaveLength(2);
 expect(r).not.toHaveProperty('totalPagado');
});
