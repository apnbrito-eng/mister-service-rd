import { expect, it } from 'vitest';
import { ingresosConfirmados } from '../../src/utils/ingresosConfirmados';
const desde = new Date('2026-09-01T00:00:00-04:00');
const hasta = new Date('2026-09-30T23:59:59-04:00');
const pago = { monto: 3000, verificado: true, fecha: new Date('2026-09-24T12:00:00-04:00') };
it('suma anticipo y saldo confirmados por fecha de cobro, sin exigir cierre de orden', () => {
  expect(ingresosConfirmados([{ pagos: [pago, { ...pago, monto: 5000 }] }], desde, hasta)).toBe(8000);
});
it('excluye pagos pendientes, legados sin verificar, órdenes eliminadas y fechas desconocidas', () => {
  expect(ingresosConfirmados([
    { pagos: [{ ...pago, verificado: false }, { ...pago, verificado: undefined }, { ...pago, fecha: new Date(NaN) }] },
    { eliminada: true, pagos: [pago] },
  ], desde, hasta)).toBe(0);
});
it('no mueve al mes actual un anticipo de agosto ni suma pagos futuros', () => {
  expect(ingresosConfirmados([{ pagos: [
    { ...pago, fecha: new Date('2026-08-31T12:00:00-04:00') },
    { ...pago, fecha: new Date('2026-10-01T00:00:00-04:00') },
  ] }], desde, hasta)).toBe(0);
});
it('incluye los límites del período y descarta importes corruptos', () => {
  expect(ingresosConfirmados([{ pagos: [
    { ...pago, fecha: desde }, { ...pago, fecha: hasta },
    { ...pago, monto: Infinity }, { ...pago, monto: NaN }, { ...pago, monto: -1 },
  ] }], desde, hasta)).toBe(6000);
});
