/**
 * QA Sanity Check — valida que las 5 cuentas QA dedicadas del SPRINT-QA-USER
 * existen y están bien configuradas para la sesión QA E2E del sidepanel.
 *
 * Origen: SPRINT-QA-USER (2026-05-15). Jorge decidió ruta B (5 cuentas QA
 * dedicadas, no super-admin único ni override impersonation). Este script
 * corre antes de cada sesión QA para detectar drift (cuenta borrada, rol
 * cambiado, doc duplicado, doc espejo `usuarios/{uid}` ausente).
 *
 * Comprobaciones por cuenta:
 *   1. `personal where email == qa-*@misterservicerd.com` → existe 1 doc.
 *   2. `personal.rol` matchea el rol esperado del catálogo.
 *   3. `personal.uid` no vacío.
 *   4. `usuarios/{personal.uid}` existe (cumple invariante P-004 alta doble doc).
 *   5. `usuarios/{personal.uid}.rol` coincide con `personal.rol` (sin drift).
 *   6. Firebase Auth tiene un usuario para ese uid + email.
 *
 * Output: tabla por cuenta con clasificación (`ok`, `falta`, `rol_drift`,
 * `usuario_faltante`, `auth_faltante`, `doc_duplicado`) + resumen final.
 *
 * Read-only — NO escribe. NO modifica nada en Firestore ni en Auth.
 *
 * Uso:
 *   npx tsx scripts/qa-sanity-check.ts
 *
 * Exit codes:
 *   0 — todas las cuentas en estado `ok`.
 *   1 — al menos una cuenta con drift.
 *
 * Requiere `service-account.json` en la raíz del repo (mismo patrón que
 * scripts/auditoria-emails-personal-vs-usuarios.ts).
 *
 * Convención: las cuentas QA tienen email con prefijo `qa-` y dominio
 * `@misterservicerd.com`. Cualquier nuevo flujo QA debe respetar este
 * prefijo. El cazador (si se agrega como P-XXX nuevo en backlog futuro)
 * detectaría hardcodes fuera de scripts/qa-*.
 *
 * Política operativa (ver docs/QA_SUPER_USER.md):
 *   - NUNCA usar estas cuentas para crear datos reales en producción.
 *   - Cliente siempre "QA Test" + teléfono `8090000000` + obs "TEST QA <fecha>".
 *   - Si una rule bloquea acción legítima del rol QA, reportar como bug real
 *     (significa que un usuario real con ese rol también está bloqueado).
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
    console.error('        Descargalo desde Firebase Console → Project Settings →');
    console.error('        Service accounts → Generate new private key.');
    process.exit(1);
  }
  const serviceAccount = JSON.parse(fs.readFileSync(SERVICE_ACCOUNT_PATH, 'utf-8'));
  initializeApp({ credential: cert(serviceAccount) });
}

const db = getFirestore();
const auth = getAuth();

type RolQA = 'secretaria' | 'tecnico' | 'operaria' | 'coordinadora' | 'administrador';

interface CuentaQA {
  email: string;
  rolEsperado: RolQA;
  nombreSimbolico: string;
}

// Catálogo único — fuente de verdad. Cualquier cambio aquí debe replicarse
// en docs/QA_SUPER_USER.md.
const CUENTAS_QA: CuentaQA[] = [
  { email: 'qa-secretaria@misterservicerd.com', rolEsperado: 'secretaria', nombreSimbolico: 'QA Secretaria Sidepanel' },
  { email: 'qa-tecnica@misterservicerd.com', rolEsperado: 'tecnico', nombreSimbolico: 'QA Técnica Sidepanel' },
  { email: 'qa-operaria@misterservicerd.com', rolEsperado: 'operaria', nombreSimbolico: 'QA Operaria Sidepanel' },
  { email: 'qa-coordinadora@misterservicerd.com', rolEsperado: 'coordinadora', nombreSimbolico: 'QA Coordinadora Sidepanel' },
  { email: 'qa-admin@misterservicerd.com', rolEsperado: 'administrador', nombreSimbolico: 'QA Admin Sidepanel' },
];

type Clasificacion =
  | 'ok'
  | 'falta'
  | 'doc_duplicado'
  | 'uid_vacio'
  | 'rol_drift_personal'
  | 'usuario_faltante'
  | 'rol_drift_usuario'
  | 'auth_faltante'
  | 'auth_email_mismatch';

interface ResultadoCuenta {
  email: string;
  rolEsperado: RolQA;
  clasificacion: Clasificacion;
  personalId: string | null;
  uid: string | null;
  personalRol: string | null;
  usuariosRol: string | null;
  authEmail: string | null;
  notas: string[];
}

function emailLower(s: string): string {
  return (s || '').trim().toLowerCase();
}

async function chequearCuenta(cuenta: CuentaQA): Promise<ResultadoCuenta> {
  const r: ResultadoCuenta = {
    email: cuenta.email,
    rolEsperado: cuenta.rolEsperado,
    clasificacion: 'ok',
    personalId: null,
    uid: null,
    personalRol: null,
    usuariosRol: null,
    authEmail: null,
    notas: [],
  };

  // 1. Buscar en personal/. Firestore es case-sensitive; probamos lowercase
  //    primero y, si no encuentra, fallback con el email tal cual.
  const targetLower = emailLower(cuenta.email);
  let snap = await db.collection('personal').where('email', '==', targetLower).get();
  if (snap.empty) {
    snap = await db.collection('personal').where('email', '==', cuenta.email).get();
  }

  if (snap.empty) {
    r.clasificacion = 'falta';
    r.notas.push(`No existe doc en personal/ con email ${cuenta.email}`);
    return r;
  }

  if (snap.size > 1) {
    r.clasificacion = 'doc_duplicado';
    r.notas.push(`personal/ tiene ${snap.size} docs con email ${cuenta.email} — debe ser 1`);
    snap.docs.forEach((d) => r.notas.push(`   doc ${d.id} uid=${d.data().uid ?? '(vacio)'} rol=${d.data().rol ?? '(vacio)'}`));
    return r;
  }

  const personalDoc = snap.docs[0];
  const personalData = personalDoc.data();
  r.personalId = personalDoc.id;
  r.uid = personalData.uid || null;
  r.personalRol = personalData.rol || null;

  if (!r.uid) {
    r.clasificacion = 'uid_vacio';
    r.notas.push(`personal/${r.personalId}.uid está vacío — alta incompleta`);
    return r;
  }

  if (r.personalRol !== cuenta.rolEsperado) {
    r.clasificacion = 'rol_drift_personal';
    r.notas.push(`personal/${r.personalId}.rol = "${r.personalRol}" pero el catálogo QA dice "${cuenta.rolEsperado}"`);
    // sigue chequeando para reportar todo de una.
  }

  // 2. usuarios/{uid} debe existir (P-004).
  const usuarioRef = await db.collection('usuarios').doc(r.uid).get();
  if (!usuarioRef.exists) {
    if (r.clasificacion === 'ok') r.clasificacion = 'usuario_faltante';
    r.notas.push(`usuarios/${r.uid} no existe — viola invariante P-004 (alta doble doc)`);
  } else {
    const usuarioData = usuarioRef.data() || {};
    r.usuariosRol = usuarioData.rol || null;
    if (r.usuariosRol !== cuenta.rolEsperado) {
      if (r.clasificacion === 'ok') r.clasificacion = 'rol_drift_usuario';
      r.notas.push(`usuarios/${r.uid}.rol = "${r.usuariosRol}" pero el catálogo QA dice "${cuenta.rolEsperado}"`);
    }
  }

  // 3. Firebase Auth.
  try {
    const authUser = await auth.getUser(r.uid);
    r.authEmail = authUser.email || null;
    const authLower = emailLower(r.authEmail || '');
    if (authLower !== targetLower) {
      if (r.clasificacion === 'ok') r.clasificacion = 'auth_email_mismatch';
      r.notas.push(`auth.email = "${r.authEmail}" ≠ catálogo "${cuenta.email}"`);
    }
  } catch (err: unknown) {
    if (r.clasificacion === 'ok') r.clasificacion = 'auth_faltante';
    const msg = err instanceof Error ? err.message : String(err);
    r.notas.push(`Firebase Auth no tiene user uid=${r.uid}: ${msg}`);
  }

  return r;
}

function formatRow(r: ResultadoCuenta): string {
  const icon = r.clasificacion === 'ok' ? '✓' : '✗';
  return [
    `${icon} ${r.email}`,
    `   rol esperado=${r.rolEsperado} personal.rol=${r.personalRol ?? '-'} usuarios.rol=${r.usuariosRol ?? '-'}`,
    `   uid=${r.uid ?? '-'} personalId=${r.personalId ?? '-'} auth.email=${r.authEmail ?? '-'}`,
    `   clasificacion=${r.clasificacion}`,
    ...r.notas.map((n) => `   • ${n}`),
  ].join('\n');
}

async function main() {
  console.log('=== QA Sanity Check — SPRINT-QA-USER ===\n');
  console.log(`Verificando ${CUENTAS_QA.length} cuentas QA dedicadas...\n`);

  const resultados = await Promise.all(CUENTAS_QA.map((c) => chequearCuenta(c)));

  for (const r of resultados) {
    console.log(formatRow(r));
    console.log('');
  }

  const okCount = resultados.filter((r) => r.clasificacion === 'ok').length;
  const failCount = resultados.length - okCount;

  console.log('=== Resumen ===');
  console.log(`  OK:   ${okCount}/${resultados.length}`);
  console.log(`  FAIL: ${failCount}/${resultados.length}`);

  if (failCount > 0) {
    console.log('\nDrift detectado. Acciones sugeridas:');
    console.log('  - "falta": Jorge crea la cuenta desde /admin/gestion-usuarios (alta normal, NO desde Console).');
    console.log('  - "doc_duplicado": revisar manualmente en Firestore Console qué doc conservar.');
    console.log('  - "uid_vacio": el alta quedó incompleta — re-disparar onboarding desde /admin/gestion-usuarios.');
    console.log('  - "usuario_faltante": correr `npx tsx scripts/backfill-usuarios-desde-personal.ts --uid <uid>`.');
    console.log('  - "rol_drift_*": editar desde /admin/gestion-usuarios al rol correcto.');
    console.log('  - "auth_faltante" / "auth_email_mismatch": revisar manualmente en Firebase Console → Authentication.');
    process.exit(1);
  }

  console.log('\nTodas las cuentas QA están listas. Sesión QA E2E puede arrancar.');
  process.exit(0);
}

main().catch((err) => {
  console.error('[FATAL]', err);
  process.exit(2);
});
