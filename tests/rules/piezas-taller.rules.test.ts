import { beforeAll, afterAll, beforeEach, expect, it, vi } from 'vitest';
import { collection, getDocs, doc, getDoc } from 'firebase/firestore';
import { iniciarEntorno, entorno, resetearConPerfiles, sembrar, como, UID } from './helpers';
const contexto = vi.hoisted(() => ({ db: undefined as unknown, uid: 'uid-admin' }));
vi.mock('../../src/firebase/config', () => ({ get db() { return contexto.db; }, auth: { get currentUser() { return { uid: contexto.uid }; } } }));
vi.mock('../../src/utils/resolverChatCliente', () => ({ resolverChatCliente: vi.fn() }));
import { cambiarEstadoTaller, registrarLlegadaPieza, vincularEquipoOrden } from '../../src/services/flujoPiezasTaller.service';
beforeAll(async () => { await iniciarEntorno(); });
afterAll(async () => { await entorno().cleanup(); });
beforeEach(async () => {
  await resetearConPerfiles(); contexto.db = como(UID.admin); contexto.uid = UID.admin;
  await sembrar('personal/p-op', { uid: UID.operaria, rol: 'operaria', activo: true });
  await sembrar('ordenes_servicio/o', { clienteId: 'c', clienteNombre: 'QA', estado: 'activo', fase: 'en_diagnostico', enStandby: false, operariaId: 'p-op' });
  await sembrar('equipos_taller/e', { ordenId: 'o', clienteId: 'c', estado: 'recibido' });
});
const leer = async (ruta: string) => (await getDoc(doc(como(UID.admin), ruta))).data()!;
it.each([UID.admin, UID.operaria])('taller/orden/pieza y doble llegada operan con reglas como %s', async uid => {
  contexto.db = como(uid); contexto.uid = uid;
  await cambiarEstadoTaller('e', 'en_standby');
  expect((await leer('ordenes_servicio/o')).enStandby).toBe(true);
  expect((await leer('standby_piezas/taller_e')).ordenId).toBe('o');
  await Promise.all([registrarLlegadaPieza('taller_e'), registrarLlegadaPieza('taller_e')]);
  expect((await leer('standby_piezas/taller_e')).estado).toBe('llego');
  expect((await leer('ordenes_servicio/o')).enStandby).toBe(true);
  const avisos = await getDocs(collection(como(UID.admin), 'notificaciones'));
  expect(avisos.size).toBe(1); expect(avisos.docs[0].data().userId).toBe(UID.operaria);
});
it('técnico no puede mutar taller ni registrar llegada', async () => {
  await cambiarEstadoTaller('e', 'en_standby');
  contexto.db = como(UID.tecnico); contexto.uid = UID.tecnico;
  await expect(cambiarEstadoTaller('e', 'descartado', 'No reparable')).rejects.toThrow();
  await expect(registrarLlegadaPieza('taller_e')).rejects.toThrow();
  expect((await leer('standby_piezas/taller_e')).estado).toBe('buscando');
});
it('vínculo histórico operaria conserva atomicidad y solicitud', async () => {
  await sembrar('equipos_taller/e', { estado: 'en_standby' });
  await sembrar('standby_piezas/taller_e', { estado: 'buscando', piezaFaltante: 'Motor' });
  contexto.db = como(UID.operaria); contexto.uid = UID.operaria;
  await vincularEquipoOrden('e', 'o');
  expect((await leer('equipos_taller/e')).ordenId).toBe('o');
  expect((await leer('standby_piezas/taller_e')).clienteId).toBe('c');
  expect((await leer('ordenes_servicio/o')).enStandby).toBe(true);
});
