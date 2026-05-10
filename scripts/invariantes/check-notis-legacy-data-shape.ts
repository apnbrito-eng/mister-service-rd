/**
 * P-008 — Health-check de DATOS en producción: notificaciones con shape legacy
 *
 * NATURALEZA DIFERENTE A LOS DEMÁS CAZADORES (P-001..P-007):
 * - P-001..P-007 escanean ARCHIVOS LOCALES (código + rules) en <1s. Corren en
 *   pre-commit hook con cero dependencias externas.
 * - P-008 escanea DATOS LIVE en Firestore mediante Admin SDK. Requiere
 *   `service-account.json` + cuota Firebase. Tarda 10-60s según volumen.
 * - Por eso P-008 NO se ejecuta en `run-all.ts` (pre-commit). Se ejecuta
 *   MANUALMENTE vía `npm run audit:notis-legacy` después de:
 *     - cualquier alta de empleado nueva,
 *     - cualquier sprint que toque `notificaciones.service.ts`,
 *     - sospecha de regresión reportada por un empleado,
 *     - revisión periódica (semanal/mensual).
 *
 * BUG ORIGINAL: notis legacy con `userId == personalDocId` afectando a 5
 * empleados (Yohana, Wilainy, Jorge, misterservicerd, Maria Teresa) — 44
 * docs invisibles en campanita. Re-migrados en `b781f80` (2026-05-08).
 * Postmortem: docs/postmortems/2026-05-08-notis-legacy-multiples-empleados.md.
 *
 * SÍNTOMA QUE DETECTA: notificaciones con shape problemático en producción —
 *   Caso A: ni `userId` ni `destinatarioId` matchean un `auth.uid` válido,
 *     pero alguno matchea con `personal.id` (doc id auto-generado). El
 *     empleado destinatario NO ve el doc en su campanita.
 *   Caso B: `destinatarioId == auth.uid` pero `userId != auth.uid` (típicamente
 *     `userId == personalDocId` o `userId == null`). El empleado ve el toast
 *     pero NO puede marcar la noti como leída (rule de update rechaza).
 *
 * CAUSA RAÍZ del bug original: cubierta por P-001 (userProfile.id literal),
 * P-004 (alta sin doc espejo en usuarios/), P-006 (dropdowns con personal.id)
 * y P-007 (crearNotificacion con personal.id). Esos 4 cazadores cubren el
 * CÓDIGO. P-008 cubre los DATOS — si por alguna razón aparecen hits nuevos
 * aunque P-001..P-007 estén en 0, es síntoma de:
 *   - alta de empleado pre-SPRINT-105 que el backfill no migró,
 *   - regresión en código que P-007 no detectó (allowlist mal usada, variante
 *     no contemplada, etc.),
 *   - re-migración previa incompleta (Caso B sin reparar).
 *
 * SALIDA:
 *   - 0 hits → output limpio "Sin notis legacy en producción", exit 0.
 *   - N>0 hits → output con lista de empleados afectados + IDs exactos +
 *     recomendación de re-migración acotada. Exit 1.
 *
 * Read-only por diseño. NO modifica datos. No tiene flag `--apply`. Para
 * remediar, ver `scripts/re-migrar-notificaciones-masivo.ts` (require OK
 * explícito de Jorge en BLOQUEOS.md, scope listado por uid).
 *
 * USO:
 *   npm run audit:notis-legacy
 *   (equivale a `npx tsx scripts/invariantes/check-notis-legacy-data-shape.ts`)
 *
 * REQUISITOS:
 *   - `service-account.json` en la raíz del repo (mismo patrón que el resto
 *     de scripts admin: `auditoria-notis-legacy-todos.ts`, etc.).
 *   - Cuota de lectura Firebase. Volumen estimado: ~4 queries por empleado.
 *     Con ~25 empleados, ~100 queries. Despreciable contra cuotas free.
 *
 * RELACIÓN CON `scripts/auditoria-notis-legacy-todos.ts`:
 *   Comparten lógica de fondo (clasificar Caso A / B). Diferencias:
 *   - El script de auditoría es exploratorio: imprime tabla detallada por
 *     empleado, útil para investigación inicial.
 *   - Este cazador (P-008) es un GATE: imprime conteo + exit code 1 si hay
 *     hits. Apto para integrar a un cron/scheduled task futuro.
 *   Si el cazador detecta hits, ejecutar el script de auditoría detallado
 *   para investigar caso por caso.
 *
 * ALLOWLIST: vacía. No hay caso legítimo donde una noti deba tener
 * `userId == personalDocId`. Si aparece, hay que repararla.
 */
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import * as fs from 'node:fs';
import * as path from 'node:path';

