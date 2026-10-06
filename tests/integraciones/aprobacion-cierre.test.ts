import { describe, it, expect } from 'vitest';
import { tieneAprobacionCierre } from '../../src/utils/aprobacionCierre';
describe('autorización del cierre técnico', () => {
  it('impide cerrar una cita nueva aunque no exista precio sugerido', () => {
    expect(tieneAprobacionCierre({})).toBe(false);
  });
  it('rechaza pendientes y rechazadas', () => {
    for (const estadoAprobacion of ['pendiente', 'rechazado'])
      expect(tieneAprobacionCierre({ estadoAprobacion })).toBe(false);
  });
  it('conserva aprobaciones de órdenes anteriores al CRM', () => {
    expect(tieneAprobacionCierre({ estadoAprobacion: 'aprobado' })).toBe(true);
  });
  it('exige aprobar nuevamente una propuesta modificada', () => {
    expect(tieneAprobacionCierre({ estadoAprobacion: 'aprobado', propuestaCrmRevision: 2, propuestaCrmAprobada: 1 })).toBe(false);
    expect(tieneAprobacionCierre({ estadoAprobacion: 'aprobado', propuestaCrmRevision: 2, propuestaCrmAprobada: 2 })).toBe(true);
  });
});

it('bloquea aprobación inconsistente mientras el presupuesto no fue aceptado', () => {
  for (const presupuestoEstado of ['cambio_solicitado', 'pendiente_cliente', 'rechazado'])
    expect(tieneAprobacionCierre({ estadoAprobacion: 'aprobado', presupuestoEstado })).toBe(false);
  expect(tieneAprobacionCierre({ estadoAprobacion: 'aprobado', presupuestoEstado: 'aceptado' })).toBe(true);
});
it('conserva solo chequeo aprobado aunque quede el presupuesto de reparación anterior', () => {
  expect(tieneAprobacionCierre({ estadoAprobacion: 'aprobado', soloChequeo: true, presupuestoEstado: 'cambio_solicitado' })).toBe(true);
  expect(tieneAprobacionCierre({ estadoAprobacion: 'pendiente', soloChequeo: true })).toBe(false);
});
