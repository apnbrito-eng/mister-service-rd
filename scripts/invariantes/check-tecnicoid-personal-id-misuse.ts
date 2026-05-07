/**
 * P-006 — Dropdown que asigna técnico/operaria/secretaria guarda personal.id
 *         en lugar de personal.uid (auth.uid)
 *
 * Bug original: c4be345 (Iniciar Chequeo Aury Mon, 2026-05-07).
 * Ver docs/PATRONES_REGRESION.md.
 *
 * Síntoma: técnico/operaria nuevo (creado con flujo SPRINT-105 que respeta
 * auto-id de Firestore en personal/) recibe órdenes asignadas vía dropdown
 * que guarda `t.id` en `tecnicoId` (o `ayudanteId`, `operariaId`, etc.).
 * Las rules comparan `tecnicoId == request.auth.uid` y rechazan
 * permission-denied porque `personal.id !== auth.uid` para empleados con
 * id auto-generado.
 *
 * Causa raíz: el doc `personal/{auto-id}` tiene un campo `uid` adentro que
 * SÍ es el `auth.uid` del empleado. Los dropdowns deben hacer
 * `<option value={t.uid}>` (no `value={t.id}`). Filtrar `t.filter(x => x.uid)`
 * para excluir empleados sin uid (alta vieja sin Auth).
 *
 * Estrategia (heurística determinística):
 *
 * 1. Recorrer `src/**.{tsx}`.
 * 2. Buscar líneas con `<option ... value={X.id}>` donde X es identificador
 *    corto (1-3 chars: t, p, op, sec, tec).
 * 3. Para cada hit, leer ±20 líneas alrededor: si el contexto sugiere que es
 *    un select de personal/técnico/operaria (presencia de `tecnicoId`,
 *    `tecnicos.map`, `personal.map`, `personalActivo`, `tecnicoNombre`,
 *    `setForm` con campo de tipo "<rol>Id"), reportar como hit.
 * 4. Allowlist por línea: comentario `// @safe-tecnicoid-id: <razón>` en la
 *    misma línea o hasta 5 líneas arriba silencia el hit. Útil cuando el
 *    dropdown es solo para filtro UI (no se guarda en Firestore) o
 *    intencionalmente referencia el doc id (ej: ver detalles del empleado).
 *
 * Allowlist por archivo: paths donde se sabe que TODOS los `<option>` son
 * filtros UI (no escriben a Firestore). Mantener corto, justificar.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { InvariantResult, InvariantHit } from './types.js';

const PATTERN_ID = 'P-006';
const PATTERN_NAME =
  'Dropdown que asigna técnico/operaria guarda personal.id en lugar de auth.uid';
const ROOT_DIR = path.resolve(process.cwd());

/**
 * Allowlist por archivo. Vacía por default. Si crece >5 entradas, refactorear
 * el cazador (probablemente hace falta más contexto en la heurística).
 */
const ALLOWLIST_FILES: Set<string> = new Set([
  // Ejemplo (no agregado aún):
  // 'src/pages/Comisiones.tsx',
]);

/**
 * Comentario de allowlist por línea. Patrón:
 *   // @safe-tecnicoid-id: filtro UI, no se guarda en Firestore
 */
const SAFE_LINE_TAG = '@safe-tecnicoid-id:';

/**
 * Identificadores de variable cortos típicos en `arr.map(t => ...)` cuando
 * `arr` es lista de personal/técnicos/operarias. Si la regex captura otro
 * nombre (ej: "cliente"), lo ignoramos para evitar falsos positivos sobre
 * dropdowns de clientes (que SÍ usan doc id legítimamente).
 */
const PERSONAL_VAR_NAMES = new Set([
  't',
  'tec',
  'tecnico',
  'p',
  'persona',
  'personal',
  'op',
  'operaria',
  'sec',
  'secretaria',
  'emp',
  'empleado',
  'ayudante',
]);

/**
 * Tokens de contexto que confirman que el `<option>` está dentro de un
 * select de personal/técnico/operaria. Buscamos en ±20 líneas alrededor.
 */
const CONTEXT_TOKENS = [
  'tecnicoId',
  'ayudanteId',
  'operariaId',
  'secretariaId',
  'responsableId',
  'asignadoA',
  'tecnicos.map',
  'tecnicosFiltrados',
  'personal.map',
  'personalActivo',
  'personalFiltrado',
  'operariasActivas',
  'tecnicoNombre',
  'ayudanteNombre',
];

const CTX_WINDOW = 20;

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
    } else if (/\.tsx$/.test(entry.name)) {
      files.push(full);
    }
  }
  return files;
}

export async function check(): Promise<InvariantResult> {
  const srcDir = path.join(ROOT_DIR, 'src');
  const files = await walk(srcDir);

  const hits: InvariantHit[] = [];
  // Regex: <option ... value={X.id}>  donde X es identificador corto (1..15 chars sin punto interno)
  const optionRe = /<option\b[^>]*\bvalue=\{(\w+)\.id\}/;

  for (const file of files) {
    const rel = path.relative(ROOT_DIR, file);
    if (ALLOWLIST_FILES.has(rel)) continue;

    const content = await fs.readFile(file, 'utf8');
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const m = optionRe.exec(line);
      if (!m) continue;

      const varName = m[1];
      if (!PERSONAL_VAR_NAMES.has(varName)) continue;

      // Allowlist por línea
      if (line.includes(SAFE_LINE_TAG)) continue;
      const tagWindowStart = Math.max(0, i - 5);
      const tagWindow = lines.slice(tagWindowStart, i).join('\n');
      if (tagWindow.includes(SAFE_LINE_TAG)) continue;

      // Contexto ±CTX_WINDOW
      const start = Math.max(0, i - CTX_WINDOW);
      const end = Math.min(lines.length, i + CTX_WINDOW);
      const ctx = lines.slice(start, end).join('\n');

      const matchedToken = CONTEXT_TOKENS.find((tok) => ctx.includes(tok));
      if (!matchedToken) continue;

      hits.push({
        file: rel,
        line: i + 1,
        snippet: line.trim(),
        explanation:
          `Dropdown <option value={${varName}.id}> dentro de contexto que sugiere ` +
          `select de personal/técnico (token "${matchedToken}" cercano). ` +
          `Las rules de Firestore validan tecnicoId/ayudanteId/etc. == request.auth.uid. ` +
          `personal.id es el doc id auto-generado, NO es auth.uid. Cambiá a ` +
          `<option value={${varName}.uid}> y filtrá tecnicos.filter(x => x.uid). ` +
          `Si este dropdown es solo filtro UI (no se guarda en Firestore), agregá comentario ` +
          `"// @safe-tecnicoid-id: filtro UI, no escribe Firestore" en la misma línea o hasta 5 líneas arriba. ` +
          `Bug original: c4be345 (2026-05-07, Aury Mon).`,
      });
    }
  }

  return {
    patternId: PATTERN_ID,
    patternName: PATTERN_NAME,
    status: hits.length > 0 ? 'fail' : 'pass',
    hits,
    notes: [
      `Escaneados ${files.length} archivos .tsx en src/. Allowlist: ${ALLOWLIST_FILES.size} archivos.`,
    ],
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  check().then((result) => {
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.status === 'fail' ? 1 : 0);
  });
}
