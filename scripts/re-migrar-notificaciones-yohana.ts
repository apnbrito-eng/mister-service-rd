/**
 * Re-migración acotada: setea `userId = <auth.uid de Yohana>` en los 3 docs
 * de `notificaciones` que el script de diagnóstico identificó como Caso A
 * para Yohana Operaria (email `melissabalbuena08@gmail.com`).
 *
 * Disparado por SPRINT-115 fase write (autorizado por jorge en BLOQUEOS.md
 * el 2026-05-08, hash de OK: `ff61875`).
 *
 * Scope autorizado (rígido — el script aborta si algo no matchea):
 *  - Email del usuario:  melissabalbuena08@gmail.com
 *  - auth.uid esperado:  HGkVoYpGKzL4JJI7FnTpHjdsM972
 *  - personalDocId esperado (el valor mal guardado en notifs): zFhokrDoPH9lD63ZxKAY
 *  - 3 docs:
 *     - F9BV32k4JEoEOk97K4xc
 *     - TVwtOtmNlzW334IUIUdF
 *     - VWjdYBRmKgU8rGPlbJAv
 *
 * Lo que hace:
 *  1. Verifica que `personal where email == melissabalbuena08@gmail.com`
 *     resuelva al `auth.uid` esperado y al `personalDocId` esperado.
 *     Si no matchean → aborta sin escribir nada.
 *  2. Para cada uno de los 3 docs:
 *     a. Lee el doc.
 *     b. Verifica que `userId == personalDocId esperado` o que ya esté
 *        en el valor objetivo (idempotencia). Si está en otro valor →
 *        warn y skip.
 *     c. En modo --dry-run: log shape antes/después, no escribe.
 *     d. En modo aplicar: setea `userId = <auth.uid>`. NO toca destinatarioId
 *        ni ningún otro campo.
 *  3. Después de los 3 updates: escribe entrada de auditoría en
 *     `auditoria_admin` con accion `remigracion_notificaciones_yohana`,
 *     listando los docs tocados.
 *
 * Lo que NO hace (por diseño):
 *  - NO toca `destinatarioId` (la lectura dual del service ya lo soporta;
 *    cambiarlo requeriría más auditoría).
 *  - NO toca campos `leida`, `leidaEn`, `tipo`, `titulo`, `descripcion`, etc.
 *  - NO migra notificaciones de OTROS usuarios (si el patrón existe en otros,
 *    abrir SPRINT-116 con su propio OK).
 *  - NO modifica rules.
 *  - NO borra docs.
 *
 * Uso:
 *   npx tsx scripts/re-migrar-notificaciones-yohana.ts             # DRY-RUN por default (no escribe)
 *   npx tsx scripts/re-migrar-notificaciones-yohana.ts --apply     # ejecuta los updates reales
 *
 * Idempotencia: si los docs ya tienen `userId == auth.uid esperado`, el
 * script reporta "ya alineado" y no escribe. Seguro de correr múltiples veces.
 *
 * Requiere `service-account.json` en la raíz del repo (mismo patrón que
 * `scripts/diagnostico-notificaciones-yohana.ts` y `scripts/migrar-notificaciones-userid.ts`).
 */

import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import * as fs from 'fs';
import * as path from 'path';

// Constantes del scope autorizado por jorge en BLOQUEOS.md (2026-05-08).
// Si algo no matchea exactamente con estas constantes, el script aborta.
const SCOPE = {
  email: 'melissabalbuena08@gmail.com',
  authUidEsperado: 'HGkVoYpGKzL4JJI7FnTpHjdsM972',
  personalDocIdEsperado: 'zFhokrDoPH9lD63ZxKAY',
  docsAutorizados: [
    'F9BV32k4JEoEOk97K4xc',
    'TVwtOtmNlzW334IUIUdF',
    'VWjdYBRmKgU8rGPlbJAv',
  ] as const,
} as const;

const SERVICE_ACCOUNT_PATH = path.resolve('service-account.json');

if (!getApps().length) {
  if (!fs.existsSync(SERVICE_ACCOUNT_PATH)) {
    console.error('[ERROR] No existe service-account.json en la raíz del repo.');
    process.exit(1);
  }
  const serviceAccount = JSON.parse(fs.readFileSync(SERVICE_ACCOUNT_PATH, 'utf-8'));
  initializeApp({ credential: cert(serviceAccount) });
}

