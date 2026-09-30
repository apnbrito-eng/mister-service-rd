import { readFileSync } from 'node:fs';
import { beforeAll, afterAll, beforeEach, expect, it } from 'vitest';
import { initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, setDoc, getDoc, getDocs, collection } from 'firebase/firestore';
import { adquirirIntentoCita, liberarIntentoCita, escribirOrdenConVinculoCita, validarOrdenReusable } from '../../src/utils/vinculoOrdenCita';
if (process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8080') throw new Error('Sólo emulador local 8080.');
let env: RulesTestEnvironment;
beforeAll(async () => { env = await initializeTestEnvironment({ projectId: 'demo-cita-intento', firestore: { host: '127.0.0.1', port: 8080, rules: readFileSync('firestore.rules', 'utf8') } }); });
afterAll(async () => env.cleanup());
beforeEach(async () => { await env.clearFirestore(); await env.withSecurityRulesDisabled(async ctx => { for (const uid of ['a', 'b']) await setDoc(doc(ctx.firestore(), 'usuarios', uid), { rol: 'coordinadora' }); }); await setDoc(doc(env.authenticatedContext('a').firestore(), 'citas_por_confirmar', 'c'), { clienteNombre: 'QA ficticio', telefono: '8095551111', estado: 'pendiente', origen: 'oficina', createdAt: new Date('2026-09-29T12:00:00Z') }); });
it('dos operadores simultáneos: un ganador, una orden y ningún unlock ajeno', async () => {
  const a = env.authenticatedContext('a').firestore(), b = env.authenticatedContext('b').firestore();
  const resultados = await Promise.allSettled([adquirirIntentoCita(a, 'c', 'a', 'intento-a'), adquirirIntentoCita(b, 'c', 'b', 'intento-b')]);
  expect(resultados.filter(r => r.status === 'fulfilled')).toHaveLength(1);
  const ganador = resultados.find(r => r.status === 'fulfilled')! as PromiseFulfilledResult<Awaited<ReturnType<typeof adquirirIntentoCita>>>;
  const intento = ganador.value;
  const db = intento.usuarioId === 'a' ? a : b;
  await liberarIntentoCita(b, 'c', { ...intento, intentoId: 'viejo' });
  const orden = await escribirOrdenConVinculoCita(db, { citaId: 'c', usuarioId: intento.usuarioId, intento, ordenData: { numero: 'OS-QA', estado: 'activo', clienteId: 'cliente', clienteTelefono: '8095551111', metadatosCita: { citaOrigenId: 'c' } } });
  expect((await getDocs(collection(db, 'ordenes_servicio'))).size).toBe(1);
  await expect(adquirirIntentoCita(b, 'c', 'b', 'otro')).rejects.toThrow('CITA_YA_PROCESANDO');
  // El callback de garantía falla tras el commit: se conserva ordenIdCreada.
  await liberarIntentoCita(db, 'c', intento);
  const retry = await adquirirIntentoCita(b, 'c', 'b', 'retry');
  expect(retry.ordenId).toBe(orden.ordenId);
  expect((await validarOrdenReusable(b, orden.ordenId, { citaId: 'c', intento: retry })).existe).toBe(true);
  await liberarIntentoCita(db, 'c', intento);
  expect((await getDoc(doc(b, 'citas_por_confirmar', 'c'))).data()?.procesandoIntento).toBe('retry');
});
it('cita editada luego del lock no crea una orden con datos viejos', async () => {
  const db = env.authenticatedContext('a').firestore();
  const intento = await adquirirIntentoCita(db, 'c', 'a', 'intento');
  await setDoc(doc(db, 'citas_por_confirmar', 'c'), { telefono: '8095559999' }, { merge: true });
  await expect(escribirOrdenConVinculoCita(db, { citaId: 'c', intento, ordenData: {} })).rejects.toThrow('CITA_CAMBIO');
  expect((await getDocs(collection(db, 'ordenes_servicio'))).size).toBe(0);
});
