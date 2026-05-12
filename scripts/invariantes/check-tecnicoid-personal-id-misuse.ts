/**
 * P-006 — Dropdown que asigna técnico/operaria/secretaria guarda personal.id
 *         en lugar de personal.uid (auth.uid). Variantes 1 (dropdown),
 *         2 (`.find()`) y 3 (Set/Map indexing en useMemo).
 *
 * Bug original: c4be345 (Iniciar Chequeo Aury Mon, 2026-05-07).
 * Extensión variante .find(): SPRINT-132 (2026-05-11) — 14 sitios en el repo
 * con el patrón `find(X => X.id === <algo>Id)` que retorna undefined cuando
 * `<algo>Id` es auth.uid post-c4be345 pero `X.id` sigue siendo personal/{docId}.
 * Extensión variante Set/Map (SPRINT-146, 2026-05-12): bug en AgendaDia.tsx
 * pasó inadvertido porque el lookup era `new Set(...).has(t.id)` y
 * `map[t.id]` dentro de `useMemo`, no `<option>` ni `.find()`. Ver
 * docs/PATRONES_REGRESION.md.
 * Extensión variante reversa "campo === X.id" (SPRINT-149, 2026-05-12):
 * detecta el patrón `o.operariaId === p.id` / `t.operariaId === userProfile.id`
 * en filter/comparison directos (no .find()). El campo `operariaId` post-SPRINT-105
 * persiste auth.uid, así que comparar contra `p.id` (doc id de personal) siempre
 * falla para operarias nuevas. Patrón sintetiza variantes 2 y 3 pero captura la
 * comparación directa en filter/condicionales fuera de `.find()`/`Set.has()`.
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
 * Síntoma variante 3 (Set/Map): bug AgendaDia.tsx 2026-05-12. Filtros y
 * render usaban `new Set(arr.map(t => t.id)).has(o.tecnicoId)` y
 * `map[t.id]` donde `map` se construía con `o.tecnicoId` como key. Como
 * `o.tecnicoId` post-c4be345 es auth.uid y `t.id` sigue siendo personal
 * docId, los lookups siempre retornan false/undefined. Resultado: TODOS
 * los técnicos aparecían como "sin órdenes" pese a tener órdenes con
 * `fechaCita = hoy`, KPIs en 0, columna del técnico vacía.
 *
 * Causa raíz: el doc `personal/{auto-id}` tiene un campo `uid` adentro que
 * SÍ es el `auth.uid` del empleado. Los dropdowns deben hacer
 * `<option value={t.uid}>` (no `value={t.id}`). Los `.find()` deben usar
 * `(t.uid || t.id) === <campo>` para soportar tanto órdenes pre-c4be345
 * (campo === personal.id) como post-c4be345 (campo === auth.uid). Los
 * `Set.has()` / `map[]` que comparan contra `o.tecnicoId` etc. deben
 * construirse/indexar con `t.uid || t.id`. Filtrar `t.filter(x => x.uid)`
 * para excluir empleados sin uid (alta vieja sin Auth) si el dropdown
 * escribe a Firestore.
 *
 * Estrategia (heurística determinística):
 *
 * 1. Recorrer `src/**.{tsx,ts}`.
 * 2. Para cada archivo, tres pasadas:
 *    (a) Buscar `<option ... value={X.id}>` donde X es identificador
 *        corto de personal. (Original variante 1, solo .tsx.)
 *    (b) Buscar `.find(X => X.id === Y)` donde Y es identificador con
 *        sufijo `tecnicoId`, `operariaId`, `ayudanteId`, `responsableId`,
 *        `secretariaId`, `personalId`, o termina en `Id` y el archivo tiene
 *        contexto de personal. Solo reportar si X es un identificador corto
 *        de personal (mismo conjunto que la variante 1).
 *    (c) Buscar `.has(X.id)` o `[X.id]` (indexación de map/objeto) cuando
 *        el contexto cercano (±CTX_WINDOW líneas) tiene un Set/Map
 *        construido con `o.tecnicoId` (o `operariaId`, etc.). Solo reportar
 *        si X es identificador corto de personal.
 * 3. Para cada hit, leer ±20 líneas alrededor para confirmar contexto.
 * 4. Allowlist por línea: comentario `// @safe-tecnicoid-id: <razón>` en la
 *    misma línea o hasta 5 líneas arriba silencia el hit.
 *
 * Allowlist por archivo: paths donde se sabe que TODOS los matches son
 * legítimos (no escriben a Firestore y el lookup es simétrico con el
 * dropdown UI). Mantener corto, justificar.
 *
 * NOTA SOBRE operariaId — [RESUELTO en SPRINT-149 el 2026-05-12]:
 *   Jorge eligió ruta (a): migrar `operariaId` a `auth.uid` consistente con
 *   `tecnicoId`. SPRINT-149 cerró el ciclo:
 *   - 13 reads migrados al patrón `(p.uid || p.id) === operariaId`.
 *   - 2 writes pendientes (PersonalPage.tsx:772-778) migrados a `(destino.uid || destino.id)`.
 *   - Script `scripts/migrar-operariaid-a-uid.ts` alinea datos legacy.
 *   - Variante 4 agregada al cazador (comparación directa reversa
 *     `xxx.<sufijo> === yyy.id`).
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
  // Variante 3 (SPRINT-146): Set.has(X.id) o map[X.id] dentro de archivos donde
  // el contexto cercano tiene un Set/Map construido con un sufijo de campo de
  // empleado (`o.tecnicoId`, `o.operariaId`, etc.). Detecta el bug AgendaDia
  // donde `idsConOrden.has(t.id)` se compara contra un Set construido con
  // `o.tecnicoId`. Buscamos también la construcción upstream (`new Set(...map(o
  // => o.tecnicoId)...)` o key de map `[o.tecnicoId]` / `o.tecnicoId ||`).
  const setHasRe = /\.has\((\w+)\.id\)/;
  const mapIndexRe = /\[(\w+)\.id\]/;
  // Pattern para detectar el Set/Map upstream — lo buscamos en ±CTX_WINDOW.
  const TECNICO_ID_SUFFIX_RE = /\b(?:tecnicoId|operariaId|ayudanteId|responsableId|secretariaId|tecnicoDestinoId)\b/;
  // Variante 4 (SPRINT-149): comparación directa reversa
  // `xxx.<sufijo> === yyy.id` (filter/condicional) donde `xxx.<sufijo>` es campo
  // persistido de empleado (post-SPRINT-105/c4be345 contiene auth.uid) e `yyy` es
  // identificador corto de personal. Captura los casos `o.operariaId === p.id`
  // de nomina/Rendimiento/Dashboard/MetricasMensuales/MapaRutas/etc. que el
  // findRe de variante 2 no cazaba porque están en `.filter()`/comparación directa.
  // Captura solo `=== `, no `==` (no asume forma).
  const reverseCmpRe = /([\w.[\]]+\.(?:tecnicoId|operariaId|ayudanteId|responsableId|secretariaId|tecnicoDestinoId))\s*===?\s*(\w+)\.id\b/;

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

      // ── Variante 4 (SPRINT-149): xxx.<sufijo> === yyy.id (comparación directa reversa) ──
      const rcm = reverseCmpRe.exec(line);
      if (rcm) {
        const lhs = rcm[1]; // ej: "o.operariaId" o "selectedOrden.operariaId"
        const rhsVar = rcm[2]; // ej: "p" en "p.id"
        if (PERSONAL_VAR_NAMES.has(rhsVar)) {
          const tagWindowStart = Math.max(0, i - 5);
          const tagWindow = lines.slice(tagWindowStart, i).join('\n');
          const allowlisted = line.includes(SAFE_LINE_TAG) || tagWindow.includes(SAFE_LINE_TAG);

          if (!allowlisted) {
            hits.push({
              file: rel,
              line: i + 1,
              snippet: line.trim(),
              explanation:
                `[Variante 4 — comparación directa reversa] \`${lhs} === ${rhsVar}.id\` ` +
                `compara campo persistido de empleado (post-c4be345/SPRINT-105 contiene auth.uid) ` +
                `contra doc id de personal/. Para empleados nuevos (con uid poblado) el lookup ` +
                `siempre falla. Cambiá a \`${lhs} === (${rhsVar}.uid || ${rhsVar}.id)\` para ` +
                `soportar tanto órdenes pre como post migración. Si es solo filtro UI ` +
                `(no escribe a Firestore gateado por rules), agregá ` +
                `"// @safe-tecnicoid-id: ..." 1-5 líneas arriba. ` +
                `Bug sistémico: SPRINT-149 (2026-05-12, operariaId migración).`,
            });
          }
        }
      }

      // ── Variante 3 (SPRINT-146): Set.has(X.id) o map[X.id] con contexto de campo empleado ──
      // Para esta variante necesitamos confirmar que el Set/Map upstream se
      // construyó con un sufijo conocido (`tecnicoId`, `operariaId`, etc.).
      // Buscamos el patrón en ±CTX_WINDOW líneas alrededor.
      const setMatch = setHasRe.exec(line);
      const mapMatch = mapIndexRe.exec(line);
      const v3Match = setMatch || mapMatch;
      if (v3Match) {
        const varName = v3Match[1];
        if (PERSONAL_VAR_NAMES.has(varName)) {
          // Allowlist por línea
          const tagWindowStart = Math.max(0, i - 5);
          const tagWindow = lines.slice(tagWindowStart, i).join('\n');
          const allowlisted = line.includes(SAFE_LINE_TAG) || tagWindow.includes(SAFE_LINE_TAG);

          if (!allowlisted) {
            // Contexto ±CTX_WINDOW para detectar el Set/Map upstream.
            const start = Math.max(0, i - CTX_WINDOW);
            const end = Math.min(lines.length, i + CTX_WINDOW);
            const ctx = lines.slice(start, end).join('\n');

            // Debe haber un campo de orden (tecnicoId, etc.) cercano para que
            // este sea un caso real. Sin esto, podría ser un Set/Map de UI
            // pura (ej: sobre clientes, productos).
            if (TECNICO_ID_SUFFIX_RE.test(ctx)) {
              const variant = setMatch ? 'Set.has' : 'map indexing';
              const suggestion = setMatch
                ? `\`.has(${varName}.uid || ${varName}.id)\``
                : `\`[${varName}.uid || ${varName}.id]\``;
              hits.push({
                file: rel,
                line: i + 1,
                snippet: line.trim(),
                explanation:
                  `[Variante 3 — ${variant}] \`${line.trim()}\` indexa/busca por ` +
                  `${varName}.id (doc id de personal) en una estructura cuya key/elemento ` +
                  `proviene de un campo de orden (tecnicoId, operariaId, etc.) que ` +
                  `post-c4be345 contiene auth.uid. El lookup siempre falla y la UI ` +
                  `renderiza vacío/falso. Cambiá a ${suggestion} para alinear dominios. ` +
                  `Si el Set/Map se construyó intencionalmente con doc id (consistente ` +
                  `local sin tocar campos de orden), agregá ` +
                  `"// @safe-tecnicoid-id: ..." 1-5 líneas arriba. ` +
                  `Bug original: AgendaDia.tsx 2026-05-12 (SPRINT-145). Cazador extendido SPRINT-146.`,
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
