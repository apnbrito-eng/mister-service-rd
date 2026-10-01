import { beforeAll, afterAll, beforeEach, expect, it, vi } from 'vitest';
import { initializeApp, deleteApp, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
const m = vi.hoisted(() => ({ db: null as unknown, rol: 'administrador', actor: 'admin', createUser: vi.fn(), updateUser: vi.fn(), revokeRefreshTokens: vi.fn(), getUser: vi.fn() }));
vi.mock('../../api/_lib/accesoEquipo.js', () => ({ accesoEquipo: async () => ({ db: m.db, uid: m.actor, rol: m.rol }), ErrorAcceso: class extends Error { constructor(public status: number, msg: string) { super(msg); } } }));
vi.mock('../../api/_lib/firebaseAdmin.js', () => ({ getAdminAuth: () => ({ createUser: m.createUser, updateUser: m.updateUser, revokeRefreshTokens: m.revokeRefreshTokens, getUser: m.getUser }) }));
import handler from '../../api/admin/accesos';
let app: App, db: Firestore;
beforeAll(() => { if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error('Solo emulador'); app = initializeApp({ projectId: 'demo-accesos-usuarios' }, 'accesos-usuarios'); db = getFirestore(app); m.db = db; });
afterAll(async () => { await db.terminate(); await deleteApp(app); });
beforeEach(async () => { for (const c of await db.listCollections()) await db.recursiveDelete(c); vi.clearAllMocks(); m.rol = 'administrador'; m.actor = 'admin'; m.getUser.mockResolvedValue({ email: 'fixture@example.invalid' }); m.createUser.mockResolvedValue({}); m.updateUser.mockResolvedValue({}); m.revokeRefreshTokens.mockResolvedValue(undefined); });
async function llamar(body: object) { const r = { status: 0, payload: {} as Record<string, unknown> }; const res = { setHeader() {}, status(n: number) { r.status = n; return res; }, json(v: Record<string, unknown>) { r.payload = v; return res; } }; await handler({ method: 'POST', body } as never, res as never); return r; }
const alta = { accion: 'guardar', nombre: 'Persona QA', usuario: 'persona.qa', rol: 'tecnico', equipo: '', password: 'CLAVE-FICTICIA-SOLO-EMULADOR' };
it('alta crea Auth y perfiles vinculados sin persistir clave', async () => {
 const r = await llamar(alta); expect(r.status).toBe(200); const uid = r.payload.uid;
 const personal = (await db.doc(`personal/${uid}`).get()).data(); expect(personal).toMatchObject({ uid, rol: 'tecnico', activo: true });
 expect((await db.doc(`accesos_alias/persona.qa`).get()).data()?.uid).toBe(uid);
 for (const c of await db.listCollections()) expect(JSON.stringify((await c.get()).docs.map(d => d.data()))).not.toContain(alta.password);
});
it('dos altas simultáneas del mismo alias crean una sola cuenta', async () => {
 const r = await Promise.all([llamar(alta), llamar(alta)]); expect(r.map(v => v.status).sort()).toEqual([200,409]); expect(m.createUser).toHaveBeenCalledTimes(1);
});
it('un error al crear Auth libera la reserva y permite reintentar', async () => {
 m.createUser.mockRejectedValueOnce(new Error('fallo simulado')); expect((await llamar(alta)).status).toBe(503); expect((await db.doc('accesos_alias/persona.qa').get()).exists).toBe(false); expect((await llamar(alta)).status).toBe(200);
});
it('cambiar alias conserva UID y bloquea edición de versión vieja', async () => {
 const r = await llamar(alta); const uid = r.payload.uid;
 expect((await llamar({ ...alta, uid, version: 1, usuario: 'persona.nueva' })).status).toBe(200);
 expect((await db.doc('accesos_alias/persona.qa').get()).exists).toBe(false);
 expect((await llamar({ ...alta, uid, version: 1, usuario: 'persona.vieja' })).status).toBe(409);
 expect((await db.doc('accesos_alias/persona.vieja').get()).exists).toBe(false);
});
it('asigna técnicos al UID de la operaria del equipo', async () => {
 await db.doc('usuarios/lider').set({ rol: 'operaria', activo: true, nombre: 'Líder QA' }); await db.doc('gestion_accesos/lider').set({ equipo: 'A' });
 const r = await llamar({ ...alta, equipo: 'A' }); expect(r.status).toBe(200);
 expect((await db.doc(`personal/${r.payload.uid}`).get()).data()).toMatchObject({ equipoId: 'equipo-1', operariaId: 'lider', operariaNombre: 'Líder QA' });
});
it('supervisión cambia la clave del personal pero no la de gerencia', async () => {
 const r = await llamar(alta); m.actor = 'super'; m.rol = 'coordinadora'; await db.doc('gestion_accesos/super').set({ supervisora: true }); await db.doc('usuarios/admin').set({ rol: 'administrador' });
 expect((await llamar({ accion: 'clave', uid: r.payload.uid, password: 'OTRA-CLAVE-FICTICIA' })).status).toBe(200);
 expect(m.revokeRefreshTokens).toHaveBeenCalledWith(r.payload.uid);
 expect((await llamar({ accion: 'clave', uid: 'admin', password: 'OTRA-CLAVE-FICTICIA' })).status).toBe(403);
});
it('baja conserva historia, bloquea Auth y permite restaurar', async () => {
 const r = await llamar(alta); const uid = r.payload.uid;
 await db.doc(`personal/${uid}`).set({ sueldoBase: 123 }, { merge: true });
 expect((await llamar({ accion: 'eliminar', uid })).status).toBe(200); expect(m.updateUser).toHaveBeenCalledWith(uid, { disabled: true });
 expect((await db.doc(`personal/${uid}`).get()).data()).toMatchObject({ sueldoBase: 123, activo: false });
 expect((await llamar({ accion: 'restaurar', uid })).status).toBe(200); expect((await db.doc(`usuarios/${uid}`).get()).data()?.activo).toBe(true);
});
it('ni gerencia puede eliminarse a sí misma', async () => { await db.doc('usuarios/admin').set({ rol: 'administrador' }); expect((await llamar({ accion: 'eliminar', uid: 'admin' })).status).toBe(403); expect(m.updateUser).not.toHaveBeenCalled(); });
