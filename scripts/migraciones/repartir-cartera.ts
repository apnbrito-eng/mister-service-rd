/**
 * SPRINT-DISENO-BAMBOO-LOTE-5 (plan integral §2, 2026-10-08) — Reparto mitad
 * A/B de la cartera actual de clientes.
 *
 * Jorge aprobó: "La cartera actual se reparte mitad A/B y los nuevos clientes
 * alternadamente." Si la cantidad es impar la diferencia máxima entre A y B es
 * 1 cliente. Esta distribución NO elimina clientes ni fusiona duplicados; se
 * limita a asignar `carteraEquipo` + registrar la asignación en subcolección
 * `clientes/{id}/cartera_historial`.
 *
 * CÓMO FUNCIONA
 *
 *   1. Inventario (siempre): paginación completa de `clientes` canónica,
 *      agrupación por `telefonoNormalizado`, conteo de flags presentes
 *      (`eliminado`, `mergedaCon`, `archivado`), lista de duplicados.
 *      NUNCA elimina ni mergea en esta migración (eso es `dedup-clientes-por-
 *      telefono.ts`, aparte).
 *
 *   2. Candidatos: los clientes "canónicos" (no `eliminado === true`, no
 *      `mergedaCon`) sin `carteraEquipo` asignado.
 *
 *   3. Asignación determinística: lista ordenada por `id` ASC estable;
 *      posición par → `A`, posición impar → `B`. Idempotente — reanudable:
 *      sólo escribe donde `carteraEquipo` falta. Mitad exacta con diferencia
 *      máxima 1 si el total es impar (requisito Jorge).
 *
 *   4. Dry-run: produce `informe-cartera-dry-run-<timestamp>.json` con el
 *      inventario, los conteos y la primera N asignaciones de muestra. NO
 *      escribe en Firestore. Codex revisa el informe antes de ejecutar.
 *
 *   5. Aplicar: para cada candidato, `runTransaction` que:
 *        - Vuelve a leer el doc (optimistic lock).
 *        - Si `carteraEquipo` sigue vacío, escribe `{ carteraEquipo,
 *          carteraAsignadaEn, carteraAsignadaPor: 'migracion-cartera-ab',
 *          carteraOrigen: 'migracion' }`.
 *        - Agrega entry a `clientes/{id}/cartera_historial` con
 *          `anteriorEquipo: null`, `nuevoEquipo`, `origen: 'migracion'`,
 *          `actorUid: 'sistema'`, `motivo: 'Reparto inicial mitad A/B'`.
 *      Si otro proceso asignó mientras tanto, se respeta y se registra.
 *
 *   6. Revertir: lee cartera_historial de cada cliente, si la última entry es
 *      `origen=migracion`, elimina `carteraEquipo` + metadatos y borra la entry.
 *      Los traslados posteriores NO se revierten.
 *
 * USO
 *
 *   DRY-RUN (siempre primero, NO escribe):
 *     npx tsx scripts/migraciones/repartir-cartera.ts
 *
 *   APLICAR (requiere `--apply` + `--ok-codex` tras revisar el informe):
 *     npx tsx scripts/migraciones/repartir-cartera.ts --apply --ok-codex
 *
 *   REVERTIR (solo asignaciones de migración; preserva traslados):
 *     npx tsx scripts/migraciones/repartir-cartera.ts --revertir --ok-codex
 *
 * AUTH: mismo patrón que `dedup-clientes-por-telefono.ts` —
 *   1. GOOGLE_APPLICATION_CREDENTIALS → applicationDefault()
 *   2. ./service-account.json
 *   3. FIREBASE_PROJECT_ID + FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY env.
 *
 * Autor: Claude Code — plan integral §2 (preparación, revisión Codex pendiente).
 */
import {
  initializeApp,
  getApps,
  cert,
  applicationDefault,
} from 'firebase-admin/app';
import {
  getFirestore,
  FieldValue,
  Timestamp as AdminTimestamp,
} from 'firebase-admin/firestore';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

