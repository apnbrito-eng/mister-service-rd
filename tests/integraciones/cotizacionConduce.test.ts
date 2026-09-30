import { describe, expect, it } from 'vitest';
import { validarCotizacionParaConduce } from '../../src/utils/cotizacionConduce';
describe('cotización a conduce', () => {
  it('acepta únicamente presupuesto aprobado de la misma orden', () => {
    expect(() => validarCotizacionParaConduce({ estado: 'aceptada', ordenId: 'os1' }, 'os1')).not.toThrow();
    for (const estado of ['rechazada', 'enviada', 'borrador']) {
      expect(() => validarCotizacionParaConduce({ estado, ordenId: 'os1' }, 'os1')).toThrow('aceptada');
    }
  });
  it('rechaza desaparecida, vínculo ajeno y conduce ya emitido', () => {
    expect(() => validarCotizacionParaConduce(undefined, 'os1')).toThrow('existe');
    expect(() => validarCotizacionParaConduce({ estado: 'aceptada', ordenId: 'os2' }, 'os1')).toThrow('corresponde');
    expect(() => validarCotizacionParaConduce({ estado: 'aceptada', ordenId: 'os1', facturaId: 'cg1' }, 'os1')).toThrow('conduce');
  });
});

import { readFileSync } from 'node:fs';
it('cotización no dispone de segunda ruta de emisión, stock o devengo', () => {
  const source = readFileSync('src/pages/Cotizaciones.tsx', 'utf8');
  expect(source).not.toContain('siguienteNumeroFactura(');
  expect(source).not.toMatch(/collection\(db,\s*['"]facturas['"]\)/);
  const modal = readFileSync('src/components/facturacion-pendiente/ProcesarFacturacionModal.tsx', 'utf8');
  expect(modal).not.toMatch(/registrarComision(?:PorFactura|esPorItems)\s*\(/);
  expect(modal).toContain('validarCotizacionParaConduce(cotSnap.data(), orden.id)');
  expect(modal).toContain('tx.update(cotRef, { convertida: true');
});

import { calcularEmisionActual, totalComisionesConduce } from '../../src/utils/cotizacionConduce';
it('revalida pagos y anulación actuales sin pago nuevo', () => {
  expect(() => calcularEmisionActual({ pagos: [{ monto: 100, verificado: false }] }, 100)).toThrow('sin confirmar');
  expect(() => calcularEmisionActual({ pagos: [{ monto: 100 }] }, 100)).toThrow('sin confirmar');
  expect(() => calcularEmisionActual({ pagos: [{ monto: 'invalido', verificado: true }] }, 100)).toThrow('inválidos');
  expect(() => calcularEmisionActual({ fase: 'cancelado' }, 100)).toThrow('anulada');
  expect(() => calcularEmisionActual({ eliminada: true }, 100)).toThrow('eliminada');
  expect(calcularEmisionActual({ precioFinal: 100, montoPagado: 1, pagos: [{ monto: 100, verificado: true }] }, 100)).toMatchObject({ montoPagado: 100, estadoPago: 'completo', estadoConduce: 'pagada' });
});
it('comisión usa ajuste firmado y excluye ambas formas anuladas', () => {
  expect(totalComisionesConduce([{ comisionMonto: 1000, descuentoPorGarantia: { monto: -200 } }, { comisionMonto: 300, estaAnulada: true }, { comisionMonto: 400, estadoLiquidacion: 'anulada' }])).toBe(800);
});
