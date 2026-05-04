/**
 * Backfill one-shot: asigna `zona` a clientes que tienen lat/lng pero
 * no tienen `zona` persistida. Reusa la lógica `inferirZona` de
 * `src/utils/zonas.ts` (importada directa para evitar drift entre
 * script y app — `zonas.ts` solo importa tipos, así que es seguro
 * en Node).
 *
 * Idempotente: solo actualiza docs donde `zona` está vacía. Re-correr
 * no toca nada extra.
 *
 * Uso:
 *   npx tsx scripts/backfill-zonas-clientes.ts            # ejecuta
 *   npx tsx scripts/backfill-zonas-clientes.ts --dry-run  # solo cuenta
 *
 * Auth (mismo patrón que `consolidar-counter-facturas.ts`):
 *   1) Si GOOGLE_APPLICATION_CREDENTIALS apunta a un JSON existente, se usa.
 *   2) Si existe ./service-account.json en el cwd, se usa.
 *   3) Si las 3 env vars FIREBASE_PROJECT_ID|CLIENT_EMAIL|PRIVATE_KEY están
 *      seteadas, se usa cert() inline.
 *   4) Si nada, error claro.
 */
import { initializeApp, getApps, cert, applicationDefault } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { inferirZona } from '../src/utils/zonas';

const BATCH_SAFE_LIMIT = 400; // Firestore tope = 500; dejamos margen.

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  console.log(`[INFO] Modo: ${dryRun ? 'DRY-RUN' : 'APLICAR'}`);

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
  const snap = await db.collection('clientes').get();
  console.log(`[INFO] Total clientes en BD: ${snap.size}`);

  let asignados = 0;
  let yaTenian = 0;
  let sinCoords = 0;
  let sinZona = 0;
  let batch = db.batch();
  let opsEnBatch = 0;
  let batchesComiteados = 0;

  for (const doc of snap.docs) {
    const data = doc.data();
    if (data.zona) {
      yaTenian++;
      continue;
    }
    if (typeof data.lat !== 'number' || typeof data.lng !== 'number') {
      sinCoords++;
      continue;
    }
    const zona = inferirZona(data.lat, data.lng);
    if (!zona) {
      sinZona++;
      continue;
    }

    if (!dryRun) {
      batch.update(doc.ref, { zona, updatedAt: FieldValue.serverTimestamp() });
      opsEnBatch++;
      if (opsEnBatch >= BATCH_SAFE_LIMIT) {
        await batch.commit();
        batchesComiteados++;
        console.log(`[OK] Batch #${batchesComiteados} comiteado (${opsEnBatch} ops). Total asignados hasta ahora: ${asignados + 1}`);
        batch = db.batch();
        opsEnBatch = 0;
      }
    }
    asignados++;
  }

  if (!dryRun && opsEnBatch > 0) {
    await batch.commit();
    batchesComiteados++;
    console.log(`[OK] Batch final #${batchesComiteados} comiteado (${opsEnBatch} ops).`);
  }

  console.log(`\n─── Resumen ───`);
  console.log(`Clientes con zona pre-existente:        ${yaTenian}`);
  console.log(`Clientes sin coords (no se infiere):    ${sinCoords}`);
  console.log(`Clientes con coords pero sin zona match: ${sinZona}`);
  console.log(`Zonas ${dryRun ? 'que se asignarían' : 'asignadas'}:                    ${asignados}`);
  if (!dryRun) {
    console.log(`Batches Firestore comiteados:           ${batchesComiteados}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[ERROR] Falló el backfill:', err);
    process.exit(1);
  });
