/**
 * Auditoría sistémica: alineación de emails entre `personal/`, `usuarios/{uid}`
 * y Firebase Auth (fuente canónica de verdad) para TODOS los empleados con
 * `uid` no vacío.
 *
 * Disparado por SPRINT-117 fase A2 (porción read-only) el 2026-05-08, que
 * absorbió el alcance de SPRINT-116 fase A. Origen: Jorge intentó cambiar
 * contraseña de Wilainy (`nwilainy@gmail.com`) y GestionUsuarios respondió
 * "No existe usuario con email Nwilainy@gmail.com". El backfill del
 * 2026-05-06 ya había marcado un mismatch para uid
 * `KT9LaszokWNmLCEIe8YOvNKc9rF3` (`usuarios.email=apnbrito0318@gmail.com` ≠
 * `personal.email=nwilainy@gmail.com`). Hipótesis: el patrón se replica.
 *
 * Lee:
 *  - `personal/*` (busca docs con `uid` no vacío).
 *  - `usuarios/{uid}` (verifica existencia y compara email).
 *  - `admin.auth().getUser(uid)` (email canónico de Firebase Auth).
 *
 * Reporta:
 *  - Matriz por empleado: `uid`, `personal.id`, `personal.email`,
 *    `usuarios.email`, `auth.email`, clasificación (`ok`, `case`, `mismatch`,
 *    `usuarios_missing`, `auth_missing`).
 *  - Resumen final con conteos.
 *  - Listado de empleados con `match: mismatch` (los que requieren
 *    intervención humana) ordenado por nombre.
 *
 * Solo lectura. NO modifica nada en Firestore ni en Firebase Auth. La
 * eventual corrección (fase D del SPRINT-116 ABSORBIDO) es caso-por-caso
 * desde la UI/Console — NO hay script de fix masivo automático.
 *
 * Uso:
 *   npx tsx scripts/auditoria-emails-personal-vs-usuarios.ts
 *
 * Requiere `service-account.json` en la raíz del repo (mismo patrón que
 * `scripts/diagnostico-notificaciones-yohana.ts` y
 * `scripts/diagnostico-tecnicoid-auth-uid.ts`).
 */

import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import * as fs from 'fs';
import * as path from 'path';

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

type MatchKind = 'ok' | 'case' | 'mismatch' | 'usuarios_missing' | 'auth_missing' | 'auth_error';

type Fila = {
  personalDocId: string;
  uid: string;
  nombre: string;
  rol?: string;
  activo?: boolean;
  personalEmail: string | null;
  usuariosEmail: string | null;
  authEmail: string | null;
  match: MatchKind;
  detalle: string;
};

function normalize(email: string | null | undefined): string | null {
  if (!email) return null;
  return email.trim().toLowerCase();
}

function clasificar(personalEmail: string | null, usuariosEmail: string | null, authEmail: string | null, usuariosExists: boolean, authExists: boolean): { match: MatchKind; detalle: string } {
  if (!authExists) {
    return { match: 'auth_missing', detalle: 'Firebase Auth no tiene un user con ese uid' };
  }
  if (!usuariosExists) {
    return { match: 'usuarios_missing', detalle: 'usuarios/{uid} no existe (alta vieja sin SPRINT-105 backfill)' };
  }

  const pNorm = normalize(personalEmail);
  const uNorm = normalize(usuariosEmail);
  const aNorm = normalize(authEmail);

  // auth.email es la fuente canónica. Comparar todo contra él.
  // Caso ok: los tres normalizados coinciden Y los originales (case-sensitive) tambien.
  const allLowerMatch = pNorm === aNorm && uNorm === aNorm;
  const allExactMatch = personalEmail === authEmail && usuariosEmail === authEmail;

  if (allExactMatch) return { match: 'ok', detalle: 'los tres emails coinciden case-sensitive' };
  if (allLowerMatch) return { match: 'case', detalle: 'coinciden case-insensitive pero difieren en mayúsculas/espacios' };

  // Mismatch real. Detallar qué difiere.
  const partes: string[] = [];
  if (pNorm !== aNorm) partes.push(`personal.email!=auth.email (${personalEmail} vs ${authEmail})`);
  if (uNorm !== aNorm) partes.push(`usuarios.email!=auth.email (${usuariosEmail} vs ${authEmail})`);
  if (pNorm !== uNorm) partes.push(`personal.email!=usuarios.email`);

  return { match: 'mismatch', detalle: partes.join(' | ') };
}

