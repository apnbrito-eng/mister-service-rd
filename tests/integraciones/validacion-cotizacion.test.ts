import { expect, it } from 'vitest';
import { errorCotizacion } from '../../src/utils/validacionCotizacion';
const item = { descripcion: 'Pieza de ensayo', cantidad: 1, precio: 1500.50 };
it('acepta centavos y conceptos sin cargo', () => {
  expect(errorCotizacion('Cliente ensayo', [item, { ...item, precio: 0 }])).toBeNull();
});
it('rechaza cliente o descripción compuestos solo de espacios y cotizaciones vacías', () => {
  expect(errorCotizacion('  ', [item])).toBeTruthy();
  expect(errorCotizacion('Cliente', [{ ...item, descripcion: '  ' }])).toBeTruthy();
  expect(errorCotizacion('Cliente', [])).toBeTruthy();
});
it.each([-1, NaN, Infinity])('rechaza precio inválido %s', precio => {
  expect(errorCotizacion('Cliente', [{ ...item, precio }])).toBeTruthy();
});
it.each([0, -1, 1.5, NaN, Infinity])('rechaza cantidad inválida %s', cantidad => {
  expect(errorCotizacion('Cliente', [{ ...item, cantidad }])).toBeTruthy();
});
it('rechaza un total desbordado aunque sus componentes sean finitos', () => {
  expect(errorCotizacion('Cliente', [{ ...item, cantidad: 2, precio: Number.MAX_VALUE }])).toBeTruthy();
});
