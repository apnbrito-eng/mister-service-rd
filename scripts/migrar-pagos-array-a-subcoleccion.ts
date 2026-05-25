/**
 * Script de migración: espeja `ordenes_servicio/{id}.pagos[]` (array) a
 * la subcolección `ordenes_servicio/{id}/pagos/{pagoId}` (un doc por pago).
 *
 * SPRINT-PAGOS-CONFIRMA-MARIA-FASE-B-2 (2026-05-25, opción B aprobada por
 * Jorge `OK: jorge 2026-05-25 01:04 opcion=B migrar-si-menos-500`).
 *
 * REGLA DE NEGOCIO IMPORTANTE (opción B — conservadora):
 *   En B-2 la subcolección queda como ESPEJO HISTÓRICO poblado por este
 *   script — los lectores siguen prefiriendo el ARRAY como source-of-truth
 *   real. Los writers W2-W5 (RegistrarPagoModal, ProcesarFacturacionModal,
 *   AgendaDia) NO se tocan en B-2 — siguen escribiendo al array. B-3 será
 *   el cut-over que invierte la preferencia + endurece rules + remueve el
 *   path de lectura del array.
 *
 * IDEMPOTENCIA:
 *   Re-correr el script NO duplica pagos en la subcolección — usa
 *   `pagoId` (el id que ya vive en `pago.id` del array) como doc id en la
 *   subcolección y hace `set(..., {merge:true})`. Si re-corre con cambios
 *   en el array (ej. un pago modificado por la operaria), la subcolección
 *   refleja el último estado del array.
 *
 * CAMPOS PRESERVADOS (TODOS):
 *   id, metodo, monto, fecha, verificado, verificadoPorId, verificadoPorNombre,
 *   verificadoAt, registradoPorId, registradoPorNombre, registradoPorRol,
 *   recibidoPor*, banco*, referencia, notas, createdAt (synth si missing).
 *
 * AUDIT:
 *   Escribe 1 doc por orden migrada en `auditoria_admin` con accion
 *   `pago.migrado.array.a.subcoleccion` para forensia.
 *
 * USO:
 *   npx tsx scripts/migrar-pagos-array-a-subcoleccion.ts                     # DRY-RUN (default)
 *   npx tsx scripts/migrar-pagos-array-a-subcoleccion.ts --apply             # ejecuta si <500 órdenes con pagos
 *   npx tsx scripts/migrar-pagos-array-a-subcoleccion.ts --apply --ok-ampliado   # ejecuta aunque >500 (requiere OK de Jorge en BLOQUEOS.md)
 *
 * REGLA DE VOLUMEN (sub-regla CLAUDE.md "migraciones >500 docs"):
 *   DRY-RUN reporta total de órdenes con pagos. Si >500, abortar y
 *   escalar a BLOQUEOS con conteo exacto. Solo `--ok-ampliado` (con
 *   OK formal de Jorge) bypasea el guard.
 *
 * AUTH (patrón tri-mode estándar del repo):
 *   1) GOOGLE_APPLICATION_CREDENTIALS env apunta a JSON.
 *   2) ./service-account.json en cwd.
 *   3) Env vars FIREBASE_PROJECT_ID|CLIENT_EMAIL|PRIVATE_KEY.
 */
import { initializeApp, getApps, cert, applicationDefault } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';

const COLLECTION = 'ordenes_servicio';
const SUBCOLLECTION = 'pagos';
const AUDIT_COLLECTION = 'auditoria_admin';
const VOLUMEN_LIMITE = 500;

// ---------- Auth tri-mode (espejo de backfill-convs-corruptas-stripundefined.ts) ----------
function initAdmin() {
  if (getApps().length > 0) return;

  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    initializeApp({ credential: applicationDefault() });
    return;
  }

  const saPath = resolve(process.cwd(), 'service-account.json');
  if (existsSync(saPath)) {
    const sa = JSON.parse(readFileSync(saPath, 'utf-8'));
    initializeApp({ credential: cert(sa) });
    return;
  }

  if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) {
    initializeApp({
      credential: cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      }),
    });
    return;
  }

  throw new Error(
    'No hay credenciales: setea GOOGLE_APPLICATION_CREDENTIALS, o pone ./service-account.json, o exporta FIREBASE_PROJECT_ID|CLIENT_EMAIL|PRIVATE_KEY.',
  );
}

// ---------- Helpers ----------
interface PagoRaw {
  id?: string;
  metodo?: string;
  monto?: number;
  fecha?: Timestamp | Date | unknown;
  verificado?: boolean;
  verificadoPorId?: string;
  verificadoPorNombre?: string;
  verificadoAt?: Timestamp | Date | unknown;
  registradoPorId?: string;
  registradoPorNombre?: string;
  registradoPorRol?: string;
  recibidoPorId?: string;
  recibidoPorNombre?: string;
  bancoId?: string;
  bancoNombre?: string;
  referencia?: string;
  notas?: string;
  createdAt?: Timestamp | Date | unknown;
}

function stripUndefined<T extends Record<string, unknown>>(obj: T): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) out[k] = v;
  }
  return out as T;
}

