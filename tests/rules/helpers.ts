import { readFileSync } from 'node:fs';
import {
  initializeTestEnvironment,
  RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import type { Firestore } from 'firebase/firestore';

/**
 * Infraestructura compartida de los tests de reglas.
 *
 * CÓMO FUNCIONAN LAS RULES DE ESTE REPO (importante para entender los tests):
 * el rol NO viene del token de auth. `firestore.rules` lo resuelve con un
 * `get()` a `usuarios/{uid}.rol` (ver helpers `userExists`, `rolUsuario`,
 * `esStaff`, `esStaffOficina`, `esAdminOCoord`). Por eso cada test tiene que
 * sembrar el doc `usuarios/{uid}` ANTES de actuar, y por eso un usuario
 * autenticado en Firebase Auth pero SIN doc en `usuarios/` no es staff
 * — que es exactamente el fix del audit C3 (se eliminó el perfil demo
 * sintetizado en memoria que permitía escalación silenciosa).
 */

export const PROJECT_ID = 'demo-mister-service-rules';

/** uids fijos, uno por rol, para que los tests se lean solos. */
export const UID = {
  admin: 'uid-admin',
  coordinadora: 'uid-coordinadora',
  secretaria: 'uid-secretaria',
  operaria: 'uid-operaria',
  tecnico: 'uid-tecnico',
  tecnicoOtro: 'uid-tecnico-otro',
  ayudante: 'uid-ayudante',
  /** Autenticado en Auth pero SIN doc en `usuarios/` — no debe ser staff. */
  sinPerfil: 'uid-sin-perfil',
} as const;

export const ROL_POR_UID: Record<string, string> = {
  [UID.admin]: 'administrador',
  [UID.coordinadora]: 'coordinadora',
  [UID.secretaria]: 'secretaria',
  [UID.operaria]: 'operaria',
  [UID.tecnico]: 'tecnico',
  [UID.tecnicoOtro]: 'tecnico',
  [UID.ayudante]: 'ayudante',
};

let testEnv: RulesTestEnvironment;

export async function iniciarEntorno(): Promise<RulesTestEnvironment> {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: readFileSync('firestore.rules', 'utf8'),
      host: '127.0.0.1',
      port: 8080,
    },
  });
  return testEnv;
}

export function entorno(): RulesTestEnvironment {
  if (!testEnv) throw new Error('Llamá iniciarEntorno() en beforeAll');
  return testEnv;
}

/**
 * Limpia Firestore y vuelve a sembrar los perfiles de `usuarios/`.
 * Se llama en beforeEach: cada test arranca del mismo estado conocido.
 */
export async function resetearConPerfiles(): Promise<void> {
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    for (const [uid, rol] of Object.entries(ROL_POR_UID)) {
      await db.doc(`usuarios/${uid}`).set({
        rol,
        nombre: `QA ${rol}`,
        email: `${uid}@qa.local`,
        activo: true,
      });
    }
  });
}

/** Siembra un documento saltándose las rules (para preparar escenarios). */
export async function sembrar(
  ruta: string,
  data: Record<string, unknown>,
): Promise<void> {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await ctx.firestore().doc(ruta).set(data);
  });
}

/** Firestore actuando como un usuario autenticado concreto. */
export function como(uid: string): Firestore {
  return testEnv.authenticatedContext(uid).firestore() as unknown as Firestore;
}

/** Firestore sin autenticar — el visitante público. */
export function anonimo(): Firestore {
  return testEnv.unauthenticatedContext().firestore() as unknown as Firestore;
}
