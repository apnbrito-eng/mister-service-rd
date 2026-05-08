/**
 * Auditoría sistémica: notificaciones con shape legacy (Caso A / Caso B) en
 * TODOS los empleados con `uid` no vacío. Generaliza la lógica del script
 * `scripts/diagnostico-notificaciones-yohana.ts` parametrizándola por uid
 * y produciendo una matriz por empleado.
 *
 * Disparado por SPRINT-117 fase A2 (porción read-only) el 2026-05-08, que
 * absorbió el alcance de SPRINT-116 fase B. Origen: el bug de Yohana
 * (3 docs Caso A) puede repetirse en cualquier empleado que haya recibido
 * notificaciones antes del fix de SPRINT-105 (2026-05-06). Hipótesis Jorge:
 * el patrón está replicado en otros empleados.
 *
 * Lee:
 *  - `personal/*` (busca docs con `uid` no vacío para enumerar empleados).
 *  - `notificaciones/*` mediante 4 queries por empleado:
 *      `userId == auth.uid`,
 *      `destinatarioId == auth.uid`,
 *      `userId == personalDocId`,
 *      `destinatarioId == personalDocId`.
 *
 * Reporta:
 *  - Tabla por empleado: nombre, rol, conteos OK / Caso A / Caso B / OTRO.
 *  - Resumen global con conteos.
 *  - Listado de empleados con Caso A o B > 0, ordenado por cantidad
 *    descendente (los candidatos a re-migración).
 *  - Para cada empleado afectado, los IDs exactos de los docs problemáticos
 *    (input directo para un eventual script de re-migración masiva, que
 *    quedará BLOQUEADO requiriendo OK Jorge).
 *
 * Solo lectura. NO modifica nada. La eventual re-migración masiva (fase C
 * del SPRINT-116 ABSORBIDO) requiere OK explícito de Jorge en BLOQUEOS.md
 * con scope listado por uids específicos — sub-regla CLAUDE.md "destructive
 * actions confirmar con jorge".
 *
 * Uso:
 *   npx tsx scripts/auditoria-notis-legacy-todos.ts
 *
 * Requiere `service-account.json` en la raíz del repo (mismo patrón que
 * `scripts/diagnostico-notificaciones-yohana.ts`).
 */

import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
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

type ShapeDoc = {
  id: string;
  userId: string | null;
  destinatarioId: string | null;
  tipo?: string;
  titulo?: string;
  leida?: boolean;
  createdAt?: Date | null;
};

type Caso = 'OK' | 'A' | 'B' | 'OTRO';

type ResumenEmpleado = {
  personalDocId: string;
  uid: string;
  nombre: string;
  rol?: string;
  activo?: boolean;
  email?: string | null;
  total: number;
  ok: number;
  casoA: number;
  casoB: number;
  otro: number;
  idsCasoA: string[];
  idsCasoB: string[];
};

function clasificar(d: ShapeDoc, authUid: string, personalDocId: string): Caso {
  const u = d.userId;
  const dst = d.destinatarioId;

  // OK: userId == auth.uid (rule pasa, queries dual lo ven, marcado como leída funciona).
  if (u === authUid) return 'OK';

  // Caso B: destinatarioId == auth.uid pero userId != auth.uid (típicamente
  // userId == null o == personalDocId). El query legacy del service la trae,
  // pero la rule de update rechaza con permission-denied.
  if (dst === authUid) return 'B';

  // Caso A: ni userId ni destinatarioId == auth.uid. Si destinatarioId o userId
  // matchea personalDocId, el doc existe pero ningún query del service llega a él.
  if (u === personalDocId || dst === personalDocId) return 'A';

  // OTRO: doc que no mapea a este usuario (no debería aparecer; quedó en la
  // dedup por shape mixto o por una colisión de id no anticipada).
  return 'OTRO';
}

