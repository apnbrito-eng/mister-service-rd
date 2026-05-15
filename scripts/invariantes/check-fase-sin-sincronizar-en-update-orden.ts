/**
 * P-011 — `updateDoc(<ordenes_servicio>, {...})` que setea flag de estado
 *           terminal SIN sincronizar `fase` en el mismo update.
 *
 * Bugs originales (clase recurrente):
 *   - SPRINT-161 / commit 4015fe1 (2026-05-12) — `ProcesarFacturacionModal.tsx::handleGenerar`
 *     seteaba `facturada: true` sin avanzar fase a `cerrado`. Orden facturada
 *     quedaba stuck en `trabajo_realizado`.
 *   - SPRINT-173 / commit d8f376b (2026-05-12) — `AgendaDia.tsx::handleAprobarPrecioInline`
 *     y `OrdenDetalle.tsx::handleAprobarPrecio` seteaban `estadoAprobacion: 'aprobado'`
 *     + `precioAprobado` sin avanzar fase a `aprobado`. Orden aprobada quedaba
 *     stuck en `en_diagnostico` / `en_cotizacion`.
 *
 * Síntoma: el pipeline visual (`/admin/ordenes`, agenda, tablero, portal cliente)
 * muestra la orden en la fase previa aunque el flag de estado terminal indica
 * que el negocio ya avanzó. Queries que filtran por `fase` infrareportan.
 *
 * Causa raíz: sub-regla CLAUDE.md "registros sincronizados" — cuando un handler
 * persiste un flag de estado de la orden (estadoAprobacion, facturada, soloChequeo,
 * cancelada, etc.), DEBE incluir `fase` + `estadoSimple` + `estado` + un append
 * a `historialFases` en el mismo `updateDoc`. Sin esto, los renders por fase
 * desinforman y los KPIs por fase mienten.
 *
 * Estrategia (heurística determinística):
 *
 * 1. Recorrer `src/**` buscando llamadas a `updateDoc(<algo>, { ... })`
 *    donde el primer argumento referencia `ordenes_servicio`.
 * 2. Extraer el bloque `{ ... }` del segundo argumento (balanceando llaves).
 * 3. Si el bloque contiene CUALQUIER `FLAG_TERMINAL` Y NO contiene `fase:`,
 *    reportar hit.
 * 4. Allowlist por línea con `// @safe-fase-sin-sincronizar: <razón>` en la
 *    misma línea del `updateDoc(...)` o ±5 arriba (para casos legítimos como
 *    updates parciales de campos no-de-fase: tracking GPS, notas, asignación).
 *
 * Allowlist por archivo: vacía. Si crece, refactorear el cazador.
 *
 * Falsos positivos esperados (deben usar allowlist con razón):
 * - `updateDoc(orden, { trackingGPS: ... })` — solo activa/desactiva GPS.
 * - `updateDoc(orden, { tecnicoId, tecnicoNombre })` — reasignación de técnico.
 * - Cualquier update que NO contiene flags terminales (no matchea por diseño).
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { InvariantResult, InvariantHit } from './types.js';

const PATTERN_ID = 'P-011';
const PATTERN_NAME =
  'updateDoc(ordenes_servicio) con flag terminal sin sincronizar fase';
const ROOT_DIR = path.resolve(process.cwd());

const ALLOWLIST_FILES: Set<string> = new Set([
  // Vacía. Sumar solo con justificación si aparecen falsos positivos.
]);

const SAFE_LINE_TAG = '@safe-fase-sin-sincronizar:';

/**
 * Flags que indican estado terminal del negocio. Si alguno aparece en el
 * update, esperamos también `fase:` (porque sino el pipeline visual se
 * desincroniza).
 */
