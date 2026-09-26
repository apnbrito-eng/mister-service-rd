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
