/**
 * P-006 — Dropdown que asigna técnico/operaria/secretaria guarda personal.id
 *         en lugar de personal.uid (auth.uid). Variante 2: lookup
 *         `personal.find(p => p.id === <campo de orden>)` que falla post-c4be345.
 *
 * Bug original: c4be345 (Iniciar Chequeo Aury Mon, 2026-05-07).
 * Extensión variante .find(): SPRINT-132 (2026-05-11) — 14 sitios en el repo
 * con el patrón `find(X => X.id === <algo>Id)` que retorna undefined cuando
 * `<algo>Id` es auth.uid post-c4be345 pero `X.id` sigue siendo personal/{docId}.
 * Ver docs/PATRONES_REGRESION.md.
 *
 * Síntoma original (variante 1, dropdown): técnico/operaria nuevo (creado
 * con flujo SPRINT-105 que respeta auto-id de Firestore en personal/) recibe
 * órdenes asignadas vía dropdown que guarda `t.id` en `tecnicoId` (o
 * `ayudanteId`, `operariaId`, etc.). Las rules comparan
 * `tecnicoId == request.auth.uid` y rechazan permission-denied porque
 * `personal.id !== auth.uid` para empleados con id auto-generado.
 *
 * Síntoma variante 2 (.find()): la derivación de operaria desde el técnico
 * elegido NUNCA se dispara en CREATE/edit de orden porque `personal.find(p =>
 * p.id === form.tecnicoId)` retorna undefined cuando `form.tecnicoId ===
 * auth.uid` post-c4be345. Resultado: la orden creada nunca pobló
 * `operariaId`/`operariaNombre` aunque el técnico SÍ tenga operaria
 * asignada. SPRINT-129 reportó 0 inconsistencias porque su definición de
 * inconsistencia es "orden con operariaNombre desincronizado", no "siempre
 * vacío".
 *
 * Causa raíz: el doc `personal/{auto-id}` tiene un campo `uid` adentro que
 * SÍ es el `auth.uid` del empleado. Los dropdowns deben hacer
 * `<option value={t.uid}>` (no `value={t.id}`). Los `.find()` deben usar
 * `(t.uid || t.id) === <campo>` para soportar tanto órdenes pre-c4be345
 * (campo === personal.id) como post-c4be345 (campo === auth.uid).
 * Filtrar `t.filter(x => x.uid)` para excluir empleados sin uid (alta vieja
 * sin Auth) si el dropdown escribe a Firestore.
 *
 * Estrategia (heurística determinística):
 *
 * 1. Recorrer `src/**.{tsx,ts}`.
 * 2. Para cada archivo, dos pasadas:
 *    (a) Buscar `<option ... value={X.id}>` donde X es identificador
 *        corto de personal. (Original variante 1, solo .tsx.)
 *    (b) Buscar `.find(X => X.id === Y)` donde Y es identificador con
 *        sufijo `tecnicoId`, `operariaId`, `ayudanteId`, `responsableId`,
 *        `secretariaId`, `personalId`, o termina en `Id` y el archivo tiene
 *        contexto de personal. Solo reportar si X es un identificador corto
 *        de personal (mismo conjunto que la variante 1).
 * 3. Para cada hit, leer ±20 líneas alrededor para confirmar contexto.
 * 4. Allowlist por línea: comentario `// @safe-tecnicoid-id: <razón>` en la
 *    misma línea o hasta 5 líneas arriba silencia el hit.
 *
 * Allowlist por archivo: paths donde se sabe que TODOS los matches son
 * legítimos (no escriben a Firestore y el lookup es simétrico con el
 * dropdown UI). Mantener corto, justificar.
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
    } else if (/\.(tsx|ts)$/.test(entry.name)) {
      files.push(full);
    }
  }
  return files;
}

/**
 * Sufijos de campos que típicamente contienen auth.uid de un empleado en
 * docs de Firestore (ordenes_servicio, avances de orden, etc.). Si el
 * `.find()` compara contra una variable que termina con uno de estos
 * sufijos, asumimos que el lookup debe usar `(uid || id)` para soportar
 * pre/post c4be345.
 */
const TECNICO_ID_SUFFIXES = [
  'tecnicoId',
  'operariaId',
  'ayudanteId',
  'responsableId',
  'secretariaId',
  'tecnicoDestinoId',
  // 'personalId' es ambiguo (avances local vs orden) — no se incluye por defecto.
  // Si crece la necesidad, allowlistar por línea con @safe-tecnicoid-id.
];

