import { describe, expect, it } from 'vitest';
import { esOrdenAsignada } from '../../src/utils/asignacionTecnico';
describe('Identidad de la asignación técnica', () => {
  it('acepta UID y perfil legacy exactos', () => {
    expect(esOrdenAsignada({ tecnicoId: 'uid-1' }, 'uid-1', 'personal-1')).toBe(true);
    expect(esOrdenAsignada({ tecnicoId: 'personal-1' }, 'uid-1', 'personal-1')).toBe(true);
  });
  it('rechaza otra cuenta aunque comparta nombre', () => {
    const orden = { tecnicoId: 'uid-2', tecnicoNombre: 'Juan Pérez' };
    expect(esOrdenAsignada(orden, 'uid-1', 'personal-1')).toBe(false);
  });
  it('no atribuye órdenes sin técnico ni sesiones sin identidad', () => {
    expect(esOrdenAsignada({}, undefined, undefined)).toBe(false);
    expect(esOrdenAsignada({ tecnicoId: 'uid-1' })).toBe(false);
  });
});
