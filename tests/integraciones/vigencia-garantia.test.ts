import { describe, it, expect } from 'vitest';
import { resolverVigenciaGarantia as resolver, fechaGarantia } from '../../api/_lib/vigenciaGarantia';
const now = new Date('2026-09-21T12:00:00Z');
const factura = { garantia: { tiempoDias: 30, inicioFecha: '2026-09-01', finFecha: '2026-10-01', estado: 'vigente' } };
describe('Vigencia pública única', () => {
  it('respeta la fecha nueva aunque la heredada no haya vencido', () => {
    expect(resolver(factura, { garantiaVencimiento: '2026-09-20' }, now).estado).toBe('expirada');
  });
  it('sin fecha válida exige revisión de oficina', () => {
    for (const finFecha of [undefined, 'inválida', new Date(NaN)])
      expect(resolver({ garantia: { finFecha } }, null, now).estado).toBe('por_confirmar');
  });
  it('no rescata una fecha nueva corrupta con una fecha heredada', () => {
    expect(resolver(factura, { garantiaVencimiento: 'inválida' }, now).estado).toBe('por_confirmar');
  });
  it('mantiene reclamos y garantías atendidas sin reabrirlas', () => {
    for (const estado of ['reclamada', 'atendida'])
      expect(resolver({ garantia: { estado } }, null, now).estado).toBe(estado);
  });
  it('permite el instante de vencimiento y rechaza el siguiente', () => {
    const f = { garantia: { finFecha: now } };
    expect(resolver(f, null, now).estado).toBe('vigente');
    expect(resolver(f, null, new Date(now.getTime() + 1)).estado).toBe('expirada');
  });
  it('fechas invertidas o inicio futuro no son vigentes', () => {
    expect(resolver(factura, { cierreServicio: { fechaCierre: '2026-11-01' } }, now).estado).toBe('por_confirmar');
  });
  it('una fecha inválida nunca se convierte en hoy', () => {
    expect(fechaGarantia({ toDate: () => new Date(NaN) })).toBeNull();
    expect(fechaGarantia({ toDate: () => { throw Error('bad'); } })).toBeNull();
  });
});
