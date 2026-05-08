/**
 * Fix email canónico de Wilainy Operaria en Firebase Auth + `usuarios/{uid}`.
 *
 * Disparado por SPRINT-118 fase 2 (autorizado por jorge en BLOQUEOS.md →
 * desbloqueado el 2026-05-08; coordinator NO ejecuta `--apply` autónomo, Jorge
 * ejecuta manualmente).
 *
 * Contexto:
 *  - Jorge intentó cambiar la contraseña de Wilainy desde GestionUsuarios y
 *    el sistema respondió "no existe usuario con ese email" porque el email
 *    registrado en Firebase Auth (`apnbrito0318@gmail.com`) no le pertenece.
 *  - Jorge confirmó que la casilla a la que Wilainy tiene acceso real es
 *    `Nwilainy@gmail.com` (con N mayúscula).
 *  - `personal/{j944265Su9Hyw29YQTj8}.email` ya está correcto (`Nwilainy@gmail.com`),
 *    NO se toca.
 *  - `usuarios/{KT9LaszokWNmLCEIe8YOvNKc9rF3}.email` está incorrecto y debe
 *    pasar a `Nwilainy@gmail.com`.
 *  - Firebase Auth user `KT9LaszokWNmLCEIe8YOvNKc9rF3` tiene email
 *    `apnbrito0318@gmail.com` y debe pasar a `Nwilainy@gmail.com`.
 *
 * Scope autorizado (rígido — el script aborta si algo no matchea):
 *  - uid:                KT9LaszokWNmLCEIe8YOvNKc9rF3
 *  - personalDocId:      j944265Su9Hyw29YQTj8
 *  - emailViejoEsperado: apnbrito0318@gmail.com (case-insensitive)
 *  - emailNuevo:         Nwilainy@gmail.com
 *
 * Lo que hace:
 *  1. Verifica que `personal/{personalDocIdEsperado}` exista y tenga
 *     `uid == authUidEsperado`. Si no matchea → aborta sin escribir nada.
 *  2. Lee Firebase Auth user `{uid}` y verifica que su email actual sea el
 *     emailViejoEsperado (case-insensitive). Si ya está en el emailNuevo →
 *     idempotente, skip Auth update. Si está en otro valor → aborta.
 *  3. Lee `usuarios/{uid}` y verifica idem.
 *  4. En modo apply:
 *     a. `admin.auth().updateUser(uid, { email: 'Nwilainy@gmail.com' })`.
 *     b. `usuarios/{uid}` update `email = 'Nwilainy@gmail.com'`.
 *  5. Audit log en `auditoria_admin` con accion `fix_email_wilainy`.
 *
 * Lo que NO hace (por diseño):
 *  - NO toca contraseña.
 *  - NO crea nuevo user ni elimina el viejo.
 *  - NO toca `personal/{personalDocId}.email` (ya está correcto).
 *  - NO migra notificaciones.
 *  - NO modifica rules.
 *  - NO afecta a otros usuarios.
 *
 * Uso:
 *   npx tsx scripts/fix-email-wilainy.ts             # DRY-RUN por default
 *   npx tsx scripts/fix-email-wilainy.ts --apply     # aplica el cambio
 *
 * Idempotencia: si Auth y `usuarios/{uid}` ya tienen el emailNuevo, skip ambos.
 *
 * Requiere `service-account.json` en la raíz del repo.
 */

import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import * as fs from 'fs';
import * as path from 'path';

