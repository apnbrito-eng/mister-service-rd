import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
const mock = vi.hoisted(() => ({ db: null as any }));
vi.mock('../../api/_lib/firebaseAdmin.js', () => ({ getAdminFirestore: () => mock.db, verificarAppCheck: async () => 'ensayo' }));
import handler from '../../api/garantia/[token]';
import feedback from '../../api/feedback/[token]';
// No ejecución contra credenciales o proyectos reales.
if (process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8289') throw Error('Requiere emulador local explícito');
const app = initializeApp({ projectId: 'demo-mister-ensayo' }, `garantia-${Date.now()}`);
const db = getFirestore(app);
const prefix = `test-garantia-${Date.now()}`;
const refs: any[] = [];
async function seed(suffix: string, orden: any = {}) {
  const id = `${prefix}-${suffix}`, token = `${id}-token`;
  const fac = db.doc(`facturas/${id}`), ord = db.doc(`ordenes_servicio/${id}`);
  refs.push(fac, ord, db.doc(`citas_por_confirmar/garantia_${id}`), db.doc(`auditoria_admin/reclamo_garantia_${id}`));
  await fac.set({ ordenId: id, clienteNombre: 'Cliente ficticio', notasInternas: 'NO MOSTRAR', garantia: { token, estado: 'vigente', finFecha: new Date(Date.now() + 86400000) } });
  await ord.set({ facturaId: id, ...orden });
  return { id, token, fac };
}
async function call(token: string, method = 'POST', endpoint = handler, payload: any = { problemaDescripcion: 'La lavadora vuelve a fallar' }) {
  let status = 200, body: any;
  const res: any = { setHeader() {}, status(n: number) { status = n; return this; }, json(v: any) { body = v; return this; } };
  await endpoint({ query: { token }, method, body: payload } as any, res);
  return { status, body };
}
beforeAll(() => { mock.db = db; });
afterAll(async () => { await Promise.all(refs.map(ref => ref.delete())); await db.terminate(); await deleteApp(app); });
describe('Reclamo público con transacciones reales del emulador', () => {
  it('dos peticiones simultáneas guardan una solicitud y una auditoría', async () => {
    const { id, token, fac } = await seed('concurrente');
    const results = await Promise.all([call(token), call(token)]);
    expect(results.map(r => r.status)).toEqual([200, 200]);
    expect((await fac.get()).data()?.garantia.estado).toBe('reclamada');
    expect((await db.collection('citas_por_confirmar').where('referenciaFacturaId', '==', id).get()).size).toBe(1);
    expect((await db.doc(`auditoria_admin/reclamo_garantia_${id}`).get()).exists).toBe(true);
  }, 20000);
  it('consulta y reclamo respetan el vencimiento de la orden', async () => {
    const { token, fac } = await seed('expirada', { garantiaVencimiento: new Date(Date.now() - 1000) });
    expect((await call(token, 'GET')).body.garantia.estado).toBe('expirada');
    expect((await call(token)).status).toBe(409);
    expect((await fac.get()).data()?.garantia.estado).toBe('vigente');
  });
  it('si falla una escritura no queda reclamo ni cita parcial', async () => {
    const { id, token, fac } = await seed('fallo');
    await db.doc(`auditoria_admin/reclamo_garantia_${id}`).set({ bloqueoPrueba: true });
    expect((await call(token)).status).toBe(500);
    expect((await fac.get()).data()?.garantia.estado).toBe('vigente');
    expect((await db.doc(`citas_por_confirmar/garantia_${id}`).get()).exists).toBe(false);
  });
  it('no publica notas internas y un token inexistente no permite reclamar', async () => {
    const { token } = await seed('privacidad');
    expect(JSON.stringify((await call(token, 'GET')).body)).not.toContain('NO MOSTRAR');
    expect((await call('inexistente')).status).toBe(404);
  });
});

describe('Evaluación pública en emulador', () => {
  const evaluacion = { puntualidad: 5, trato: 4, claridad: 3, calidad: 5 };
  async function orden(suffix: string, fase: string) {
    const row = await seed(suffix);
    await db.doc(`ordenes_servicio/${row.id}`).update({ fase, tokenPortalCliente: row.token });
    return row;
  }
  it('dos respuestas simultáneas conservan una sola evaluación', async () => {
    const { token, id } = await orden('evaluacion', 'cerrado');
    const result = await Promise.all([call(token, 'POST', feedback, { evaluacion }), call(token, 'POST', feedback, { evaluacion })]);
    expect(result.map(r => r.status).sort()).toEqual([200, 409]);
    const data = (await db.doc(`ordenes_servicio/${id}`).get()).data()!;
    expect(data.evaluacionServicio.categorias).toEqual(evaluacion);
    expect(data.feedback).toBeUndefined();
    expect((await call(token, 'GET', feedback)).body).toEqual({ yaEnviado: true, evaluacionServicio: true });
  }, 20000);
  it('rechaza evaluación antes del cierre y preserva respuestas NPS antiguas', async () => {
    const { token, id } = await orden('abierta', 'agendado');
    expect((await call(token, 'POST', feedback, { evaluacion })).status).toBe(400);
    await db.doc(`ordenes_servicio/${id}`).update({ fase: 'cerrado', feedback: { nps: 8 } });
    expect((await call(token, 'POST', feedback, { evaluacion })).status).toBe(409);
    expect((await db.doc(`ordenes_servicio/${id}`).get()).data()?.feedback.nps).toBe(8);
  });
});
