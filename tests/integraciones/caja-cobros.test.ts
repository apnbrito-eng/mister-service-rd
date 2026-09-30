import { expect, it } from 'vitest';
import { proyectarCobrosCaja } from '../../src/utils/movimientosCobros';
import { fechaFinanciera } from '../../src/utils/fechaFinanciera';
const pago = (id: string, monto: number, fecha: unknown) => ({ id, monto, fecha, metodo: 'efectivo', verificado: true });
const orden = (pagos: unknown[]) => [{ id: 'o1', datos: { pagos, estado: 'pagada', total: 10000 } }];
it('imputa abonos a la fecha real de cada pago y no al total del conduce', () => {
 const datos = orden([pago('p1',3000,'2026-09-30'),pago('p2',7000,'2026-10-01')]);
 expect(proyectarCobrosCaja(datos,undefined,'2026-09-01','2026-09-30').totalConfirmado).toBe(3000);
 expect(proyectarCobrosCaja(datos,undefined,'2026-10-01','2026-10-31').totalConfirmado).toBe(7000);
 expect(proyectarCobrosCaja(orden([])).totalConfirmado).toBe(0);
});
it('excluye duplicados, ausentes e inválidos de caja general', () => {
 const r = proyectarCobrosCaja(orden([pago('p',20,'2026-09-29'),pago('p',20,'2026-09-29'),pago('q',20,null),pago('r',NaN,'2026-09-29')]));
 expect(r.totalConfirmado).toBe(0); expect(r.incidencias).toHaveLength(4);
});
it('respeta medianoche dominicana y fecha de gasto escrita', () => {
 expect(fechaFinanciera('2026-10-01')?.toISOString()).toBe('2026-10-01T04:00:00.000Z');
 const r = proyectarCobrosCaja(orden([pago('p',20,'2026-10-01T03:59:59Z'),pago('q',30,'2026-10-01T04:00:00Z')]),undefined,'2026-10-01','2026-10-01');
 expect(r.totalConfirmado).toBe(30);
});