// ---------- Main ----------
async function main() {
  const args = process.argv.slice(2);
  const isApply = args.includes('--apply');
  const okAmpliado = args.includes('--ok-ampliado');
  const isDryRun = !isApply;

  console.log('=== Migrar pagos array → subcolección ===');
  console.log(`Modo: ${isDryRun ? 'DRY-RUN (sin escribir)' : 'APPLY (escribe a Firestore)'}`);
  if (okAmpliado) console.log('Flag --ok-ampliado activo: bypasea guard de volumen >500.');
  console.log('');

  initAdmin();
  const db = getFirestore();

  // 1. Leer todas las órdenes (sin orderBy para evitar P-015).
  console.log(`Leyendo colección ${COLLECTION}...`);
  const snap = await db.collection(COLLECTION).get();
  console.log(`Total docs en ${COLLECTION}: ${snap.size}`);

  // 2. Filtrar órdenes con pagos no vacíos.
  interface OrdenConPagos {
    id: string;
    numero?: string;
    pagos: PagoRaw[];
  }
  const ordenesConPagos: OrdenConPagos[] = [];
  let pagosTotales = 0;
  const stats = { verificadoTrue: 0, verificadoFalse: 0, verificadoUndefined: 0 };

  snap.docs.forEach((d) => {
    const data = d.data() as Record<string, unknown>;
    const pagos = Array.isArray(data.pagos) ? (data.pagos as PagoRaw[]) : [];
    if (pagos.length === 0) return;
    ordenesConPagos.push({
      id: d.id,
      numero: (data.numero as string) || undefined,
      pagos,
    });
    pagos.forEach((p) => {
      pagosTotales++;
      if (p?.verificado === true) stats.verificadoTrue++;
      else if (p?.verificado === false) stats.verificadoFalse++;
      else stats.verificadoUndefined++;
    });
  });

  console.log('');
  console.log('--- REPORTE ---');
  console.log(`Órdenes con al menos 1 pago: ${ordenesConPagos.length}`);
  console.log(`Pagos individuales que se migrarían: ${pagosTotales}`);
  console.log(`Distribución verificado:`);
  console.log(`  true:      ${stats.verificadoTrue}`);
  console.log(`  false:     ${stats.verificadoFalse}`);
  console.log(`  undefined: ${stats.verificadoUndefined} (pagos legacy pre-SPRINT-151)`);
  console.log('');

  // 3. Guard de volumen.
  if (ordenesConPagos.length > VOLUMEN_LIMITE && !okAmpliado) {
    console.error(`ABORT: ${ordenesConPagos.length} órdenes con pagos > ${VOLUMEN_LIMITE} (sub-regla CLAUDE.md "migraciones >500 docs").`);
    console.error('Escalar a BLOQUEOS.md con este conteo exacto y esperar OK de Jorge con flag --ok-ampliado.');
    process.exit(2);
  }

  if (isDryRun) {
    console.log('DRY-RUN — no se escribió nada. Para aplicar, correr con --apply.');
    console.log('');
    console.log('Primeras 5 órdenes que se migrarían (sample):');
    ordenesConPagos.slice(0, 5).forEach((o) => {
      console.log(`  ${o.numero || o.id}: ${o.pagos.length} pago(s) — ids [${o.pagos.map(p => p.id || '<sin-id>').join(', ')}]`);
    });
    return;
  }

  // 4. APPLY — migrar.
  console.log('APPLY — escribiendo a subcolección...');
  let ordenesMigradas = 0;
  let pagosEscritos = 0;
  let ordenesSinId = 0;

  for (const orden of ordenesConPagos) {
    const batch = db.batch();
    const ordenRef = db.collection(COLLECTION).doc(orden.id);
    let pagosEnOrden = 0;

    for (const pago of orden.pagos) {
      if (!pago.id || typeof pago.id !== 'string') {
        // Pago sin id — no podemos garantizar idempotencia. Reportamos y skippeamos.
        ordenesSinId++;
        console.warn(`  WARN ${orden.numero || orden.id}: pago sin .id, skip (no garantiza idempotencia).`);
        continue;
      }
      const pagoRef = ordenRef.collection(SUBCOLLECTION).doc(pago.id);
      // Preservar TODOS los campos. Synth createdAt si missing.
      const payload: Record<string, unknown> = {
        ...pago,
        // Sello del espejo: cuándo se migró este pago.
        migradoEn: Timestamp.now(),
        migradoDesde: 'array.legacy',
      };
      if (!pago.createdAt) {
        // Usar fecha del pago como fallback de createdAt (mejor proxy).
        payload.createdAt = pago.fecha || Timestamp.now();
      }
      batch.set(pagoRef, stripUndefined(payload), { merge: true });
      pagosEnOrden++;
    }

    if (pagosEnOrden > 0) {
      // Audit log dentro del mismo batch (P-003 espíritu — atómico por orden).
      const auditRef = db.collection(AUDIT_COLLECTION).doc();
      batch.set(auditRef, stripUndefined({
        accion: 'pago.migrado.array.a.subcoleccion',
        ordenId: orden.id,
        ordenNumero: orden.numero || null,
        cantidadPagosMigrados: pagosEnOrden,
        actorId: 'script:migrar-pagos-array-a-subcoleccion',
        actorNombre: 'Script de migración B-2',
        ts: Timestamp.now(),
      }));

      await batch.commit();
      ordenesMigradas++;
      pagosEscritos += pagosEnOrden;
    }
  }

  console.log('');
  console.log('--- RESULTADO APPLY ---');
  console.log(`Órdenes migradas:        ${ordenesMigradas}`);
  console.log(`Pagos escritos a sub-col: ${pagosEscritos}`);
  if (ordenesSinId > 0) {
    console.log(`Pagos sin .id (skipped): ${ordenesSinId}`);
  }
  console.log('');
  console.log('Migración completada. Los arrays `orden.pagos` NO se tocaron (opción B preserva source-of-truth real).');
}

main().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});