async function main() {
  console.log('[INFO] Leyendo personal/...');
  const personalSnap = await db.collection('personal').get();
  console.log(`[INFO] personal: ${personalSnap.size} docs total`);

  const conUid = personalSnap.docs.filter((d) => {
    const u = d.data().uid;
    return typeof u === 'string' && u.length > 0;
  });
  const sinUid = personalSnap.size - conUid.length;
  console.log(`[INFO] personal con uid:    ${conUid.length}`);
  console.log(`[INFO] personal sin uid:    ${sinUid} (no auditados — alta vieja sin Auth)`);

  const filas: Fila[] = [];

  for (const doc of conUid) {
    const data = doc.data();
    const personalDocId = doc.id;
    const uid: string = data.uid;
    const personalEmail: string | null = typeof data.email === 'string' ? data.email : null;
    const nombre: string = typeof data.nombre === 'string' ? data.nombre : '?';
    const rol: string | undefined = typeof data.rol === 'string' ? data.rol : undefined;
    const activo: boolean | undefined = typeof data.activo === 'boolean' ? data.activo : undefined;

    // Leer usuarios/{uid}
    let usuariosExists = false;
    let usuariosEmail: string | null = null;
    try {
      const usuarioDoc = await db.collection('usuarios').doc(uid).get();
      if (usuarioDoc.exists) {
        usuariosExists = true;
        const ud = usuarioDoc.data();
        usuariosEmail = typeof ud?.email === 'string' ? ud.email : null;
      }
    } catch {
      usuariosExists = false;
    }

    // Leer Firebase Auth
    let authExists = false;
    let authEmail: string | null = null;
    let authError: string | null = null;
    try {
      const authUser = await auth.getUser(uid);
      authExists = true;
      authEmail = authUser.email ?? null;
    } catch (err: unknown) {
      authExists = false;
      const code = typeof err === 'object' && err !== null && 'code' in err ? (err as { code?: string }).code : undefined;
      if (code === 'auth/user-not-found') {
        authError = 'auth/user-not-found';
      } else if (typeof err === 'object' && err !== null && 'message' in err) {
        authError = String((err as { message?: string }).message ?? 'unknown');
      } else {
        authError = 'unknown';
      }
    }

    let match: MatchKind;
    let detalle: string;
    if (!authExists && authError && authError !== 'auth/user-not-found') {
      match = 'auth_error';
      detalle = `error consultando Auth: ${authError}`;
    } else {
      const c = clasificar(personalEmail, usuariosEmail, authEmail, usuariosExists, authExists);
      match = c.match;
      detalle = c.detalle;
    }

    filas.push({
      personalDocId,
      uid,
      nombre,
      rol,
      activo,
      personalEmail,
      usuariosEmail,
      authEmail,
      match,
      detalle,
    });
  }

  // Resumen general
  const contadores: Record<MatchKind, number> = {
    ok: 0,
    case: 0,
    mismatch: 0,
    usuarios_missing: 0,
    auth_missing: 0,
    auth_error: 0,
  };
  for (const f of filas) contadores[f.match]++;

  console.log('\n─── Resumen general ───');
  console.log(`  Total auditados:                   ${filas.length}`);
  console.log(`  ✓ ok (case-sensitive match):       ${contadores.ok}`);
  console.log(`  ⚠ case (difieren solo case/spaces): ${contadores.case}`);
  console.log(`  ✗ mismatch (emails distintos):      ${contadores.mismatch}`);
  console.log(`  ✗ usuarios/{uid} missing:           ${contadores.usuarios_missing}`);
  console.log(`  ✗ auth/{uid} missing:               ${contadores.auth_missing}`);
  console.log(`  ! auth_error (consulta falló):     ${contadores.auth_error}`);

  // Tabla por empleado
  console.log('\n─── Matriz por empleado ───');
  const ordenadas = [...filas].sort((a, b) => {
    // Primero los problemáticos, luego ok.
    const orderRank: Record<MatchKind, number> = {
      mismatch: 0,
      auth_error: 1,
      auth_missing: 2,
      usuarios_missing: 3,
      case: 4,
      ok: 5,
    };
    const ra = orderRank[a.match];
    const rb = orderRank[b.match];
    if (ra !== rb) return ra - rb;
    return a.nombre.localeCompare(b.nombre);
  });

  for (const f of ordenadas) {
    const marca =
      f.match === 'ok' ? '✓' :
      f.match === 'case' ? '⚠' :
      f.match === 'mismatch' ? '✗' :
      f.match === 'usuarios_missing' ? '✗' :
      f.match === 'auth_missing' ? '✗' :
      '!';
    const rolLabel = f.rol ?? '?';
    const activoLabel = f.activo === false ? ' (inactivo)' : '';
    console.log(`\n  ${marca} ${f.nombre} [${rolLabel}]${activoLabel}`);
    console.log(`      uid:           ${f.uid}`);
    console.log(`      personal.id:   ${f.personalDocId}`);
    console.log(`      personal.email:${f.personalEmail ?? '(null)'}`);
    console.log(`      usuarios.email:${f.usuariosEmail ?? '(null)'}`);
    console.log(`      auth.email:    ${f.authEmail ?? '(null)'}`);
    console.log(`      match:         ${f.match}`);
    console.log(`      detalle:       ${f.detalle}`);
  }

  // Listado focalizado de problemas
  const problemas = filas.filter((f) => f.match === 'mismatch' || f.match === 'usuarios_missing' || f.match === 'auth_missing' || f.match === 'auth_error');
  if (problemas.length > 0) {
    console.log(`\n─── Empleados que requieren intervención humana (${problemas.length}) ───`);
    for (const p of problemas) {
      console.log(`  - ${p.nombre} (uid=${p.uid.substring(0, 12)}...) → ${p.match}`);
      console.log(`      personal.email=${p.personalEmail ?? '(null)'}`);
      console.log(`      usuarios.email=${p.usuariosEmail ?? '(null)'}`);
      console.log(`      auth.email=${p.authEmail ?? '(null)'}`);
    }
    console.log('\n  Recomendación: cada caso se resuelve manual desde GestionUsuarios');
    console.log('  o desde Firebase Console (Auth → Users → editar email). NO hay script');
    console.log('  de fix masivo automático — la elección del email canónico requiere');
    console.log('  decisión humana.');
  } else {
    console.log('\n[OK] Todos los empleados con uid tienen los tres emails alineados case-sensitive.');
  }

  // Diagnóstico final
  console.log('\n─── Diagnóstico final ───');
  if (contadores.mismatch === 0 && contadores.usuarios_missing === 0 && contadores.auth_missing === 0 && contadores.auth_error === 0) {
    if (contadores.case === 0) {
      console.log('  El universo de empleados está limpio: emails alineados case-sensitive');
      console.log('  entre personal/, usuarios/{uid} y Firebase Auth para los',
        contadores.ok, 'empleados auditados.');
    } else {
      console.log(`  ${contadores.case} empleados con emails que coinciden case-insensitive pero`);
      console.log('  difieren en mayúsculas/espacios. La app puede normalizar al consultar');
      console.log('  o no — depende de cada flujo. Riesgo bajo si las queries usan toLowerCase().');
    }
  } else {
    console.log(`  Detectados ${contadores.mismatch + contadores.usuarios_missing + contadores.auth_missing + contadores.auth_error} empleados con problemas.`);
    console.log('  Ver listado arriba. Cada caso se resuelve caso-por-caso (ver SPRINT-116');
    console.log('  fase D ABSORBIDO en SPRINT-117).');
  }
}

main().catch((err) => {
  console.error('[ERROR]', err);
  process.exit(1);
});
