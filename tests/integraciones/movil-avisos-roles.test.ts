import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ rol: 'administrador', activo: true, send: vi.fn(), acceso: vi.fn(), db: null as any }));
vi.mock('firebase-admin/messaging', () => ({ getMessaging: () => ({ send: m.send }) }));
vi.mock('../../api/_lib/firebaseAdmin.js', () => ({ getAdminApp: () => ({}), getAdminFirestore: () => m.db }));
vi.mock('../../api/_lib/accesoOrdenTecnico.js', () => ({ accesoOrdenTecnico: m.acceso }));
import handler from '../../api/movil/avisos';
const saved = process.env.MOBILE_CRON_SECRET;
beforeEach(() => {
  vi.stubEnv('CRON_SECRET', '');
  vi.stubEnv('MOBILE_PUSH_ENABLED', 'true'); vi.stubEnv('ALLOW_EXTERNAL_SENDS', 'true');
  process.env.MOBILE_CRON_SECRET = 'prueba-local-sin-envios'; m.activo = true; m.send.mockReset().mockResolvedValue('ficticio'); m.acceso.mockReset().mockResolvedValue({});
  const leaseRef = { update: vi.fn().mockResolvedValue(undefined) };
  const notice = { id: 'n1', data: () => ({ userId: 'u1', ordenId: 'o1', leida: false }) };
  const device = { id: 'd1', data: () => ({ activo: true, token: 'ficticio' }), ref: { delete: vi.fn() } };
  function query(docs: any[]) { return { where: () => query(docs), orderBy: () => query(docs), limit: () => query(docs), get: async () => ({ docs, size: docs.length }) }; }
  m.db = { collection: (name: string) => name === 'config' ? { doc: () => ({ get: async () => ({ data: () => undefined }), set: vi.fn() }) } : name === 'notificaciones' ? query([notice]) : name === 'usuarios' ? { doc: () => ({ get: async () => ({ data: () => ({ rol: m.rol, activo: m.activo }) }) }) } : name === 'dispositivos_moviles' ? query([device]) : { doc: () => leaseRef }, runTransaction: async (fn: any) => fn({ get: async () => ({ data: () => undefined }), set: vi.fn() }) };
});
afterEach(() => { vi.unstubAllEnvs(); if (saved === undefined) delete process.env.MOBILE_CRON_SECRET; else process.env.MOBILE_CRON_SECRET = saved; });
async function run() {
  const res: any = { setHeader() {}, status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() };
  await handler({ method: 'POST', headers: { authorization: 'Bearer prueba-local-sin-envios' } } as any, res);
  return res;
}
describe('Avisos móviles según destinatario', () => {
  it('mantiene bloqueados los envíos mientras no se active el canal o el ensayo los prohíba', async () => {
    vi.stubEnv('MOBILE_PUSH_ENABLED', 'false'); await run(); expect(m.send).not.toHaveBeenCalled();
    vi.stubEnv('MOBILE_PUSH_ENABLED', 'true'); vi.stubEnv('ALLOW_EXTERNAL_SENDS', 'false'); await run(); expect(m.send).not.toHaveBeenCalled();
  });
  it.each(['administrador', 'coordinadora', 'secretaria', 'operaria', 'tecnico'])('admite %s con texto sin datos del cliente', async rol => {
    m.rol = rol; const res = await run(); expect(res.status).toHaveBeenCalledWith(200); expect(m.send).toHaveBeenCalledTimes(1);
    expect(m.send.mock.calls[0][0].notification.body).toBe('Tienes una actualización de trabajo. Abre la app para revisarla.');
    expect(m.acceso).toHaveBeenCalledTimes(rol === 'tecnico' ? 1 : 0);
  });
  it('no envía al técnico cuando la orden ya no le corresponde', async () => {
    m.rol = 'tecnico'; m.acceso.mockRejectedValue(new Error('Reasignada')); await run(); expect(m.send).not.toHaveBeenCalled();
  });
  it('no envía a cuentas suspendidas ni roles ajenos', async () => {
    m.rol = 'administrador'; m.activo = false; await run(); expect(m.send).not.toHaveBeenCalled();
    m.rol = 'ayudante'; m.activo = true; await run(); expect(m.send).not.toHaveBeenCalled();
  });
});
