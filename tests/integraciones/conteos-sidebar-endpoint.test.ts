import { beforeEach, expect, it, vi } from 'vitest';
import type { VercelRequest, VercelResponse } from '@vercel/node';
const m = vi.hoisted(() => ({ auth: vi.fn(), app: vi.fn(), profile: vi.fn(), contar: vi.fn() }));
vi.mock('../../api/_lib/accesoEquipo.js', () => ({ accesoEquipo: m.auth, ErrorAcceso: class extends Error { constructor(public status: number, message: string) { super(message); } } }));
vi.mock('../../api/_lib/firebaseAdmin.js', () => ({ exigirAppCheck: m.app }));
vi.mock('../../api/_lib/conteosSidebar.js', () => ({ obtenerConteosSidebar: m.contar }));
import handler from '../../api/sidebar/conteos';
import { ErrorAcceso } from '../../api/_lib/accesoEquipo';
function respuesta() { const r = { setHeader: vi.fn(), status: vi.fn(), json: vi.fn() }; r.status.mockReturnValue(r); return r; }
beforeEach(() => { vi.clearAllMocks(); m.app.mockResolvedValue({ ok: true }); m.profile.mockResolvedValue({ data: () => ({ rol: 'administrador', activo: true }) }); m.auth.mockResolvedValue({ uid: 'admin', db: { collection: () => ({ doc: () => ({ get: m.profile }) }) } }); m.contar.mockResolvedValue({ conteos: {} }); });
it('exige AppCheck y sesión y relee perfil en cada solicitud sin cachear', async () => {
  const r = respuesta();
  for (let i = 0; i < 2; i++) await handler({ method: 'GET' } as VercelRequest, r as unknown as VercelResponse);
  expect(m.app).toHaveBeenCalledTimes(2); expect(m.auth).toHaveBeenCalledTimes(2); expect(m.profile).toHaveBeenCalledTimes(2);
  expect(r.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');
});
it('bloquea fallo AppCheck antes de auth y sesión inválida antes de contar', async () => {
  const r = respuesta(); m.app.mockRejectedValueOnce(Object.assign(new Error('invalid'), { status: 403 }));
  await handler({ method: 'GET' } as VercelRequest, r as unknown as VercelResponse);
  expect(r.status).toHaveBeenCalledWith(403); expect(m.auth).not.toHaveBeenCalled();
  m.auth.mockRejectedValueOnce(new ErrorAcceso(401, 'Inicia sesión'));
  await handler({ method: 'GET' } as VercelRequest, r as unknown as VercelResponse);
  expect(r.status).toHaveBeenCalledWith(401); expect(m.contar).not.toHaveBeenCalled();
});