const PATTERN_ID = 'P-008';
const PATTERN_NAME =
  'Notificaciones en producción con userId/destinatarioId apuntando a personal.id en lugar de auth.uid';

const SERVICE_ACCOUNT_PATH = path.resolve('service-account.json');

type ShapeDoc = {
  id: string;
  userId: string | null;
  destinatarioId: string | null;
};

type Caso = 'OK' | 'A' | 'B' | 'OTRO';

type ResumenEmpleado = {
  personalDocId: string;
  uid: string;
  nombre: string;
  rol?: string;
  email: string | null;
  total: number;
  ok: number;
  casoA: number;
  casoB: number;
  otro: number;
  idsCasoA: string[];
  idsCasoB: string[];
};

function clasificar(d: ShapeDoc, authUid: string, personalDocId: string): Caso {
  if (d.userId === authUid) return 'OK';
  if (d.destinatarioId === authUid) return 'B';
  if (d.userId === personalDocId || d.destinatarioId === personalDocId) return 'A';
  return 'OTRO';
}

async function auditarEmpleado(
  db: FirebaseFirestore.Firestore,
  personalDocId: string,
  uid: string,
): Promise<{
  ok: number;
  casoA: number;
  casoB: number;
  otro: number;
  total: number;
  idsCasoA: string[];
  idsCasoB: string[];
}> {
  const [snapUserAuth, snapDstAuth, snapUserPersonal, snapDstPersonal] =
    await Promise.all([
      db.collection('notificaciones').where('userId', '==', uid).get(),
      db.collection('notificaciones').where('destinatarioId', '==', uid).get(),
      db
        .collection('notificaciones')
        .where('userId', '==', personalDocId)
        .get(),
      db
        .collection('notificaciones')
        .where('destinatarioId', '==', personalDocId)
        .get(),
    ]);

  const dedup = new Map<string, ShapeDoc>();
  const ingest = (snap: FirebaseFirestore.QuerySnapshot) => {
    for (const d of snap.docs) {
      if (dedup.has(d.id)) continue;
      const data = d.data();
      dedup.set(d.id, {
        id: d.id,
        userId: typeof data.userId === 'string' ? data.userId : null,
        destinatarioId:
          typeof data.destinatarioId === 'string' ? data.destinatarioId : null,
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

async function main(): Promise<void> {
  console.log(`\n=== ${PATTERN_ID} — ${PATTERN_NAME} ===\n`);
  console.log(
    '[INFO] Cazador de DATOS en producción. Read-only. Requiere service-account.json.\n',
  );

  if (!fs.existsSync(SERVICE_ACCOUNT_PATH)) {
    console.error('[ERROR] No existe service-account.json en la raíz del repo.');
    console.error(
      '        Este cazador requiere credenciales Admin SDK. Ver README o',
    );
    console.error(
      '        contactar a Jorge para obtener el archivo. No se commitea por ser secreto.',
    );
    process.exit(2);
  }

  if (!getApps().length) {
    const serviceAccount = JSON.parse(
      fs.readFileSync(SERVICE_ACCOUNT_PATH, 'utf-8'),
    );
    initializeApp({ credential: cert(serviceAccount) });
  }

  const db = getFirestore();

  console.log('[INFO] Leyendo personal/...');
  const personalSnap = await db.collection('personal').get();
  const conUid = personalSnap.docs.filter((d) => {
    const u = d.data().uid;
    return typeof u === 'string' && u.length > 0;
  });
  console.log(
    `[INFO] personal: ${personalSnap.size} docs (${conUid.length} con uid auditables)\n`,
  );

  if (conUid.length === 0) {
    console.error(
      '[ERROR] No hay empleados con uid en personal/. Termina sin auditar.',
    );
    process.exit(2);
  }

  console.log(`[INFO] Auditando notis de ${conUid.length} empleados...\n`);

  const resumenes: ResumenEmpleado[] = [];

  for (const doc of conUid) {
    const data = doc.data();
    const personalDocId = doc.id;
    const uid: string = data.uid;
    const nombre: string =
      typeof data.nombre === 'string' ? data.nombre : '?';
    const rol: string | undefined =
      typeof data.rol === 'string' ? data.rol : undefined;
    const email: string | null =
      typeof data.email === 'string' ? data.email : null;

    process.stdout.write(`  ${nombre.padEnd(30)} `);
    const r = await auditarEmpleado(db, personalDocId, uid);
    process.stdout.write(
      `total=${r.total} ok=${r.ok} A=${r.casoA} B=${r.casoB} otro=${r.otro}\n`,
    );

    resumenes.push({
      personalDocId,
      uid,
      nombre,
      rol,
      email,
      ...r,
    });
  }

  const totalDocs = resumenes.reduce((acc, r) => acc + r.total, 0);
  const totalOk = resumenes.reduce((acc, r) => acc + r.ok, 0);
  const totalA = resumenes.reduce((acc, r) => acc + r.casoA, 0);
  const totalB = resumenes.reduce((acc, r) => acc + r.casoB, 0);
  const totalOtro = resumenes.reduce((acc, r) => acc + r.otro, 0);
  const afectados = resumenes.filter((r) => r.casoA > 0 || r.casoB > 0);

  console.log('\n─── Resumen global ───');
  console.log(`  Empleados auditados:            ${resumenes.length}`);
  console.log(`  Empleados afectados (A o B>0):  ${afectados.length}`);
  console.log(`  Notificaciones totales (dedup): ${totalDocs}`);
  console.log(`  ✓ OK:                            ${totalOk}`);
  console.log(`  ✗ Caso A (invisibles):           ${totalA}`);
  console.log(`  ✗ Caso B (no marca leído):       ${totalB}`);
  console.log(`  ? OTRO:                          ${totalOtro}`);

  if (afectados.length === 0) {
    console.log(`\n[OK ${PATTERN_ID}] Sin notis legacy en producción.`);
    console.log(
      '       El universo está alineado. Si aparece un caso futuro,',
    );
    console.log(
      '       será regresión nueva. Volver a correr este cazador después',
    );
    console.log(
      '       de altas de empleado o sprints que toquen notificaciones.service.ts.',
    );
    process.exit(0);
  }

  console.log(
    `\n─── Empleados afectados (${afectados.length}) — candidatos a re-migración ───`,
  );
  for (const r of afectados) {
    const total = r.casoA + r.casoB;
    console.log(
      `  - ${r.nombre} [${r.rol ?? '?'}]: ${total} notis problemáticas (A=${r.casoA}, B=${r.casoB})`,
    );
    console.log(`      uid=${r.uid}`);
    console.log(`      personalDocId=${r.personalDocId}`);
    if (r.casoA > 0) console.log(`      Caso A ids: ${r.idsCasoA.join(', ')}`);
    if (r.casoB > 0) console.log(`      Caso B ids: ${r.idsCasoB.join(', ')}`);
  }

  console.log(
    '\n[FAIL ' +
      PATTERN_ID +
      '] Hay notis legacy en producción. NO autorizar re-migración',
  );
  console.log(
    '       automática. Reportar a Jorge y abrir sprint write acotado por uid',
  );
  console.log(
    '       (mismo patrón que SPRINT-118). Ver scripts/re-migrar-notificaciones-masivo.ts',
  );
  console.log(
    '       y documentar OK explícito en docs/sprints/BLOQUEOS.md antes de ejecutar.',
  );
  process.exit(1);
}

main().catch((err) => {
  console.error('[ERROR]', err);
  process.exit(2);
});