// ────────────────────────────────────────────────────────────────────────
// Flags CLI
// ────────────────────────────────────────────────────────────────────────

const APPLY = process.argv.includes('--apply');
const REVERTIR = process.argv.includes('--revertir');
const OK_CODEX = process.argv.includes('--ok-codex');
const DEBUG = process.argv.includes('--debug');

if (APPLY && REVERTIR) {
  console.error('[ERROR] --apply y --revertir son excluyentes.');
  process.exit(1);
}
if ((APPLY || REVERTIR) && !OK_CODEX) {
  console.error(
    '[ERROR] Para escribir se requiere `--ok-codex` tras revisión del informe dry-run.',
  );
  process.exit(1);
}

// ────────────────────────────────────────────────────────────────────────
// Firebase Admin init
// ────────────────────────────────────────────────────────────────────────

function inicializarAdmin(): void {
  if (getApps().length > 0) return;
  const gacPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  const localPath = resolve(process.cwd(), 'service-account.json');
  if (gacPath && existsSync(gacPath)) {
    console.log(`[INFO] Usando GOOGLE_APPLICATION_CREDENTIALS: ${gacPath}`);
    initializeApp({ credential: applicationDefault() });
    return;
  }
  if (existsSync(localPath)) {
    console.log('[INFO] Usando ./service-account.json');
    const json = JSON.parse(readFileSync(localPath, 'utf8'));
    initializeApp({
      credential: cert({
        projectId: json.project_id,
        clientEmail: json.client_email,
        privateKey: json.private_key,
      }),
    });
    return;
  }
  const { FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY } =
    process.env;
  if (FIREBASE_PROJECT_ID && FIREBASE_CLIENT_EMAIL && FIREBASE_PRIVATE_KEY) {
    console.log('[INFO] Usando credenciales en variables de entorno');
    initializeApp({
      credential: cert({
        projectId: FIREBASE_PROJECT_ID,
        clientEmail: FIREBASE_CLIENT_EMAIL,
        privateKey: FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      }),
    });
    return;
  }
  console.error(
    '[ERROR] Faltan credenciales de Firebase Admin SDK. Ver cabecera del script.',
  );
  process.exit(1);
}

// ────────────────────────────────────────────────────────────────────────
// Normalización de teléfono (clon local, no depende de Vite)
// ────────────────────────────────────────────────────────────────────────

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

// ────────────────────────────────────────────────────────────────────────
// Shapes locales
// ────────────────────────────────────────────────────────────────────────

type Equipo = 'A' | 'B';

interface ClienteFila {
  id: string;
  nombre: string;
  telefono: string;
  telNorm: string;
  eliminado: boolean;
  mergedaCon?: string;
  carteraEquipo?: Equipo;
  carteraOrigen?: 'migracion' | 'alta' | 'traslado';
}

interface Inventario {
  totalDocs: number;
  canonicosActivos: number;
  conflags: {
    eliminado: number;
    mergedaCon: number;
    yaConCartera: number;
  };
  duplicadosPorTelefono: Array<{
    telNorm: string;
    ids: string[];
  }>;
  distribucionActual: Record<Equipo | 'sin', number>;
}

interface Propuesta {
  nuevosEnA: number;
  nuevosEnB: number;
  ejemplo: Array<{ id: string; nuevoEquipo: Equipo; posicion: number }>;
}

// ────────────────────────────────────────────────────────────────────────
// Paginación + inventario
// ────────────────────────────────────────────────────────────────────────

const PAGE_SIZE = 500;

