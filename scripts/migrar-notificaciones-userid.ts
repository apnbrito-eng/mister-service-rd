/**
 * Migración idempotente: copia `destinatarioId` → `userId` en docs de
 * `notificaciones`. Sin esto, los docs antiguos no son leíbles ni
 * actualizables por sus dueños (rules `notificaciones` gatean por
 * `userId == auth.uid`).
 *
 * Idempotente: si el doc ya tiene `userId` con el mismo valor, no toca.
 * Si tiene `userId` pero con valor distinto, log warn y NO sobrescribe
 * (es señal de algo raro — humano decide).
 *
 * Uso:
 *   npx tsx scripts/migrar-notificaciones-userid.ts            # ejecuta
 *   npx tsx scripts/migrar-notificaciones-userid.ts --dry-run  # solo cuenta
 *
 * Después de ejecutar este script, el commit follow-up puede eliminar
 * el fallback compat (`destinatarioId`) del código.
 */
import { initializeApp, getApps, cert, applicationDefault } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';

const BATCH_SAFE_LIMIT = 400;

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
  const snap = await db.collection('notificaciones').get();
  console.log(`[INFO] Total notificaciones en BD: ${snap.size}`);

  let copiados = 0;
  let yaAlineados = 0;
  let sinDestinatarioId = 0;
  let conflictos = 0;
  const conflictoIds: string[] = [];
  let batch = db.batch();
  let opsEnBatch = 0;
  let batchesComiteados = 0;

  for (const doc of snap.docs) {
    const data = doc.data();
    const destinatarioId = typeof data.destinatarioId === 'string' ? data.destinatarioId : null;
    const userId = typeof data.userId === 'string' ? data.userId : null;

    if (!destinatarioId) {
      sinDestinatarioId++;
      continue;
    }
    if (userId === destinatarioId) {
      yaAlineados++;
      continue;
    }
    if (userId !== null && userId !== destinatarioId) {
      conflictos++;
      conflictoIds.push(doc.id);
      continue;
    }
    // userId === null y destinatarioId existe → copiar.
    if (!dryRun) {
      batch.update(doc.ref, { userId: destinatarioId, migradoEn: FieldValue.serverTimestamp() });
      opsEnBatch++;
      if (opsEnBatch >= BATCH_SAFE_LIMIT) {
        await batch.commit();
        batchesComiteados++;
        console.log(`[OK] Batch #${batchesComiteados} comiteado (${opsEnBatch} ops). Total copiados hasta ahora: ${copiados + 1}`);
        batch = db.batch();
        opsEnBatch = 0;
      }
    }
    copiados++;
  }

  if (!dryRun && opsEnBatch > 0) {
    await batch.commit();
    batchesComiteados++;
    console.log(`[OK] Batch final #${batchesComiteados} comiteado (${opsEnBatch} ops).`);
  }

  console.log(`\n─── Resumen ───`);
  console.log(`Total notificaciones:                       ${snap.size}`);
  console.log(`Ya alineados (userId == destinatarioId):    ${yaAlineados}`);
  console.log(`Sin destinatarioId (no se puede migrar):    ${sinDestinatarioId}`);
  console.log(`Conflictos (userId distinto, NO sobrescribe): ${conflictos}`);
  console.log(`${dryRun ? 'Que se copiarían' : 'Copiados'}:                            ${copiados}`);
  if (!dryRun) {
    console.log(`Batches Firestore comiteados:               ${batchesComiteados}`);
  }
  if (conflictos > 0) {
    console.log(`\n[WARN] IDs con conflicto userId/destinatarioId — revisar manualmente:`);
    for (const id of conflictoIds.slice(0, 20)) {
      console.log(`  - ${id}`);
    }
    if (conflictoIds.length > 20) {
      console.log(`  ... y ${conflictoIds.length - 20} más`);
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[ERROR] Falló la migración:', err);
    process.exit(1);
  });
