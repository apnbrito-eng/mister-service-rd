import { expect, it } from 'vitest';
import { Timestamp } from 'firebase/firestore';
import { fechaFinanciera } from '../../src/utils/fechaFinanciera';
it('fecha desconocida o imposible permanece desconocida', () => {
 for (const valor of [undefined, null, '', 'ayer', 0, '2026-02-30', '2026-09-30T24:00:00Z', new Date(NaN), { toDate: () => new Date(NaN) }, { toDate: () => { throw Error(); } }]) expect(fechaFinanciera(valor)).toBeNull();
});
it('acepta Date, Timestamp e ISO con milisegundos intactos', () => {
 const fecha = new Date('2026-09-30T23:59:59.999-04:00');
 for (const valor of [fecha, Timestamp.fromDate(fecha), fecha.toISOString()]) expect(fechaFinanciera(valor)?.getTime()).toBe(fecha.getTime());
});

it('día sin hora conserva inicio del día dominicano y corte quincenal', () => {
 expect(fechaFinanciera('2026-09-01')?.toISOString()).toBe('2026-09-01T04:00:00.000Z');
 expect(fechaFinanciera('2026-09-15')?.toISOString()).toBe('2026-09-15T04:00:00.000Z');
});
