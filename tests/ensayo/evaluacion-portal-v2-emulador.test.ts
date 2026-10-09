// Tests contra el emulador Firestore (requiere FIRESTORE_EMULATOR_HOST=127.0.0.1:8289).
// Cubren el flujo v2 del Portal del Cliente — evaluación separada atención/técnico,
// atribución server-side desde el doc, antiduplicado transaccional, privacidad
// del GET (no expone participantes/UIDs/notas internas).
//
// No ejecutar contra Firestore de producción.

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import type { DocumentReference, Firestore } from 'firebase-admin/firestore';
import { getFirestore } from 'firebase-admin/firestore';

const mock = vi.hoisted(() => ({ db: null as Firestore | null }));
vi.mock('../../api/_lib/firebaseAdmin.js', () => ({
  getAdminFirestore: () => mock.db,
  exigirAppCheck: async () => 'ensayo',
}));

import feedback from '../../api/feedback/[token]';

if (process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8289') {
  throw Error('Requiere emulador local explícito');
}

const app = initializeApp({ projectId: 'demo-mister-ensayo' }, `evaluacion-v2-${Date.now()}`);
const db = getFirestore(app);
const prefix = `test-evaluacion-v2-${Date.now()}`;
const refs: DocumentReference[] = [];

async function seedOrden(suffix: string, extra: Record<string, unknown> = {}) {
  const id = `${prefix}-${suffix}`;
  const token = `${id}-token`;
  const ord = db.doc(`ordenes_servicio/${id}`);
  refs.push(ord);
  await ord.set({
    tokenPortalCliente: token,
    fase: 'cerrado',
    numero: `OS-${suffix}`,
    clienteNombre: 'Cliente ficticio',
    // Campos privados que el GET público NUNCA debe exponer:
    notasInternas: 'NO MOSTRAR',
    costoMateriales: 999,
    precioFinal: 12000,
    ...extra,
  });
  return { id, token, ref: ord };
}

async function seedUsuario(uid: string) {
  const ref = db.doc(`usuarios/${uid}`);
  refs.push(ref);
  await ref.set({ nombre: 'Usuario ficticio de ensayo' });
}

async function call(
  token: string,
  method = 'POST',
  payload: Record<string, unknown> = { evaluacion: { tecnico: { puntualidad: 5, trato: 5, claridad: 5, calidad: 5 } } },
) {
  let status = 200;
  let body: unknown;
  const res = {
    setHeader() {},
    status(n: number) { status = n; return this; },
    json(v: unknown) { body = v; return this; },
  };
  await feedback({ query: { token }, method, body: payload } as VercelRequest, res as unknown as VercelResponse);
  return { status, body };
}

beforeAll(() => { mock.db = db; });
afterAll(async () => {
  await Promise.all(refs.map((r) => r.delete().catch(() => void 0)));
  await db.terminate();
  await deleteApp(app);
});

