/**
 * P-013 — `storage.rules` modificado en el repo pero no deployado a producción.
 *
 * Patrón espejo de P-005 (firestore.rules). Bug pattern original que motivó
 * el cazador hermano: SPRINT-103/106 (2026-05-06/07) donde el feature
 * "Iniciar chequeo Aury" se pusheó con rules actualizadas pero sin ejecutar
 * `npm run deploy:rules`. Las rules de producción siguieron con la versión
 * vieja y los técnicos recibieron permission-denied silencioso por ~24h.
 *
 * Para Storage el síntoma sería análogo: si el path `whatsapp-media/**`
 * (o cualquier otro nuevo) se agrega a `storage.rules` en el repo pero no
 * se deploya, el endpoint server-side podría seguir funcionando (Admin SDK
 * ignora rules) pero las lecturas client-side fallarían con
 * `storage/unauthorized`.
 *
 * Síntoma: feature compilado + pusheado, código pide leer/escribir un path
 * cubierto por las rules NUEVAS, pero las rules ACTIVAS en producción son
 * la versión anterior → unauthorized.
 *
 * Causa raíz: `git push` no triggerea deploy de rules. Vercel deploy del
 * frontend SÍ se dispara automático por GitHub webhook. Las rules de Storage
 * requieren `firebase deploy --only storage:rules` ejecutado a mano por el
 * coordinator/Jorge. Si nadie lo ejecuta, hay desincronía silenciosa.
 *
 * Estrategia (heurística determinística):
 *
 * 1. Calcular SHA-256 del `storage.rules` actual.
 * 2. Leer `storage.rules.deployed.lock` (escrito por
 *    `marcar-storage-rules-deployadas.ts` después de cada deploy real).
 * 3. Si los hashes difieren → FAIL.
 * 4. Si el lock no existe → WARN (cold start, primer setup post-SPRINT-138).
 * 5. Si `storage.rules` no existe → PASS (cazador N/A; aplica solo a repos
 *    que ya versionan rules de Storage).
 *
 * Recuperación (única vía válida):
 *   1. Con autorización explícita de Jorge, desplegar de verdad:
 *      `npm run deploy:storage-rules` (corre firebase deploy y, solo si el
 *      deploy termina bien, actualiza el lock).
 *   2. Verificar que las rules de Storage activas en producción coinciden con
 *      `storage.rules` del repo y que el cazador vuelve a PASS.
 *
 * Allowlist: NO HAY.
 *
 * Nunca editar ni regenerar `storage.rules.deployed.lock` para silenciar este
 * cazador: el lock es evidencia de un deploy real. Si el cazador grita y el
 * commit no toca storage.rules, se trata como pendiente hasta comprobar el
 * estado de producción y, si hace falta, redeployar por la vía de arriba.
 *
 * Historia: versiones anteriores de este encabezado ofrecían
 * `git commit --no-verify` como bypass de emergencia y sugerían sincronizar el
 * lock con `marcar-storage-rules-deployadas.ts` sin deploy. Se retiraron
 * (2026-10-15) porque saltaban el control sin resolver la desincronía.
 */
import path from 'node:path';
import type { InvariantResult } from './types.js';
import {
  SPEC_STORAGE,
  inspeccionarRulesDeploy,
  resultadoRulesDeploy,
} from './estado-rules-deploy.js';

// Lógica compartida con P-005 en `estado-rules-deploy.ts`. `run-all.ts` no
// llama a este `check()`: inspecciona una sola vez y reutiliza el estado para
// aplicar la política de contexto (`politica-publicacion.ts`).
export async function check(): Promise<InvariantResult> {
  const estado = await inspeccionarRulesDeploy(path.resolve(process.cwd()), SPEC_STORAGE);
  return resultadoRulesDeploy(estado, SPEC_STORAGE);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  check().then((result) => {
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.status === 'fail' ? 1 : 0);
  });
}
