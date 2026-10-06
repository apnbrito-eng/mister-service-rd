import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { OrdenServicio, Usuario } from '../../src/types';
const mock = vi.hoisted(() => ({ data: {} as Record<string, unknown>, update: vi.fn() }));
vi.mock('../../src/firebase/config', () => ({ db: {} }));
vi.mock('../../src/services/notificaciones.service', () => ({ crearNotificacion: vi.fn() }));
vi.mock('firebase/firestore', () => ({
  collection: vi.fn(), doc: vi.fn(), getDocs: vi.fn(async () => ({docs: []})),
  Timestamp: { now: () => new Date(), fromDate: (d: Date) => d }, arrayUnion: (...a: unknown[]) => a,
  runTransaction: async (_db: unknown, f: (tx: unknown) => Promise<void>) => f({get: async () => ({exists: () => true, id: 'o1', data: () => mock.data}), update: (_ref: unknown, patch: Record<string, unknown>) => {mock.update(patch); mock.data = {...mock.data, ...patch};}}),
}));
vi.mock('../../src/utils', () => ({ parseOrden: (id: string, raw: Record<string, unknown>) => ({id, ...raw}), crearRegistroAuditoria: (...args: unknown[]) => args }));
import { gestionarPresupuestoOrden } from '../../src/services/presupuestoOrden.service';
const actor = (rol: Usuario['rol'], id = 'oficina') => ({id, rol, nombre: id} as Usuario);
const order = () => ({id: 'o1', ...mock.data} as OrdenServicio);
const action = (accion: 'aprobar'|'aceptar'|'proponer', monto: number, rol: Usuario['rol'] = 'coordinadora', uid = 'oficina', orden = order()) => gestionarPresupuestoOrden({orden, usuario: actor(rol, uid), uid, accion, monto, motivo: 'Cliente solicita ajuste'});
beforeEach(() => { mock.data = {fase: 'en_cotizacion', estadoAprobacion: 'pendiente', precioSugerido: 5200, operariaId: 'oficina', historialFases: [], clienteNombre: 'Ejemplo'}; mock.update.mockClear(); });
describe('Presupuesto real por roles', () => {
  it('aprobar monto no habilita al técnico; aceptación exacta sí, sin segunda aprobación', async () => {
    await action('aprobar', 5200);
    expect(mock.data).toMatchObject({estadoAprobacion:'pendiente', presupuestoEstado:'pendiente_cliente', fase:'en_cotizacion'});
    await action('aceptar', 5200, 'operaria');
    expect(mock.data).toMatchObject({estadoAprobacion:'aprobado', presupuestoEstado:'aceptado', fase:'aprobado', presupuestoAceptadoPor:'oficina'});
    await expect(action('aprobar', 5200)).rejects.toThrow();
  });
  it('cambio propuesto bloquea hasta aprobación y aceptación del nuevo total', async () => {
    await action('aprobar', 5200); await action('proponer', 4800, 'operaria');
    await expect(action('aceptar', 4800, 'operaria')).rejects.toThrow();
    await action('aprobar', 4800); await action('aceptar', 4800, 'operaria');
    expect(mock.data.precioFinal).toBe(4800);
    expect(mock.data.precioSugerido).toBe(5200);
  });
  it('no permite aceptar un total distinto ni duplicar aceptación', async () => {
    await action('aprobar', 5200);
    await expect(action('aceptar', 5000, 'operaria')).rejects.toThrow();
    const stale = order(); await action('aceptar', 5200, 'operaria');
    await expect(action('aceptar', 5200, 'operaria', 'oficina', stale)).rejects.toThrow();
  });
  it.each(['tecnico', 'operaria', 'secretaria'] as const)('%s no aprueba presupuesto', async rol => {
    await expect(action('aprobar', 5200, rol)).rejects.toThrow('permiso');
    expect(mock.update).not.toHaveBeenCalled();
  });
  it('oficina ajena y técnico no pueden registrar aceptación', async () => {
    await action('aprobar', 5200);
    await expect(action('aceptar', 5200, 'operaria', 'otra')).rejects.toThrow('permiso');
    await expect(action('aceptar', 5200, 'tecnico')).rejects.toThrow('permiso');
  });
  it.each([NaN, Infinity, -1, 0])('rechaza monto inválido %s', async monto => {
    await expect(action('aprobar', monto)).rejects.toThrow(); expect(mock.update).not.toHaveBeenCalled();
  });
  it('conserva descuento registrado y no suma piezas al precio del servicio', async () => {
    await gestionarPresupuestoOrden({orden:order(), usuario:actor('coordinadora'), uid:'oficina', accion:'aprobar', monto:3200, camposDescuento:{descuentoChequeoMonto:2000, descuentoChequeoPrevioId:'previo'}});
    await action('aceptar', 3200, 'operaria');
    expect(mock.data).toMatchObject({precioFinal:3200, descuentoChequeoMonto:2000, descuentoChequeoPrevioId:'previo'});
  });
});
