/**
 * Migración SPRINT-175: órdenes legacy stuck en `fase: 'trabajo_realizado'`
 * pese a tener `facturada: true` (conduce CG ya emitido).
 *
 * Contexto del bug:
 *   - Antes de SPRINT-161 (commit `4015fe1`, 2026-05-12), `ProcesarFacturacionModal`
 *     seteaba `facturada: true` + `facturaNumero: 'CG-XXXXX'` pero NO sincronizaba
 *     `fase` / `estadoSimple` / `estado` / `historialFases`. Resultado: órdenes
 *     facturadas quedaban stuck en `fase: 'trabajo_realizado'` aunque el negocio
 *     ya las consideraba cerradas.
 *   - SPRINT-161 arregló el bug en código (cazador P-011 enforcea el invariante).
 *   - SPRINT-175 alinea los DATOS legacy: cualquier orden con
 *     `facturada == true && fase != 'cerrado'` se migra a `fase: 'cerrado'`
 *     + `estadoSimple: 'completado'` + `estado: 'cerrado'` + append a
 *     `historialFases` con razón "Migración legacy SPRINT-175".
 *
 * Lo que hace:
 *   1. Lee `ordenes_servicio` y filtra docs con `facturada == true && fase != 'cerrado'`.
 *   2. Reporta count + IDs (primeros 20) + estado actual de cada uno.
 *   3. En `--apply`: para cada doc, escribe en batch:
 *        - `fase: 'cerrado'`
 *        - `estadoSimple: 'completado'`
 *        - `estado: 'cerrado'`
 *        - `historialFases`: append `{ fase: 'cerrado', timestamp: now, usuario: 'script:SPRINT-175', nota: 'Migración legacy SPRINT-175' }`
 *        - `migradoSprint: 'SPRINT-175'` + `migradoEn: serverTimestamp()` (forensia)
 *        - `updatedAt: serverTimestamp()`
 *   4. Escribe audit log en `auditoria_admin` con `accion: 'migracion_fases_cerrado_legacy'`.
 *
 * Idempotente: orden con `fase: 'cerrado'` se ignora aunque se vuelva a correr.
 *
 * Uso:
 *   - Dry-run por default (no escribe):
 *       npx tsx scripts/migrar-ordenes-cerradas-legacy.ts
 *   - Real (escribe a Firestore):
 *       npx tsx scripts/migrar-ordenes-cerradas-legacy.ts --apply
 *
 * Batches de hasta 200 docs (Firestore admite 500; margen de seguridad).
 *
 * **Autorización requerida (sub-regla CLAUDE.md):** el coordinator NO ejecuta
 * `--apply` autónomo. Jorge dispara manualmente después de revisar el dry-run.
 * Umbral de 50 docs replica patrón SPRINT-149: si DRY-RUN detecta >50 migrables,
 * `--apply` aborta y exige `--ok-ampliado` + entrada firmada en `BLOQUEOS.md`
 * (sprint SPRINT-175-APPLY).
 *
 * Requiere `service-account.json` en la raíz del repo, o `gcloud auth
 * application-default login` con permisos sobre el proyecto.
 */

import { initializeApp, cert, getApps, applicationDefault } from 'firebase-admin/app';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
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

interface HistorialFaseEntry {
  fase: string;
  timestamp: Timestamp | Date;
  usuario: string;
  nota?: string;
}

interface OrdenStuck {
  docId: string;
  numero: string;
  facturaNumero?: string;
  faseActual: string;
  estadoSimpleActual?: string;
  estadoActual?: string;
  historialFases: HistorialFaseEntry[];
}

