import { beforeEach, describe, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ docs: new Map<string, Record<string, unknown>>(), writes: [] as Array<[string, Record<string, unknown>]>, usuarios: [] as Array<{ id: string; data: () => Record<string, unknown> }>, personal: [] as Array<{ id: string; data: () => Record<string, unknown> }> }));
vi.mock('../../src/firebase/config', () => ({ db: {}, auth: { currentUser: { uid: 'actor' } } }));
vi.mock('../../src/utils/resolverChatCliente', () => ({ resolverChatCliente: vi.fn() }));
vi.mock('firebase/firestore', () => ({
  collection: (_: unknown, path: string) => path, doc: (_: unknown, col: string, id: string) => `${col}/${id}`,
  getDoc: vi.fn(), getDocs: async (col: string) => ({ docs: col === 'usuarios' ? m.usuarios : m.personal }),
  Timestamp: { now: () => 'fecha' }, increment: (n: number) => n, arrayUnion: (...v: unknown[]) => v, query: (v: unknown) => v, where: () => null,
  runTransaction: async (_: unknown, cb: (tx: unknown) => unknown) => {
    const writes: typeof m.writes = [];
    await cb({ get: async (path: string) => ({ ref: path, exists: () => m.docs.has(path), data: () => m.docs.get(path) }), update: (path: string, data: Record<string, unknown>) => writes.push([path, data]), set: (path: string, data: Record<string, unknown>) => writes.push([path, data]) });
    for (const [path, data] of writes) m.docs.set(path, { ...m.docs.get(path), ...data });
    m.writes.push(...writes);
  },
}));
import { cambiarEstadoTaller, guardarSolicitudPieza, registrarLlegadaPieza, vincularEquipoOrden, recibirEquipoTaller } from '../../src/services/flujoPiezasTaller.service';
beforeEach(() => { m.docs.clear(); m.writes.length = 0; m.usuarios = [{ id: 'admin-uid', data: () => ({ activo: true, rol: 'administrador' }) }]; m.personal = [{ id: 'admin-personal', data: () => ({ uid: 'admin-uid', activo: true, rol: 'administrador' }) }]; });
describe('piezas y taller', () => {
  it('repetir standby conserva solicitud y detalle', async () => {
    m.docs.set('equipos_taller/e', { clienteNombre: 'Cliente' });
    await cambiarEstadoTaller('e', 'en_standby');
    m.docs.set('standby_piezas/taller_e', { piezaFaltante: 'Motor', estado: 'buscando' });
    await cambiarEstadoTaller('e', 'en_standby');
    expect(m.docs.get('standby_piezas/taller_e')?.piezaFaltante).toBe('Motor');
    expect(m.writes.filter(([p]) => p.startsWith('standby_piezas'))).toHaveLength(1);
  });
  it('descartado requiere motivo y conserva actor', async () => {
    m.docs.set('equipos_taller/e', {});
    await expect(cambiarEstadoTaller('e', 'descartado', '')).rejects.toThrow('Explica');
    expect(m.writes).toHaveLength(0);
    await cambiarEstadoTaller('e', 'descartado', 'Daño irreparable');
    expect(m.docs.get('equipos_taller/e')).toMatchObject({ estado: 'descartado', descartadoPor: 'actor' });
  });
  it('llegada repetida genera aviso una vez y no reactiva orden', async () => {
    m.docs.set('standby_piezas/p', { estado: 'buscando', ordenId: 'o' });
    m.docs.set('ordenes_servicio/o', { enStandby: true });
    await registrarLlegadaPieza('p'); await registrarLlegadaPieza('p');
    expect(m.writes.filter(([p]) => p.startsWith('notificaciones'))).toHaveLength(1);
    expect(m.docs.get('ordenes_servicio/o')?.enStandby).toBe(true);
  });
  it('resuelve responsable personal a UID sin broadcast', async () => {
    m.docs.set('standby_piezas/p', { estado: 'buscando', ordenId: 'o' }); m.docs.set('ordenes_servicio/o', { operariaId: 'personal-id' });
    m.personal = [{ id: 'personal-id', data: () => ({ uid: 'operaria-uid', activo: true, rol: 'operaria' }) }];
    m.usuarios.push({ id: 'operaria-uid', data: () => ({ activo: true, rol: 'operaria' }) });
    await registrarLlegadaPieza('p');
    expect(m.writes.filter(([p]) => p.startsWith('notificaciones')).map(([, d]) => d.userId)).toEqual(['operaria-uid']);
  });
  it('sin responsable no marca llegada', async () => {
    m.personal = []; m.docs.set('standby_piezas/p', { estado: 'buscando' });
    await expect(registrarLlegadaPieza('p')).rejects.toThrow('responsables'); expect(m.writes).toHaveLength(0);
  });
  it('registro toma cliente de orden y pone standby sin nombres como vínculo', async () => {
    m.docs.set('ordenes_servicio/o', { clienteId: 'c', clienteNombre: 'Real' });
    await guardarSolicitudPieza('p', 'o', { piezaFaltante: 'Motor', clienteNombre: 'Falso', fotoUrl: undefined });
    expect(m.docs.get('standby_piezas/p')).toMatchObject({ clienteId: 'c', clienteNombre: 'Real', ordenId: 'o' });
    expect(m.docs.get('standby_piezas/p')).not.toHaveProperty('fotoUrl');
    expect(m.docs.get('ordenes_servicio/o')?.enStandby).toBe(true);
  });
  it('no traslada piezas entre órdenes', async () => {
    m.docs.set('ordenes_servicio/o', { clienteId: 'c' }); m.docs.set('standby_piezas/p', { ordenId: 'otra' });
    await expect(guardarSolicitudPieza('p', 'o', { piezaFaltante: 'Motor' })).rejects.toThrow('trasladar'); expect(m.writes).toHaveLength(0);
  });
});