const FLAG_TERMINAL_PATTERNS: Array<{ key: string; re: RegExp }> = [
  // Aprobación de precio (SPRINT-173).
  { key: 'estadoAprobacion', re: /\bestadoAprobacion\s*:\s*['"]aprobado['"]/ },
  // Facturación (SPRINT-161).
  { key: 'facturada', re: /\bfacturada\s*:\s*true\b/ },
  // Solo chequeo (handler ya correcto pero protegemos contra regresión).
  { key: 'soloChequeo', re: /\bsoloChequeo\s*:\s*true\b/ },
  // Cancelación (handler ya correcto pero protegemos).
  { key: 'cancelada', re: /\bcancelada\s*:\s*true\b/ },
  // Eliminación (soft delete).
  { key: 'eliminada', re: /\beliminada\s*:\s*true\b/ },
];

/**
 * Captura los bloques `{...}` que aparecen como SEGUNDO argumento de
 * `updateDoc(...)`. Balanceo simple de llaves para soportar multi-línea.
 * Retorna texto del bloque, línea del `updateDoc`, y el snippet del primer
 * argumento (para verificar que apunte a `ordenes_servicio`).
 */
function extractUpdateDocBlocks(
  content: string,
): Array<{ text: string; startLine: number; firstArgSnippet: string }> {
  const out: Array<{ text: string; startLine: number; firstArgSnippet: string }> = [];
  // Match `updateDoc(` y luego buscamos `,` al nivel 0 de paréntesis para separar args.
  const re = /\bupdateDoc\s*\(/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    const openParen = content.indexOf('(', m.index);
    if (openParen < 0) continue;
    // Buscar la coma al depth=0 entre paréntesis para separar arg1 y arg2.
    let depth = 0;
    let commaIdx = -1;
    for (let i = openParen + 1; i < content.length; i++) {
      const ch = content[i];
      if (ch === '(' || ch === '[' || ch === '{') depth++;
      else if (ch === ')' || ch === ']' || ch === '}') {
        if (depth === 0) break;
        depth--;
      } else if (ch === ',' && depth === 0) {
        commaIdx = i;
        break;
      }
    }
    if (commaIdx < 0) continue;
    const firstArg = content.slice(openParen + 1, commaIdx).trim();
    // El segundo arg debe ser un object literal `{...}`.
    let bracePos = commaIdx + 1;
    while (bracePos < content.length && content[bracePos] !== '{') {
      if (!/\s/.test(content[bracePos])) {
        // No es object literal (puede ser variable, spread, etc.) — skip.
        bracePos = -1;
        break;
      }
      bracePos++;
    }
    if (bracePos < 0 || bracePos >= content.length || content[bracePos] !== '{') continue;
    // Balancear el object literal.
    let bd = 0;
    let end = bracePos;
    for (; end < content.length; end++) {
      const ch = content[end];
      if (ch === '{') bd++;
      else if (ch === '}') {
        bd--;
        if (bd === 0) break;
      }
    }
    if (bd !== 0) continue;
    const blockText = content.slice(bracePos, end + 1);
    const startLine = content.slice(0, m.index).split('\n').length;
    out.push({ text: blockText, startLine, firstArgSnippet: firstArg });
  }
  return out;
}

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
  const srcDir = path.join(ROOT_DIR, 'src');
  const files = await walk(srcDir);
  const hits: InvariantHit[] = [];

  for (const file of files) {
    const rel = path.relative(ROOT_DIR, file);
    if (ALLOWLIST_FILES.has(rel)) continue;

    const content = await fs.readFile(file, 'utf8');
    const fileLines = content.split('\n');
    const blocks = extractUpdateDocBlocks(content);

    for (const block of blocks) {
      // ¿El primer arg apunta a `ordenes_servicio`? Buscamos el literal en
      // el snippet (cubre `doc(db, 'ordenes_servicio', id)`, refs como
      // `doc(db, "ordenes_servicio", ...)` y refs ya construidos como
      // `ordenRef` solo si tienen 'ordenes_servicio' cerca — el filtro es
      // pesimista, falsos positivos quedan en allowlist).
      if (!/ordenes_servicio/.test(block.firstArgSnippet)) continue;

      // Detectar flag terminal presente.
      const flagsHit: string[] = [];
      for (const { key, re } of FLAG_TERMINAL_PATTERNS) {
        if (re.test(block.text)) flagsHit.push(key);
      }
      if (flagsHit.length === 0) continue;

      // Si el bloque también incluye `fase:`, está sincronizado — no es hit.
      if (/\bfase\s*:/.test(block.text)) continue;

      // Allowlist por línea sobre la línea del `updateDoc(`.
      const lineText = fileLines[block.startLine - 1] ?? '';
      if (lineText.includes(SAFE_LINE_TAG)) continue;
      const tagWindowStart = Math.max(0, block.startLine - 1 - 5);
      const tagWindow = fileLines
        .slice(tagWindowStart, block.startLine - 1)
        .join('\n');
      if (tagWindow.includes(SAFE_LINE_TAG)) continue;

      hits.push({
        file: rel,
        line: block.startLine,
        snippet: lineText.trim(),
        explanation:
          `updateDoc(ordenes_servicio, {...}) setea flag terminal (${flagsHit.join(', ')}) ` +
          `pero NO sincroniza \`fase\` en el mismo update. Sub-regla CLAUDE.md ` +
          `"registros sincronizados": pipeline visual (/admin/ordenes, agenda, tablero, ` +
          `portal cliente) y queries por fase quedan desincronizadas. Agregá al mismo ` +
          `update: fase + estadoSimple + estado + historialFases reconstruido con append ` +
          `entry { fase, timestamp, usuario, nota } (NO arrayUnion). Patrón canónico: ` +
          `SPRINT-161 (4015fe1, ProcesarFacturacionModal::handleGenerar) y SPRINT-173 ` +
          `(d8f376b, AgendaDia::handleAprobarPrecioInline + OrdenDetalle::handleAprobarPrecio). ` +
          `Si este update es legítimamente parcial (ej: solo tracking GPS, solo reasignación ` +
          `de técnico), agregá comentario "// ${SAFE_LINE_TAG} <razón>" en la misma línea ` +
          `del updateDoc o hasta 5 líneas arriba.`,
      });
    }
  }

  return {
    patternId: PATTERN_ID,
    patternName: PATTERN_NAME,
    status: hits.length > 0 ? 'fail' : 'pass',
    hits,
    notes: [
      `Escaneados ${files.length} archivos en src/. Allowlist files: ${ALLOWLIST_FILES.size}.`,
    ],
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  check().then((result) => {
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.status === 'fail' ? 1 : 0);
  });
}
