import { beforeAll, afterAll, beforeEach, describe, it } from 'vitest';
import { readFileSync } from 'node:fs';
import type { Firestore } from 'firebase/firestore';
import { assertFails, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc } from 'firebase/firestore';
let env: RulesTestEnvironment;
const UID = { admin: 'qa-admin', tecnico: 'qa-tecnico', secretaria: 'qa-secretaria' };
const como = (uid: string) => env.authenticatedContext(uid).firestore() as unknown as Firestore;
const anonimo = () => env.unauthenticatedContext().firestore() as unknown as Firestore;
const colecciones = [
  'subidas_publicas_permisos', 'subidas_publicas_config', 'subidas_publicas_cuotas',
  'solicitudes_publicas_control', 'solicitudes_publicas_config', 'solicitudes_publicas_cuotas', 'solicitudes_publicas_alertas',
  'citas_publicas_control', 'citas_publicas_config', 'citas_publicas_cuotas', 'citas_publicas_alertas',
  'bot_servicio_config', 'bot_servicio_sim_limites', 'bot_servicio_sim_presupuesto', 'bot_servicio_sim_reservas',
  'bot_servicio_sim_trabajos', 'bot_servicio_sim_clientes', 'bot_servicio_sim_alertas',
  'bot_servicio_real_handoffs', 'bot_servicio_real_reparto', 'bot_servicio_real_asignaciones', 'bot_servicio_real_reparto_eventos',
  'bot_servicio_runtime', 'bot_servicio_sesiones', 'bot_servicio_trabajos',
  'bot_servicio_real_presupuesto', 'bot_servicio_real_reservas', 'bot_servicio_real_clientes', 'bot_servicio_real_alertas', 'bot_servicio_real_limites',
  'bot_servicio_sim_sesiones', 'bot_servicio_sim_asignaciones', 'bot_servicio_sim_reparto',
];
beforeAll(async () => {
 const [host, puerto] = (process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080').split(':');
 env = await initializeTestEnvironment({ projectId: 'demo-bot-rules-aislado', firestore: { host, port: Number(puerto), rules: readFileSync('firestore.rules', 'utf8') } });
});
afterAll(async () => { await env.cleanup(); });
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async ctx => {
    for (const [rol, uid] of Object.entries(UID)) await ctx.firestore().doc(`usuarios/${uid}`).set({ rol: rol === 'admin' ? 'administrador' : rol, activo: true });
    for (const nombre of colecciones) await ctx.firestore().doc(`${nombre}/sistema`).set({ modo: 'simulacion', valor: 1 });
  });
});
describe('Base bot: SDK cliente no puede saltarse endpoint administrativo', () => {
  for (const rol of ['admin', 'tecnico', 'secretaria', 'anonimo'] as const) {
    it(`${rol}: deniega lectura/listado/creación/edición/borrado de todas las colecciones`, async () => {
      const db = rol === 'anonimo' ? anonimo() : como(UID[rol]);
      for (const nombre of colecciones) {
        const existente = doc(db, nombre, 'sistema');
        await assertFails(getDoc(existente));
        await assertFails(getDocs(collection(db, nombre)));
        await assertFails(setDoc(doc(db, nombre, 'nuevo'), { valor: 2 }));
        await assertFails(updateDoc(existente, { valor: 3 }));
        await assertFails(deleteDoc(existente));
      }
    });
  }
});