it('UID ausente o identidad ambigua no produce falso aviso de llegada', async () => {
  m.docs.set('standby_piezas/p', { estado: 'buscando', ordenId: 'o' });
  m.docs.set('ordenes_servicio/o', { operariaId: 'ambigua' });
  m.personal = [
    { id: 'ambigua', data: () => ({ uid: 'u1', rol: 'operaria', activo: true }) },
    { id: 'p2', data: () => ({ uid: 'ambigua', rol: 'operaria', activo: true }) },
    { id: 'admin', data: () => ({ rol: 'administrador', activo: true }) },
  ];
  await expect(registrarLlegadaPieza('p')).rejects.toThrow('responsables');
  expect(m.writes).toHaveLength(0);
});


it('taller pone orden vinculada en standby dentro del mismo commit', async () => {
  m.docs.set('equipos_taller/e', { ordenId: 'o', clienteId: 'c' });
  m.docs.set('ordenes_servicio/o', { estado: 'activo', enStandby: false });
  await cambiarEstadoTaller('e', 'en_standby');
  expect(m.docs.get('ordenes_servicio/o')?.enStandby).toBe(true);
  expect(m.docs.get('standby_piezas/taller_e')?.ordenId).toBe('o');
});
it.each(['cerrado', 'cancelado', 'completado'])('taller rechaza orden terminal %s sin guardar equipo ni pieza', async estado => {
  m.docs.set('equipos_taller/e', { ordenId: 'o' }); m.docs.set('ordenes_servicio/o', { estado });
  await expect(cambiarEstadoTaller('e', 'en_standby')).rejects.toThrow('activa');
  expect(m.writes).toHaveLength(0);
});
it('vínculo histórico arrastra solicitud pendiente y marca standby', async () => {
  m.docs.set('equipos_taller/e', { estado: 'en_standby' }); m.docs.set('ordenes_servicio/o', { clienteId: 'c', estado: 'activo' });
  m.docs.set('standby_piezas/taller_e', { estado: 'buscando', piezaFaltante: 'Motor' });
  await vincularEquipoOrden('e', 'o');
  expect(m.docs.get('standby_piezas/taller_e')).toMatchObject({ ordenId: 'o', clienteId: 'c', piezaFaltante: 'Motor' });
  expect(m.docs.get('ordenes_servicio/o')?.enStandby).toBe(true);
});
it.each([{ estado: 'llego' }, { estado: 'buscando', ordenId: 'otra' }])('vínculo conflictivo no modifica documentos', async pieza => {
  m.docs.set('equipos_taller/e', {}); m.docs.set('ordenes_servicio/o', { clienteId: 'c', estado: 'activo' });
  m.docs.set('standby_piezas/taller_e', pieza);
  await expect(vincularEquipoOrden('e', 'o')).rejects.toThrow('Requiere revisión');
  expect(m.writes).toHaveLength(0);
});

it('no pone standby cuando solicitud estable ya llegó', async () => {
  m.docs.set('equipos_taller/e', { ordenId: 'o', estado: 'en_reparacion' });
  m.docs.set('ordenes_servicio/o', { estado: 'activo', enStandby: false });
  m.docs.set('standby_piezas/taller_e', { estado: 'llego' });
  await expect(cambiarEstadoTaller('e', 'en_standby')).rejects.toThrow('registra una nueva pieza');
  expect(m.writes).toHaveLength(0);
});
it('recepción ignora identidad editable y usa la orden releída', async () => {
  m.docs.set('ordenes_servicio/o', { clienteId: 'c', clienteNombre: 'Real', clienteTelefono: '8091111111', equipoTipo: 'Nevera' });
  await recibirEquipoTaller('e', 'o', { clienteId: 'otro', clienteNombre: 'Falso', clienteTelefono: '000', numeroSerie: 'N1' });
  expect(m.docs.get('equipos_taller/e')).toMatchObject({ clienteId: 'c', clienteNombre: 'Real', clienteTelefono: '8091111111', numeroSerie: 'N1' });
});
it('completado legacy sin fase bloquea solicitud y vínculo pendientes', async () => {
  m.docs.set('ordenes_servicio/o', { clienteId: 'c', estado: 'completado' });
  m.docs.set('equipos_taller/e', {}); m.docs.set('standby_piezas/taller_e', { estado: 'buscando' });
  await expect(guardarSolicitudPieza('p', 'o', { piezaFaltante: 'Motor' })).rejects.toThrow('vigente');
  await expect(vincularEquipoOrden('e', 'o')).rejects.toThrow('activa');
  expect(m.writes).toHaveLength(0);
});
