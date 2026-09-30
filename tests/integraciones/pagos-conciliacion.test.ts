import { expect, it } from 'vitest';
import { incidenciasPago, pagosSinConfirmacion, huellaPago } from '../../src/utils/pagosConciliacion';
const base = { id: 'p', fecha: '2026-09-29', monto: 100, metodo: 'efectivo' };
it('lista legacy undefined y false, conserva confirmados fuera de bandeja', () => {
  const pagos = [base, { ...base, id: 'p2', verificado: false }, { ...base, id: 'p3', verificado: true }];
  expect(pagosSinConfirmacion(pagos).map(p => p.indice)).toEqual([0, 1]);
  expect(pagosSinConfirmacion(pagos).every(p => p.incidencias.length === 0)).toBe(true);
  expect(pagos[0]).not.toHaveProperty('verificado');
});
it('no fabrica fecha o ID y exige identidad única antes de verificar', () => {
  const p = { monto: 100, metodo: 'efectivo' };
  expect(pagosSinConfirmacion([p])[0].pago).toBe(p);
  expect(incidenciasPago(p, [p])).toEqual(['Identificador ausente o duplicado', 'Fecha no verificable']);
  expect(incidenciasPago(base, [base, base])).toContain('Identificador ausente o duplicado');
  expect(incidenciasPago({ ...base, fecha: '2026-02-30' }, [base])).toContain('Fecha no verificable');
});
it('huella detecta cambio de datos pero ignora orden de claves', () => {
  expect(huellaPago({ id: 'p', monto: 100 })).toBe(huellaPago({ monto: 100, id: 'p' }));
  expect(huellaPago(base)).not.toBe(huellaPago({ ...base, monto: 101 }));
});
