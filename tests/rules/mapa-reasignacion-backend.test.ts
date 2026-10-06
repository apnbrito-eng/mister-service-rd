/* eslint-disable @typescript-eslint/no-explicit-any -- Dobles de Firebase/API deliberadamente parciales; solo fixtures de pruebas. */
import { beforeAll, afterAll, beforeEach, expect, it, vi } from 'vitest';
import { createServer } from 'node:http';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { initializeApp, deleteApp, type App } from 'firebase-admin/app';
import { getFirestore, Timestamp, FieldValue, type Firestore } from 'firebase-admin/firestore';
const acceso = vi.hoisted(() => ({ db: null as unknown, uid: 'qa-admin', rol: 'administrador' }));
vi.mock('../../api/_lib/accesoEquipo.js', () => ({
  accesoEquipo: async () => acceso,
  ErrorAcceso: class extends Error { constructor(public status: number, message: string) { super(message); } },
}));
import handler from '../../api/mapa/reasignar';
let app: App, db: Firestore;
const fecha = Timestamp.fromDate(new Date('2026-10-05T10:00:00-04:00'));
beforeAll(() => {
  if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error('Solo emulador');
  app = initializeApp({ projectId: 'demo-mapa-reasignacion' }, 'mapa-reasignacion');
  db = getFirestore(app); acceso.db = db;
});
afterAll(async () => { await db.terminate(); await deleteApp(app); });
beforeEach(async () => {
  for (const c of await db.listCollections()) await db.recursiveDelete(c);
  acceso.uid = 'qa-admin'; acceso.rol = 'administrador';
  for (const [uid, rol] of [['qa-admin', 'administrador'], ['qa-op', 'operaria'], ['qa-origen', 'tecnico'], ['qa-destino', 'tecnico']]) {
    await db.doc(`usuarios/${uid}`).set({ uid, nombre: uid, rol, activo: true });
  }
  for (const uid of ['qa-origen', 'qa-destino']) {
    await db.doc(`personal/persona-${uid}`).set({ uid, rol: 'tecnico', nombre: uid, activo: true, operariaId: 'qa-op' });
  }
});
async function llamar(body: unknown) {
  let status = 200, payload: any;
  const res = { setHeader() {}, status(n: number) { status = n; return res; }, json(v: unknown) { payload = v; return res; } };
  await handler({ method: 'POST', headers: {}, body } as never, res as never);
  return { status, payload };
}
async function orden(id: string, extra: Record<string, unknown> = {}) {
  await db.doc(`ordenes_servicio/${id}`).set({ tecnicoId: 'qa-origen', tecnicoNombre: 'QA origen', operariaId: 'qa-op',
    operariaNombre: 'QA operaria', clienteNombre: `Cliente simulado ${id}`, fase: 'agendado', fechaCita: fecha,
    duracionMin: 60, precioFinal: 5000, notas: 'original', ...extra });
}
const preview = (ordenId: string) => llamar({ action: 'preview', ordenId, destinoUid: 'qa-destino', origen: 'mapa',
  esperado: { tecnicoId: 'qa-origen', fase: 'agendado', fechaCitaMs: fecha.toMillis() } });
