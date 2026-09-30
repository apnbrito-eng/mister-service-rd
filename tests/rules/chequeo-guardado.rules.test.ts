import { beforeAll, afterAll, beforeEach, expect, it, vi } from 'vitest';
import { doc, getDoc, collection, getDocs } from 'firebase/firestore';
import { iniciarEntorno, entorno, resetearConPerfiles, sembrar, como, UID } from './helpers';
const contexto = vi.hoisted(() => ({ db: undefined as unknown, auth: { currentUser: { uid: '' } } }));
vi.mock('../../src/firebase/config', () => ({ get db() { return contexto.db; }, auth: contexto.auth }));
import { guardarSeguimientoChequeo } from '../../src/services/seguimientoChequeo.service';
beforeAll(async () => { await iniciarEntorno(); });
afterAll(async () => { await entorno().cleanup(); });
beforeEach(async () => {
 await resetearConPerfiles();
 await sembrar('personal/destino', { uid: UID.operaria, rol: 'operaria', activo: true });
 await sembrar('ordenes_servicio/o', { numero: 'OS-1', soloChequeo: true, fase: 'cerrado', estado: 'completado', precioFinal: 1500 });
});
const gestion = { responsableUid: UID.operaria, proximaFecha: '2026-10-01', resultado: 'pendiente' as const, nota: '  Contactar cliente  ' };
it.each([UID.admin, UID.secretaria, UID.coordinadora])('oficina %s asigna a operaria sin leer usuario ajeno, doble clic no duplica', async uid => {
 contexto.db = como(uid); contexto.auth.currentUser.uid = uid;
 await Promise.all([guardarSeguimientoChequeo('o', gestion), guardarSeguimientoChequeo('o', gestion)]);
 const orden = (await getDoc(doc(como(UID.admin), 'ordenes_servicio/o'))).data()!;
 expect(orden).toMatchObject({ fase: 'cerrado', precioFinal: 1500, seguimientoChequeo: { nota: 'Contactar cliente', responsableUid: UID.operaria, actualizadoPor: uid } });
 expect(orden.historialSeguimientoChequeo).toHaveLength(1);
 expect((await getDocs(collection(como(UID.admin), 'notificaciones'))).size).toBe(1);
});
it('operaria asigna a otra operaria por personal.uid', async () => {
 await sembrar('usuarios/otra-op', { rol: 'operaria', activo: true });
 await sembrar('personal/otra', { uid: 'otra-op', rol: 'operaria', activo: true });
 contexto.db = como(UID.operaria); contexto.auth.currentUser.uid = UID.operaria;
 await expect(getDoc(doc(como(UID.operaria), 'usuarios/otra-op'))).rejects.toThrow();
 await guardarSeguimientoChequeo('o', { ...gestion, responsableUid: 'otra-op' });
 expect((await getDocs(collection(como(UID.admin), 'notificaciones'))).size).toBe(1);
});
it('vínculo ambiguo se rechaza sin mutación', async () => {
 await sembrar('personal/duplicado', { uid: UID.operaria, rol: 'operaria', activo: true });
 contexto.db = como(UID.admin); contexto.auth.currentUser.uid = UID.admin;
 await expect(guardarSeguimientoChequeo('o', gestion)).rejects.toThrow('único');
 expect((await getDocs(collection(como(UID.admin), 'notificaciones'))).size).toBe(0);
});
it('orden cancelada conserva historial e importes sin guardar seguimiento', async () => {
 await sembrar('ordenes_servicio/o',{numero:'OS-1',soloChequeo:true,fase:'cancelado',precioFinal:1500});
 contexto.db=como(UID.admin); contexto.auth.currentUser.uid=UID.admin;
 await expect(guardarSeguimientoChequeo('o',gestion)).rejects.toThrow('disponible');
 expect((await getDocs(collection(como(UID.admin),'notificaciones'))).size).toBe(0);
 expect((await getDoc(doc(como(UID.admin),'ordenes_servicio/o'))).data()).toMatchObject({fase:'cancelado',precioFinal:1500});
});