async function auditarEmpleado(personalDocId: string, uid: string): Promise<{ ok: number; casoA: number; casoB: number; otro: number; total: number; idsCasoA: string[]; idsCasoB: string[] }> {
  // 4 queries paralelas para cubrir la matriz {userId, destinatarioId} × {auth.uid, personalDocId}.
  const [snapUserAuth, snapDstAuth, snapUserPersonal, snapDstPersonal] = await Promise.all([
    db.collection('notificaciones').where('userId', '==', uid).get(),
    db.collection('notificaciones').where('destinatarioId', '==', uid).get(),
    db.collection('notificaciones').where('userId', '==', personalDocId).get(),
    db.collection('notificaciones').where('destinatarioId', '==', personalDocId).get(),
  ]);

  // Dedup por id.
  const dedup = new Map<string, ShapeDoc>();
  const ingest = (snap: FirebaseFirestore.QuerySnapshot) => {
    for (const d of snap.docs) {
      if (dedup.has(d.id)) continue;
      const data = d.data();
      dedup.set(d.id, {
        id: d.id,
        userId: typeof data.userId === 'string' ? data.userId : null,
        destinatarioId: typeof data.destinatarioId === 'string' ? data.destinatarioId : null,
        tipo: data.tipo,
        titulo: data.titulo,
        leida: data.leida,
        createdAt: data.createdAt?.toDate?.() ?? null,
      });
    }
  };
  ingest(snapUserAuth);
  ingest(snapDstAuth);
  ingest(snapUserPersonal);
  ingest(snapDstPersonal);

  let ok = 0;
  let casoA = 0;
  let casoB = 0;
  let otro = 0;
  const idsCasoA: string[] = [];
  const idsCasoB: string[] = [];

  for (const d of dedup.values()) {
    const c = clasificar(d, uid, personalDocId);
    if (c === 'OK') ok++;
    else if (c === 'A') {
      casoA++;
      idsCasoA.push(d.id);
    } else if (c === 'B') {
      casoB++;
      idsCasoB.push(d.id);
    } else {
      otro++;
    }
  }

  return { ok, casoA, casoB, otro, total: dedup.size, idsCasoA, idsCasoB };
}

