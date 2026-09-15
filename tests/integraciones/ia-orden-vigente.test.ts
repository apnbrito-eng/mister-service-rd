import { describe, expect, it } from 'vitest';
import { seleccionarOrdenVigente } from '../../api/_lib/ordenVigente';
const doc = (id: string, eliminada?: boolean) => ({ id, data: () => ({ eliminada }) });
describe('selección de orden con número repetido', () => {
  it('omite la prueba eliminada aunque aparezca primero', () => {
    expect(seleccionarOrdenVigente([doc('prueba', true), doc('vigente')])?.id).toBe('vigente');
  });
  it('no escoge arbitrariamente entre dos órdenes vigentes', () => {
    expect(() => seleccionarOrdenVigente([doc('uno'), doc('dos', false)])).toThrow('varias órdenes vigentes');
  });
  it('no devuelve una orden eliminada cuando no existe una vigente', () => {
    expect(seleccionarOrdenVigente([doc('prueba', true)])).toBeNull();
    expect(seleccionarOrdenVigente([])).toBeNull();
  });
});
