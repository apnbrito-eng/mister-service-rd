/**
 * P-003 — Mutación cross-collection sin runTransaction
 *
 * Riesgo activo (gotcha CLAUDE.md). Ver docs/PATRONES_REGRESION.md.
 *
 * Estrategia (heurística, conservadora — preferimos falsos negativos a
 * falsos positivos para no joder el flujo):
 *
 * 1. Recorrer src/services, src/pages, src/hooks y api/ (extendido en
 *    SPRINT-133 desde el scope original `src/services` + `api/` tras
 *    detectar `handleConfirmarEliminar` en `src/pages/PersonalPage.tsx`).
 * 2. Para cada función exportada, contar mutaciones a colecciones distintas:
 *    - `updateDoc(doc(db, '<col>', ...))`
 *    - `setDoc(doc(db, '<col>', ...))`
 *    - `addDoc(collection(db, '<col>'))`
 *    - `deleteDoc(doc(db, '<col>', ...))`
 * 3. Si la función toca ≥2 colecciones distintas Y no contiene
 *    `runTransaction(` ni `writeBatch(` → FAIL.
 * 4. Allowlist: comentario `// @safe-non-tx: <razón>` arriba de la función
 *    indica que es intencional (ej: backfill one-shot, UI puramente local).
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { InvariantResult, InvariantHit } from './types.js';

const PATTERN_ID = 'P-003';
const PATTERN_NAME = 'Mutación cross-collection sin runTransaction';
const ROOT_DIR = path.resolve(process.cwd());

const MUTATION_FNS = ['updateDoc', 'setDoc', 'addDoc', 'deleteDoc'];

interface FunctionBlock {
  name: string;
  startLine: number;
  endLine: number;
  body: string;
  safeNonTx: boolean; // marcado por comentario
}

/**
 * Splitter naive de funciones por matching de llaves. Funciona bien para
 * funciones top-level con bodies bien indentadas. No es un parser AST
 * pero suficiente para esta heurística.
 */
function splitFunctions(content: string): FunctionBlock[] {
  const lines = content.split('\n');
  const fns: FunctionBlock[] = [];
  // Patrones de función exportada o async
  const re = /^\s*(?:export\s+)?(?:async\s+)?function\s+(\w+)|^\s*(?:export\s+)?const\s+(\w+)\s*=\s*(?:async\s+)?\(/;

  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(re);
    if (!m) continue;
    const name = m[1] || m[2];
    if (!name) continue;

    // Buscar la primera `{` desde i
    let braceLine = i;
    while (braceLine < lines.length && !lines[braceLine].includes('{')) braceLine++;
    if (braceLine >= lines.length) continue;

    let depth = 0;
    let started = false;
    let endLine = braceLine;
    for (let j = braceLine; j < lines.length; j++) {
      for (const ch of lines[j]) {
        if (ch === '{') {
          depth++;
          started = true;
        } else if (ch === '}') {
          depth--;
          if (started && depth === 0) {
            endLine = j;
            break;
          }
        }
      }
      if (started && depth === 0) {
        endLine = j;
        break;
      }
    }

    // ¿Comentario @safe-non-tx en líneas previas?
    const prevCtx = lines.slice(Math.max(0, i - 5), i).join('\n');
    const safeNonTx = /@safe-non-tx:/.test(prevCtx);

    fns.push({
      name,
      startLine: i + 1,
      endLine: endLine + 1,
      body: lines.slice(i, endLine + 1).join('\n'),
      safeNonTx,
    });
  }
  return fns;
}

function extractCollectionsTouched(body: string): Set<string> {
  const cols = new Set<string>();
  // doc(db, 'col', ...) o collection(db, 'col')
  // Sólo si está envuelto en una llamada de mutación
  for (const fn of MUTATION_FNS) {
    const re = new RegExp(
      `\\b${fn}\\s*\\([\\s\\S]*?(?:doc|collection)\\(\\s*db\\s*,\\s*['"]([\\w_]+)['"]`,
      'g',
    );
    let m: RegExpExecArray | null;
    while ((m = re.exec(body)) !== null) {
      cols.add(m[1]);
    }
  }
  return cols;
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
  const targets: string[] = [];
  // Revisamos services/, pages/, hooks/ y api/ — son los que escriben Firestore
  // intencionalmente desde el frontend o backend. Componentes puntuales que
  // hagan mutaciones de una sola colección no aplican (cols.size < 2 los excluye).
  // Extendido en SPRINT-133 tras detectar `handleConfirmarEliminar` en pages/.
  for (const sub of ['src/services', 'src/pages', 'src/hooks', 'api']) {
    const dir = path.join(ROOT_DIR, sub);
    await walk(dir, targets);
  }

  const hits: InvariantHit[] = [];

  for (const file of targets) {
    const rel = path.relative(ROOT_DIR, file);
    const content = await fs.readFile(file, 'utf8');
    const fns = splitFunctions(content);

    for (const fn of fns) {
      const cols = extractCollectionsTouched(fn.body);
      if (cols.size < 2) continue; // toca 0 o 1 colección, no aplica
      if (fn.safeNonTx) continue;
      if (/runTransaction\s*\(/.test(fn.body)) continue;
      if (/writeBatch\s*\(/.test(fn.body)) continue;

      hits.push({
        file: rel,
        line: fn.startLine,
        snippet: `function ${fn.name} (líneas ${fn.startLine}-${fn.endLine})`,
        explanation:
          `Función "${fn.name}" muta ${cols.size} colecciones distintas ` +
          `(${[...cols].join(', ')}) sin runTransaction ni writeBatch. ` +
          `Si la red corta entre las escrituras, queda estado parcial. ` +
          `Envolver en runTransaction(...) o, si es intencional ` +
          `(ej: backfill), agregar comentario "// @safe-non-tx: <razón>" arriba ` +
          `de la función.`,
      });
    }
  }

  return {
    patternId: PATTERN_ID,
    patternName: PATTERN_NAME,
    status: hits.length > 0 ? 'fail' : 'pass',
    hits,
    notes: [`Escaneados ${targets.length} archivos en src/services, src/pages, src/hooks y api.`],
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  check().then((result) => {
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.status === 'fail' ? 1 : 0);
  });
}
