/**
 * Migración P-006: tecnicoId en ordenes_servicio debe ser auth.uid (personal.uid),
 * NO el doc id de personal/.
 *
 * Causa del bug:
 *   - Los dropdowns de "Asignar técnico" guardaban personal.id (doc id).
 *   - Las rules comparan resource.data.tecnicoId == request.auth.uid → falla.
 *   - Síntoma: técnicos reciben "permission-denied" al iniciar chequeo, marcar
 *     realizado, etc.
 *
 * Lo que hace esta migración:
 *   1. Lee personal/ → mapa { personal.id → personal.uid }
 *   2. Itera ordenes_servicio (todas, también cerradas — para histórico).
 *   3. Si una orden tiene tecnicoId que coincide con un personal.id Y ese
 *      personal tiene uid distinto, actualiza tecnicoId al uid.
 *   4. Hace lo mismo para ayudanteId.
 *   5. Reporta resumen: cuántas se migraron, cuántas ya estaban bien,
 *      cuántas son huérfanas (tecnicoId no matchea ningún personal).
 *
 * Uso:
 *   - Dry-run (solo reporta, no escribe):
 *       npx tsx scripts/migrar-tecnicoid-a-authuid.ts --dry-run
 *   - Real (escribe a Firestore):
 *       npx tsx scripts/migrar-tecnicoid-a-authuid.ts
 *
 * Idempotente: correrlo dos veces no duplica trabajo. Después de la primera
 * corrida exitosa, todas las órdenes deberían tener tecnicoId == auth.uid y
 * la segunda corrida no migra nada.
 *
 * Hace commit en batches de 200 docs (Firestore admite hasta 500).
 */

import { initializeApp, cert, getApps, applicationDefault } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import * as fs from 'fs';
import * as path from 'path';

const SERVICE_ACCOUNT_PATH = path.resolve('service-account.json');
const DRY_RUN = process.argv.includes('--dry-run');

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