async function cargarClientes(): Promise<ClienteFila[]> {
  const db = getFirestore();
  const resultado: ClienteFila[] = [];
  let cursor: FirebaseFirestore.QueryDocumentSnapshot | undefined;
  let paginas = 0;
  // Bucle sin cota superior conocida (la colección se recorre entera por
  // páginas); se termina cuando una página devuelve menos docs que `PAGE_SIZE`.
  for (;;) {
    let query = db.collection('clientes').orderBy('__name__').limit(PAGE_SIZE);
    if (cursor) query = query.startAfter(cursor);
    const snap = await query.get();
    if (snap.empty) break;
    paginas++;
    for (const d of snap.docs) {
      const data = d.data();
      const telefono = String(data.telefono ?? '');
      resultado.push({
        id: d.id,
        nombre: String(data.nombre ?? ''),
        telefono,
        telNorm: String(data.telefonoNormalizado ?? normalizarTelefono(telefono)),
        eliminado: data.eliminado === true,
        mergedaCon: typeof data.mergedaCon === 'string' ? data.mergedaCon : undefined,
        carteraEquipo:
          data.carteraEquipo === 'A' || data.carteraEquipo === 'B'
            ? (data.carteraEquipo as Equipo)
            : undefined,
        carteraOrigen:
          data.carteraOrigen === 'migracion' ||
          data.carteraOrigen === 'alta' ||
          data.carteraOrigen === 'traslado'
            ? data.carteraOrigen
            : undefined,
      });
    }
    cursor = snap.docs[snap.docs.length - 1];
    if (DEBUG) console.log(`[DEBUG] Página ${paginas} · acumulado ${resultado.length}`);
    if (snap.size < PAGE_SIZE) break;
  }
  console.log(`[INFO] Clientes leídos (incluye eliminados): ${resultado.length}`);
  return resultado;
}

function construirInventario(clientes: ClienteFila[]): Inventario {
  const inv: Inventario = {
    totalDocs: clientes.length,
    canonicosActivos: 0,
    conflags: { eliminado: 0, mergedaCon: 0, yaConCartera: 0 },
    duplicadosPorTelefono: [],
    distribucionActual: { A: 0, B: 0, sin: 0 },
  };
  const porTel = new Map<string, string[]>();
  for (const c of clientes) {
    if (c.eliminado) inv.conflags.eliminado++;
    if (c.mergedaCon) inv.conflags.mergedaCon++;
    if (c.carteraEquipo) inv.conflags.yaConCartera++;
    if (!c.eliminado && !c.mergedaCon) {
      inv.canonicosActivos++;
      if (c.carteraEquipo) inv.distribucionActual[c.carteraEquipo]++;
      else inv.distribucionActual.sin++;
    }
    if (c.telNorm) {
      if (!porTel.has(c.telNorm)) porTel.set(c.telNorm, []);
      porTel.get(c.telNorm)!.push(c.id);
    }
  }
  for (const [telNorm, ids] of porTel) {
    if (ids.length > 1) inv.duplicadosPorTelefono.push({ telNorm, ids });
  }
  return inv;
}

// ────────────────────────────────────────────────────────────────────────
// Asignación determinística A/B
// ────────────────────────────────────────────────────────────────────────

function proponerAsignacion(clientes: ClienteFila[]): {
  propuesta: Propuesta;
  asignaciones: Array<{ cliente: ClienteFila; nuevoEquipo: Equipo }>;
} {
  // Candidatos: canónicos sin cartera. Ordenados por `id` ASC estable
  // (lexicográfico sobre el docId). Esto garantiza idempotencia + reanudación.
  const candidatos = clientes
    .filter((c) => !c.eliminado && !c.mergedaCon && !c.carteraEquipo)
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  // Para arrancar la alternancia respetamos la distribución actual: si ya hay
  // más A asignadas por traslados/altas tempranas, arrancamos por B para
  // compensar y terminar lo más balanceado posible.
  const yaEnA = clientes.filter((c) => c.carteraEquipo === 'A').length;
  const yaEnB = clientes.filter((c) => c.carteraEquipo === 'B').length;
  const primeroEsA = yaEnA <= yaEnB;

  const asignaciones = candidatos.map((cliente, posicion) => {
    const esPar = posicion % 2 === 0;
    const nuevoEquipo: Equipo = primeroEsA ? (esPar ? 'A' : 'B') : esPar ? 'B' : 'A';
    return { cliente, nuevoEquipo };
  });

  const nuevosEnA = asignaciones.filter((a) => a.nuevoEquipo === 'A').length;
  const nuevosEnB = asignaciones.filter((a) => a.nuevoEquipo === 'B').length;

  const propuesta: Propuesta = {
    nuevosEnA,
    nuevosEnB,
    ejemplo: asignaciones.slice(0, 20).map((a, posicion) => ({
      id: a.cliente.id,
      nuevoEquipo: a.nuevoEquipo,
      posicion,
    })),
  };

  const difFinal = Math.abs(yaEnA + nuevosEnA - (yaEnB + nuevosEnB));
  console.log(
    `[INFO] Propuesta: A=${nuevosEnA} B=${nuevosEnB} (final total A=${yaEnA + nuevosEnA}, B=${yaEnB + nuevosEnB}, dif=${difFinal})`,
  );
  if (difFinal > 1) {
    console.warn(
      `[WARN] La diferencia final (${difFinal}) supera 1. Jorge pidió diferencia máxima 1.`,
    );
  }
  return { propuesta, asignaciones };
}

