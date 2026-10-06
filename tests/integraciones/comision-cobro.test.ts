import { expect, it } from 'vitest';
import { cobroCompletoParaComision, prepararLiberacionComision, quincenaCobroRD, leerOrdenesDeComisiones, comisionConCobroCompleto } from '../../src/utils/comisionCobro';
const pago = (id: string, monto: number, verificado = true) => ({ id, monto, verificado });
const orden = { fase: 'cerrado', precioFinal: 10000, pagos: [pago('anticipo', 5000)] };
const politica = { exigirVerificacion: true };
it('anticipo 50% no libera comisión; completar sí', () => {
  expect(cobroCompletoParaComision(orden, politica)).toBe(false);
  expect(cobroCompletoParaComision({ ...orden, pagos: [...orden.pagos, pago('saldo', 5000)] }, politica)).toBe(true);
});
it('permite decidir explícitamente si la confirmación de oficina es necesaria', () => {
  const completa = { ...orden, pagos: [pago('p', 10000, false)] };
  expect(cobroCompletoParaComision(completa, politica)).toBe(false);
  expect(cobroCompletoParaComision(completa, { exigirVerificacion: false })).toBe(true);
});
it('custodia del efectivo y estadoPago no sustituyen los cobros', () => {
  expect(cobroCompletoParaComision({ ...orden, estadoPago: 'completo', montoPagado: 10000, efectivoEntregado: true }, politica)).toBe(false);
  expect(cobroCompletoParaComision({ ...orden, pagos: [pago('p', 10000)], efectivoEntregado: false }, politica)).toBe(true);
});
it('rechaza pagos inválidos, duplicados o total ausente', () => {
  for (const pagos of [[pago('p', 5000), pago('p', 5000)], [pago('p', NaN)], [pago('p', -10000)]]) {
    expect(cobroCompletoParaComision({ ...orden, pagos }, politica)).toBe(false);
  }
  expect(cobroCompletoParaComision({ ...orden, precioFinal: undefined }, politica)).toBe(false);
});
it('libera mismo registro retenido una sola vez al terminar y cobrar', () => {
  const fecha = new Date('2026-10-30T15:00:00Z');
  const comision = { precioFinal: 10000, estadoLiquidacion: 'retenida_por_cobro', comisionMonto: 1000 };
  const completa = { ...orden, pagos: [pago('p', 10000)] };
  const cambio = prepararLiberacionComision(comision, completa, fecha, fecha, politica);
  expect(cambio).toMatchObject({ estadoLiquidacion: 'pendiente', quincenaAsignada: '2026-11-Q1', fechaCobro: fecha });
  expect(cambio).not.toHaveProperty('comisionMonto');
  expect(prepararLiberacionComision({ ...comision, ...cambio }, completa, fecha, fecha, politica)).toBeNull();
  expect(prepararLiberacionComision(comision, { ...completa, fase: 'agendado' }, fecha, fecha, politica)).toBeNull();
  expect(prepararLiberacionComision({ ...comision, estadoLiquidacion: 'liquidada' }, completa, fecha, fecha, politica)).toBeNull();
});
it('quincena de liberación usa hora dominicana incluso si servidor usa UTC', () => {
  expect(quincenaCobroRD(new Date('2026-10-15T02:00:00Z'))).toBe('2026-10-Q1');
  expect(quincenaCobroRD(new Date('2026-10-15T05:00:00Z'))).toBe('2026-10-Q2');
});

it('nómina relee orden aunque la comisión legacy figure pendiente y el borrador diga pagada', async () => {
  const comisiones = [{ ordenId: 'o1', estadoLiquidacion: 'pendiente', montoPagado: 10000 }, { ordenId: 'o1', estadoLiquidacion: 'pendiente' }];
  const lecturas: string[] = [];
  const leidas = await leerOrdenesDeComisiones(comisiones, async id => { lecturas.push(id); return orden; });
  expect(lecturas).toEqual(['o1']);
  for (const politica of [{ exigirVerificacion: true }, { exigirVerificacion: false }]) {
    expect(comisionConCobroCompleto(comisiones[0], leidas, politica)).toBe(false);
  }
});
it('orden ausente no permite liquidar y comisión retenida no se liquida por inferencia', () => {
  expect(comisionConCobroCompleto({ ordenId: 'ausente' }, new Map(), politica)).toBe(false);
  expect(comisionConCobroCompleto({ estadoLiquidacion: 'pendiente' }, new Map(), politica)).toBe(false);
  expect(comisionConCobroCompleto({ ordenId: 'o1', estadoLiquidacion: 'retenida_por_cobro' }, new Map([['o1', { ...orden, pagos: [pago('p', 10000)] }]]), politica)).toBe(false);
});
it.each([6000, 14000])('cambio de precio a %s bloquea comisión antigua tanto al liberar como en nómina', precioFinal => {
  const actual = { ...orden, precioFinal, pagos: [pago('p', precioFinal)] };
  const comision = { ordenId: 'o', precioFinal: 10000, comisionMonto: 4000, estadoLiquidacion: 'retenida_por_cobro' };
  expect(prepararLiberacionComision(comision, actual, new Date(), new Date(), politica)).toBeNull();
  expect(comisionConCobroCompleto({ ...comision, estadoLiquidacion: 'pendiente' }, new Map([['o', actual]]), politica)).toBe(false);
});
it('sin importe original verificable no autoriza comisión por inferencia', () => {
  const actual = { ...orden, pagos: [pago('p', 10000)] };
  expect(comisionConCobroCompleto({ ordenId: 'o', estadoLiquidacion: 'pendiente' }, new Map([['o', actual]]), politica)).toBe(false);
});
