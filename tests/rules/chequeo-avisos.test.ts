import { beforeAll, afterAll, beforeEach, it, expect } from 'vitest';
import { initializeApp, deleteApp, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { generarAvisosChequeo } from '../../api/_lib/avisosChequeo';
let app: App, db: Firestore;
const ahora = new Date('2026-09-29T14:00:00Z');
beforeAll(() => { if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error('Solo emulador'); app = initializeApp({ projectId: 'demo-chequeo' }, 'chequeo'); db = getFirestore(app); });
afterAll(async () => { await db.terminate(); await deleteApp(app); });
beforeEach(async () => { for (const c of await db.listCollections()) await db.recursiveDelete(c); await db.doc('personal/p').set({uid:'op',rol:'operaria',activo:true}); await db.doc('usuarios/op').set({ rol: 'operaria', activo: true }); await db.doc('ordenes_servicio/o').set({ soloChequeo: true, fase: 'cerrado', precioFinal: 1500, seguimientoChequeo: { responsableUid: 'op', proximaFecha: '2026-09-29', resultado: 'pendiente' } }); });
it('cron concurrente conserva una sola notificación y no reabre ni modifica dinero', async () => {
 await Promise.all([generarAvisosChequeo(db, ahora), generarAvisosChequeo(db, ahora)]);
 expect((await db.collection('notificaciones').get()).size).toBe(1);
 expect((await db.doc('ordenes_servicio/o').get()).data()).toMatchObject({ fase: 'cerrado', precioFinal: 1500 });
});
it('cancelación evita aviso; nueva fecha crea nueva ocurrencia', async () => {
 await db.doc('ordenes_servicio/o').update({ 'seguimientoChequeo.resultado': 'no_interesado' });
 expect((await generarAvisosChequeo(db, ahora)).creados).toBe(0);
 await db.doc('ordenes_servicio/o').update({ 'seguimientoChequeo.resultado': 'pendiente' });
 expect((await generarAvisosChequeo(db, ahora)).creados).toBe(1);
 await db.doc('ordenes_servicio/o').update({ 'seguimientoChequeo.proximaFecha': '2026-09-30' });
 expect((await generarAvisosChequeo(db, ahora)).creados).toBe(0);
 expect((await generarAvisosChequeo(db, new Date('2026-09-30T14:00:00Z'))).creados).toBe(1);
});
it.each(['personal_inactivo','cancelado','duplicado'])('cron omite %s', async caso => {
 if(caso==='personal_inactivo') await db.doc('personal/p').update({activo:false});
 if(caso==='cancelado') await db.doc('ordenes_servicio/o').update({fase:'cancelado'});
 if(caso==='duplicado') await db.doc('personal/p2').set({uid:'op',rol:'operaria',activo:true});
 expect((await generarAvisosChequeo(db,ahora)).creados).toBe(0);
});