// ────────────────────────────────────────────────────────────────────────
// Dry-run report
// ────────────────────────────────────────────────────────────────────────

function escribirInforme(inventario: Inventario, propuesta: Propuesta): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const ruta = resolve(process.cwd(), `informe-cartera-dry-run-${timestamp}.json`);
  const contenido = JSON.stringify(
    {
      generadoEn: new Date().toISOString(),
      modo: APPLY ? 'apply' : REVERTIR ? 'revertir' : 'dry-run',
      inventario,
      propuesta,
      notas: [
        'Script determinístico: ordena por `id` ASC y asigna par→A impar→B.',
        'Si la distribución actual tiene más A, el reparto arranca por B para compensar.',
        'Clientes `eliminado=true` o `mergedaCon` se excluyen del reparto (quedan sin cartera).',
        'Clientes con `carteraEquipo` ya asignado se preservan (idempotente/reanudable).',
        'Dedup por teléfono NO lo hace esta migración; se corre `dedup-clientes-por-telefono.ts` aparte.',
      ],
    },
    null,
    2,
  );
  writeFileSync(ruta, contenido, 'utf8');
  console.log(`[INFO] Informe escrito en ${ruta}`);
  return ruta;
}

// ────────────────────────────────────────────────────────────────────────
// Aplicar / revertir
// ────────────────────────────────────────────────────────────────────────

async function aplicar(
  asignaciones: Array<{ cliente: ClienteFila; nuevoEquipo: Equipo }>,
): Promise<void> {
  const db = getFirestore();
  let escritos = 0;
  let saltados = 0;
  for (const { cliente, nuevoEquipo } of asignaciones) {
    const ref = db.collection('clientes').doc(cliente.id);
    const historialRef = ref.collection('cartera_historial').doc();
    try {
      await db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        const data = snap.data() ?? {};
        if (data.carteraEquipo === 'A' || data.carteraEquipo === 'B') {
          saltados++;
          return;
        }
        tx.update(ref, {
          carteraEquipo: nuevoEquipo,
          carteraAsignadaEn: FieldValue.serverTimestamp(),
          carteraAsignadaPor: 'migracion-cartera-ab',
          carteraOrigen: 'migracion',
          updatedAt: FieldValue.serverTimestamp(),
        });
        tx.set(historialRef, {
          anteriorEquipo: null,
          nuevoEquipo,
          actorUid: 'sistema',
          actorNombre: 'Migración mitad A/B',
          motivo: 'Reparto inicial mitad A/B (plan integral §2)',
          origen: 'migracion',
          timestamp: FieldValue.serverTimestamp(),
        });
      });
      escritos++;
      if (escritos % 100 === 0) console.log(`[INFO] Avance: ${escritos} asignados…`);
    } catch (err) {
      console.error(
        `[ERROR] Transacción falló para cliente ${cliente.id}:`,
        err instanceof Error ? err.message : err,
      );
    }
  }
  console.log(`[INFO] Aplicado · escritos=${escritos} saltados=${saltados}`);
  await db.collection('auditoria_admin').add({
    accion: 'migracion_cartera_mitad_ab',
    escritos,
    saltados,
    createdAt: FieldValue.serverTimestamp(),
    executor: 'scripts/migraciones/repartir-cartera.ts',
  });
}

