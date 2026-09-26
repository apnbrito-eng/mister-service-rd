import { expect, it, vi } from 'vitest';
vi.mock('../../src/firebase/config', () => ({ db: {} }));
vi.mock('../../src/utils/index', () => ({ crearRegistroAuditoria: vi.fn() }));
import { calcularComisionesProporcionales } from '../../src/utils/comisiones';
it('la base mostrada coincide con la ganancia sobre la que se aplica el porcentaje', () => {
  const resultados = calcularComisionesProporcionales({
    items: [{ descripcion: 'Bomba', cantidad: 1, precio: 3000, tipoItem: 'pieza', costoCompra: 3000, tecnicoId: 't' }, { descripcion: 'Servicio', cantidad: 1, precio: 5000, tecnicoId: 't' }],
    totalConItbis: 8000, costoPiezasTotal: 3000, itbisPorcentaje: 18,
    getTecnico: () => ({ nombre: 'Prueba', porcentaje: 20 }),
  });
  expect(resultados[0].baseSinItbisAsignada).toBe(3779.66);
  expect(resultados[0].monto).toBe(755.93);
});