const db = getFirestore();

type Resultado = 'actualizado' | 'ya_alineado' | 'skip_userId_inesperado' | 'no_existe';

interface ShapeAntesDespues {
  id: string;
  userIdAntes: string | null;
  userIdDespues: string;
  destinatarioIdAntes: string | null;
  resultado: Resultado;
  notas?: string;
}

async function main() {
  const apply = process.argv.includes('--apply');
  const modo = apply ? 'APLICAR' : 'DRY-RUN';
  console.log(`[INFO] Modo: ${modo}`);
  console.log(`[INFO] Scope: ${SCOPE.email} → ${SCOPE.docsAutorizados.length} docs autorizados`);

  // 1. Verificar que personal/email == scope.
  const personalSnap = await db
    .collection('personal')
    .where('email', '==', SCOPE.email)
    .get();
  if (personalSnap.empty) {
    console.error(`[ERROR] No se encontró personal con email == "${SCOPE.email}".`);
    console.error('        Aborta sin escribir nada. Verificá que el alta no haya cambiado.');
    process.exit(1);
  }
  if (personalSnap.size > 1) {
    console.error(`[ERROR] ${personalSnap.size} docs en personal con ese email. Inesperado. Abortando.`);
    process.exit(1);
  }
  const personalDoc = personalSnap.docs[0];
  const personalDocIdReal = personalDoc.id;
  const personalData = personalDoc.data();
  const authUidReal: string | undefined = personalData.uid;

  console.log(`\n─── Usuario resuelto ───`);
  console.log(`  email:           ${personalData.email}`);
  console.log(`  nombre:          ${personalData.nombre || '?'}`);
  console.log(`  rol:             ${personalData.rol || '?'}`);
  console.log(`  personal.id:     ${personalDocIdReal}`);
  console.log(`  personal.uid:    ${authUidReal || '(no seteado)'}`);

  // 2. Doble verificación contra constantes del scope. Si algo no matchea, abortar.
  if (authUidReal !== SCOPE.authUidEsperado) {
    console.error(`\n[ERROR] auth.uid no matchea el scope autorizado.`);
    console.error(`        Esperado: ${SCOPE.authUidEsperado}`);
    console.error(`        Real:     ${authUidReal}`);
    console.error('        Abortando sin escribir nada.');
    process.exit(1);
  }
  if (personalDocIdReal !== SCOPE.personalDocIdEsperado) {
    console.error(`\n[ERROR] personalDocId no matchea el scope autorizado.`);
    console.error(`        Esperado: ${SCOPE.personalDocIdEsperado}`);
    console.error(`        Real:     ${personalDocIdReal}`);
    console.error('        Abortando sin escribir nada.');
    process.exit(1);
  }
  console.log(`  [OK] Scope validado contra OK Jorge en BLOQUEOS.md.`);

  // 3. Para cada doc autorizado, leer y validar antes de tocar.
  const resultados: ShapeAntesDespues[] = [];

  for (const docId of SCOPE.docsAutorizados) {
    const ref = db.collection('notificaciones').doc(docId);
    const snap = await ref.get();

    if (!snap.exists) {
      resultados.push({
        id: docId,
        userIdAntes: null,
        userIdDespues: SCOPE.authUidEsperado,
        destinatarioIdAntes: null,
        resultado: 'no_existe',
        notas: 'Doc no existe en notificaciones/. Skip.',
      });
      continue;
    }

    const data = snap.data() ?? {};
    const userIdAntes = typeof data.userId === 'string' ? data.userId : null;
    const destinatarioIdAntes =
      typeof data.destinatarioId === 'string' ? data.destinatarioId : null;

    // Idempotencia: ya alineado.
    if (userIdAntes === SCOPE.authUidEsperado) {
      resultados.push({
        id: docId,
        userIdAntes,
        userIdDespues: SCOPE.authUidEsperado,
        destinatarioIdAntes,
        resultado: 'ya_alineado',
        notas: 'userId ya está en auth.uid. Skip.',
      });
      continue;
    }

    // Defensa: solo aceptamos userId == personalDocId esperado (Caso A confirmado).
    // Si es null, también lo migramos (mismo vector). Si es otro valor, abort de
    // ese doc (no del script entero) — eso es señal de algo que no entendemos.
    if (userIdAntes !== null && userIdAntes !== SCOPE.personalDocIdEsperado) {
      resultados.push({
        id: docId,
        userIdAntes,
        userIdDespues: SCOPE.authUidEsperado,
        destinatarioIdAntes,
        resultado: 'skip_userId_inesperado',
        notas: `userId actual (${userIdAntes}) no es null ni personalDocId esperado. NO se sobrescribe — revisar manualmente.`,
      });
      continue;
    }

    // Aplicar (o dry-run).
    if (apply) {
      await ref.update({
        userId: SCOPE.authUidEsperado,
        // sello de auditoría de la propia mutación.
        remigradoEn: FieldValue.serverTimestamp(),
        remigradoPor: 'script_re-migrar-notificaciones-yohana',
      });
    }

    resultados.push({
      id: docId,
      userIdAntes,
      userIdDespues: SCOPE.authUidEsperado,
      destinatarioIdAntes,
      resultado: 'actualizado',
    });
  }

  // 4. Reportar resultado por doc.
  console.log(`\n─── Resultado por doc ───`);
  for (const r of resultados) {
    console.log(`  - ${r.id}`);
    console.log(`      userIdAntes:        ${r.userIdAntes ?? '(null)'}`);
    console.log(`      userIdDespues:      ${r.userIdDespues}`);
    console.log(`      destinatarioIdAntes: ${r.destinatarioIdAntes ?? '(null)'} (NO modificado)`);
    console.log(`      resultado:          ${r.resultado}`);
    if (r.notas) console.log(`      notas:              ${r.notas}`);
  }

  const actualizados = resultados.filter((r) => r.resultado === 'actualizado').length;
  const yaAlineados = resultados.filter((r) => r.resultado === 'ya_alineado').length;
  const skips = resultados.filter(
    (r) => r.resultado === 'skip_userId_inesperado' || r.resultado === 'no_existe',
  ).length;

  console.log(`\n─── Resumen ───`);
  console.log(`  Modo:            ${modo}`);
  console.log(`  Total docs scope: ${SCOPE.docsAutorizados.length}`);
  console.log(`  ${apply ? 'Actualizados' : 'Que se actualizarían'}: ${actualizados}`);
  console.log(`  Ya alineados (idempotencia): ${yaAlineados}`);
  console.log(`  Skips (revisar):  ${skips}`);

  // 5. Auditoría — solo en modo apply, solo si hubo updates.
  if (apply && actualizados > 0) {
    await db.collection('auditoria_admin').add({
      accion: 'remigracion_notificaciones_yohana',
      sprintId: 'SPRINT-115-fase-write',
      okJorgeBloqueosCommit: 'ff61875',
      actorScript: 'scripts/re-migrar-notificaciones-yohana.ts',
      ejecutadoEn: FieldValue.serverTimestamp(),
      docsAfectados: resultados
        .filter((r) => r.resultado === 'actualizado')
        .map((r) => r.id),
      docsNoModificados: resultados
        .filter((r) => r.resultado !== 'actualizado')
        .map((r) => ({ id: r.id, resultado: r.resultado })),
      scope: {
        email: SCOPE.email,
        authUid: SCOPE.authUidEsperado,
        personalDocId: SCOPE.personalDocIdEsperado,
      },
    });
    console.log(`\n  [OK] Entrada de auditoría escrita en auditoria_admin/`);
  }

  if (!apply) {
    console.log(`\n[INFO] DRY-RUN — nada fue escrito a Firestore.`);
    console.log(`       Para ejecutar real: npx tsx scripts/re-migrar-notificaciones-yohana.ts --apply`);
  } else {
    console.log(`\n[OK] Re-migración aplicada.`);
    console.log(`     Próximo paso: pedirle a Yohana hard refresh y verificar campanita.`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('\n[ERROR] Falló la re-migración:', err);
    process.exit(1);
  });
