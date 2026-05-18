/**
 * SPRINT-185 — Deduplicación de clientes por teléfono normalizado.
 *
 * Causa raíz: hasta el fix commiteado junto con este script, la página
 * `/admin/clientes` usaba `addDoc(collection(db, 'clientes'), ...)` con
 * auto-id, ignorando la convención de `buscarOCrearCliente` (ID =
 * telefonoNormalizado). Resultado: 2+ docs de clientes con el mismo
 * teléfono normalizado quedaron en la base. Detección original: QA
 * puntual del SPRINT-178 reveló que el descuento de chequeo previo NO
 * aplicaba para OS-0058/OS-0059 porque ambas órdenes apuntaban a
 * `clienteId` distintos del mismo cliente "QA Test".
 *
 * Estrategia:
 *
 *   1. Recorrer `clientes` calculando `telNorm` (lo persistido o el
 *      derivado de `telefono` raw via `normalizarTelefono`).
 *   2. Agrupar por `telNorm`. Grupos con >1 entrada son duplicados.
 *   3. Para cada grupo: el más antiguo (`createdAt` ASC) es canónico.
 *      Los otros son duplicados a mergear.
 *   4. Para cada duplicado:
 *      a. Reasignar `clienteId` en `ordenes_servicio`, `citas_por_confirmar`,
 *         `cotizaciones`, `facturas`, `equipos_taller` que apunten al
 *         duplicado → apuntarlos al canónico.
 *      b. Marcar el duplicado con soft-delete (`eliminado: true`,
 *         `eliminadoEn`, `eliminadoPor: 'sistema'`, `mergedaCon: <canonicoId>`).
 *   5. Audit log en `auditoria_admin` con `accion: 'dedup_clientes_por_telefono'`
 *      + lista de grupos consolidados.
 *
 * Uso:
 *
 *   DRY-RUN (default — solo reporta, NO escribe):
 *     npx tsx scripts/dedup-clientes-por-telefono.ts
 *
 *   REAL (escribe a Firestore):
 *     npx tsx scripts/dedup-clientes-por-telefono.ts --apply
 *
 *   Si DRY-RUN reporta >50 docs afectados → abortar y pedir flag
 *   adicional `--ok-ampliado` (sub-regla CLAUDE.md migraciones masivas).
 *
 * Idempotente: re-correrlo después del primer `--apply` no toca nada
 * (los duplicados ya tienen `eliminado: true` y el grupo queda con 1
 * único activo).
 *
 * Auth: mismo patrón que `backfill-zonas-clientes.ts` —
 *   1. GOOGLE_APPLICATION_CREDENTIALS apuntando al JSON.
 *   2. ./service-account.json en cwd.
 *   3. FIREBASE_PROJECT_ID + FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY env.
 */
import { initializeApp, getApps, cert, applicationDefault } from 'firebase-admin/app';
import { getFirestore, FieldValue, Timestamp as AdminTimestamp } from 'firebase-admin/firestore';
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';

const APPLY = process.argv.includes('--apply');
const OK_AMPLIADO = process.argv.includes('--ok-ampliado');
const LIMITE_DOCS_SIN_OK_AMPLIADO = 50;
const LIMITE_GRUPOS_SIN_ESCALACION = 5;
const BATCH_SAFE_LIMIT = 400;

/**
 * Replica de `normalizarTelefono` de `src/services/clientes.service.ts`.
 * Mantenida acá para evitar imports cruzados Node/Vite. Si la lógica
 * cambia en el service, hay que actualizar acá tambien (test inline en
 * el helper canónico).
 */
function normalizarTelefono(tel: string): string {
  if (!tel) return '';
  const soloDigitos = tel.replace(/\D/g, '');
  if (soloDigitos.length > 11) return '';
  if (soloDigitos.length === 11 && !soloDigitos.startsWith('1')) return '';
  if (soloDigitos.length === 11 && soloDigitos.startsWith('1')) {
    return soloDigitos.substring(1);
  }
  if (soloDigitos.length < 10) return '';
  return soloDigitos.slice(-10);
}

interface ClienteDoc {
  id: string;
  telNorm: string;
  telefono: string;
  nombre: string;
  createdAt: number; // ms timestamp para sort
  eliminado: boolean;
}

interface Grupo {
  telNorm: string;
  canonico: ClienteDoc;
  duplicados: ClienteDoc[];
}