it('dos órdenes distintas concurrentes no ocupan el mismo hueco del técnico destino', async () => {
  await orden('una'); await orden('otra');
  const [a, b] = await Promise.all([preview('una'), preview('otra')]);
  expect(a.status).toBe(200); expect(b.status).toBe(200);
  const resultados = await Promise.all([a, b].map(p => llamar({ action: 'confirmar', previewId: p.payload.previewId })));
  expect(resultados.map(r => r.status).sort()).toEqual([200, 409]);
  const asignadas = await db.collection('ordenes_servicio').where('tecnicoId', '==', 'qa-destino').get();
  expect(asignadas.size).toBe(1);
  expect(asignadas.docs[0].data()).toMatchObject({ fase: 'agendado', precioFinal: 5000, notas: 'original' });
  expect(asignadas.docs[0].data().fechaCita.toMillis()).toBe(fecha.toMillis());
}, 30000);
it('una edición entre preview y confirmación aborta sin sobreescribir la orden', async () => {
  await orden('una'); const p = await preview('una'); expect(p.status).toBe(200);
  await db.doc('ordenes_servicio/una').update({ notas: 'cambio de otra persona' });
  const r = await llamar({ action: 'confirmar', previewId: p.payload.previewId });
  expect(r.status).toBe(409);
  expect((await db.doc('ordenes_servicio/una').get()).data()).toMatchObject({ tecnicoId: 'qa-origen', notas: 'cambio de otra persona' });
});
it('deshacer no acepta otra edición aunque técnico, fecha y fase sigan iguales', async () => {
  await orden('una'); const p = await preview('una');
  const aplicada = await llamar({ action: 'confirmar', previewId: p.payload.previewId });
  expect(aplicada.status).toBe(200); expect(aplicada.payload.deshacer).toBeTruthy();
  await db.doc('ordenes_servicio/una').update({ notas: 'otra edición' });
  const r = await llamar({ action: 'preview', ...aplicada.payload.deshacer });
  expect(r.status).toBe(409);
  expect((await db.doc('ordenes_servicio/una').get()).data()?.tecnicoId).toBe('qa-destino');
});
it('sin duración guardada aún detecta intervalos ocupados', async () => {
  await orden('una'); await db.doc('ordenes_servicio/una').update({ duracionMin: FieldValue.delete() });
  await orden('ocupada', { tecnicoId: 'qa-destino', fechaCita: Timestamp.fromMillis(fecha.toMillis() + 30 * 60_000) });
  const p = await preview('una'); expect(p.status).toBe(200); expect(p.payload.conflictos).toHaveLength(1);
  const r = await llamar({ action: 'confirmar', previewId: p.payload.previewId });
  expect(r.status).toBe(409);
});
it('la agenda incluye órdenes antiguas vinculadas por personal.id al UID destino', async () => {
  await orden('una');
  await orden('antigua', { tecnicoId: 'persona-qa-destino' });
  const p = await preview('una'); expect(p.status).toBe(200); expect(p.payload.conflictos).toHaveLength(1);
  const r = await llamar({ action: 'confirmar', previewId: p.payload.previewId });
  expect(r.status).toBe(409);
});
it('una visita reiniciada después de reactivar sigue bloqueando reasignación', async () => {
  await orden('una', { reactivadaPostChequeo: true, reactivadaPostChequeoEn: Timestamp.fromMillis(fecha.toMillis() - 10000),
    inicioChequeo: { fechaInicio: fecha, tecnicoId: 'qa-origen' } });
  expect((await preview('una')).status).toBe(409);
});
it('recibe JSON crudo por curl y confirma sobre Firestore emulado', async () => {
  await orden('http');
  const server = createServer(async (req, res) => {
    let body = '';
    for await (const chunk of req) body += chunk;
    const adapter = {
      setHeader: (key: string, value: string) => res.setHeader(key, value),
      status: (status: number) => { res.statusCode = status; return adapter; },
      json: (value: unknown) => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(value)); return adapter; },
    };
    await handler({ method: req.method, headers: req.headers, body } as never, adapter as never);
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const { port } = server.address() as { port: number };
    const enviar = async (body: unknown) => {
      const { stdout } = await promisify(execFile)('curl', ['--silent', '--show-error', '--fail',
        '-H', 'Content-Type: application/json', '--data', JSON.stringify(body), `http://127.0.0.1:${port}/api/mapa/reasignar`]);
      return JSON.parse(stdout);
    };
    const p = await enviar({ action: 'preview', ordenId: 'http', destinoUid: 'qa-destino', origen: 'mapa',
      esperado: { tecnicoId: 'qa-origen', fase: 'agendado', fechaCitaMs: fecha.toMillis() } });
    expect(p.previewId).toBeTruthy();
    expect((await enviar({ action: 'confirmar', previewId: p.previewId })).ok).toBe(true);
    expect((await db.doc('ordenes_servicio/http').get()).data()?.tecnicoId).toBe('qa-destino');
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
}, 30000);
