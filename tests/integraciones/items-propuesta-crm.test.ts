import { describe, expect, it } from 'vitest';
import { itemsPropuestaCrm } from '../../src/utils/itemsPropuestaCrm';
describe('Presupuesto CRM hacia factura', () => {
  const propuesta = { estado: 'aprobado', diagnostico: 'Reparación', piezas: [{ nombre: 'Bomba', cantidad: 1, costoUnitario: 3000 }] };
  it('conserva el total 8000 y el costo de pieza 3000 para descontarlo de la comisión', () => {
    const items = itemsPropuestaCrm(propuesta, 8000);
    expect(items.reduce((s, i) => s + i.precio * i.cantidad, 0)).toBe(8000);
    expect(items.filter(i => i.tipoItem === 'pieza').reduce((s, i) => s + (i.costoCompra ?? i.precio) * i.cantidad, 0)).toBe(3000);
    expect(items.at(-1)?.precio).toBe(5000);
  });
  it('respeta descuentos del total sin perder el costo de compra', () => {
    expect(itemsPropuestaCrm(propuesta, 7500).at(-1)?.precio).toBe(4500);
  });
  it('impide usar una propuesta pendiente o un total menor que sus piezas', () => {
    expect(() => itemsPropuestaCrm({ ...propuesta, estado: 'pendiente' }, 8000)).toThrow();
    expect(() => itemsPropuestaCrm(propuesta, 2000)).toThrow();
  });
});
