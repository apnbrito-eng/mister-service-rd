import { beforeAll, beforeEach, afterEach, afterAll, describe, it, expect, vi } from 'vitest';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
const m = vi.hoisted(() => ({ db: null as any, uid: '', rol: 'operaria', verificarApp: vi.fn() }));
vi.mock('../../api/_lib/accesoEquipo.js', () => {
  class ErrorAcceso extends Error { constructor(public status: number, message: string) { super(message); } }
  return { ErrorAcceso, accesoEquipo: async () => ({ db: m.db, uid: m.uid, rol: m.rol }) };
});
vi.mock('firebase-admin/app-check', () => ({ getAppCheck: () => ({ verifyToken: m.verificarApp }) }));
vi.mock('../../api/_lib/firebaseAdmin.js', () => ({ getAdminApp: () => app }));
import handler from '../../api/crm/chat-orden';
import chat from '../../api/movil/chat';
import { rutaMensajeEntrante, exigirRutaChat } from '../../api/_lib/rutaChatOrden';
if (process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8299') throw Error('Requiere emulador aislado 8299');
const suite = `chat-${Date.now()}`;
let prefix: string, phone: string, order: string, other: string, tech: string;
let caso = 0;
const APP_ID = 'app-chat-ensayo';
const TOKEN = 'token-ficticio-appcheck';
const app = initializeApp({ projectId: 'demo-mister-ensayo' }, suite), db = getFirestore(app);
async function call(body: any, method = 'POST', api = handler, headers: Record<string, string> = { 'x-firebase-appcheck': TOKEN }) {
  let status = 200, result: any;
  const res: any = { setHeader() {}, status(n: number) { status = n; return this; }, json(v: any) { result = v; return this; } };
  await api({ method, body, headers, query: body } as any, res); return { status, result };
}
const ref = (id: string) => db.doc(`ordenes_servicio/${id}`);
const version = async () => (await call({ ordenId: order }, 'GET')).result.version;
beforeAll(() => { m.db = db; });
beforeEach(async () => {
  prefix = `${suite}-${++caso}`;
  phone = `1809${String(Date.now()).slice(-5)}${String(caso).padStart(2, '0')}`;
  order = `${prefix}-1`; other = `${prefix}-2`; tech = `${prefix}-tech`;
  m.uid = 'office'; m.rol = 'operaria';
  vi.stubEnv('MOBILE_FIREBASE_APP_IDS', APP_ID);
  m.verificarApp.mockReset().mockResolvedValue({ appId: APP_ID });
  await db.doc(`usuarios/${tech}`).set({ rol: 'tecnico', activo: true });
  await Promise.all([order, other].map(id => ref(id).set({ tecnicoId: tech, fase: 'agendado', clienteTelefono: phone })));
});
afterEach(async () => {
  m.uid = 'office'; m.rol = 'operaria';
  vi.unstubAllEnvs();
  const rutas = [`usuarios/${tech}`, `crm_chat_rutas/${phone}`, `ordenes_servicio/${order}`, `ordenes_servicio/${other}`];
  for (const col of ['whatsapp_mensajes_inbox', 'whatsapp_mensajes_outbox']) {
    for (const sufijo of ['texto', 'banco', 'ajeno', 'otra', 'privado', 'office', 'visible', ...Array.from({ length: 45 }, (_, i) => `volumen-${i}`)]) rutas.push(`${col}/${prefix}-${sufijo}`);
  }
  const eventos = await db.collection('crm_chat_eventos').where('telefono', '==', phone).get();
  const batch = db.batch();
  rutas.forEach(ruta => batch.delete(db.doc(ruta)));
  eventos.docs.forEach(doc => batch.delete(doc.ref));
  await batch.commit();
});
afterAll(async () => { await db.terminate(); await deleteApp(app); });
async function activar() {
  expect((await call({ ordenId: order, accion: 'activar', version: 0 })).status).toBe(200);
}
describe('Vínculo privado de chat por orden', () => {
  it('rechaza técnicos y controla activaciones concurrentes', async () => {
    m.rol = 'tecnico'; expect((await call({ ordenId: order }, 'GET')).status).toBe(403); m.rol = 'operaria';
    const body = { ordenId: order, accion: 'activar', version: 0 };
    const outcomes = await Promise.all([call(body), call({ ...body, ordenId: other })]);
    expect(outcomes.map(o => o.status).sort()).toEqual([200, 409]);
    expect((await call({ ...body, version: await version() })).status).toBe(200);
  });
  it('vincula solo mensajes nuevos y bloquea el envío en otra orden', async () => {
    await activar();
    const read = (date: Date) => db.runTransaction(tx => rutaMensajeEntrante(db, tx, phone, date));
    expect(await read(new Date(Date.now() + 1000))).toBe(order);
    expect(await read(new Date(0))).toBeNull();
    await expect(exigirRutaChat(db, phone, other)).rejects.toThrow();
    await expect(exigirRutaChat(db, phone, order)).resolves.toBeUndefined();
  });
  it('solo comparte textos del mismo cliente, sin mover mensajes de otra orden', async () => {
    await activar();
    const docs = [
      ['texto', { wa_id: phone, tipo: 'text', contenido: { texto: 'Llamar al llegar' } }],
      ['banco', { wa_id: phone, tipo: 'image', contenido: { mediaId: 'secreto' } }],
      ['ajeno', { wa_id: '18095550111', tipo: 'text', contenido: { texto: 'privado' } }],
      ['otra', { wa_id: phone, ordenId: other, tipo: 'text', contenido: { texto: 'otro servicio' } }],
    ] as const;
    for (const [id, data] of docs) await db.doc(`whatsapp_mensajes_inbox/${prefix}-${id}`).set({ ...data, timestampRecibido: Timestamp.now() });
    for (const [id, expected] of [['texto', 200], ['banco', 400], ['ajeno', 403], ['otra', 409]] as const) {
      expect((await call({ ordenId: order, accion: 'compartir', version: await version(), wamid: `${prefix}-${id}` })).status).toBe(expected);
    }
  });
  it('el técnico ve el texto compartido, sin banco ni mensajes privados de oficina', async () => {
    await activar();
    await db.doc(`whatsapp_mensajes_inbox/${prefix}-texto`).set({ wa_id: phone, ordenId: order, visibleTecnico: true, tipo: 'text', contenido: { texto: 'Llamar al llegar' }, timestampRecibido: Timestamp.now() });
    await db.doc(`whatsapp_mensajes_inbox/${prefix}-privado`).set({ wa_id: phone, ordenId: order, visibleTecnico: false, contenido: { texto: 'Datos bancarios' }, timestampRecibido: Timestamp.now() });
    await db.doc(`whatsapp_mensajes_outbox/${prefix}-office`).set({ wa_id: phone, ordenId: order, texto: 'Finanzas privadas', createdAt: Timestamp.now() });
    m.rol = 'tecnico'; m.uid = tech;
    const response = await call({ ordenId: order }, 'GET', chat);
    expect(response.status).toBe(200); expect(response.result.mensajes.map((x: any) => x.texto)).toEqual(['Llamar al llegar']);
    m.rol = 'operaria'; m.uid = 'office';
    expect((await call({ ordenId: order, accion: 'ocultar', version: await version(), wamid: `${prefix}-texto` })).status).toBe(200);
    m.rol = 'tecnico'; m.uid = tech;
    expect((await call({ ordenId: order }, 'GET', chat)).result.mensajes).toEqual([]);
    await ref(order).update({ tecnicoId: 'otro' }); expect((await call({ ordenId: order }, 'GET', chat)).status).toBe(403);
    await ref(order).update({ tecnicoId: tech, eliminado: true }); expect((await call({ ordenId: order }, 'GET', chat)).status).toBe(403);
    await ref(order).update({ eliminado: false, fase: 'trabajo_realizado' }); expect((await call({ ordenId: order }, 'GET', chat)).status).toBe(403);
    m.rol = 'operaria'; m.uid = 'office';
  });
  it('el cierre y la pausa impiden asociar nuevos mensajes', async () => {
    await activar();
    await ref(order).update({ fase: 'trabajo_realizado' });
    expect(await db.runTransaction(tx => rutaMensajeEntrante(db, tx, phone, new Date(Date.now() + 1000)))).toBeNull();
    expect((await call({ ordenId: order, accion: 'activar', version: await version() })).status).toBe(409);
    await ref(order).update({ fase: 'agendado' });
    expect((await call({ ordenId: order, accion: 'pausar', version: await version() })).status).toBe(200);
    expect(await db.runTransaction(tx => rutaMensajeEntrante(db, tx, phone, new Date(Date.now() + 1000)))).toBeNull();
  });
  it('mensajes internos recientes no desplazan los mensajes compartidos con el técnico', async () => {
    m.rol = 'tecnico'; m.uid = tech;
    const batch = db.batch();
    for (const [collection, field] of [['whatsapp_mensajes_inbox', 'timestampRecibido'], ['whatsapp_mensajes_outbox', 'createdAt']]) {
      for (let i = 0; i < 45; i++) batch.set(db.collection(collection).doc(`${prefix}-volumen-${i}`), {
        ordenId: order, wa_id: phone, visibleTecnico: false, [field]: Timestamp.fromMillis(Date.now() + i),
        contenido: { texto: 'Nota privada' }, texto: 'Nota privada',
      });
      batch.set(db.collection(collection).doc(`${prefix}-visible`), {
        ordenId: order, wa_id: phone, visibleTecnico: true, [field]: Timestamp.fromMillis(Date.now() - 10000),
        contenido: { texto: 'Instrucción compartida' }, texto: 'Respuesta compartida',
      });
    }
    await batch.commit();
    const response = await call({ ordenId: order }, 'GET', chat);
    expect(response.status).toBe(200);
    expect(response.result.mensajes.map((x: { texto: string }) => x.texto).sort()).toEqual(['Instrucción compartida', 'Respuesta compartida']);
  });
  it('rechaza ausencia de token App Check antes de consultar mensajes', async () => {
    m.rol = 'tecnico'; m.uid = tech;
    expect((await call({ ordenId: order }, 'GET', chat, {})).status).toBe(403);
    expect(m.verificarApp).not.toHaveBeenCalled();
  });
  it('rechaza un token App Check inválido', async () => {
    m.rol = 'tecnico'; m.uid = tech;
    m.verificarApp.mockRejectedValueOnce(new Error('Token de prueba inválido'));
    expect((await call({ ordenId: order }, 'GET', chat)).status).toBe(403);
    expect(m.verificarApp).toHaveBeenCalledWith(TOKEN);
  });
  it('rechaza una app no autorizada aunque su token sea válido', async () => {
    m.rol = 'tecnico'; m.uid = tech;
    m.verificarApp.mockResolvedValueOnce({ appId: 'otra-app' });
    expect((await call({ ordenId: order }, 'GET', chat)).status).toBe(403);
  });
  it('falla cerrado si el servidor no tiene apps permitidas configuradas', async () => {
    m.rol = 'tecnico'; m.uid = tech;
    vi.stubEnv('MOBILE_FIREBASE_APP_IDS', '');
    expect((await call({ ordenId: order }, 'GET', chat)).status).toBe(503);
    expect(m.verificarApp).not.toHaveBeenCalled();
  });

});
