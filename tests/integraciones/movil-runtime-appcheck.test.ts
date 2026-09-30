import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ token: vi.fn(), request: vi.fn(), original: vi.fn(), listener: vi.fn() }));
vi.mock('@capacitor-firebase/app-check', () => ({ FirebaseAppCheck: { getToken: m.token } }));
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => true, getPlatform: () => 'android' }, CapacitorHttp: { request: m.request } }));
vi.mock('@capacitor/app', () => ({ App: { addListener: m.listener, minimizeApp: vi.fn() } }));
vi.mock('../../src/mobile/capas', () => ({ cerrarCapaSuperior: vi.fn() }));
import { iniciarRuntimeMovil } from '../../src/mobile/runtime';
beforeEach(async () => {
  vi.clearAllMocks();
  vi.stubEnv('VITE_MOBILE_API_ORIGIN', 'https://app.example.test');
  vi.stubGlobal('window', { fetch: m.original });
  vi.stubGlobal('document', { documentElement: { classList: { add: vi.fn() } } });
  m.token.mockReset().mockResolvedValue({ token: 'token-inicial' });
  m.request.mockReset().mockResolvedValue({ status: 200, data: '{}', headers: {} });
  m.original.mockResolvedValue(new Response('{}'));
  await iniciarRuntimeMovil();
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
it.each(['/api/movil/chat', '/api/movil/chat?cursor=uno', '/api/movil/estado'])('adjunta token únicamente al transporte propio %s', async ruta => {
  await window.fetch(ruta, { method: 'POST', body: '{"texto":"QA"}', headers: { Authorization: 'Bearer ficticio', 'X-Firebase-AppCheck': 'viejo' } });
  expect(m.token).toHaveBeenCalledWith({ forceRefresh: false });
  expect(m.request).toHaveBeenCalledWith(expect.objectContaining({ url: 'https://app.example.test' + ruta, headers: expect.objectContaining({ 'x-firebase-appcheck': 'token-inicial', authorization: 'Bearer ficticio' }), disableRedirects: true }));
  expect(Object.keys(m.request.mock.calls[0][0].headers).filter(k => k.toLowerCase() === 'x-firebase-appcheck')).toHaveLength(1);
});
it('403 refresca una sola vez y devuelve el segundo 403 sin bucle', async () => {
  const tokens: string[] = [];
  m.token.mockResolvedValueOnce({ token: 'inicial' }).mockResolvedValueOnce({ token: 'fresco' });
  m.request.mockImplementation(async (p: { headers: Record<string, string> }) => { tokens.push(p.headers['x-firebase-appcheck']); return { status: 403, data: '{}', headers: {} }; });
  expect((await window.fetch('/api/movil/chat')).status).toBe(403);
  expect(tokens).toEqual(['inicial', 'fresco']);
  expect(m.token.mock.calls).toEqual([[{ forceRefresh: false }], [{ forceRefresh: true }]]);
  expect(m.request).toHaveBeenCalledTimes(2);
});
it.each(['https://externo.test/api/movil/chat', '//externo.test/api/movil/chat'])('destino externo conserva fetch original sin adquirir token: %s', async url => {
  await window.fetch(url);
  expect(m.original).toHaveBeenCalledWith(url, undefined);
  expect(m.token).not.toHaveBeenCalled(); expect(m.request).not.toHaveBeenCalled();
});
it.each(['/api/movil/chat/otra', '/api/movil/chats', '/api/otro'])('ruta no exacta %s no recibe token ni refresco', async ruta => {
  m.request.mockResolvedValue({ status: 403, data: '{}', headers: {} });
  await window.fetch(ruta);
  expect(m.token).not.toHaveBeenCalled(); expect(m.request).toHaveBeenCalledOnce();
  expect(m.request.mock.calls[0][0].headers).not.toHaveProperty('x-firebase-appcheck');
});
it('sin token inicial no envía solicitud protegida', async () => {
  m.token.mockResolvedValue({ token: '' });
  await expect(window.fetch('/api/movil/chat')).rejects.toThrow('No se pudo verificar');
  expect(m.request).not.toHaveBeenCalled();
});
