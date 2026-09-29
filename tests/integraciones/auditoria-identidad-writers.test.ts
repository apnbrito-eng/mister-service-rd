import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Cliente } from '../../src/types';
const m = vi.hoisted(() => ({
  auth: { currentUser: { uid: 'uid-admin' } as { uid: string } | null },
  data: {} as Record<string, Record<string, unknown>>,
  writes: [] as Array<{ name: string; data?: Record<string, unknown> }>,
}));
vi.mock('../../src/firebase/config', () => ({ db: {}, auth: m.auth }));
vi.mock('firebase/firestore', async original => ({
  ...await original<typeof import('firebase/firestore')>(),
  collection: (_db: unknown, name: string) => ({ name }),
  doc: (...args: any[]) => ({ name: args.length === 1 ? args[0].name : args[1], id: args[2] || 'audit' }),
  query: (ref: unknown) => ref,
  getDocs: async () => ({ docs: [{ id: 'comision', data: () => m.data.comisiones }] }),
  addDoc: async (ref: any, data: Record<string, unknown>) => { m.writes.push({ name: ref.name, data }); },
  runTransaction: async (_db: unknown, fn: (tx: any) => Promise<unknown>) => {
    const pending: typeof m.writes = [];
    const result = await fn({
      get: async (ref: any) => ({ exists: () => true, data: () => m.data[ref.name] }),
      set: (ref: any, data: Record<string, unknown>) => pending.push({ name: ref.name, data }),
      update: (ref: any, data: Record<string, unknown>) => pending.push({ name: ref.name, data }),
      delete: (ref: any) => pending.push({ name: ref.name }),
    });
    m.writes.push(...pending); return result;
  },
}));
import { confirmarPagoOrden } from '../../src/services/ordenes.service';
import { marcarOrdenReactivada } from '../../src/services/campanasMarketing.service';
import { eliminarComisionesDeFactura } from '../../src/utils/comisiones';
beforeEach(() => {
  m.auth.currentUser = { uid: 'uid-admin' };
  m.data = { ordenes_servicio: {}, campanas_marketing: { fecha: new Date() }, comisiones: { estadoLiquidacion: 'pendiente', comisionMonto: 10 } };
  m.writes = [];
});
const cliente = () => ({ id: 'cliente', ultimoContactoMarketing: new Date(), contactosMarketing: [{ campanaId: 'campana', fecha: new Date() }] }) as unknown as Cliente;
const audit = () => m.writes.find(w => w.name === 'auditoria_admin')?.data;
describe('escritores compatibles con identidad obligatoria', () => {
  it('confirmar pago conserva monto y agrega identidad junto a la actualización', async () => {
    m.data.ordenes_servicio = { pagos: [{ id: 'pago', monto: 500, metodo: 'efectivo', verificado: false }] };
    expect(await confirmarPagoOrden('orden', 'pago', { id: 'perfil-personal-distinto', nombre: 'QA' })).toEqual({ ok: true });
    expect(m.writes).toHaveLength(2);
    expect(audit()).toMatchObject({ actorUid: 'uid-admin', actorId: 'uid-admin', monto: 500 });
    const pagos = m.writes[0].data?.pagos as Array<Record<string, unknown>>;
    expect(pagos[0]).toMatchObject({ monto: 500, verificado: true });
  });
  it('reactivación mantiene sus tres escrituras y audita al usuario autenticado', async () => {
    expect(await marcarOrdenReactivada({ ordenId: 'orden', cliente: cliente() })).toMatchObject({ reactivada: true });
    expect(m.writes).toHaveLength(3);
    expect(audit()).toMatchObject({ actorUid: 'uid-admin', accion: 'orden_reactivada_detectada' });
  });
  it('eliminar comisión sin UID opcional conserva auditoría atribuida a la sesión', async () => {
    expect(await eliminarComisionesDeFactura({ facturaId: 'factura' })).toMatchObject({ eliminadas: 1 });
    expect(audit()).toMatchObject({ solicitanteUid: 'uid-admin', accion: 'eliminar_comisiones_factura' });
  });
  it('sin sesión no modifica campañas ni comisiones', async () => {
    m.auth.currentUser = null;
    expect(await confirmarPagoOrden('orden', 'pago', {id:'perfil',nombre:'QA'})).toEqual({ok:false,razon:'sin_sesion'});
    await expect(marcarOrdenReactivada({ ordenId: 'orden', cliente: cliente() })).rejects.toThrow('sesión');
    await expect(eliminarComisionesDeFactura({ facturaId: 'factura' })).rejects.toThrow('sesión');
    expect(m.writes).toHaveLength(0);
  });
});