async function revertir(clientes: ClienteFila[]): Promise<void> {
  const db = getFirestore();
  let revertidos = 0;
  let preservados = 0;
  for (const c of clientes) {
    if (!c.carteraEquipo) continue;
    if (c.carteraOrigen !== 'migracion') {
      preservados++;
      continue; // No tocamos traslados ni altas posteriores.
    }
    const ref = db.collection('clientes').doc(c.id);
    try {
      await db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        const data = snap.data() ?? {};
        if (data.carteraOrigen !== 'migracion') {
          preservados++;
          return;
        }
        tx.update(ref, {
          carteraEquipo: FieldValue.delete(),
          carteraAsignadaEn: FieldValue.delete(),
          carteraAsignadaPor: FieldValue.delete(),
          carteraOrigen: FieldValue.delete(),
          updatedAt: FieldValue.serverTimestamp(),
        });
      });
      // Borrar entries de historial `origen=migracion` por batch separado para
      // no acoplar la rever̄sión al cliente a batches gigantes.
      const histSnap = await ref
        .collection('cartera_historial')
        .where('origen', '==', 'migracion')
        .get();
      const batch = db.batch();
      histSnap.docs.forEach((h) => batch.delete(h.ref));
      if (!histSnap.empty) await batch.commit();
      revertidos++;
    } catch (err) {
      console.error(
        `[ERROR] Revertir falló para cliente ${c.id}:`,
        err instanceof Error ? err.message : err,
      );
    }
  }
  console.log(`[INFO] Revertido · ${revertidos} clientes · preservados=${preservados}`);
  await db.collection('auditoria_admin').add({
    accion: 'migracion_cartera_mitad_ab_revertida',
    revertidos,
    preservados,
    createdAt: FieldValue.serverTimestamp(),
    executor: 'scripts/migraciones/repartir-cartera.ts',
  });
}

// ────────────────────────────────────────────────────────────────────────
// Entry point
// ────────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const modo = APPLY ? 'APPLY' : REVERTIR ? 'REVERTIR' : 'DRY-RUN';
  console.log(`[INFO] Modo: ${modo}`);
  inicializarAdmin();
  const clientes = await cargarClientes();
  const inventario = construirInventario(clientes);
  console.log(`[INFO] Inventario:
   totalDocs=${inventario.totalDocs}
   canónicosActivos=${inventario.canonicosActivos}
   yaConCartera=${inventario.conflags.yaConCartera}
   soft-deleted=${inventario.conflags.eliminado}
   mergedaCon=${inventario.conflags.mergedaCon}
   duplicadosPorTelefono=${inventario.duplicadosPorTelefono.length} grupos
   distribución actual A/B/sin = ${inventario.distribucionActual.A}/${inventario.distribucionActual.B}/${inventario.distribucionActual.sin}`);

  if (inventario.duplicadosPorTelefono.length > 0) {
    console.warn(
      `[WARN] Hay ${inventario.duplicadosPorTelefono.length} grupos de duplicados por teléfono. Esta migración NO los resuelve (ver scripts/dedup-clientes-por-telefono.ts).`,
    );
  }

  const { propuesta, asignaciones } = proponerAsignacion(clientes);

  if (!APPLY && !REVERTIR) {
    escribirInforme(inventario, propuesta);
    console.log('[INFO] Dry-run completado. Revisá el informe con Codex antes de ejecutar.');
    return;
  }

  if (APPLY) {
    await aplicar(asignaciones);
    return;
  }

  if (REVERTIR) {
    await revertir(clientes);
    return;
  }
}

main().catch((err) => {
  console.error('[FATAL]', err);
  process.exitCode = 1;
});

// Mantener `AdminTimestamp` como import vivo por si una futura iteración
// necesita escribir timestamps absolutos en vez de `serverTimestamp()`.
export const _types = { AdminTimestamp };