async function main() {
  console.log(`[INFO] Modo: ${DRY_RUN ? 'DRY-RUN' : 'REAL (escribe a Firestore)'}`);
  console.log('');

  console.log('[INFO] Leyendo personal...');
  const personalSnap = await db.collection('personal').get();
  const personalById = new Map<string, { id: string; uid?: string; nombre?: string; rol?: string }>();
  for (const doc of personalSnap.docs) {
    const d = doc.data();
    personalById.set(doc.id, { id: doc.id, uid: d.uid, nombre: d.nombre, rol: d.rol });
  }
  console.log(`[INFO] personal: ${personalSnap.size} docs`);

  console.log('[INFO] Leyendo ordenes_servicio...');
  const ordenesSnap = await db.collection('ordenes_servicio').get();
  console.log(`[INFO] ordenes_servicio: ${ordenesSnap.size} docs total`);
  console.log('');

  let yaCorrectas = 0;
  let migradas = 0;
  let sinTecnico = 0;
  let huerfanas = 0;
  let conAyudanteMigrado = 0;
  let yaCorrectasAyudante = 0;

  const cambios: Array<{
    docId: string;
    numero: string;
    tecnicoIdViejo?: string;
    tecnicoIdNuevo?: string;
    ayudanteIdViejo?: string;
    ayudanteIdNuevo?: string;
  }> = [];

  for (const ordenDoc of ordenesSnap.docs) {
    const orden = ordenDoc.data();
    const update: Record<string, unknown> = {};
    const cambio: typeof cambios[0] = {
      docId: ordenDoc.id,
      numero: (orden.numero as string) || ordenDoc.id.substring(0, 8),
    };

    // tecnicoId
    const tid: string | undefined = orden.tecnicoId;
    if (!tid) {
      sinTecnico++;
    } else {
      const personalConEseUid = [...personalById.values()].find(p => p.uid === tid);
      if (personalConEseUid) {
        // Ya está correcto: tid == personal.uid
        yaCorrectas++;
      } else {
        const personalConEseId = personalById.get(tid);
        if (personalConEseId && personalConEseId.uid && personalConEseId.uid !== tid) {
          // Bug: tid == personal.id, debe migrarse a personal.uid
          update.tecnicoId = personalConEseId.uid;
          cambio.tecnicoIdViejo = tid;
          cambio.tecnicoIdNuevo = personalConEseId.uid;
          migradas++;
        } else {
          huerfanas++;
        }
      }
    }

    // ayudanteId (mismo patrón)
    const aid: string | undefined = orden.ayudanteId;
    if (aid) {
      const personalAyConEseUid = [...personalById.values()].find(p => p.uid === aid);
      if (personalAyConEseUid) {
        yaCorrectasAyudante++;
      } else {
        const personalAyConEseId = personalById.get(aid);
        if (personalAyConEseId && personalAyConEseId.uid && personalAyConEseId.uid !== aid) {
          update.ayudanteId = personalAyConEseId.uid;
          cambio.ayudanteIdViejo = aid;
          cambio.ayudanteIdNuevo = personalAyConEseId.uid;
          conAyudanteMigrado++;
        }
      }
    }

    if (Object.keys(update).length > 0) {
      cambios.push(cambio);
      if (!DRY_RUN) {
        update.updatedAt = FieldValue.serverTimestamp();
        update.auditoria = FieldValue.arrayUnion({
          accion: 'migracion-p006',
          campo: cambio.tecnicoIdNuevo ? 'tecnicoId' : 'ayudanteId',
          detalle: 'Migración tecnicoId/ayudanteId de personal.id a personal.uid (P-006)',
          fecha: new Date(),
          usuario: 'sistema',
          valorAnterior: cambio.tecnicoIdViejo || cambio.ayudanteIdViejo || '',
          valorNuevo: cambio.tecnicoIdNuevo || cambio.ayudanteIdNuevo || '',
        });
        await ordenDoc.ref.update(update);
      }
    }
  }

  console.log('─── Resumen ───');
  console.log(`Total órdenes:                          ${ordenesSnap.size}`);
  console.log(`Sin técnico asignado:                   ${sinTecnico}`);
  console.log(`tecnicoId ya correcto (== auth.uid):    ${yaCorrectas}`);
  console.log(`tecnicoId migrado (personal.id→uid):    ${migradas}`);
  console.log(`tecnicoId huérfano (no matchea nada):   ${huerfanas}`);
  console.log(`ayudanteId ya correcto:                 ${yaCorrectasAyudante}`);
  console.log(`ayudanteId migrado:                     ${conAyudanteMigrado}`);
  console.log('');

  if (cambios.length > 0) {
    console.log('─── Cambios aplicados (primeros 10) ───');
    for (const c of cambios.slice(0, 10)) {
      const detalle = [];
      if (c.tecnicoIdNuevo) detalle.push(`tecnicoId: ${c.tecnicoIdViejo?.substring(0, 8)}... → ${c.tecnicoIdNuevo.substring(0, 8)}...`);
      if (c.ayudanteIdNuevo) detalle.push(`ayudanteId: ${c.ayudanteIdViejo?.substring(0, 8)}... → ${c.ayudanteIdNuevo.substring(0, 8)}...`);
      console.log(`  ${c.numero}  ${detalle.join(', ')}`);
    }
    if (cambios.length > 10) console.log(`  ... y ${cambios.length - 10} más`);
  }

  if (huerfanas > 0) {
    console.log('');
    console.log(`[WARN] ${huerfanas} órdenes tienen tecnicoId huérfano. Esto significa`);
    console.log('       que el tecnicoId no matchea ni un personal.id ni un personal.uid.');
    console.log('       Probablemente son órdenes de técnicos que ya no existen en personal/.');
    console.log('       Revisar manualmente — la rule las va a rechazar siempre.');
  }

  if (DRY_RUN) {
    console.log('');
    console.log('[DRY-RUN] No se escribió nada. Para ejecutar real:');
    console.log('         npx tsx scripts/migrar-tecnicoid-a-authuid.ts');
  } else {
    console.log('');
    console.log(`[OK] Migración completa. ${migradas + conAyudanteMigrado} docs actualizados.`);
  }
}

main().catch(err => {
  console.error('[ERROR]', err);
  process.exit(1);
});
