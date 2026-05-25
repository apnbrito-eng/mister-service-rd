/**
 * P-024 — Garantía no debe anular la comisión completa del técnico original
 *
 * Bug original (SPRINT-GARANTIA-FLUJO-COMPLETO Fase A, 2026-05-25):
 * la lógica vieja en `Citas.tsx::onAfterCreate` aplicaba al técnico original
 * `descuentoPorGarantia.monto = -comisionMontoOriginal` + `estaAnulada: true`
 * cuando cambiaba el técnico. Eso anulaba el 100% de su comisión.
 *
 * Regla NUEVA de Jorge (entrevista 2026-05-24):
 *   - El técnico original CONSERVA su comisión original.
 *   - El descuento es el 10% del costo de PIEZAS de la re-reparación,
 *     aplicado al cerrar la NUEVA orden de garantía (no al confirmar la cita).
 *   - El descuento NUNCA debe ser equivalente al 100% de la comisión.
 *
 * Patrones a cazar (FAIL si aparecen en código nuevo):
 *
 *  (a) `monto: -comisionMontoOriginal` o `monto: -comisionMonto` cuando
 *      acompaña a `descuentoPorGarantia` (denota anulación completa).
 *
 *  (b) `estaAnulada: true` (o `estaAnulada=true`) co-presente con
 *      `descuentoPorGarantia` en el mismo bloque. Marcador del patrón viejo.
 *
 *  (c) Asignación nueva a `descuentoPorGarantia` con `monto` que use una
 *      variable que claramente sea "la comisión completa" (heurística básica:
 *      el grep busca `descuentoPorGarantia.*monto:.*-comision`).
 *
 * Patrón CORRECTO (no debe disparar el cazador):
 *   - Llamar al helper `aplicarDescuentoGarantiaPorPiezas` en
 *     `utils/comisiones.ts`, que calcula `-(costoPiezas * 0.10)`.
 *
 * Allowlist:
 *   - `src/utils/comisiones.ts` — define el helper correcto (no usa el patrón
 *     viejo) pero menciona los nombres en comentarios JSDoc. Excluir.
 *   - `src/types/index.ts` — comentario doc de `descuentoPorGarantia` puede
 *     mencionar el patrón viejo para forensia.
 *   - `scripts/invariantes/check-comision-garantia-anula-completa.ts` —
 *     este archivo (auto-referencia).
 *
 * Falsos positivos esperados: ninguno conocido en código actual. Si aparecen
 * (ej. backfill script para migrar registros legacy con `estaAnulada=true`),
 * agregar tag `// @safe-garantia-anulacion-legacy: <razón>` en la línea.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { InvariantResult, InvariantHit } from './types.js';

const PATTERN_ID = 'P-024';
const PATTERN_NAME =
  'Garantía aplica anulación completa de comisión (descuentoPorGarantia.monto = -comisionMonto / estaAnulada=true) en lugar del 10% de piezas';
const ROOT_DIR = path.resolve(process.cwd());

const ALLOWLIST_FILES = new Set<string>([
  'src/utils/comisiones.ts',
  'src/types/index.ts',
  'scripts/invariantes/check-comision-garantia-anula-completa.ts',
]);

// Patrones que indican el bug:
//   (a) `monto: -comision...` dentro de un bloque que también menciona
//       `descuentoPorGarantia`. Lo simplificamos: la línea misma debe contener
//       `monto:` con valor que matchee `-comision...`.
//   (b) `estaAnulada: true` co-presente con `descuentoPorGarantia` en el archivo.
const RE_MONTO_NEG_COMISION = /\bmonto\s*:\s*-\s*comision/i;
const RE_ESTA_ANULADA_TRUE = /\bestaAnulada\s*[:=]\s*true\b/;
const RE_DESCUENTO_POR_GARANTIA = /\bdescuentoPorGarantia\b/;
const RE_SAFE_TAG = /@safe-garantia-anulacion-legacy:/;

async function walk(dir: string, files: string[] = []): Promise<string[]> {
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return files;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
      await walk(full, files);
    } else if (/\.(ts|tsx)$/.test(entry.name)) {
      files.push(full);
    }
  }
  return files;
}

export async function check(): Promise<InvariantResult> {
  const targets: string[] = [];
  for (const sub of ['src', 'api']) {
    await walk(path.join(ROOT_DIR, sub), targets);
  }

  const hits: InvariantHit[] = [];

  for (const file of targets) {
    const rel = path.relative(ROOT_DIR, file);
    if (ALLOWLIST_FILES.has(rel)) continue;
    const content = await fs.readFile(file, 'utf8');

    const mencionaDescuento = RE_DESCUENTO_POR_GARANTIA.test(content);
    if (!mencionaDescuento) continue;

    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const ln = lines[i];
      const trimmed = ln.trim();
      // Ignorar comentarios JSDoc y line comments.
      if (trimmed.startsWith('*') || trimmed.startsWith('//')) continue;
      // Skip si tiene tag de allowlist en la misma línea.
      if (RE_SAFE_TAG.test(ln)) continue;

      // Patrón (a): monto: -comision...
      if (RE_MONTO_NEG_COMISION.test(ln)) {
        hits.push({
          file: rel,
          line: i + 1,
          snippet: ln.trim().slice(0, 140),
          explanation:
            `Patrón viejo de garantía: \`descuentoPorGarantia.monto = -comisionMonto*\` ` +
            `anula el 100% de la comisión del técnico original. Regla nueva (Jorge ` +
            `2026-05-24): el descuento es el 10% del costo de PIEZAS de la ` +
            `re-reparación, aplicado al CERRAR la orden de garantía vía ` +
            `\`aplicarDescuentoGarantiaPorPiezas\` en \`src/utils/comisiones.ts\`. ` +
            `Si esto es un backfill/migración de registros legacy, agregar tag ` +
            `\`// @safe-garantia-anulacion-legacy: <razón>\` en la misma línea.`,
        });
      }

      // Patrón (b): estaAnulada: true acompañado de descuentoPorGarantia
      // en el mismo archivo. Reporta cada línea con `estaAnulada: true`.
      if (RE_ESTA_ANULADA_TRUE.test(ln)) {
        hits.push({
          file: rel,
          line: i + 1,
          snippet: ln.trim().slice(0, 140),
          explanation:
            `Patrón viejo de garantía: \`estaAnulada: true\` en archivo que ` +
            `también referencia \`descuentoPorGarantia\`. La nueva lógica no ` +
            `marca la comisión como anulada — el técnico original conserva su ` +
            `comisión, solo se aplica un descuento parcial del 10% sobre piezas. ` +
            `Migrar a \`aplicarDescuentoGarantiaPorPiezas\` o, si es código de ` +
            `lectura defensiva de registros legacy, agregar tag ` +
            `\`// @safe-garantia-anulacion-legacy: <razón>\`.`,
        });
      }
    }
  }

  return {
    patternId: PATTERN_ID,
    patternName: PATTERN_NAME,
    status: hits.length > 0 ? 'fail' : 'pass',
    hits,
    notes: [
      `Escaneados ${targets.length} archivos en src/ y api/.`,
      `Allowlist: ${ALLOWLIST_FILES.size} archivos.`,
      'Patrón viejo: monto = -comisionMonto + estaAnulada = true (anulación 100%).',
      'Patrón nuevo: aplicarDescuentoGarantiaPorPiezas() = -(costoPiezas * 0.10).',
    ],
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  check().then((result) => {
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.status === 'fail' ? 1 : 0);
  });
}