export async function check(): Promise<InvariantResult> {
  const srcDir = path.join(ROOT_DIR, 'src');
  const files = await walk(srcDir);

  const hits: InvariantHit[] = [];
  // Variante 1: <option ... value={X.id}>  donde X es identificador corto de personal.
  const optionRe = /<option\b[^>]*\bvalue=\{(\w+)\.id\}/;
  // Variante 2 (SPRINT-132): .find(X => X.id === Y) donde X es identificador corto de
  // personal y Y termina en un sufijo conocido de campo de empleado en Firestore.
  // Soporta ambos `===` y `==` (defensa de paranoia).
  const findRe = /\.find\(\s*(\w+)\s*=>\s*\1\.id\s*===?\s*([\w.[\]]+)\s*\)/;

  for (const file of files) {
    const rel = path.relative(ROOT_DIR, file);
    if (ALLOWLIST_FILES.has(rel)) continue;

    const content = await fs.readFile(file, 'utf8');
    const lines = content.split('\n');
    const isTsx = /\.tsx$/.test(file);

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // ── Variante 1: <option value={X.id}> (solo en .tsx) ──
      if (isTsx) {
        const m = optionRe.exec(line);
        if (m) {
          const varName = m[1];
          if (PERSONAL_VAR_NAMES.has(varName)) {
            // Allowlist por línea
            const tagWindowStart = Math.max(0, i - 5);
            const tagWindow = lines.slice(tagWindowStart, i).join('\n');
            const allowlisted = line.includes(SAFE_LINE_TAG) || tagWindow.includes(SAFE_LINE_TAG);

            if (!allowlisted) {
              // Contexto ±CTX_WINDOW
              const start = Math.max(0, i - CTX_WINDOW);
              const end = Math.min(lines.length, i + CTX_WINDOW);
              const ctx = lines.slice(start, end).join('\n');

              const matchedToken = CONTEXT_TOKENS.find((tok) => ctx.includes(tok));
              if (matchedToken) {
                hits.push({
                  file: rel,
                  line: i + 1,
                  snippet: line.trim(),
                  explanation:
                    `[Variante 1 — dropdown] <option value={${varName}.id}> dentro de contexto ` +
                    `que sugiere select de personal/técnico (token "${matchedToken}" cercano). ` +
                    `Las rules de Firestore validan tecnicoId/ayudanteId/etc. == request.auth.uid. ` +
                    `personal.id es el doc id auto-generado, NO es auth.uid. Cambiá a ` +
                    `<option value={${varName}.uid}> y filtrá tecnicos.filter(x => x.uid). ` +
                    `Si es solo filtro UI (no escribe Firestore), agregá ` +
                    `"// @safe-tecnicoid-id: ..." en la misma línea o hasta 5 líneas arriba. ` +
                    `Bug original: c4be345 (2026-05-07, Aury Mon).`,
                });
              }
            }
          }
        }
      }

      // ── Variante 2: .find(X => X.id === Y) donde Y es campo persistido de empleado ──
      const fm = findRe.exec(line);
      if (fm) {
        const varName = fm[1];
        const compareTo = fm[2];
        if (PERSONAL_VAR_NAMES.has(varName)) {
          // Verificar si compareTo termina con uno de los sufijos conocidos.
          // compareTo puede ser `form.tecnicoId`, `m.tecnicoId`, `o.tecnicoId`,
          // `tecnicoDestinoId`, etc. Tomamos el último segmento tras el último `.`.
          const lastSegment = compareTo.includes('.')
            ? compareTo.slice(compareTo.lastIndexOf('.') + 1)
            : compareTo;
          const matchesSuffix = TECNICO_ID_SUFFIXES.some(
            (suffix) => lastSegment === suffix || lastSegment.endsWith(suffix),
          );
          if (matchesSuffix) {
            // Allowlist por línea
            const tagWindowStart = Math.max(0, i - 5);
            const tagWindow = lines.slice(tagWindowStart, i).join('\n');
            const allowlisted = line.includes(SAFE_LINE_TAG) || tagWindow.includes(SAFE_LINE_TAG);

            if (!allowlisted) {
              hits.push({
                file: rel,
                line: i + 1,
                snippet: line.trim(),
                explanation:
                  `[Variante 2 — .find()] \`.find(${varName} => ${varName}.id === ${compareTo})\` ` +
                  `compara doc id de personal contra un campo que persiste auth.uid post-c4be345. ` +
                  `El lookup retorna undefined para órdenes nuevas con tecnicoId == auth.uid. ` +
                  `Cambiá a \`.find(${varName} => (${varName}.uid || ${varName}.id) === ${compareTo})\` ` +
                  `para soportar tanto pre como post c4be345. Si el lookup es intencionalmente ` +
                  `simétrico con un dropdown UI local (no escribe a Firestore gateado por rules), ` +
                  `agregá "// @safe-tecnicoid-id: ..." 1-5 líneas arriba. ` +
                  `Bug sistémico: SPRINT-132 (2026-05-11). Variante original: c4be345.`,
              });
            }
          }
        }
      }
    }
  }

  return {
    patternId: PATTERN_ID,
    patternName: PATTERN_NAME,
    status: hits.length > 0 ? 'fail' : 'pass',
    hits,
    notes: [
      `Escaneados ${files.length} archivos .ts/.tsx en src/. Allowlist: ${ALLOWLIST_FILES.size} archivos.`,
    ],
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  check().then((result) => {
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.status === 'fail' ? 1 : 0);
  });
}
