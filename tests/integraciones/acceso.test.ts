import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { VercelRequest } from '@vercel/node';
const mock = vi.hoisted(() => ({ verify: vi.fn(), perfil: vi.fn() }));
vi.mock('../../api/_lib/firebaseAdmin.js', () => ({ getAdminAuth: () => ({ verifyIdToken: mock.verify }), getAdminFirestore: () => ({ collection: () => ({ doc: () => ({ get: async () => ({ data: mock.perfil }) }) }) }) }));
import { accesoEquipo } from '../../api/_lib/accesoEquipo';
describe('Acceso a servicios del equipo', () => {
  beforeEach(() => { mock.verify.mockResolvedValue({ uid: 'uid-real' }); mock.perfil.mockReturnValue({ rol: 'secretaria', activo: true }); });
  it('rechaza acceso anónimo', async () => { await expect(accesoEquipo({ headers: {} } as VercelRequest)).rejects.toMatchObject({ status: 401 }); });
  it('rechaza tokens inválidos', async () => { mock.verify.mockRejectedValue(new Error()); await expect(accesoEquipo({ headers: { authorization: 'Bearer invalid' } } as VercelRequest)).rejects.toMatchObject({ status: 401 }); });
  it('no concede acceso a autenticados sin perfil', async () => { mock.perfil.mockReturnValue(undefined); await expect(accesoEquipo({ headers: { authorization: 'Bearer test' } } as VercelRequest)).rejects.toMatchObject({ status: 403 }); });
  it('rechaza empleados inactivos y eliminados', async () => {
    for (const perfil of [{ rol: 'administrador', activo: false }, { rol: 'administrador', eliminado: true }]) { mock.perfil.mockReturnValue(perfil); await expect(accesoEquipo({ headers: { authorization: 'Bearer test' } } as VercelRequest)).rejects.toMatchObject({ status: 403 }); }
  });
  it('usa UID verificado y comprueba revocación', async () => { const result = await accesoEquipo({ headers: { authorization: 'Bearer test' } } as VercelRequest); expect(result.uid).toBe('uid-real'); expect(result.rol).toBe('secretaria'); expect(mock.verify).toHaveBeenCalledWith('test', true); });
});
