/**
 * Migración one-shot: consolida el counter legacy de facturas
 * (`counters/facturas.count`, usado históricamente por `Facturas.tsx`)
 * con el counter oficial (`config/contadores.ultimaFactura`, usado por
 * `FacturacionPendiente.tsx` y ahora por todo el sistema).
 *
 * Lógica: el oficial pasa a ser el máximo entre ambos, asegurando que
 * los próximos `siguienteNumeroFactura()` no choquen con números
 * `FAC-####` ya emitidos por el flujo legacy.
 *
 * Idempotente: si el oficial ya es ≥ al legacy, no hace nada. Re-correr
 * es seguro.
 *
 * Uso:
 *   npx tsx scripts/consolidar-counter-facturas.ts
 *
 * Requiere las variables de entorno del Admin SDK (las mismas que `api/`):
 *   FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY
 *
 * Correr ANTES de hacer push del refactor que consolida el counter, para
 * que el primer conduce emitido desde `/admin/facturas` post-deploy
 * arranque secuencial al máximo histórico.
 */
import { initializeApp, getApps, cert, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';

async function main() {
  // Resolver credenciales en este orden:
  // 1) Si GOOGLE_APPLICATION_CREDENTIALS apunta a un JSON existente, usar ése.
  // 2) Si existe ./service-account.json en el cwd, usarlo.
  // 3) Si las 3 env vars FIREBASE_* están seteadas, usar cert() inline.
  // 4) Si nada, error claro.
  if (getApps().length === 0) {
    const gacPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
    const localPath = resolve(process.cwd(), 'service-account.json');

    if (gacPath && existsSync(gacPath)) {
      console.log(`Usando GOOGLE_APPLICATION_CREDENTIALS: ${gacPath}`);
      initializeApp({ credential: applicationDefault() });
    } else if (existsSync(localPath)) {
      console.log(`Usando service-account.json local`);
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
          'Faltan credenciales del Admin SDK. Probá una de estas opciones:\n' +
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

  const legacyRef = db.collection('counters').doc('facturas');
  const oficialRef = db.collection('config').doc('contadores');

  const [legacySnap, oficialSnap] = await Promise.all([
    legacyRef.get(),
    oficialRef.get(),
  ]);

  const legacyData = legacySnap.exists ? legacySnap.data() : undefined;
  const oficialData = oficialSnap.exists ? oficialSnap.data() : undefined;

  const maxLegacy = typeof legacyData?.count === 'number' ? legacyData.count : 0;
  const maxOficial = typeof oficialData?.ultimaFactura === 'number' ? oficialData.ultimaFactura : 0;
  const consolidado = Math.max(maxLegacy, maxOficial);

  console.log('─── Estado actual ───');
  console.log(`Legacy   (counters/facturas.count):        ${maxLegacy}`);
  console.log(`Oficial  (config/contadores.ultimaFactura): ${maxOficial}`);

  if (consolidado > maxOficial) {
    if (!oficialSnap.exists) {
      await oficialRef.set({ ultimaFactura: consolidado }, { merge: true });
    } else {
      await oficialRef.update({ ultimaFactura: consolidado });
    }
    console.log(`\nConsolidado: ${maxOficial} → ${consolidado}`);
    console.log(`Próximo conduce emitirá CG-${String(consolidado + 1).padStart(5, '0')}`);
  } else {
    console.log('\nNo requiere ajuste. Oficial ya es >= Legacy.');
    console.log(`Próximo conduce emitirá CG-${String(maxOficial + 1).padStart(5, '0')}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Error en migración:', err);
    process.exit(1);
  });
