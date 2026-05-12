/**
 * Migración SPRINT-149: `operariaId` en `ordenes_servicio` Y en `personal/{tecnico}`
 * debe ser `auth.uid` (personal.uid), NO el doc id de personal/.
 *
 * Contexto del bug:
 *   - El WRITE-side se migró parcialmente en SPRINT-105 (FormAltaEditarEmpleado.tsx)
 *     y `useOrdenCreateForm.ts` que derivan el valor del técnico, pero algunas
 *     escrituras y los READ-side seguían asumiendo doc id de personal/.
 *   - Las operarias creadas post-SPRINT-105 tienen `operariaId == personal.uid`,
 *     pero las operarias pre-SPRINT-105 tienen `operariaId == personal.id` (doc id).
 *   - SPRINT-149 alineó el código (todos los reads usan ahora el patrón
 *     `(p.uid || p.id) === operariaId`).
 *   - Este script alinea los DATOS existentes: cualquier `operariaId` que sea
 *     doc id de una operaria que SÍ tenga `uid` poblado se migra a uid.
 *
 * Lo que hace:
 *   1. Lee `personal/` → identifica operarias/coordinadoras + sus uid.
 *   2. Itera `ordenes_servicio` (todas, también cerradas — para histórico).
 *      Si `o.operariaId` matchea un doc id de operaria con `uid` poblado,
 *      actualiza a uid. Si ya está como uid o no matchea ningún docId, no toca.
 *   3. Itera `personal where rol == 'tecnico'`. Si `t.operariaId` matchea
 *      un docId de operaria con uid, actualiza a uid.
 *   4. Reporta resumen: cuántas ya alineadas, cuántas migradas, cuántas huérfanas,
 *      cuántas pertenecen a operarias sin uid (no migrables hasta onboarding).
 *
 * Uso:
 *   - Dry-run por default (no escribe):
 *       npx tsx scripts/migrar-operariaid-a-uid.ts
 *   - Real (escribe a Firestore):
 *       npx tsx scripts/migrar-operariaid-a-uid.ts --apply
 *
 * Idempotente: correrlo dos veces no duplica trabajo.
 *
 * Batches de hasta 200 docs (Firestore admite 500; dejamos margen).
 *
 * **Autorización requerida (sub-regla CLAUDE.md):** el coordinator NO ejecuta
 * `--apply` autónomo — Jorge dispara manualmente después de revisar el dry-run.
 * Si el script detecta >50 docs a migrar, escala a `BLOQUEOS.md` con OK explícito.
 *
 * Requiere `service-account.json` en la raíz del repo.
 */

import { initializeApp, cert, getApps, applicationDefault } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import * as fs from 'fs';
import * as path from 'path';

const SERVICE_ACCOUNT_PATH = path.resolve('service-account.json');
const APPLY = process.argv.includes('--apply');
const OK_AMPLIADO = process.argv.includes('--ok-ampliado');
const DRY_RUN = !APPLY;

if (!getApps().length) {
  if (fs.existsSync(SERVICE_ACCOUNT_PATH)) {
    const serviceAccount = JSON.parse(fs.readFileSync(SERVICE_ACCOUNT_PATH, 'utf-8'));
    initializeApp({ credential: cert(serviceAccount) });
    console.log('[INFO] Usando service-account.json local');
  } else {
    initializeApp({ credential: applicationDefault() });
    console.log('[INFO] Usando applicationDefault() (gcloud)');
  }
}

const db = getFirestore();

interface PersonalDoc {
  id: string;
  uid?: string;
  nombre?: string;
  rol?: string;
}

