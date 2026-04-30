/**
 * Migración one-shot: genera `tokenPortalCliente` para órdenes en fase
 * `agendado` o posterior que aún no lo tengan.
 *
 * Idempotente: si la orden ya tiene token, se salta. Re-correr es seguro.
 *
 * NO envía WhatsApp — admin/coord decide cuándo manualmente desde el modal.
 *
 * Uso:
 *   npx tsx scripts/generar-tokens-portal-cliente.ts
 *
 * Requiere las variables de entorno del Admin SDK (las mismas que `api/`):
 *   FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY
 */
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const FASES_OBJETIVO = new Set([
  'agendado',
  'en_diagnostico',
  'en_cotizacion',
  'aprobado',
  'trabajo_realizado',
  'cerrado',
]);

/**
 * Genera 32 chars hex sin guiones (mismo formato que el helper del frontend).
 */
function generarToken(): string {
  if (typeof globalThis.crypto !== 'undefined' && typeof globalThis.crypto.randomUUID === 'function') {
    return globalThis.crypto.randomUUID().replace(/-/g, '');
  }
  let out = '';
  for (let i = 0; i < 32; i++) {
    out += Math.floor(Math.random() * 16).toString(16);
  }
  return out;
}

async function main() {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKeyRaw = process.env.FIREBASE_PRIVATE_KEY;

  if (!projectId || !clientEmail || !privateKeyRaw) {
    console.error(
      'Faltan variables de entorno: FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY',
    );
    process.exit(1);
  }

  const privateKey = privateKeyRaw.replace(/\\n/g, '\n');
  if (getApps().length === 0) {
    initializeApp({
      credential: cert({ projectId, clientEmail, privateKey }),
      projectId,
    });
  }
  const db = getFirestore();

  console.log('Buscando órdenes elegibles...');
  const snap = await db.collection('ordenes_servicio').get();

  let actualizadas = 0;
  let skipConToken = 0;
  let skipFaseInvalida = 0;

  // Procesamos en lotes de 400 (límite Firestore = 500 ops por batch).
  const BATCH_SIZE = 400;
  let batch = db.batch();
  let batchCount = 0;

  for (const docSnap of snap.docs) {
    const data = docSnap.data() as Record<string, unknown>;
    const fase = typeof data.fase === 'string' ? data.fase : '';
    if (!FASES_OBJETIVO.has(fase)) {
      skipFaseInvalida += 1;
      continue;
    }
    if (typeof data.tokenPortalCliente === 'string' && data.tokenPortalCliente.length > 0) {
      skipConToken += 1;
      continue;
    }
    batch.update(docSnap.ref, { tokenPortalCliente: generarToken() });
    batchCount += 1;
    actualizadas += 1;
    if (batchCount >= BATCH_SIZE) {
      await batch.commit();
      batch = db.batch();
      batchCount = 0;
    }
  }

  if (batchCount > 0) {
    await batch.commit();
  }

  console.log('\n─── Resumen ───');
  console.log(`Total leídas: ${snap.size}`);
  console.log(`Skip (fase no elegible): ${skipFaseInvalida}`);
  console.log(`Skip (ya tienen token): ${skipConToken}`);
  console.log(`Actualizadas: ${actualizadas} órdenes`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Error en migración:', err);
    process.exit(1);
  });