describe('Portal Cliente — evaluación v2 contra emulador', () => {
  it('persiste participantes extraídos del doc (NUNCA del body)', async () => {
    const { id, token } = await seedOrden('participantes-ok', {
      tecnicoId: 'uid-tecnico-A',
      metadatosCita: { responsableAtencionId: 'uid-atencion-B' },
    });
    await seedUsuario('uid-tecnico-A');
    await seedUsuario('uid-atencion-B');
    // Cliente mete UIDs falsos en el body — deben ignorarse.
    const payload = {
      evaluacion: {
        atencion: { puntualidad: 4, trato: 5, claridad: 3 },
        tecnico: { puntualidad: 5, trato: 5, claridad: 4, calidad: 5 },
      },
      participantes: { tecnicoUid: 'inyectado', atencionUid: 'inyectado' },
      comentario: 'Muy bien',
    };
    const result = await call(token, 'POST', payload);
    expect(result.status).toBe(200);
    const data = (await db.doc(`ordenes_servicio/${id}`).get()).data()!;
    expect(data.evaluacionServicio.version).toBe(2);
    expect(data.evaluacionServicio.atencion).toEqual({ puntualidad: 4, trato: 5, claridad: 3 });
    expect(data.evaluacionServicio.tecnico).toEqual({ puntualidad: 5, trato: 5, claridad: 4, calidad: 5 });
    expect(data.evaluacionServicio.participantes).toMatchObject({
      tecnicoUid: 'uid-tecnico-A',
      atencionUid: 'uid-atencion-B',
      atribucionTecnicoConfiable: true,
      atribucionAtencionConfiable: true,
    });
    // Body del cliente NO influye en participantes:
    expect(JSON.stringify(data.evaluacionServicio.participantes)).not.toContain('inyectado');
  });

  it('deja atribución explícitamente no fiable cuando faltan identificadores', async () => {
    const { id, token } = await seedOrden('participantes-nulos', {});
    const result = await call(token, 'POST', {
      evaluacion: { atencion: { puntualidad: 5, trato: 5, claridad: 5 } },
    });
    expect(result.status).toBe(200);
    const data = (await db.doc(`ordenes_servicio/${id}`).get()).data()!;
    expect(data.evaluacionServicio.participantes).toMatchObject({
      tecnicoUid: null,
      atencionUid: null,
      atribucionTecnicoConfiable: false,
      atribucionAtencionConfiable: false,
    });
    expect(data.evaluacionServicio.atencion).toBeTruthy();
    expect(data.evaluacionServicio.tecnico).toBeNull();
  });

  it('dos envíos simultáneos preservan una sola evaluación (antiduplicado transaccional)', async () => {
    const { id, token } = await seedOrden('concurrente', {
      tecnicoId: 'uid-tecnico-C',
    });
    const payload = { evaluacion: { tecnico: { puntualidad: 5, trato: 5, claridad: 5, calidad: 5 } } };
    const results = await Promise.all([call(token, 'POST', payload), call(token, 'POST', payload)]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    const data = (await db.doc(`ordenes_servicio/${id}`).get()).data()!;
    expect(data.evaluacionServicio.version).toBe(2);
  });

  it('GET expone yaEnviado SIN filtrar participantes, UIDs ni notas internas', async () => {
    const { token } = await seedOrden('privacidad', {
      tecnicoId: 'uid-tecnico-D',
      metadatosCita: { responsableAtencionId: 'uid-atencion-E' },
    });
    await call(token, 'POST', { evaluacion: { tecnico: { puntualidad: 5, trato: 5, claridad: 5, calidad: 5 } } });
    const result = await call(token, 'GET');
    expect(result.status).toBe(200);
    expect(result.body).toEqual({ yaEnviado: true, evaluacionServicio: true });
    const serialized = JSON.stringify(result.body);
    expect(serialized).not.toContain('uid-tecnico-D');
    expect(serialized).not.toContain('uid-atencion-E');
    expect(serialized).not.toContain('NO MOSTRAR');
    expect(serialized).not.toContain('999');
    expect(serialized).not.toContain('12000');
  });

  it('rechaza evaluación cuando la orden no está cerrada y rechaza cuerpos sin bloques válidos', async () => {
    const { token } = await seedOrden('abierta', { fase: 'agendado' });
    const abierto = await call(token, 'POST', { evaluacion: { tecnico: { puntualidad: 5, trato: 5, claridad: 5, calidad: 5 } } });
    expect(abierto.status).toBe(400);
    const { token: tokenOk } = await seedOrden('vacio');
    const vacio = await call(tokenOk, 'POST', { evaluacion: {} });
    expect(vacio.status).toBe(400);
    const claveExtra = await call(tokenOk, 'POST', {
      evaluacion: { tecnico: { puntualidad: 5, trato: 5, claridad: 5, calidad: 5 }, nps: 10 },
    });
    expect(claveExtra.status).toBe(400);
  });

  it('rechaza v2 si una sección iniciada queda incompleta', async () => {
    const { token } = await seedOrden('incompleta');
    const r = await call(token, 'POST', {
      evaluacion: { atencion: { puntualidad: 5, trato: 5 } },
    });
    expect(r.status).toBe(400);
  });

  it('acepta payload v1 legacy sin ruptura y lo persiste con version=1', async () => {
    const { id, token } = await seedOrden('v1-compat', {
      tecnicoId: 'uid-tecnico-F',
      metadatosCita: { responsableAtencionId: 'uid-atencion-G' },
    });
    await seedUsuario('uid-tecnico-F');
    await seedUsuario('uid-atencion-G');
    const payload = { evaluacion: { puntualidad: 5, trato: 4, claridad: 3, calidad: 2 } };
    const r = await call(token, 'POST', payload);
    expect(r.status).toBe(200);
    const data = (await db.doc(`ordenes_servicio/${id}`).get()).data()!;
    expect(data.evaluacionServicio.version).toBe(1);
    expect(data.evaluacionServicio.categorias).toEqual({ puntualidad: 5, trato: 4, claridad: 3, calidad: 2 });
    // Aun así captura participantes del servidor:
    expect(data.evaluacionServicio.participantes).toMatchObject({
      tecnicoUid: 'uid-tecnico-F',
      atencionUid: 'uid-atencion-G',
    });
  });
});

it('un ID legacy que solo existe en personal no produce atribución fiable', async () => {
  const personalRef = db.doc(`personal/${prefix}-legacy`);
  refs.push(personalRef);
  await personalRef.set({ uid: 'otro-uid', nombre: 'Ensayo' });
  const { token, ref } = await seedOrden('legacy-id', { tecnicoId: personalRef.id });
  expect((await call(token)).status).toBe(200);
  expect((await ref.get()).data()?.evaluacionServicio.participantes).toMatchObject({ tecnicoUid: null, atribucionTecnicoConfiable: false });
});
