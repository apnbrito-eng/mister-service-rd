/**
 * Mide el % de requests con `app_check.ok=false` en `app_check_audit`
 * durante una ventana reciente. Decide GO/NO-GO para el hard
 * enforcement del C2 fase B.
 *
 * Uso:
 *   npx tsx scripts/medir-app-check-fail-rate.ts                # 2h por defecto
 *   npx tsx scripts/medir-app-check-fail-rate.ts --hours=4      # ventana custom
 *
 * Auth (mismo patrón que `backfill-zonas-clientes.ts`):
 *   1) GOOGLE_APPLICATION_CREDENTIALS apunta a un JSON existente.
 *   2) ./service-account.json en el cwd.
 *   3) FIREBASE_PROJECT_ID + FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY.
 *
 * Output:
 *   - Total requests, ok=true, ok=false, % fail.
 *   - Breakdown por endpoint (% fail por cada uno).
 *   - Veredicto GO/PAUSE/NO-GO con threshold 5%.
 */
import { initializeApp, getApps, cert, applicationDefault } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';

const THRESHOLD_PCT = 5;

async function main() {
  const horasArg = process.argv.find((a) => a.startsWith('--hours='));
  const horas = horasArg ? Number(horasArg.split('=')[1]) || 2 : 2;
  console.log(`[INFO] Ventana de análisis: últimas ${horas}h`);

  if (getApps().length === 0) {
    const gacPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
    const localPath = resolve(process.cwd(), 'service-account.json');

    if (gacPath && existsSync(gacPath)) {
      console.log(`[INFO] Usando GOOGLE_APPLICATION_CREDENTIALS: ${gacPath}`);
      initializeApp({ credential: applicationDefault() });
    } else if (existsSync(localPath)) {
      console.log(`[INFO] Usando service-account.json local`);
      const json = JSON.parse(readFileSync(localPath, 'utf8'));
      initializeApp({
        credential: cert({
          projectId: json.project_id,
          clientEmail: json.client_email,
          privateKey: json.private_key,
        }),
        projectId: json.project_id,
      });
    } else {
      const projectId = process.env.FIREBASE_PROJECT_ID;
      const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
      const privateKeyRaw = process.env.FIREBASE_PRIVATE_KEY;

      if (!projectId || !clientEmail || !privateKeyRaw) {
        console.error(
          '[ERROR] Faltan credenciales del Admin SDK. Probá una de estas opciones:\n' +
          '  1) Descargar service-account.json desde Firebase Console y ponerlo en la raíz del repo.\n' +
          '  2) Setear GOOGLE_APPLICATION_CREDENTIALS apuntando al JSON.\n' +
          '  3) Setear FIREBASE_PROJECT_ID + FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY.',
        );
        process.exit(1);
      }

      const privateKey = privateKeyRaw.replace(/\\n/g, '\n');
      initializeApp({
        credential: cert({ projectId, clientEmail, privateKey }),
        projectId,
      });
    }
  }

  const db = getFirestore();
  const desde = new Date(Date.now() - horas * 60 * 60 * 1000);
  const cutoff = Timestamp.fromDate(desde);

  console.log(`[INFO] Querying app_check_audit donde timestamp >= ${desde.toISOString()}`);
  const snap = await db.collection('app_check_audit').where('timestamp', '>=', cutoff).get();
  console.log(`[INFO] Total docs en ventana: ${snap.size}`);

  if (snap.empty) {
    console.log('\n[WARN] Sin tráfico en la ventana. ¿Endpoints recibiendo requests? ¿Instrumentación viva?');
    process.exit(0);
  }

  let totalOk = 0;
  let totalFail = 0;
  const porEndpoint: Record<string, { ok: number; fail: number }> = {};

  for (const doc of snap.docs) {
    const d = doc.data();
    const endpoint = typeof d.endpoint === 'string' ? d.endpoint : 'desconocido';
    const ok = d.ok === true;
    if (!porEndpoint[endpoint]) porEndpoint[endpoint] = { ok: 0, fail: 0 };
    if (ok) {
      totalOk++;
      porEndpoint[endpoint].ok++;
    } else {
      totalFail++;
      porEndpoint[endpoint].fail++;
    }
  }

  const total = totalOk + totalFail;
  const pctFail = total > 0 ? (totalFail / total) * 100 : 0;

  console.log(`\n─── Resumen global ───`);
  console.log(`Total requests:  ${total}`);
  console.log(`ok=true:         ${totalOk} (${((totalOk / total) * 100).toFixed(2)}%)`);
  console.log(`ok=false:        ${totalFail} (${pctFail.toFixed(2)}%)`);

  console.log(`\n─── Breakdown por endpoint ───`);
  const ordenado = Object.entries(porEndpoint).sort(([, a], [, b]) => (b.ok + b.fail) - (a.ok + a.fail));
  for (const [endpoint, { ok, fail }] of ordenado) {
    const t = ok + fail;
    const pct = t > 0 ? (fail / t) * 100 : 0;
    console.log(`${endpoint.padEnd(30)} total=${String(t).padStart(5)}  fail=${String(fail).padStart(5)}  ${pct.toFixed(2)}%`);
  }

  console.log(`\n─── Veredicto C2 fase B ───`);
  if (pctFail < THRESHOLD_PCT) {
    console.log(`✓ GO — ${pctFail.toFixed(2)}% < ${THRESHOLD_PCT}% threshold. Hard enforcement seguro.`);
  } else {
    console.log(`✗ PAUSE — ${pctFail.toFixed(2)}% >= ${THRESHOLD_PCT}%. Hard enforcement rompería usuarios legítimos.`);
    console.log(`         Investigar el breakdown por endpoint arriba antes de proceder.`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[ERROR] Falló la medición:', err);
    process.exit(1);
  });
