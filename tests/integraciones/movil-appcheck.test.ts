import { beforeEach, afterEach, it, expect, vi } from 'vitest';
const m = vi.hoisted(() => ({ verificar: vi.fn() }));
vi.mock('firebase-admin/app-check', () => ({ getAppCheck: () => ({ verifyToken: m.verificar }) }));
vi.mock('../../api/_lib/firebaseAdmin.js', () => ({ getAdminApp: vi.fn() }));
import { exigirAppMovil } from '../../api/_lib/appMovilVerificada';
beforeEach(() => { vi.resetAllMocks(); vi.stubEnv('MOBILE_FIREBASE_APP_IDS', 'android-autorizada,ios-autorizada'); });
afterEach(() => vi.unstubAllEnvs());
it('falla de forma cerrada si falta configuración o token', async () => {
  await expect(exigirAppMovil({ headers: {} } as any)).rejects.toMatchObject({ status: 403 });
  vi.stubEnv('MOBILE_FIREBASE_APP_IDS', '');
  await expect(exigirAppMovil({ headers: {} } as any)).rejects.toMatchObject({ status: 503 });
  expect(m.verificar).not.toHaveBeenCalled();
});
it('rechaza token inválido o válido de otra aplicación', async () => {
  const req = { headers: { 'x-firebase-appcheck': 'prueba' } } as any;
  m.verificar.mockRejectedValueOnce(Error('invalid'));
  await expect(exigirAppMovil(req)).rejects.toMatchObject({ status: 403 });
  m.verificar.mockResolvedValue({ appId: 'web-no-autorizada' });
  await expect(exigirAppMovil(req)).rejects.toMatchObject({ status: 403 });
});
it('admite únicamente una aplicación nativa verificada y permitida', async () => {
  m.verificar.mockResolvedValue({ appId: 'ios-autorizada' });
  await expect(exigirAppMovil({ headers: { 'x-firebase-appcheck': 'prueba' } } as any)).resolves.toBeUndefined();
});
