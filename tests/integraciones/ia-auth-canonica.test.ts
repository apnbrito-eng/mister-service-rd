import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import type { VercelRequest, VercelResponse } from '@vercel/node';
const m = vi.hoisted(() => ({ verificar: vi.fn(), perfil: vi.fn(), coleccion: vi.fn() }));
vi.mock('../../api/_lib/firebaseAdmin.js', () => ({ verificarAppCheck: async () => ({ ok: true }), getAdminAuth: () => ({ verifyIdToken: m.verificar }), getAdminFirestore: () => ({ collection: m.coleccion }) }));
import handler from '../../api/ai/chat';
function response() { const r = { status: vi.fn(), json: vi.fn() }; r.status.mockReturnValue(r); return r; }
const req = { method: 'POST', headers: { authorization: 'Bearer prueba' }, body: { mensajes: [{ role: 'user', content: 'Hola' }] } } as VercelRequest;
beforeEach(() => { vi.clearAllMocks(); vi.stubEnv('ANTHROPIC_API_KEY', 'test-placeholder'); m.verificar.mockResolvedValue({ uid: 'qa', email: 'qa@example.test' }); m.coleccion.mockReturnValue({ doc: () => ({ get: m.perfil }) }); });
afterEach(() => vi.unstubAllEnvs());
it.each(['auth/id-token-revoked','auth/user-disabled','auth/id-token-expired'])('bloquea token %s y verifica revocación', async code => {
  m.verificar.mockRejectedValueOnce({ code }); const r = response();
  await handler(req, r as unknown as VercelResponse);
  expect(m.verificar).toHaveBeenCalledWith('prueba', true); expect(r.status).toHaveBeenCalledWith(401); expect(m.coleccion).not.toHaveBeenCalled();
});
it.each([null, { rol: 'administrador', activo: false, iaHabilitada: true }, { rol: 'administrador', eliminado: true, iaHabilitada: true }])('rechaza perfil canónico ausente o bloqueado sin recuperar por email', async data => {
  m.perfil.mockResolvedValue({ exists: !!data, data: () => data }); const r = response();
  await handler(req, r as unknown as VercelResponse);
  expect(r.status).toHaveBeenCalledWith(403); expect(m.coleccion).toHaveBeenCalledTimes(1); expect(m.coleccion).toHaveBeenCalledWith('usuarios');
});
