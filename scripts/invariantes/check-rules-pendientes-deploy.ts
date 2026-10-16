/**
 * P-005 — `firestore.rules` modificado en el repo pero no deployado a producción.
 *
 * Bug original: SPRINT-103 (commit `1568a63`, 2026-05-06) modificó
 * `firestore.rules` con `.get(field, null)` en `noTocaSoloChequeo`,
 * `noTocaCamposAprobacion`, `noTocaAsignacion`. El sprint cerró COMPLETADO
 * y se hizo push a main, pero NUNCA se ejecutó `npm run deploy:rules`. Las
 * rules de producción siguieron con acceso directo a campos opcionales y
 * cualquier técnico que intentaba "Iniciar chequeo" en una orden regular
 * (sin `soloChequeo`/`estadoAprobacion`/`ayudanteId` previos) recibía
 * permission-denied silencioso. Detectado el 2026-05-07 cuando Jorge
 * reportó que el botón no funciona en producción (SPRINT-106).
 *
 * Síntoma: feature compilado y pusheado funciona en local (rules locales
 * = rules emuladas para testing) pero rompe en producción porque las rules
 * activas son la versión anterior.
 *
 * Causa raíz: `git push` no triggerea deploy de rules. Vercel deploy del
 * frontend SÍ se dispara automático por GitHub webhook. Las rules requieren
 * `firebase deploy --only firestore:rules` ejecutado a mano por el
 * coordinator/Jorge. Si nadie lo ejecuta, hay desincronía silenciosa.
 *
 * Estrategia (heurística determinística):
 *
 * 1. Calcular SHA-256 del `firestore.rules` actual.
 * 2. Leer `firestore.rules.deployed.lock` (escrito por
 *    `marcar-rules-deployadas.ts` después de cada deploy real).
 * 3. Si los hashes difieren → FAIL.
 * 4. Si el lock no existe → WARN (cold start, primer setup).
 *
 * Recuperación (única vía válida):
 *   1. Con autorización explícita de Jorge (cambios a rules requieren su OK),
 *      desplegar de verdad: `npm run deploy:rules` (corre firebase deploy y,
 *      solo si el deploy termina bien, actualiza el lock).
 *   2. Verificar que las rules activas en el proyecto
 *      `mister-service-app-cloude` coinciden con `firestore.rules` del repo
 *      (Firebase Console en modo lectura o salida del deploy) y que el
 *      cazador vuelve a PASS.
 *
 * Allowlist: NO HAY.
 *
 * Nunca editar ni regenerar `firestore.rules.deployed.lock` para silenciar
 * este cazador. El lock es evidencia de un deploy real; si se reescribe sin
 * deploy, el control afirma una sincronía que no existe y se repite el
 * incidente de SPRINT-103/106. Si el cazador grita y el commit no toca rules,
 * no se asume que "alguien deployó fuera de banda": se trata como pendiente
 * hasta comprobar el estado de producción y, si hace falta, redeployar por la
 * vía de arriba.
 *
 * Historia: versiones anteriores de este encabezado recomendaban sincronizar
 * con `npx tsx scripts/invariantes/marcar-rules-deployadas.ts` sin deploy y
 * ofrecían `git commit --no-verify` como bypass. Ambas recomendaciones se
 * retiraron (2026-10-15) porque permitían saltarse el control sin resolver la
 * desincronía.
 */
import path from 'node:path';
import type { InvariantResult } from './types.js';
import {
  SPEC_FIRESTORE,
  inspeccionarRulesDeploy,
  resultadoRulesDeploy,
} from './estado-rules-deploy.js';

// Lógica compartida con P-013 en `estado-rules-deploy.ts`. `run-all.ts` no
// llama a este `check()`: inspecciona una sola vez y reutiliza el estado para
// aplicar la política de contexto (`politica-publicacion.ts`).
export async function check(): Promise<InvariantResult> {
  const estado = await inspeccionarRulesDeploy(path.resolve(process.cwd()), SPEC_FIRESTORE);
  return resultadoRulesDeploy(estado, SPEC_FIRESTORE);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  check().then((result) => {
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.status === 'fail' ? 1 : 0);
  });
}