async function main() {
  console.log(`[INFO] Modo: ${DRY_RUN ? 'DRY-RUN (no escribe)' : 'REAL (--apply, escribe a Firestore)'}`);
  console.log('');

  console.log('[INFO] Leyendo personal...');
  const personalSnap = await db.collection('personal').get();
  const personalById = new Map<string, PersonalDoc>();
  const operariasConUid: PersonalDoc[] = [];
  const operariasSinUid: PersonalDoc[] = [];
  for (const doc of personalSnap.docs) {
    const d = doc.data();
    const item: PersonalDoc = { id: doc.id, uid: d.uid, nombre: d.nombre, rol: d.rol };
    personalById.set(doc.id, item);
    if (d.rol === 'operaria' || d.rol === 'coordinadora') {
      if (d.uid) operariasConUid.push(item);
      else operariasSinUid.push(item);
    }
  }
  console.log(`[INFO] personal: ${personalSnap.size} docs (operarias con uid: ${operariasConUid.length}, sin uid: ${operariasSinUid.length})`);

  if (operariasSinUid.length > 0) {
    console.log('[INFO] Operarias sin uid (no migrables hasta onboarding):');
    for (const op of operariasSinUid) {
      console.log(`         - ${op.nombre || '(sin nombre)'} (docId: ${op.id})`);
    }
  }
  console.log('');

  // Map docId → uid solo para operarias con uid poblado.
  const docIdToUid = new Map<string, string>();
  for (const op of operariasConUid) {
    if (op.uid) docIdToUid.set(op.id, op.uid);
  }

  console.log('[INFO] Leyendo ordenes_servicio...');
  const ordenesSnap = await db.collection('ordenes_servicio').get();
  console.log(`[INFO] ordenes_servicio: ${ordenesSnap.size} docs`);
  console.log('');

  // ── Parte 1: ordenes_servicio.operariaId ──
  let ordYaCorrecta = 0;     // operariaId ya es uid
  let ordSinOperaria = 0;    // no tiene operariaId
  let ordMigrable = 0;       // operariaId == docId de operaria con uid → migrar
  let ordHuerfana = 0;       // operariaId no matchea ningún docId ni uid conocido
  let ordSinUidDestino = 0;  // operariaId == docId de operaria sin uid (no migrable)

  const cambiosOrdenes: Array<{
    docId: string;
    numero: string;
    operariaIdViejo: string;
    operariaIdNuevo: string;
  }> = [];

  for (const ordenDoc of ordenesSnap.docs) {
    const orden = ordenDoc.data();
    const operariaId: string | undefined = orden.operariaId;
    if (!operariaId) {
      ordSinOperaria++;
      continue;
    }
    // ¿ya es uid?
    const yaEsUid = operariasConUid.some(op => op.uid === operariaId);
    if (yaEsUid) {
      ordYaCorrecta++;
      continue;
    }
    // ¿es un docId conocido?
    const uidDestino = docIdToUid.get(operariaId);
    if (uidDestino) {
      ordMigrable++;
      cambiosOrdenes.push({
        docId: ordenDoc.id,
        numero: (orden.numero as string) || ordenDoc.id.substring(0, 8),
        operariaIdViejo: operariaId,
        operariaIdNuevo: uidDestino,
      });
      continue;
    }
    // ¿es docId de operaria sin uid?
    const sinUid = operariasSinUid.find(op => op.id === operariaId);
    if (sinUid) {
      ordSinUidDestino++;
      continue;
    }
    // huérfana
    ordHuerfana++;
  }

  // ── Parte 2: personal[tecnico].operariaId ──
  let tecYaCorrecta = 0;
  let tecSinOperaria = 0;
  let tecMigrable = 0;
  let tecHuerfana = 0;
  let tecSinUidDestino = 0;

  const cambiosTecnicos: Array<{
    docId: string;
    nombre: string;
    operariaIdViejo: string;
    operariaIdNuevo: string;
  }> = [];

  for (const persona of Array.from(personalById.values())) {
    if (persona.rol !== 'tecnico') continue;
    const doc = personalSnap.docs.find(d => d.id === persona.id);
    if (!doc) continue;
    const data = doc.data();
    const operariaId: string | undefined = data.operariaId;
    if (!operariaId) {
      tecSinOperaria++;
      continue;
    }
    const yaEsUid = operariasConUid.some(op => op.uid === operariaId);
    if (yaEsUid) {
      tecYaCorrecta++;
      continue;
    }
    const uidDestino = docIdToUid.get(operariaId);
    if (uidDestino) {
      tecMigrable++;
      cambiosTecnicos.push({
        docId: persona.id,
        nombre: persona.nombre || '(sin nombre)',
        operariaIdViejo: operariaId,
        operariaIdNuevo: uidDestino,
      });
      continue;
    }
    const sinUid = operariasSinUid.find(op => op.id === operariaId);
    if (sinUid) {
      tecSinUidDestino++;
      continue;
    }
    tecHuerfana++;
  }

  // ── Resumen ──
  console.log('─── Resumen ordenes_servicio ───');
  console.log(`Total órdenes:                                  ${ordenesSnap.size}`);
  console.log(`Sin operariaId:                                 ${ordSinOperaria}`);
  console.log(`operariaId ya correcto (== auth.uid):           ${ordYaCorrecta}`);
  console.log(`operariaId migrable (docId→uid):                ${ordMigrable}`);
  console.log(`operariaId apunta a operaria sin uid (no migr): ${ordSinUidDestino}`);
  console.log(`operariaId huérfano (no matchea nada):          ${ordHuerfana}`);
  console.log('');
  console.log('─── Resumen personal (técnicos) ───');
  console.log(`Total técnicos:                                 ${Array.from(personalById.values()).filter(p => p.rol === 'tecnico').length}`);
  console.log(`Sin operariaId:                                 ${tecSinOperaria}`);
  console.log(`operariaId ya correcto:                         ${tecYaCorrecta}`);
  console.log(`operariaId migrable (docId→uid):                ${tecMigrable}`);
  console.log(`operariaId apunta a operaria sin uid:           ${tecSinUidDestino}`);
  console.log(`operariaId huérfano:                            ${tecHuerfana}`);
  console.log('');

  const totalMigrables = ordMigrable + tecMigrable;

  if (totalMigrables === 0) {
    console.log('[OK] Nada que migrar. Base ya alineada.');
    return;
  }

  if (cambiosOrdenes.length > 0) {
    console.log('─── Cambios en órdenes (primeros 10) ───');
    for (const c of cambiosOrdenes.slice(0, 10)) {
      console.log(`  ${c.numero}  operariaId: ${c.operariaIdViejo.substring(0, 8)}... → ${c.operariaIdNuevo.substring(0, 8)}...`);
    }
    if (cambiosOrdenes.length > 10) console.log(`  ... y ${cambiosOrdenes.length - 10} más`);
    console.log('');
  }

  if (cambiosTecnicos.length > 0) {
    console.log('─── Cambios en técnicos (primeros 10) ───');
    for (const c of cambiosTecnicos.slice(0, 10)) {
      console.log(`  ${c.nombre}  operariaId: ${c.operariaIdViejo.substring(0, 8)}... → ${c.operariaIdNuevo.substring(0, 8)}...`);
    }
    if (cambiosTecnicos.length > 10) console.log(`  ... y ${cambiosTecnicos.length - 10} más`);
    console.log('');
  }

  if (ordHuerfana > 0) {
    console.log(`[WARN] ${ordHuerfana} órdenes tienen operariaId huérfano (operaria ya no existe en personal/).`);
    console.log('       Revisar manualmente. No se tocan.');
  }
  if (tecHuerfana > 0) {
    console.log(`[WARN] ${tecHuerfana} técnicos tienen operariaId huérfano.`);
  }

  // Umbral de seguridad: >50 docs requieren OK explícito de Jorge (sub-regla SPRINT-149).
  // Pasar --ok-ampliado salta el gate, solo válido si BLOQUEOS.md tiene la entrada
  // "OK ampliado: jorge YYYY-MM-DD HH:MM" firmada en SPRINT-149-APPLY.
  if (totalMigrables > 50 && APPLY && !OK_AMPLIADO) {
    console.log('');
    console.log(`[ABORT] ${totalMigrables} docs migrables superan el umbral de 50 declarado en SPRINT-149.`);
    console.log('        Jorge debe agregar OK explícito en BLOQUEOS.md (entrada SPRINT-149-APPLY) y');
    console.log('        re-ejecutar con --apply --ok-ampliado.');
    console.log('        O volvé a correr sin --apply para revisar el listado.');
    process.exit(2);
  }
  if (totalMigrables > 50 && APPLY && OK_AMPLIADO) {
    console.log('');
    console.log(`[OK AMPLIADO] ${totalMigrables} docs > 50 — procediendo con --ok-ampliado. Asumiendo`);
    console.log('              que BLOQUEOS.md tiene la entrada firmada para SPRINT-149-APPLY.');
  }

  if (DRY_RUN) {
    console.log('');
    console.log(`[DRY-RUN] No se escribió nada. ${totalMigrables} docs serían migrados.`);
    console.log('         Para ejecutar real (autorización requerida de Jorge):');
    console.log('         npx tsx scripts/migrar-operariaid-a-uid.ts --apply');
    return;
  }

  // ── Ejecutar migración real con writeBatch (chunks de 200) ──
  console.log(`[INFO] Aplicando ${totalMigrables} updates en batches de 200...`);

  const BATCH_SIZE = 200;
  let appliedOrd = 0;
  let appliedTec = 0;

  // Órdenes
  for (let i = 0; i < cambiosOrdenes.length; i += BATCH_SIZE) {
    const batch = db.batch();
    const slice = cambiosOrdenes.slice(i, i + BATCH_SIZE);
    for (const c of slice) {
      const ref = db.collection('ordenes_servicio').doc(c.docId);
      batch.update(ref, {
        operariaId: c.operariaIdNuevo,
        operariaIdMigradoDesde: c.operariaIdViejo,
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
    await batch.commit();
    appliedOrd += slice.length;
    console.log(`  [BATCH ${Math.floor(i / BATCH_SIZE) + 1}] ${slice.length} órdenes actualizadas (total ${appliedOrd}/${cambiosOrdenes.length})`);
  }

  // Técnicos
  for (let i = 0; i < cambiosTecnicos.length; i += BATCH_SIZE) {
    const batch = db.batch();
    const slice = cambiosTecnicos.slice(i, i + BATCH_SIZE);
    for (const c of slice) {
      const ref = db.collection('personal').doc(c.docId);
      batch.update(ref, {
        operariaId: c.operariaIdNuevo,
        operariaIdMigradoDesde: c.operariaIdViejo,
      });
    }
    await batch.commit();
    appliedTec += slice.length;
    console.log(`  [BATCH ${Math.floor(i / BATCH_SIZE) + 1}] ${slice.length} técnicos actualizados (total ${appliedTec}/${cambiosTecnicos.length})`);
  }

  // Audit log
  await db.collection('auditoria_admin').add({
    accion: 'migracion_operariaid_a_uid',
    fecha: FieldValue.serverTimestamp(),
    actor: 'script:migrar-operariaid-a-uid',
    sprint: 'SPRINT-149',
    docsAfectados: appliedOrd + appliedTec,
    resumen: {
      ordenesActualizadas: appliedOrd,
      tecnicosActualizados: appliedTec,
      ordenesYaCorrectas: ordYaCorrecta,
      tecnicosYaCorrectos: tecYaCorrecta,
      ordenesHuerfanas: ordHuerfana,
      tecnicosHuerfanos: tecHuerfana,
    },
  });

  console.log('');
  console.log(`[OK] Migración completa. ${appliedOrd + appliedTec} docs actualizados.`);
  console.log('     Audit log escrito en auditoria_admin con accion=migracion_operariaid_a_uid.');
}

main().catch(err => {
  console.error('[ERROR]', err);
  process.exit(1);
});