const SCOPE = {
  uid: 'KT9LaszokWNmLCEIe8YOvNKc9rF3',
  personalDocIdEsperado: 'j944265Su9Hyw29YQTj8',
  emailViejoEsperado: 'apnbrito0318@gmail.com',
  emailNuevo: 'Nwilainy@gmail.com',
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
const auth = getAuth();

function normalize(email: string | null | undefined): string | null {
  if (!email) return null;
  return email.trim().toLowerCase();
}

type ResultadoStep = 'actualizado' | 'ya_alineado' | 'aborto_validacion';

interface StepReport {
  step: 'auth_update' | 'usuarios_update';
  emailAntes: string | null;
  emailDespues: string;
  resultado: ResultadoStep;
  notas?: string;
}

async function main() {
  const apply = process.argv.includes('--apply');
  const modo = apply ? 'APLICAR' : 'DRY-RUN';
  console.log(`[INFO] Modo: ${modo}`);
  console.log(`[INFO] Scope: fix email de Wilainy (uid=${SCOPE.uid}).`);
  console.log(`        emailViejoEsperado: ${SCOPE.emailViejoEsperado}`);
  console.log(`        emailNuevo:         ${SCOPE.emailNuevo}`);

  const reports: StepReport[] = [];

  // 1. Validar contra realidad: leer personal/{personalDocIdEsperado}.
  const personalRef = db.collection('personal').doc(SCOPE.personalDocIdEsperado);
  const personalSnap = await personalRef.get();
  if (!personalSnap.exists) {
    console.error(`[ERROR] No existe personal/${SCOPE.personalDocIdEsperado}. Aborta.`);
    process.exit(1);
  }
  const personalData = personalSnap.data() ?? {};
  const personalUid = personalData.uid as string | undefined;
  const personalEmail = personalData.email as string | undefined;

  console.log(`\n─── Validación contra realidad ───`);
  console.log(`  personal.id:    ${SCOPE.personalDocIdEsperado}`);
  console.log(`  personal.uid:   ${personalUid ?? '(null)'}`);
  console.log(`  personal.email: ${personalEmail ?? '(null)'}`);

  if (personalUid !== SCOPE.uid) {
    console.error(
      `[ERROR] personal.uid (${personalUid ?? '(null)'}) != SCOPE.uid (${SCOPE.uid}). Aborta sin escribir.`,
    );
    process.exit(1);
  }
  if (normalize(personalEmail) !== normalize(SCOPE.emailNuevo)) {
    console.error(
      `[ERROR] personal.email (${personalEmail}) no matchea SCOPE.emailNuevo (${SCOPE.emailNuevo}). Aborta sin escribir.`,
    );
    console.error('        Hipótesis del sprint era que personal.email ya estaba correcto.');
    process.exit(1);
  }
  console.log(`  [OK] personal.uid y personal.email matchean scope.`);

  // 2. Leer Firebase Auth user.
  let authUser;
  try {
    authUser = await auth.getUser(SCOPE.uid);
  } catch (err) {
    console.error(`[ERROR] No se pudo leer auth.getUser(${SCOPE.uid}):`, err);
    process.exit(1);
  }
  const authEmailAntes = authUser.email ?? null;
  console.log(`\n─── Firebase Auth user ───`);
  console.log(`  uid:    ${authUser.uid}`);
  console.log(`  email:  ${authEmailAntes ?? '(null)'}`);

  // Idempotencia o validación.
  const authReport: StepReport = (() => {
    if (normalize(authEmailAntes) === normalize(SCOPE.emailNuevo)) {
      return {
        step: 'auth_update',
        emailAntes: authEmailAntes,
        emailDespues: SCOPE.emailNuevo,
        resultado: 'ya_alineado',
        notas: 'Auth.email ya está en emailNuevo. Skip.',
      };
    }
    if (normalize(authEmailAntes) !== normalize(SCOPE.emailViejoEsperado)) {
      return {
        step: 'auth_update',
        emailAntes: authEmailAntes,
        emailDespues: SCOPE.emailNuevo,
        resultado: 'aborto_validacion',
        notas: `Auth.email (${authEmailAntes}) no matchea emailViejoEsperado (${SCOPE.emailViejoEsperado}). NO se sobrescribe.`,
      };
    }
    return {
      step: 'auth_update',
      emailAntes: authEmailAntes,
      emailDespues: SCOPE.emailNuevo,
      resultado: 'actualizado',
    };
  })();
  reports.push(authReport);

  // 3. Leer usuarios/{uid}.
  const usuariosRef = db.collection('usuarios').doc(SCOPE.uid);
  const usuariosSnap = await usuariosRef.get();
  if (!usuariosSnap.exists) {
    console.error(`[ERROR] No existe usuarios/${SCOPE.uid}. Aborta sin escribir nada.`);
    process.exit(1);
  }
  const usuariosData = usuariosSnap.data() ?? {};
  const usuariosEmailAntes =
    typeof usuariosData.email === 'string' ? usuariosData.email : null;
  console.log(`\n─── usuarios/{uid} ───`);
  console.log(`  email: ${usuariosEmailAntes ?? '(null)'}`);

  const usuariosReport: StepReport = (() => {
    if (normalize(usuariosEmailAntes) === normalize(SCOPE.emailNuevo)) {
      return {
        step: 'usuarios_update',
        emailAntes: usuariosEmailAntes,
        emailDespues: SCOPE.emailNuevo,
        resultado: 'ya_alineado',
        notas: 'usuarios.email ya está en emailNuevo. Skip.',
      };
    }
    if (normalize(usuariosEmailAntes) !== normalize(SCOPE.emailViejoEsperado)) {
      return {
        step: 'usuarios_update',
        emailAntes: usuariosEmailAntes,
        emailDespues: SCOPE.emailNuevo,
        resultado: 'aborto_validacion',
        notas: `usuarios.email (${usuariosEmailAntes}) no matchea emailViejoEsperado (${SCOPE.emailViejoEsperado}). NO se sobrescribe.`,
      };
    }
    return {
      step: 'usuarios_update',
      emailAntes: usuariosEmailAntes,
      emailDespues: SCOPE.emailNuevo,
      resultado: 'actualizado',
    };
  })();
  reports.push(usuariosReport);

  // 4. Mostrar plan.
  console.log(`\n─── Plan ───`);
  for (const r of reports) {
    console.log(`  - ${r.step}`);
    console.log(`      antes:    ${r.emailAntes ?? '(null)'}`);
    console.log(`      despues:  ${r.emailDespues}`);
    console.log(`      resultado: ${r.resultado}`);
    if (r.notas) console.log(`      notas:     ${r.notas}`);
  }

  // Si hay validación abortada, NO aplicar nada (defensa: no querés actualizar
  // solo Auth y dejar usuarios desincronizado).
  const hayAborto = reports.some((r) => r.resultado === 'aborto_validacion');
  if (hayAborto) {
    console.error(`\n[ERROR] Al menos un step abortó por validación. NO se aplicó NINGÚN cambio.`);
    console.error('        Revisar manualmente el estado real antes de re-correr.');
    process.exit(1);
  }

  // 5. Aplicar.
  if (apply) {
    if (authReport.resultado === 'actualizado') {
      await auth.updateUser(SCOPE.uid, { email: SCOPE.emailNuevo });
      console.log(`\n  [OK] auth.updateUser(${SCOPE.uid}, { email: ${SCOPE.emailNuevo} })`);
    } else {
      console.log(`\n  [SKIP] auth_update (${authReport.resultado}).`);
    }

    if (usuariosReport.resultado === 'actualizado') {
      await usuariosRef.update({
        email: SCOPE.emailNuevo,
        emailFixedEn: FieldValue.serverTimestamp(),
        emailFixedPor: 'script_fix-email-wilainy',
      });
      console.log(`  [OK] usuarios/${SCOPE.uid}.email = ${SCOPE.emailNuevo}`);
    } else {
      console.log(`  [SKIP] usuarios_update (${usuariosReport.resultado}).`);
    }

    // Audit log — solo si al menos un step se aplicó.
    const huboCambio = reports.some((r) => r.resultado === 'actualizado');
    if (huboCambio) {
      await db.collection('auditoria_admin').add({
        accion: 'fix_email_wilainy',
        sprintId: 'SPRINT-118-fase-2',
        actorScript: 'scripts/fix-email-wilainy.ts',
        ejecutadoEn: FieldValue.serverTimestamp(),
        scope: {
          uid: SCOPE.uid,
          personalDocId: SCOPE.personalDocIdEsperado,
          emailViejoEsperado: SCOPE.emailViejoEsperado,
          emailNuevo: SCOPE.emailNuevo,
        },
        steps: reports.map((r) => ({
          step: r.step,
          emailAntes: r.emailAntes,
          emailDespues: r.emailDespues,
          resultado: r.resultado,
        })),
      });
      console.log(`  [OK] Entrada de auditoría escrita en auditoria_admin/`);
    } else {
      console.log(`  [INFO] Nada cambió (todo ya alineado). No se escribe audit log.`);
    }
  }

  console.log(`\n─── Resumen ───`);
  console.log(`  Modo: ${modo}`);
  for (const r of reports) {
    console.log(`  - ${r.step}: ${r.resultado}`);
  }

  if (!apply) {
    console.log(`\n[INFO] DRY-RUN — nada fue escrito a Firebase Auth ni Firestore.`);
    console.log(`       Para ejecutar real: npx tsx scripts/fix-email-wilainy.ts --apply`);
  } else {
    console.log(`\n[OK] Fix aplicado.`);
    console.log(`     Próximo paso:`);
    console.log(`       1. Jorge prueba reset de contraseña de Wilainy desde GestionUsuarios`);
    console.log(`          contra ${SCOPE.emailNuevo} y confirma que ya no tira "no existe".`);
    console.log(`       2. Wilainy recibe el reset en su casilla y completa el cambio.`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('\n[ERROR] Falló el fix de email:', err);
    process.exit(1);
  });