async function main() {
  console.log(`[INFO] Modo: ${APPLY ? 'APPLY (escribe a Firestore)' : 'DRY-RUN (solo reporta)'}`);

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
          '[ERROR] Faltan credenciales del Admin SDK.\n' +
          '  1) ./service-account.json en raíz del repo, o\n' +
          '  2) GOOGLE_APPLICATION_CREDENTIALS, o\n' +
          '  3) FIREBASE_PROJECT_ID + FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY.',
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

  // ─── Paso 1: leer todos los clientes ────────────────────────────────────
  console.log('[INFO] Leyendo `clientes`...');
  const snap = await db.collection('clientes').get();
  console.log(`[INFO] Total clientes en BD: ${snap.size}`);

  const clientes: ClienteDoc[] = [];
  for (const doc of snap.docs) {
    const d = doc.data();
    const telRaw = (d.telefono as string) || '';
    // Preferir telNorm persistido; si no existe (cliente legacy), derivar.
    const telNorm = (d.telefonoNormalizado as string) || normalizarTelefono(telRaw);
    if (!telNorm) continue; // tel inválido — fuera del scope del dedup

    const createdAtRaw = d.createdAt;
    let createdAtMs = 0;
    if (createdAtRaw instanceof AdminTimestamp) createdAtMs = createdAtRaw.toMillis();
    else if (createdAtRaw && typeof createdAtRaw.toDate === 'function') createdAtMs = createdAtRaw.toDate().getTime();
    else if (createdAtRaw instanceof Date) createdAtMs = createdAtRaw.getTime();

    clientes.push({
      id: doc.id,
      telNorm,
      telefono: telRaw,
      nombre: (d.nombre as string) || '(sin nombre)',
      createdAt: createdAtMs,
      eliminado: d.eliminado === true,
    });
  }

  // ─── Paso 2: agrupar y detectar duplicados ──────────────────────────────
  const porTel = new Map<string, ClienteDoc[]>();
  for (const c of clientes) {
    if (c.eliminado) continue; // ya mergeados — no entran al grupo
    const arr = porTel.get(c.telNorm) || [];
    arr.push(c);
    porTel.set(c.telNorm, arr);
  }

  const grupos: Grupo[] = [];
  for (const [telNorm, lista] of porTel.entries()) {
    if (lista.length < 2) continue;
    // El más antiguo es canónico. Empate de createdAt → el ID alfabéticamente menor.
    lista.sort((a, b) => {
      if (a.createdAt !== b.createdAt) return a.createdAt - b.createdAt;
      return a.id.localeCompare(b.id);
    });
    const [canonico, ...duplicados] = lista;
    grupos.push({ telNorm, canonico, duplicados });
  }

  // ─── Paso 3: reporte preliminar ─────────────────────────────────────────
  console.log('');
  console.log('─── Resumen detección ───');
  console.log(`Total clientes activos (no-eliminado): ${clientes.filter(c => !c.eliminado).length}`);
  console.log(`Total grupos con duplicados:           ${grupos.length}`);
  const totalDuplicadosAMergear = grupos.reduce((sum, g) => sum + g.duplicados.length, 0);
  console.log(`Total duplicados a mergear:            ${totalDuplicadosAMergear}`);
  console.log('');

  if (grupos.length === 0) {
    console.log('[OK] No hay duplicados. Nada que hacer.');
    process.exit(0);
  }

  // ─── Paso 4: detallar grupos ────────────────────────────────────────────
  for (const g of grupos.slice(0, 20)) {
    console.log(`Grupo tel ${g.telNorm}:`);
    console.log(`  canónico:    ${g.canonico.id} (${g.canonico.nombre}, createdAt ${new Date(g.canonico.createdAt).toISOString()})`);
    for (const d of g.duplicados) {
      console.log(`  duplicado:   ${d.id} (${d.nombre}, createdAt ${new Date(d.createdAt).toISOString()})`);
    }
  }
  if (grupos.length > 20) {
    console.log(`  ... y ${grupos.length - 20} grupos más (truncado).`);
  }
  console.log('');

  // ─── Paso 5: escalación si pasa límites ─────────────────────────────────
  if (grupos.length > LIMITE_GRUPOS_SIN_ESCALACION && !APPLY) {
    console.log(`[WARN] ${grupos.length} grupos > ${LIMITE_GRUPOS_SIN_ESCALACION} → escalar SPRINT-185-APPLY a BLOQUEOS con conteo (regla operacional Jorge 2026-05-18).`);
  }

  if (!APPLY) {
    console.log('[INFO] DRY-RUN completo. Nada se escribió. Para aplicar, re-correr con --apply');
    process.exit(0);
  }

  // ─── Paso 6: contar docs afectados pre-write ────────────────────────────
  const colsConClienteId = ['ordenes_servicio', 'citas_por_confirmar', 'cotizaciones', 'facturas', 'equipos_taller'];
  const duplicadoIds = new Set(grupos.flatMap(g => g.duplicados.map(d => d.id)));

  console.log('[INFO] Contando docs apuntando a duplicados en colecciones aledañas...');
  let totalDocsAReasignar = 0;
  const conteoPorCol: Record<string, number> = {};
  for (const col of colsConClienteId) {
    let n = 0;
    for (const dupId of duplicadoIds) {
      const q = await db.collection(col).where('clienteId', '==', dupId).get();
      n += q.size;
    }
    conteoPorCol[col] = n;
    totalDocsAReasignar += n;
    console.log(`  ${col}: ${n} docs`);
  }
  console.log(`Total docs a reasignar: ${totalDocsAReasignar}`);
  console.log('');

  const totalAfectados = totalDocsAReasignar + totalDuplicadosAMergear;
  if (totalAfectados > LIMITE_DOCS_SIN_OK_AMPLIADO && !OK_AMPLIADO) {
    console.error(
      `[ABORT] Total docs afectados (${totalAfectados}) > ${LIMITE_DOCS_SIN_OK_AMPLIADO}.\n` +
      `Sub-regla CLAUDE.md migraciones masivas. Re-correr con --apply --ok-ampliado si Jorge dio OK.`,
    );
    process.exit(2);
  }

  // ─── Paso 7: aplicar (reasignar + soft-delete + audit) ──────────────────
  const nowAdmin = AdminTimestamp.now();
  let opsTotales = 0;
  let batch = db.batch();
  let opsEnBatch = 0;
  let batchesComiteados = 0;

  async function flushIfNeeded() {
    if (opsEnBatch >= BATCH_SAFE_LIMIT) {
      await batch.commit();
      batchesComiteados++;
      console.log(`[OK] Batch #${batchesComiteados} comiteado (${opsEnBatch} ops).`);
      batch = db.batch();
      opsEnBatch = 0;
    }
  }

  // 7a. Reasignar clienteId en colecciones aledañas
  for (const col of colsConClienteId) {
    for (const dupId of duplicadoIds) {
      const grupo = grupos.find(g => g.duplicados.some(d => d.id === dupId))!;
      const canonicoId = grupo.canonico.id;
      const q = await db.collection(col).where('clienteId', '==', dupId).get();
      for (const doc of q.docs) {
        batch.update(doc.ref, {
          clienteId: canonicoId,
          updatedAt: FieldValue.serverTimestamp(),
        });
        opsEnBatch++;
        opsTotales++;
        await flushIfNeeded();
      }
    }
  }

  // 7b. Soft-delete duplicados
  for (const g of grupos) {
    for (const d of g.duplicados) {
      batch.update(db.collection('clientes').doc(d.id), {
        eliminado: true,
        eliminadoEn: nowAdmin,
        eliminadoPor: 'sistema',
        mergedaCon: g.canonico.id,
        updatedAt: FieldValue.serverTimestamp(),
      });
      opsEnBatch++;
      opsTotales++;
      await flushIfNeeded();
    }
  }

  // 7c. Audit log
  const auditPayload = {
    accion: 'dedup_clientes_por_telefono',
    timestamp: nowAdmin,
    actorUid: 'sistema',
    actorNombre: 'script:dedup-clientes-por-telefono',
    detalle: {
      gruposConsolidados: grupos.length,
      totalDuplicadosMergeados: totalDuplicadosAMergear,
      totalDocsReasignados: totalDocsAReasignar,
      conteoPorColeccion: conteoPorCol,
      grupos: grupos.map(g => ({
        telNorm: g.telNorm,
        canonicoId: g.canonico.id,
        canonicoNombre: g.canonico.nombre,
        duplicados: g.duplicados.map(d => ({ id: d.id, nombre: d.nombre })),
      })),
    },
  };
  const auditRef = db.collection('auditoria_admin').doc();
  batch.set(auditRef, auditPayload);
  opsEnBatch++;
  opsTotales++;

  // Flush final
  if (opsEnBatch > 0) {
    await batch.commit();
    batchesComiteados++;
    console.log(`[OK] Batch final #${batchesComiteados} comiteado (${opsEnBatch} ops).`);
  }

  console.log('');
  console.log('─── Resumen aplicado ───');
  console.log(`Grupos consolidados:       ${grupos.length}`);
  console.log(`Duplicados soft-deleted:   ${totalDuplicadosAMergear}`);
  console.log(`Docs reasignados:          ${totalDocsAReasignar}`);
  console.log(`Total ops Firestore:       ${opsTotales}`);
  console.log(`Batches comiteados:        ${batchesComiteados}`);
  console.log(`Audit log id:              ${auditRef.id}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[ERROR] Falló el dedup:', err);
    process.exit(1);
  });