async function main() {
  console.log('[INFO] Leyendo personal/...');
  const personalSnap = await db.collection('personal').get();
  const conUid = personalSnap.docs.filter((d) => {
    const u = d.data().uid;
    return typeof u === 'string' && u.length > 0;
  });
  console.log(`[INFO] personal: ${personalSnap.size} docs (${conUid.length} con uid auditables)`);

  if (conUid.length === 0) {
    console.error('[ERROR] No hay empleados con uid en personal/. Termina sin tocar Firestore.');
    process.exit(1);
  }

  console.log(`[INFO] Auditando notificaciones de ${conUid.length} empleados...`);

  const resumenes: ResumenEmpleado[] = [];

  for (const doc of conUid) {
    const data = doc.data();
    const personalDocId = doc.id;
    const uid: string = data.uid;
    const nombre: string = typeof data.nombre === 'string' ? data.nombre : '?';
    const rol: string | undefined = typeof data.rol === 'string' ? data.rol : undefined;
    const activo: boolean | undefined = typeof data.activo === 'boolean' ? data.activo : undefined;
    const email: string | null = typeof data.email === 'string' ? data.email : null;

    process.stdout.write(`  ${nombre.padEnd(30)} `);
    const r = await auditarEmpleado(personalDocId, uid);
    process.stdout.write(`total=${r.total} ok=${r.ok} A=${r.casoA} B=${r.casoB} otro=${r.otro}\n`);

    resumenes.push({
      personalDocId,
      uid,
      nombre,
      rol,
      activo,
      email,
      ...r,
    });
  }

  // Resumen global
  const total = resumenes.reduce((acc, r) => acc + r.total, 0);
  const totalOk = resumenes.reduce((acc, r) => acc + r.ok, 0);
  const totalA = resumenes.reduce((acc, r) => acc + r.casoA, 0);
  const totalB = resumenes.reduce((acc, r) => acc + r.casoB, 0);
  const totalOtro = resumenes.reduce((acc, r) => acc + r.otro, 0);

  const empleadosAfectados = resumenes.filter((r) => r.casoA > 0 || r.casoB > 0);
  const empleadosLimpios = resumenes.filter((r) => r.casoA === 0 && r.casoB === 0 && r.ok > 0);
  const empleadosVacios = resumenes.filter((r) => r.total === 0);

  console.log('\n─── Resumen global ───');
  console.log(`  Empleados auditados:               ${resumenes.length}`);
  console.log(`  Empleados afectados (A o B > 0):   ${empleadosAfectados.length}`);
  console.log(`  Empleados limpios (solo OK):       ${empleadosLimpios.length}`);
  console.log(`  Empleados sin notificaciones:      ${empleadosVacios.length}`);
  console.log('');
  console.log(`  Notificaciones totales (dedup):    ${total}`);
  console.log(`  ✓ OK (rule pasa, query las ve):    ${totalOk}`);
  console.log(`  ✗ Caso A (no las ve nadie):        ${totalA}`);
  console.log(`  ✗ Caso B (las ve, no marca leído): ${totalB}`);
  console.log(`  ? OTRO (no mapea al empleado):     ${totalOtro}`);

  // Tabla detallada por empleado
  console.log('\n─── Matriz por empleado ───');
  const ordenadas = [...resumenes].sort((a, b) => {
    const sevA = a.casoA + a.casoB;
    const sevB = b.casoA + b.casoB;
    if (sevA !== sevB) return sevB - sevA; // más afectados primero
    return a.nombre.localeCompare(b.nombre);
  });

  for (const r of ordenadas) {
    const marca = r.casoA > 0 || r.casoB > 0 ? '✗' : r.total === 0 ? '·' : '✓';
    const rolLabel = r.rol ?? '?';
    const activoLabel = r.activo === false ? ' (inactivo)' : '';
    console.log(`\n  ${marca} ${r.nombre} [${rolLabel}]${activoLabel}`);
    console.log(`      uid:        ${r.uid.substring(0, 12)}...`);
    console.log(`      personal.id:${r.personalDocId.substring(0, 12)}...`);
    console.log(`      email:      ${r.email ?? '(null)'}`);
    console.log(`      total=${r.total}  ok=${r.ok}  A=${r.casoA}  B=${r.casoB}  otro=${r.otro}`);
    if (r.casoA > 0) {
      console.log(`      ids Caso A: ${r.idsCasoA.slice(0, 5).join(', ')}${r.idsCasoA.length > 5 ? `, ...y ${r.idsCasoA.length - 5} más` : ''}`);
    }
    if (r.casoB > 0) {
      console.log(`      ids Caso B: ${r.idsCasoB.slice(0, 5).join(', ')}${r.idsCasoB.length > 5 ? `, ...y ${r.idsCasoB.length - 5} más` : ''}`);
    }
  }

  // Listado focalizado de afectados
  if (empleadosAfectados.length > 0) {
    console.log(`\n─── Empleados afectados (${empleadosAfectados.length}) — candidatos a re-migración ───`);
    for (const r of empleadosAfectados) {
      const total = r.casoA + r.casoB;
      console.log(`  - ${r.nombre} [${r.rol ?? '?'}]: ${total} notis problemáticas (A=${r.casoA}, B=${r.casoB})`);
      console.log(`      uid=${r.uid}`);
      console.log(`      personalDocId=${r.personalDocId}`);
      if (r.casoA > 0) console.log(`      Caso A ids: ${r.idsCasoA.join(', ')}`);
      if (r.casoB > 0) console.log(`      Caso B ids: ${r.idsCasoB.join(', ')}`);
    }
    console.log('\n  Estos empleados NO ven o NO pueden marcar leído sus notificaciones.');
    console.log('  Para fix: generalizar `scripts/re-migrar-notificaciones-yohana.ts` con scope');
    console.log('  acotado a estos uids/ids — REQUIERE OK explícito de Jorge en BLOQUEOS.md');
    console.log('  (sub-regla CLAUDE.md sobre destructive actions + scope listado por uid).');
  } else {
    console.log('\n[OK] Ningún empleado tiene notificaciones legacy en Caso A o B.');
    console.log('     El fix de SPRINT-105 + la re-migración acotada de Yohana cubrieron');
    console.log('     el universo. Si en el futuro reaparece un caso, será regresión nueva.');
  }

  // Diagnóstico final
  console.log('\n─── Diagnóstico final ───');
  if (empleadosAfectados.length === 0) {
    console.log('  El universo de notificaciones está alineado: 0 empleados afectados.');
  } else {
    const pct = Math.round((empleadosAfectados.length / resumenes.length) * 100);
    console.log(`  ${empleadosAfectados.length}/${resumenes.length} empleados afectados (${pct}%).`);
    if (pct >= 50) {
      console.log('  [ALERTA] Patrón sistémico (>50%). Escalar a Jorge antes de proponer fix masivo.');
    } else {
      console.log('  Fix propuesto: re-migración acotada por uid (NO masivo automático).');
    }
    console.log('  Postmortem obligatorio si afectados > 5 (sub-regla CLAUDE.md "cada bug → cazador").');
  }
}

main().catch((err) => {
  console.error('[ERROR]', err);
  process.exit(1);
});
