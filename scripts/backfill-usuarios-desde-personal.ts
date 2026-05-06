/**
 * Backfill: crea docs en `usuarios/{uid}` para cada empleado activo en
 * `personal` que tenga `uid` pero no tenga el doc espejo.
 *
 * Por qué: la cascada de AppContext acepta perfiles desde `personal`
 * como fallback cuando no hay doc en `usuarios/{uid}`. Eso causó el
 * bug de Reactivación (`afc5e4a` / `1f21cc2`). Para prevenir futuros
 * casos donde `userProfile.id` (doc id de `personal`) se confunde con
 * `auth.uid`, todos los empleados activos con uid deben tener doc
 * espejo en `usuarios/`.
 *
 * Idempotente:
 *   - Si `usuarios/{uid}` no existe → crear.
 *   - Si existe y email/rol matchean → no toca.
 *   - Si existe y email/rol divergen → log warn, no sobrescribe (humano decide).
 *
 * Uso:
 *   npx tsx scripts/backfill-usuarios-desde-personal.ts            # ejecuta
 *   npx tsx scripts/backfill-usuarios-desde-personal.ts --dry-run  # solo cuenta
 *
 * Auth:
 *   1) GOOGLE_APPLICATION_CREDENTIALS apunta a un JSON existente.
 *   2) ./service-account.json en el cwd.
 *   3) FIREBASE_PROJECT_ID + FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY.
 */
import { initializeApp, getApps, cert, applicationDefault } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';

interface ConflictoEntry {
  uid: string;
  personalId: string;
  motivo: string;
}

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
  const personalSnap = await db.collection('personal').get();
  console.log(`[INFO] Total docs en personal: ${personalSnap.size}`);

  let creados = 0;
  let yaExistianOk = 0;
  let saltadosSinUid = 0;
  let saltadosInactivos = 0;
  const conflictos: ConflictoEntry[] = [];

  for (const personalDoc of personalSnap.docs) {
    const data = personalDoc.data();
    const uid = typeof data.uid === 'string' && data.uid.length > 0 ? data.uid : null;
    const activo = data.activo === true;

    if (!activo) {
      saltadosInactivos++;
      continue;
    }
    if (!uid) {
      saltadosSinUid++;
      continue;
    }

    const usuarioRef = db.collection('usuarios').doc(uid);
    const usuarioSnap = await usuarioRef.get();

    if (usuarioSnap.exists) {
      const u = usuarioSnap.data() as Record<string, unknown>;
      const emailUsuario = typeof u.email === 'string' ? u.email.toLowerCase() : null;
      const emailPersonal = typeof data.email === 'string' ? data.email.toLowerCase() : null;
      const rolUsuario = typeof u.rol === 'string' ? u.rol : null;
      const rolPersonal = typeof data.rol === 'string' ? data.rol : null;

      if (emailUsuario && emailPersonal && emailUsuario !== emailPersonal) {
        conflictos.push({ uid, personalId: personalDoc.id, motivo: `email diverge: usuarios=${emailUsuario}, personal=${emailPersonal}` });
        continue;
      }
      if (rolUsuario && rolPersonal && rolUsuario !== rolPersonal) {
        conflictos.push({ uid, personalId: personalDoc.id, motivo: `rol diverge: usuarios=${rolUsuario}, personal=${rolPersonal}` });
        continue;
      }
      yaExistianOk++;
      continue;
    }

    // Crear doc espejo en usuarios/{uid}.
    const payload: Record<string, unknown> = {
      nombre: data.nombre ?? '',
      email: data.email ?? '',
      rol: data.rol ?? 'tecnico',
      telefono: data.telefono ?? '',
      activo: true,
      createdAt: FieldValue.serverTimestamp(),
      migradoDesdePersonal: true,
      personalDocId: personalDoc.id,
    };
    if (typeof data.color === 'string') payload.color = data.color;
    const limpio = Object.fromEntries(Object.entries(payload).filter(([, v]) => v !== undefined));

    if (!dryRun) {
      await usuarioRef.set(limpio);
    }
    creados++;
    console.log(`[${dryRun ? 'DRY' : 'OK '}] crear usuarios/${uid} desde personal/${personalDoc.id} (${data.nombre} · ${data.rol})`);
  }

  console.log(`\n─── Resumen ───`);
  console.log(`Total personal:                            ${personalSnap.size}`);
  console.log(`Saltados (activo=false):                   ${saltadosInactivos}`);
  console.log(`Saltados (sin uid):                        ${saltadosSinUid}`);
  console.log(`Ya existían en usuarios (email+rol OK):    ${yaExistianOk}`);
  console.log(`Conflictos (NO sobrescribe):               ${conflictos.length}`);
  console.log(`${dryRun ? 'Que se crearían' : 'Creados'}:                            ${creados}`);

  if (conflictos.length > 0) {
    console.log(`\n[WARN] Conflictos — revisar manualmente:`);
    for (const c of conflictos.slice(0, 30)) {
      console.log(`  - uid=${c.uid} personal=${c.personalId} :: ${c.motivo}`);
    }
    if (conflictos.length > 30) {
      console.log(`  ... y ${conflictos.length - 30} más`);
    }
    console.log(`\nResolución: leer ambos docs en Firebase Console y decidir cuál es la verdad.`);
    console.log(`En general, la verdad es 'personal' (es donde se gestiona el empleado), pero verificar caso por caso.`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[ERROR] Falló el backfill:', err);
    process.exit(1);
  });