async function main() {
  console.log(`[INFO] SPRINT-175 — Migración de órdenes legacy stuck post-conduce`);
  console.log(`[INFO] Modo: ${DRY_RUN ? 'DRY-RUN (no escribe)' : 'REAL (--apply, escribe a Firestore)'}`);
  console.log('');

  console.log('[INFO] Leyendo ordenes_servicio donde facturada == true...');
  const snap = await db
    .collection('ordenes_servicio')
    .where('facturada', '==', true)
    .get();
  console.log(`[INFO] ordenes_servicio facturadas: ${snap.size} docs totales`);
  console.log('');

  const stuck: OrdenStuck[] = [];
  let yaCerradas = 0;
  let canceladas = 0;

  for (const doc of snap.docs) {
    const d = doc.data();
    const fase: string = d.fase;
    // Idempotencia: si ya está cerrada, skip.
    if (fase === 'cerrado') {
      yaCerradas++;
      continue;
    }
    // No tocar canceladas — son un estado terminal distinto.
    if (fase === 'cancelado') {
      canceladas++;
      continue;
    }
    stuck.push({
      docId: doc.id,
      numero: (d.numero as string) || doc.id.substring(0, 8),
      facturaNumero: d.facturaNumero,
      faseActual: fase,
      estadoSimpleActual: d.estadoSimple,
      estadoActual: d.estado,
      historialFases: Array.isArray(d.historialFases) ? d.historialFases : [],
    });
  }

  console.log('─── Resumen ───');
  console.log(`Total facturadas:                                ${snap.size}`);
  console.log(`Ya en fase 'cerrado' (idempotencia, skip):       ${yaCerradas}`);
  console.log(`En fase 'cancelado' (terminal distinto, skip):   ${canceladas}`);
  console.log(`Stuck (facturada=true && fase != 'cerrado'):     ${stuck.length}`);
  console.log('');

  if (stuck.length === 0) {
    console.log('[OK] Nada que migrar. Base ya alineada.');
    return;
  }

  // Desglose por fase actual.
  const porFase = new Map<string, number>();
  for (const s of stuck) {
    porFase.set(s.faseActual, (porFase.get(s.faseActual) || 0) + 1);
  }
  console.log('─── Desglose por fase actual ───');
  for (const [fase, count] of Array.from(porFase.entries()).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${fase.padEnd(28)} ${count}`);
  }
  console.log('');

  console.log(`─── Primeras ${Math.min(20, stuck.length)} órdenes stuck ───`);
  for (const s of stuck.slice(0, 20)) {
    const cg = s.facturaNumero ? ` (${s.facturaNumero})` : '';
    console.log(`  ${s.numero}${cg}  fase=${s.faseActual}  estadoSimple=${s.estadoSimpleActual || '-'}  estado=${s.estadoActual || '-'}`);
  }
  if (stuck.length > 20) console.log(`  ... y ${stuck.length - 20} más`);
  console.log('');

  // Umbral de seguridad: >50 docs requieren OK explícito de Jorge (sub-regla CLAUDE.md).
  // Pasar --ok-ampliado salta el gate, solo válido si BLOQUEOS.md tiene la entrada
  // "OK ampliado: jorge YYYY-MM-DD HH:MM" firmada en SPRINT-175-APPLY.
  if (stuck.length > 50 && APPLY && !OK_AMPLIADO) {
    console.log('');
    console.log(`[ABORT] ${stuck.length} docs stuck superan el umbral de 50 declarado en SPRINT-175.`);
    console.log('        Jorge debe agregar OK explícito en BLOQUEOS.md (entrada SPRINT-175-APPLY) y');
    console.log('        re-ejecutar con --apply --ok-ampliado.');
    console.log('        O volvé a correr sin --apply para revisar el listado.');
    process.exit(2);
  }
  if (stuck.length > 50 && APPLY && OK_AMPLIADO) {
    console.log('');
    console.log(`[OK AMPLIADO] ${stuck.length} docs > 50 — procediendo con --ok-ampliado. Asumiendo`);
    console.log('              que BLOQUEOS.md tiene la entrada firmada para SPRINT-175-APPLY.');
  }

  if (DRY_RUN) {
    console.log('');
    console.log(`[DRY-RUN] No se escribió nada. ${stuck.length} docs serían migrados.`);
    console.log('         Para ejecutar real (autorización requerida de Jorge):');
    console.log('         npx tsx scripts/migrar-ordenes-cerradas-legacy.ts --apply');
    if (stuck.length > 50) {
      console.log('         (> 50 docs: requiere --apply --ok-ampliado + OK firmado en BLOQUEOS.md)');
    }
    return;
  }

  // ── Ejecutar migración real con writeBatch (chunks de 200) ──
  console.log(`[INFO] Aplicando ${stuck.length} updates en batches de 200...`);

  const BATCH_SIZE = 200;
  let applied = 0;
  const ahora = Timestamp.now();
  const USUARIO_SCRIPT = 'script:migrar-ordenes-cerradas-legacy';

  for (let i = 0; i < stuck.length; i += BATCH_SIZE) {
    const batch = db.batch();
    const slice = stuck.slice(i, i + BATCH_SIZE);
    for (const s of slice) {
      const ref = db.collection('ordenes_servicio').doc(s.docId);
      // Append a historialFases preservando entries previas. Patrón replica
      // ProcesarFacturacionModal.tsx:740-753 (array reemplazado completo,
      // shape { fase, timestamp, usuario, nota }, no arrayUnion para no romper
      // shape de Timestamp en entries históricas).
      const nuevoHistorial = [
        ...s.historialFases,
        {
          fase: 'cerrado',
          timestamp: ahora,
          usuario: USUARIO_SCRIPT,
          nota: `Migración legacy SPRINT-175 (fase previa: ${s.faseActual}${s.facturaNumero ? ', conduce ' + s.facturaNumero : ''})`,
        },
      ];
      batch.update(ref, {
        fase: 'cerrado',
        estadoSimple: 'completado',
        estado: 'cerrado',
        historialFases: nuevoHistorial,
        migradoSprint: 'SPRINT-175',
        migradoEn: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
    await batch.commit();
    applied += slice.length;
    console.log(`  [BATCH ${Math.floor(i / BATCH_SIZE) + 1}] ${slice.length} órdenes actualizadas (total ${applied}/${stuck.length})`);
  }

  // Audit log
  await db.collection('auditoria_admin').add({
    accion: 'migracion_fases_cerrado_legacy',
    fecha: FieldValue.serverTimestamp(),
    actor: USUARIO_SCRIPT,
    sprint: 'SPRINT-175',
    docsAfectados: applied,
    resumen: {
      ordenesMigradas: applied,
      yaCerradasSkipped: yaCerradas,
      canceladasSkipped: canceladas,
      porFasePrevia: Object.fromEntries(porFase.entries()),
    },
  });

  console.log('');
  console.log(`[OK] Migración completa. ${applied} docs actualizados.`);
  console.log('     Audit log escrito en auditoria_admin con accion=migracion_fases_cerrado_legacy.');
}

main().catch(err => {
  console.error('[ERROR]', err);
  process.exit(1);
});
