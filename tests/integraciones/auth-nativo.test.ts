import { afterEach, expect, it, vi } from 'vitest';
import { browserPopupRedirectResolver } from 'firebase/auth';
import { deleteApp, getApps } from 'firebase/app';

vi.mock('firebase/auth', () => import('../../node_modules/firebase/node_modules/@firebase/auth/dist/esm2017/index.js'));
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => true } }));
vi.mock('@capacitor-firebase/app-check', () => ({ FirebaseAppCheck: { initialize: vi.fn().mockResolvedValue(undefined) } }));
vi.mock('firebase/app-check', () => ({
  initializeAppCheck: vi.fn(() => ({})), CustomProvider: class {}, ReCaptchaV3Provider: class {},
}));
afterEach(async () => {
  vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs();
  await Promise.all(getApps().map(app => deleteApp(app)));
});
it('prepara sesión nativa aunque el resolver web de iOS no responda, conservando la persistencia del SDK', async () => {
  vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 27_0 like Mac OS X) AppleWebKit/605.1.15', onLine: true });
  for (const [key, value] of Object.entries({
    VITE_FIREBASE_API_KEY: 'test-key', VITE_FIREBASE_AUTH_DOMAIN: 'test.invalid',
    VITE_FIREBASE_PROJECT_ID: 'test-native-auth', VITE_FIREBASE_STORAGE_BUCKET: 'test.invalid',
    VITE_FIREBASE_MESSAGING_SENDER_ID: '123', VITE_FIREBASE_APP_ID: '1:123:web:test',
  })) vi.stubEnv(key, value);
  // Reproduce el bloqueo del resolver de ventanas: no termina ni rechaza.
  const popup = vi.spyOn(browserPopupRedirectResolver.prototype as any, '_initialize')
    .mockImplementation(() => new Promise(() => {}));
  const { auth } = await import('../../src/firebase/config');
  await Promise.race([
    auth.authStateReady(),
    new Promise((_, reject) => setTimeout(() => reject(new Error('La sesión quedó esperando al navegador')), 500)),
  ]);
  expect(auth.currentUser).toBeNull();
  expect(popup).not.toHaveBeenCalled();
});
