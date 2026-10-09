import { describe, expect, it, vi, beforeEach } from 'vitest';
import { normalizarCodigoEmpleado } from '../../src/utils/codigoEmpleado';
const mock = vi.hoisted(() => ({ set: vi.fn(), update: vi.fn(), commit: vi.fn() }));
vi.mock('../../src/firebase/config', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
  doc: (_db: unknown, coleccion: string, id: string) => ({ path: `${coleccion}/${id}`, id }),
  writeBatch: () => mock,
  deleteField: () => 'BORRAR-CAMPO',
}));
import { guardarFichaPersonal } from '../../src/services/personal.service';
import type { DocumentReference } from 'firebase/firestore';
const ref = { path: 'personal/personal-1', id: 'personal-1' } as DocumentReference;
beforeEach(() => vi.clearAllMocks());
describe('código administrativo de empleado', () => {
  it('conserva vacío legacy y normaliza solamente espacios exteriores', () => {
    expect(normalizarCodigoEmpleado(undefined)).toBeUndefined();
    expect(normalizarCodigoEmpleado('  ')).toBeUndefined();
    expect(normalizarCodigoEmpleado(' EMP-001.a ')).toBe('EMP-001.a');
  });
  it('rechaza longitud excesiva, espacios internos y símbolos de ruta', () => {
    for (const valor of ['a'.repeat(31), 'EMP 001', '../001', 'EMP/001']) {
      expect(() => normalizarCodigoEmpleado(valor)).toThrow();
    }
  });
  it('persiste código privado y cambios públicos en un único batch merge', async () => {
    await guardarFichaPersonal(ref, { codigoEmpleado: ' EMP-001 ', nombre: 'Empleado' });
    expect(mock.set).toHaveBeenCalledWith({ path: 'personal_privado/personal-1', id: 'personal-1' }, { codigoEmpleado: 'EMP-001' }, { merge: true });
    expect(mock.update).toHaveBeenCalledWith(ref, { nombre: 'Empleado' });
    expect(mock.commit).toHaveBeenCalledTimes(1);
  });
  it('vaciar código borra solo ese campo sin sobreescribir datos privados', async () => {
    await guardarFichaPersonal(ref, { codigoEmpleado: '' });
    expect(mock.set).toHaveBeenCalledWith(expect.anything(), { codigoEmpleado: 'BORRAR-CAMPO' }, { merge: true });
    expect(mock.update).not.toHaveBeenCalled();
  });
  it('entrada inválida no llega a commit', async () => {
    await expect(guardarFichaPersonal(ref, { codigoEmpleado: 'mal/codigo' })).rejects.toThrow();
    expect(mock.commit).not.toHaveBeenCalled();
  });
});
