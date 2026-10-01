import { beforeAll, afterAll, beforeEach, expect, it, vi } from 'vitest';
import { initializeApp, deleteApp, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
const m = vi.hoisted(() => ({ db: null as unknown, verificar: vi.fn(async () => ({ appId: 'qa' })) }));
vi.mock('../../api/_lib/firebaseAdmin.js', () => ({ getAdminApp: () => ({}), getAdminFirestore: () => m.db }));
vi.mock('firebase-admin/app-check', () => ({ getAppCheck: () => ({ verifyToken: m.verificar }) }));
import handler from '../../api/publico/cita';
import { registrarCitaPublica, validarCitaPublica } from '../../api/_lib/citaPublica';
let app: App, db: Firestore;
const ahora = Date.parse('2026-09-28T12:00:00-04:00');
const datos = { clienteNombre: 'QA prueba', telefono: '8090000000', equipoTipo: 'Lavadora', falla: 'No enciende al conectar' };
beforeAll(() => { if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error('Solo emulador'); app = initializeApp({ projectId: 'demo-cita-segura' }, 'cita-segura'); db = getFirestore(app); m.db = db; });
afterAll(async () => { await db.terminate(); await deleteApp(app); });
beforeEach(async () => { for (const c of await db.listCollections()) await db.recursiveDelete(c); m.verificar.mockReset().mockResolvedValue({ appId: 'qa' }); });
it('doble envío concurrente y reintentos crean una sola cita y consumen un cupo', async () => {
 await db.doc('personal/secretaria').set({ uid: 'qa-secretaria', rol: 'secretaria', activo: true, nombre: 'QA' });
 const resultados = await Promise.all(Array.from({ length: 8 }, () => registrarCitaPublica(db, datos, ahora)));
 expect(resultados.every(r => r.ok)).toBe(true);
 expect((await db.collection('citas_por_confirmar').get()).size).toBe(1);
 expect((await db.collection('notificaciones').get()).size).toBe(1);
 expect((await db.collection('citas_publicas_cuotas').get()).docs[0].data().total).toBe(1);
 expect(resultados.every(r => !('citaId' in r))).toBe(true);
 await registrarCitaPublica(db, datos, ahora + 86400000);
 expect((await db.collection('citas_por_confirmar').get()).size).toBe(2);
});
it('cupo global atómico por teléfonos distintos; no depende de IP compartida', async () => {
 await db.doc('citas_publicas_config/limites').set({ maxSolicitudesHora: 2 });
 const resultados = await Promise.all(Array.from({ length: 7 }, (_, n) => registrarCitaPublica(db, { ...datos, telefono: `829000000${n}` }, ahora)));
 expect(resultados.filter(r => r.ok).length).toBe(2);
 expect((await db.collection('citas_por_confirmar').get()).size).toBe(2);
 expect((await db.collection('citas_publicas_alertas').get()).size).toBe(1);
 expect((await registrarCitaPublica(db, { ...datos, telefono: '8490000000' }, ahora + 3600000)).ok).toBe(true);
});
it('calendario debe existir activo; identidad/asignado se leen del servidor', async () => {
 const entrada = { ...datos, calendarioId: 'qa', fechaSolicitada: '2026-09-29', horaSolicitada: '8:00 AM', asignadoId: 'intruso' };
 await expect(registrarCitaPublica(db, entrada, ahora)).rejects.toThrow('calendario');
 await db.doc('calendarios/qa').set({ activo: true, dias: ['Martes'], horas: ['8:00 AM'], nombre: 'Calendario QA', asignadoId: 'tecnico-qa', asignadoNombre: 'QA' });
 await registrarCitaPublica(db, entrada, ahora);
 const cita = (await db.collection('citas_por_confirmar').get()).docs[0].data();
 expect(cita).toMatchObject({ asignadoId: 'tecnico-qa', origen: 'formulario_publico', estado: 'pendiente', whatsappAsignado: '18495646767' });
});
it('mantiene teléfonos de diez dígitos y normaliza solo prefijo1 válido', () => {
 expect(validarCitaPublica({ ...datos, telefono: '2125550100' }).telefonoNormalizado).toBe('2125550100');
 expect(validarCitaPublica({ ...datos, telefono: '+1 2125550100' }).telefonoNormalizado).toBe('2125550100');
 expect(() => validarCitaPublica({ ...datos, telefono: '+34 612345678' })).toThrow();
});
it('agenda general acepta las horas AM/PM que ofrece el formulario y conserva el reintento único', async () => {
 const permiso = 'a'.repeat(64), bucket = 'demo-cita-segura.appspot.com', path = 'citas-publico/qa-foto.jpg', token = 'qa-token-foto';
 await db.doc(`subidas_publicas_permisos/${permiso}`).set({ completo: true, bucket, path, token, destino: 'agendar' });
 const fotoEquipoUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodeURIComponent(path)}?alt=media&token=${token}&permiso=${permiso}`;
 const entrada = { ...datos, equipoTipo: 'Nevera', equipoMarca: 'Samsung', equipoModelo: 'Side-by-side', fechaSolicitada: '2026-10-05', horaSolicitada: '9:00 AM', fotoEquipoUrl, clienteLat: 18.4, clienteLng: -69.9 };
 expect((await llamar(entrada)).status).toBe(200);
 expect((await llamar(entrada)).status).toBe(200);
 const citas = await db.collection('citas_por_confirmar').get();
 expect(citas.size).toBe(1);
 expect(citas.docs[0].data()).toMatchObject({ horaSolicitada: '9:00 AM', equipoTipo: 'Nevera', fotoEquipoUrl, clienteLat: 18.4, clienteLng: -69.9 });
});
it('acepta bloques personalizados del servidor y horas24 legadas, pero rechaza opciones ajenas', async () => {
 await db.doc('config_web/sitio').set({ formularioAgendar: { bloquesHora: ['De 9:00 AM a 12:00 PM'] } });
 expect((await llamar({ ...datos, horaSolicitada: 'De 9:00 AM a 12:00 PM' })).status).toBe(200);
 expect((await llamar({ ...datos, horaSolicitada: '09:00' })).status).toBe(200);
 for (const horaSolicitada of ['25:00', '9:99 AM', 'texto ajeno', '9:00 AM']) {
   const r = await llamar({ ...datos, horaSolicitada });
   expect(r.status).toBe(400);
   expect(r.payload.error).toContain('hora');
 }
 expect((await db.collection('citas_por_confirmar').get()).size).toBe(2);
});
it('cada horario predeterminado se admite también con configuración vacía', async () => {
 await db.doc('config_web/sitio').set({ formularioAgendar: { bloquesHora: [] } });
 for (const horaSolicitada of ['9:00 AM', '11:00 AM', '1:00 PM', '3:00 PM', '5:00 PM']) {
   expect((await llamar({ ...datos, horaSolicitada })).status).toBe(200);
 }
 expect((await db.collection('citas_por_confirmar').get()).size).toBe(5);
});
it('rechaza payloads enormes, coordenadas inválidas y descripción solo prefijo', () => {
 for (const p of [{ falla: 'x'.repeat(4001) }, { clienteLat: 100 }, { fechaSolicitada: '2026-02-31' }, { falla: '[Mantenimiento] ' }, { camposPersonalizados: { x: {} } }, { fotoEquipoUrl: 'javascript:alert(1)' }]) expect(() => validarCitaPublica({ ...datos, ...p })).toThrow();
});
async function llamar(body: unknown, token: unknown = 'qa-token') {
 let status = 200, payload: any;
 const res = { setHeader() {}, status(n: number) { status = n; return res; }, json(v: unknown) { payload = v; return res; } };
 await handler({ method: 'POST', headers: { 'x-firebase-appcheck': token }, body } as any, res as any);
 return { status, payload };
}
it('HTTP exige App Check antes de crear y acepta JSON objeto/string', async () => {
 expect((await llamar(datos)).status).toBe(200);
 expect((await llamar({ ...datos, telefono: '8290000000' }, null)).status).toBe(401);
 m.verificar.mockRejectedValueOnce(new Error('token secreto'));
 expect((await llamar(datos)).status).toBe(401);
 expect((await llamar(JSON.stringify(datos))).status).toBe(200);
 expect((await llamar('{')).status).toBe(400);
 expect((await db.collection('citas_por_confirmar').get()).size).toBe(1);
});
it('fallo inesperado responde genérico sin PII y límite conserva HTTP429', async () => {
 const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
 const real = m.db; m.db = { doc() { throw new Error('token=secreto telefono=809'); } };
 try { const r = await llamar(datos); expect(r.status).toBe(503); expect(JSON.stringify([r, spy.mock.calls])).not.toContain('secreto'); }
 finally { m.db = real; spy.mockRestore(); }
 await db.doc('citas_publicas_config/limites').set({ maxSolicitudesHora: 1 });
 await llamar(datos);
 expect((await llamar({ ...datos, telefono: '8290000000' })).status).toBe(429);
});
it('HTTP local real: cuerpo JSON, token obligatorio y cuota sin crear tráfico externo', async () => {
 const { createServer } = await import('node:http');
 const servidor = createServer(async (req, res) => {
   let body = ''; for await (const chunk of req) body += chunk;
   let status = 200;
   const respuesta = { setHeader(k: string, v: string) { res.setHeader(k, v); }, status(n: number) { status = n; return respuesta; }, json(v: unknown) { res.statusCode = status; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(v)); return respuesta; } };
   await handler({ method: req.method, headers: req.headers, body } as any, respuesta as any);
 });
 await new Promise<void>(resolve => servidor.listen(0, '127.0.0.1', resolve));
 try {
   const puerto = (servidor.address() as { port: number }).port;
   const url = `http://127.0.0.1:${puerto}`;
   const sinToken = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(datos) });
   expect(sinToken.status).toBe(401);
   expect((await db.collection('citas_por_confirmar').get()).size).toBe(0);
   const respuesta = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Firebase-AppCheck': 'qa-token' }, body: JSON.stringify(datos) });
   expect(respuesta.status).toBe(200); expect(await respuesta.json()).toMatchObject({ ok: true });
   expect((await db.collection('citas_por_confirmar').get()).size).toBe(1);
 } finally { await new Promise<void>((resolve, reject) => servidor.close(e => e ? reject(e) : resolve())); }
});

it('permite equipos distintos del mismo teléfono y limita solicitudes nuevas sin confirmar falsamente', async () => {
  await db.doc('citas_publicas_config/limites').set({ maxSolicitudesTelefonoHora: 2 });
  expect((await registrarCitaPublica(db, datos, ahora)).ok).toBe(true);
  expect((await registrarCitaPublica(db, { ...datos, equipoTipo: 'Nevera' }, ahora)).ok).toBe(true);
  expect((await registrarCitaPublica(db, { ...datos, equipoTipo: 'Secadora' }, ahora)).ok).toBe(false);
  expect((await registrarCitaPublica(db, datos, ahora)).ok).toBe(true);
  expect((await db.collection('citas_por_confirmar').get()).size).toBe(2);
});
