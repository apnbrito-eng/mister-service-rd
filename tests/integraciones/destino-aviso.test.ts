import { beforeEach, describe, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ rol: 'tecnico', notice: { userId: 'u1', ordenId: 'orden-42' }, acceso: vi.fn() }));
vi.mock('../../api/_lib/accesoEquipo.js', () => ({
  ErrorAcceso: class extends Error { constructor(public status: number, message: string) { super(message); } },
  accesoEquipo: async () => ({ uid: 'u1', rol: m.rol, db: { collection: () => ({ doc: () => ({ get: async () => ({ data: () => m.notice }) }) }) } }),
}));
vi.mock('../../api/_lib/accesoOrdenTecnico.js', () => ({ accesoOrdenTecnico: m.acceso }));
import handler from '../../api/crm/destino-aviso';
import { ErrorAcceso } from '../../api/_lib/accesoEquipo';
beforeEach(() => { m.rol = 'tecnico'; m.notice = { userId: 'u1', ordenId: 'orden-42' }; m.acceso.mockReset().mockResolvedValue({}); });
async function run() {
  const res: any = { setHeader: vi.fn(), status: vi.fn().mockReturnThis(), json: vi.fn() };
  await handler({ method: 'GET', query: { id: 'aviso-1' } } as any, res);
  return res;
}
describe('Destino autorizado del aviso', () => {
  it('abre la orden exacta en la vista del técnico después de validar su asignación', async () => {
    const res = await run();
    expect(m.acceso).toHaveBeenCalledWith(expect.anything(), 'u1', 'orden-42');
    expect(res.json).toHaveBeenCalledWith({ ruta: '/tecnico?orden=orden-42' });
  });
  it('rechaza un aviso cuya orden fue reasignada', async () => {
    m.acceso.mockRejectedValue(new ErrorAcceso(403, 'Reasignada'));
    const res = await run(); expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).not.toHaveBeenCalledWith(expect.objectContaining({ ruta: expect.anything() }));
  });
  it('no abre avisos de otra persona', async () => {
    m.notice.userId = 'otra'; const res = await run();
    expect(res.status).toHaveBeenCalledWith(403); expect(m.acceso).not.toHaveBeenCalled();
  });
  it('conserva la vista de oficina para supervisión', async () => {
    m.rol = 'coordinadora'; const res = await run();
    expect(res.json).toHaveBeenCalledWith({ ruta: '/admin/ordenes/orden-42' });
  });
});
