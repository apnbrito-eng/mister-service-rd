import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ acceso: vi.fn() }));
vi.mock('../../api/_lib/accesoEquipo.js', () => ({ accesoEquipo: mocks.acceso, ErrorAcceso: class extends Error { constructor(public status: number, mensaje: string) { super(mensaje); } } }));
vi.mock('firebase-admin/firestore', () => ({ FieldValue: { serverTimestamp: () => 'timestamp-servidor' } }));
import handler from '../../api/movil/actividad-orden';

function fixture() {
  const docs = new Map<string, Record<string, unknown>>([
    ['usuarios/sec', { rol: 'secretaria', nombre: 'Leany', activo: true }],
    ['usuarios/op', { rol: 'operaria', nombre: 'Wila', activo: true }],
    ['usuarios/coord', { rol: 'coordinadora', activo: true }],
    ['usuarios/admin', { rol: 'administrador', activo: true }],
    ['usuarios/tec', { rol: 'tecnico', activo: true }],
    ['usuarios/otra', { rol: 'secretaria', activo: true }],
    ['personal/sec-legacy', { uid: 'sec', operariaId: 'op-personal', activo: true }],
    ['personal/op-personal', { uid: 'op', activo: true }],
    ['personal/otra-personal', { uid: 'otra', operariaId: 'otro-equipo', activo: true }],
    ['personal/tec-legacy', { uid: 'tec', activo: true }],
    ['ordenes_servicio/os-1', { tecnicoId: 'tec-legacy', operariaId: 'op', fase: 'agendado', clienteNombre: 'Prueba', numero: 'OS-1' }],
  ]);
  interface Ref { path: string; filter?: { key: string; op: string; value: unknown }; query?: boolean; collection: (name: string) => Ref; doc: (id: string) => Ref; where: (key: string, op: string, value: unknown) => Ref; id: string }
  const ref = (path: string, query = false, filter?: Ref['filter']): Ref => ({ path, query, filter, id: path.split('/').at(-1)!, collection: name => ref(`${path}/${name}`, true), doc: id => ref(`${path}/${id}`), where: (key, op, value) => ref(path, true, { key, op, value }) });
  const snapshot = (path: string) => ({ id: path.split('/').at(-1), exists: docs.has(path), data: () => docs.get(path) });
  const writes: string[] = [];
  const tx = {
    get: async (r: Ref) => r.query ? { docs: [...docs.keys()].filter(path => path.startsWith(r.path + '/') && path.split('/').length === r.path.split('/').length + 1).filter(path => !r.filter || (r.filter.op === 'in' ? (r.filter.value as string[]).includes(String(docs.get(path)?.[r.filter.key])) : docs.get(path)?.[r.filter.key] === r.filter.value)).map(snapshot) } : snapshot(r.path),
    create: (r: Ref, value: Record<string, unknown>) => { docs.set(r.path, value); writes.push(r.path); },
    set: (r: Ref, value: Record<string, unknown>) => { docs.set(r.path, value); writes.push(r.path); },
    update: (r: Ref, value: Record<string, unknown>) => { docs.set(r.path, { ...docs.get(r.path), ...value }); writes.push(r.path); },
  };
  const db = { doc: (p: string) => ref(p), collection: (p: string) => ref(p, true), runTransaction: async (fn: (t: typeof tx) => unknown) => fn(tx) };
  return { docs, db, writes };
}
async function call(accion = 'whatsapp', intentoId = 'intento-0001') {
  const res = { status: vi.fn(), json: vi.fn(), setHeader: vi.fn() };
  res.status.mockReturnValue(res);
  await handler({ method: 'POST', body: { ordenId: 'os-1', accion, intentoId } } as never, res as never);
  return res;
}
beforeEach(() => vi.clearAllMocks());
describe('actividad de orden: equipo y salida', () => {
  it('secretaria se autoriza desde Personal y notifica solamente al equipo, coordinadora y gerente', async () => {
    const { db, docs } = fixture(); mocks.acceso.mockResolvedValue({ db, uid: 'sec', rol: 'secretaria' });
    expect((await call()).status).toHaveBeenCalledWith(200);
    const avisos = [...docs.entries()].filter(([key]) => key.startsWith('notificaciones/')).map(([, d]) => d.userId).sort();
    expect(avisos).toEqual(['admin', 'coord', 'op', 'sec']);
    expect(docs.get('ordenes_servicio/os-1/actividad/sec_intento-0001')?.detalle).toContain('envío no confirmado');
  });
  it('secretaria de otro equipo no puede registrar ni recibir datos de la orden', async () => {
    const { db, writes } = fixture(); mocks.acceso.mockResolvedValue({ db, uid: 'otra', rol: 'secretaria' });
    expect((await call()).status).toHaveBeenCalledWith(403);
    expect(writes).toHaveLength(0);
  });
  it('visita cancelada bloquea salida sin registrar GPS ni avisos', async () => {
    const { db, docs, writes } = fixture(); docs.get('ordenes_servicio/os-1')!.visitaCancelada = { motivo: 'Cliente ausente' };
    mocks.acceso.mockResolvedValue({ db, uid: 'tec', rol: 'tecnico' });
    expect((await call('salida')).status).toHaveBeenCalledWith(409);
    expect(writes).toHaveLength(0);
  });
  it('salida del técnico asignado legacy se registra una vez por intento', async () => {
    const { db, docs, writes } = fixture(); mocks.acceso.mockResolvedValue({ db, uid: 'tec', rol: 'tecnico' });
    expect((await call('salida')).status).toHaveBeenCalledWith(200);
    const total = writes.length;
    expect((await call('salida')).status).toHaveBeenCalledWith(200);
    expect(writes).toHaveLength(total);
    expect(docs.get('ordenes_servicio/os-1')?.salidaTecnico).toEqual({ uid: 'tec', fecha: 'timestamp-servidor' });
  });
  it('un empleado inactivo queda denegado aunque la autenticación haya ocurrido antes', async () => {
    const { db, docs, writes } = fixture(); docs.get('usuarios/sec')!.activo = false;
    mocks.acceso.mockResolvedValue({ db, uid: 'sec', rol: 'secretaria' });
    expect((await call()).status).toHaveBeenCalledWith(403);
    expect(writes).toHaveLength(0);
  });
});
