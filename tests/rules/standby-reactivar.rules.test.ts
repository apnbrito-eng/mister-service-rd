import { beforeAll, afterAll, beforeEach, expect, it, vi } from 'vitest';
import { doc, getDoc } from 'firebase/firestore';
import { iniciarEntorno, entorno, resetearConPerfiles, sembrar, como, UID } from './helpers';
const contexto = vi.hoisted(() => ({ db: undefined as unknown, despuesConsulta: null as null | (() => Promise<void>) }));
vi.mock('../../src/firebase/config', () => ({ get db() { return contexto.db; }, auth: { currentUser: { uid: 'uid-admin' } } }));
vi.mock('../../src/utils/resolverChatCliente', () => ({ resolverChatCliente: vi.fn() }));
vi.mock('firebase/firestore', async original => {
  const real = await original<typeof import('firebase/firestore')>();
  return { ...real, getDocs: async (...args: Parameters<typeof real.getDocs>) => {
    const resultado = await real.getDocs(...args);
    const hook = contexto.despuesConsulta; contexto.despuesConsulta = null;
    if (hook) await hook(); return resultado;
  } };
});
import { reactivarOrdenPorPiezas, guardarSolicitudPieza } from '../../src/services/flujoPiezasTaller.service';
beforeAll(async () => { await iniciarEntorno(); }); afterAll(async () => { await entorno().cleanup(); });
beforeEach(async () => { await resetearConPerfiles(); contexto.db = como(UID.admin); contexto.despuesConsulta = null;
 await sembrar('ordenes_servicio/o', { clienteId: 'c', fase: 'en_diagnostico', enStandby: true, standbyRevision: 0 });
 await sembrar('standby_piezas/p', { ordenId: 'o', estado: 'llego' });
});
const orden = async () => (await getDoc(doc(como(UID.admin), 'ordenes_servicio/o'))).data()!;
it('dos usuarios/reintento quitan espera una vez sin cambiar fase ni agendar', async () => {
 const r = await Promise.all([reactivarOrdenPorPiezas('o'), reactivarOrdenPorPiezas('o')]);
 expect(r.filter(Boolean)).toHaveLength(1); const o = await orden();
 expect(o.enStandby).toBe(false); expect(o.fase).toBe('en_diagnostico'); expect(o.auditoria).toHaveLength(1); expect(o.standbyReactivadaPor).toBe(UID.admin); expect(o.fechaCita).toBeUndefined();
});
it('pieza nueva después consulta invalida reactivación', async () => {
 contexto.despuesConsulta = () => guardarSolicitudPieza('nueva', 'o', { piezaFaltante: 'Motor' });
 await expect(reactivarOrdenPorPiezas('o')).rejects.toThrow('cambiaron'); expect((await orden()).enStandby).toBe(true);
});
it('pieza no llegada bloquea', async () => {
 await sembrar('standby_piezas/p', { ordenId: 'o', estado: 'buscando' });
 await expect(reactivarOrdenPorPiezas('o')).rejects.toThrow('pendientes');
});
it('orden finalizada concurrentemente bloquea', async () => {
 contexto.despuesConsulta = () => sembrar('ordenes_servicio/o', { clienteId: 'c', fase: 'cerrado', enStandby: true, standbyRevision: 0 });
 await expect(reactivarOrdenPorPiezas('o')).rejects.toThrow('activa');
});
