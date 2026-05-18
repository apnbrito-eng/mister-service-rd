/**
 * P-012 — `onSnapshot(collection(db, '<col>'), ...)` o
 *           `onSnapshot(query(collection(db, '<col>')), ...)` sin `where(...)`
 *           cuando la rule de `<col>` exige `auth.uid == X` para read.
 *
 * Bug original: histórico — `TecnicoVista.tsx` suscribía a `comisiones`
 * sin where filter (presente desde "Fase 5", pre-2026-04). La rule de
 * `comisiones` exige `esAdminOCoord() || (esTecnico() && resource.data.tecnicoId == auth.uid)`.
 * Para técnicos, la query SIN where era rechazada por Firestore con
 * `permission-denied` en console. Detección: QA E2E sidepanel 2026-05-16.
 * Fix: SPRINT-179 (commit `328c508`, 2026-05-18). Postmortem:
 * `docs/postmortems/2026-05-18-tecnico-comisiones-listener-sin-where.md`.
 *
 * SPRINT-179-FIX2 (2026-05-18) confirmó vía barrido sistemático del
 * codebase que NO hay otros listeners sin where contra colecciones con
 * rules restrictivas en este momento. El cazador se crea proactivamente
 * para que cualquier reintroducción del patrón sea cazada pre-commit.
 *
 * Síntoma: `permission-denied` en console cuando un usuario rol-restringido
 * (técnico/operaria/ayudante) carga una página que suscribe a una colección
 * con rule del tipo `auth.uid == X`. El listener nunca emite datos pero la
 * app puede SEGUIR FUNCIONANDO si tiene fallback (filter client-side
 * espera vacío). Bug latente — features que dependan del listener no
 * funcionan en silencio.
 *
 * Causa raíz: Firestore Rules evalúa queries por su shape: si la rule
 * exige `field == auth.uid`, la query DEBE incluir `where('field', '==',
 * auth.uid)` para que Firestore garantice estructuralmente que todos los
 * docs devueltos satisfacen la rule. Un filter client-side post-snapshot
 * NO sustituye el constraint server-side.
 *
 * Regla: cualquier `onSnapshot(collection(db, '<col>'), ...)` o
 * `onSnapshot(query(collection(db, '<col>'), ...))` sin `where(...)` donde
 * la rule de `<col>` tiene un `auth.uid == <campo>` en `allow read`, debe:
 *   (a) incluir `where('<campo>', '==', auth.uid)` en la query, O
 *   (b) anteponer un check de rol que corto-circuite (ej: `esAdminOCoord()`
 *       en la rule) y verificar que el caller siempre es admin/coord.
 *
 * Estrategia (determinística + heurística):
 *
 *   1. Parsear `firestore.rules`:
 *      - Detectar bloques `match /<col>/{...}` y dentro `allow read: if ...`.
 *      - Si la rule contiene `resource.data.<campo> == request.auth.uid` y
 *        NO existe un short-circuit obvio (`esAdminOCoord()` o `esStaff*()`
 *        antes del `||`), marcar la colección como RESTRICTIVA.
 *      - Si la rule contiene `esStaff()` o `esAdminOCoord()` como uno de los
 *        términos del OR, considerar la colección NO restrictiva (rol oficina
 *        bypasa el constraint per-doc).
 *
 *   2. Parsear `src/**` buscando `onSnapshot(<arg1>, ...)`:
 *      - Si `<arg1>` es `collection(db, '<col>')` sin envolver en `query(...)`:
 *        es candidate sin where → si `<col>` está en RESTRICTIVAS → hit.
 *      - Si `<arg1>` es `query(collection(db, '<col>'), ...)`:
 *        extraer el contenido de `query(...)`. Si NO contiene `where('<campo>', '==',`
 *        donde `<campo>` matchea uno de los campos restrictivos de la rule
 *        → hit.
 *
 *   3. Allowlist por línea: `// @safe-listener-sin-where: <razón>` en la
 *      misma línea o hasta 5 arriba.
 *
 * Limitación conocida:
 * - Parser de rules es heurístico (regex). Si la rule tiene estructura
 *   atípica (ej: función helper que envuelve la check), puede falso-positivar
 *   o falso-negativar. Allowlist documentada por colección si hace falta.
 * - El parser de TSX no es AST completo — busca literales. Si una colección
 *   se referencia vía variable (`const COL = 'comisiones'`), no se detecta.
 *
 * Allowlist por archivo: vacía. Allowlist por colección documentada si el
 * caller tiene gating de rol verificable estáticamente (raro).
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { InvariantResult, InvariantHit } from './types.js';

const PATTERN_ID = 'P-012';
const PATTERN_NAME =
  "onSnapshot sin where contra colección con rule auth.uid==X";
const ROOT_DIR = path.resolve(process.cwd());
const SAFE_LINE_TAG = '@safe-listener-sin-where:';

const ALLOWLIST_FILES: Set<string> = new Set([
  // Vacía. Los listeners en páginas admin que sólo cargan para admin/coord
  // bypasan la rule via `esAdminOCoord()` short-circuit. El parser detecta
  // ese caso y los marca como NO restrictivos automáticamente.
]);

/**
 * Detecta colecciones cuya rule de read contiene
 * `resource.data.<campo> == request.auth.uid` Y NO tiene un short-circuit
 * de rol obvio (`esStaff()`, `esAdminOCoord()`, `esStaffOficina()`,
 * `esAdmin()`) ANTES o EN el mismo OR.
 */
function parseRulesRestrictivas(rulesContent: string): Map<string, string[]> {
  const out = new Map<string, string[]>();
  // Buscar bloques `match /<col>/{...}`. Captura nombre.
  const matchRe = /match\s+\/([a-z_][a-z0-9_]*)\/\{[^}]+\}\s*\{([\s\S]*?)\n\s{4}\}/g;
  let m: RegExpExecArray | null;
  while ((m = matchRe.exec(rulesContent)) !== null) {
    const col = m[1];
    const body = m[2];
    // Extraer la regla de read.
    // Acepta `allow read:`, `allow read, ...:`, `allow get, list:`.
    const readRe = /allow\s+(?:[a-z, ]*read[a-z, ]*|get(?:\s*,\s*list)?|list(?:\s*,\s*get)?)\s*:\s*if\s+([\s\S]*?);/m;
    const readMatch = readRe.exec(body);
    if (!readMatch) continue;
    const readRule = readMatch[1];

    // ¿Hay short-circuit que cubra TODOS los roles staff? Si SÍ → no
    // restrictiva (la query nunca falla para usuarios staff legítimos).
    //
    // - `esStaff()` cubre admin/coord/secretaria/operaria/tecnico/ayudante
    //   → cubre todo → no restrictiva.
    // - `esStaffOficina()` cubre admin/coord/secretaria/operaria. En
    //   colecciones gateadas solo para oficina (NO accesibles por técnico/
    //   ayudante via UI), tratamos como no restrictiva — confiamos en
    //   gating UI.
    // - `esAdmin()` / `esAdminOCoord()` NO cubre técnicos → si un listener
    //   en una página de técnico apunta a una col con esa rule, falla.
    //   Ejemplo: `comisiones` (`esAdminOCoord() || (esTecnico() && ...)`)
    //   SÍ es restrictiva — el técnico cae en la rama de constraint.
    if (/\bes(Staff|StaffOficina)\s*\(\s*\)/.test(readRule)) {
      continue;
    }

    // ¿Hay constraint `resource.data.<X> == request.auth.uid`?
    const constraintRe = /resource\.data\.(\w+)\s*==\s*request\.auth\.uid/g;
    const campos: string[] = [];
    let cm: RegExpExecArray | null;
    while ((cm = constraintRe.exec(readRule)) !== null) {
      campos.push(cm[1]);
    }
    if (campos.length > 0) {
      out.set(col, campos);
    }
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

/**
 * Extrae todos los call-sites `onSnapshot(<arg1>, ...)` con balanceo de
 * paréntesis. Retorna la línea y el texto del primer arg.
 */
function extractOnSnapshotCalls(
  content: string,
): Array<{ arg1: string; startLine: number; rawLine: string }> {
  const out: Array<{ arg1: string; startLine: number; rawLine: string }> = [];
  const re = /\bonSnapshot\s*\(/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    const open = content.indexOf('(', m.index);
    if (open < 0) continue;
    let depth = 0;
    let commaIdx = -1;
    for (let i = open + 1; i < content.length; i++) {
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
    const arg1 = content.slice(open + 1, commaIdx).trim();
    const startLine = content.slice(0, m.index).split('\n').length;
    const lines = content.split('\n');
    const rawLine = lines[startLine - 1] ?? '';
    out.push({ arg1, startLine, rawLine });
  }
  return out;
}

export async function check(): Promise<InvariantResult> {
  const rulesPath = path.join(ROOT_DIR, 'firestore.rules');
  const rulesContent = await fs.readFile(rulesPath, 'utf8');
  const restrictivas = parseRulesRestrictivas(rulesContent);

  const srcDir = path.join(ROOT_DIR, 'src');
  const files = await walk(srcDir);
  const hits: InvariantHit[] = [];

  for (const file of files) {
    const rel = path.relative(ROOT_DIR, file);
    if (ALLOWLIST_FILES.has(rel)) continue;

    const content = await fs.readFile(file, 'utf8');
    const lines = content.split('\n');
    const calls = extractOnSnapshotCalls(content);

    for (const call of calls) {
      // Caso A: `onSnapshot(collection(db, '<col>'), ...)` directo sin query/where.
      const directColRe = /^collection\s*\(\s*db\s*,\s*['"]([a-z_]+)['"]\s*\)$/;
      const dm = directColRe.exec(call.arg1);
      // Caso B: `onSnapshot(query(collection(db, '<col>'), ...), ...)`.
      const wrappedColRe = /^query\s*\(\s*collection\s*\(\s*db\s*,\s*['"]([a-z_]+)['"]\s*\)([\s\S]*)\)$/;
      const wm = wrappedColRe.exec(call.arg1);

      let col: string | null = null;
      let queryBody = '';
      if (dm) {
        col = dm[1];
        queryBody = '';
      } else if (wm) {
        col = wm[1];
        queryBody = wm[2];
      } else {
        continue;
      }

      const camposRestrictivos = restrictivas.get(col);
      if (!camposRestrictivos) continue; // No restrictiva — OK.

      // ¿La query incluye `where('<campo>', '==', ...)` matcheando uno de
      // los campos restrictivos? Si SÍ → OK. Si NO → hit.
      const tieneWhereCampo = camposRestrictivos.some((campo) => {
        const whereRe = new RegExp(`where\\s*\\(\\s*['"]${campo}['"]\\s*,\\s*['"]==['"]\\s*,`);
        return whereRe.test(queryBody);
      });
      if (tieneWhereCampo) continue;

      // Allowlist por tag.
      const windowStart = Math.max(0, call.startLine - 1 - 5);
      const ventana = lines.slice(windowStart, call.startLine).join('\n');
      if (ventana.includes(SAFE_LINE_TAG)) continue;

      hits.push({
        file: rel,
        line: call.startLine,
        snippet: call.rawLine.trim(),
        explanation:
          `onSnapshot a '${col}' sin where('${camposRestrictivos.join("'|'")}', '==', ...). ` +
          `La rule de Firestore exige uno de esos constraints para read (sin short-circuit ` +
          `de rol oficina). Firestore rechaza la query → permission-denied en console + ` +
          `listener vacío silencioso. Solución: agregar where('${camposRestrictivos[0]}', '==', ` +
          `currentUser.uid) al query. Si el caller siempre es admin/coord (rule short-circuit), ` +
          `agregá '// ${SAFE_LINE_TAG} <razón>' arriba. Patrón documentado en P-012 + postmortem ` +
          `docs/postmortems/2026-05-18-tecnico-comisiones-listener-sin-where.md.`,
      });
    }
  }

  return {
    patternId: PATTERN_ID,
    patternName: PATTERN_NAME,
    status: hits.length > 0 ? 'fail' : 'pass',
    hits,
    notes: [
      `Escaneados ${files.length} archivos en src/. ${restrictivas.size} colecciones con rule restrictiva detectadas: ${Array.from(restrictivas.keys()).join(', ') || '(ninguna)'}.`,
    ],
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  check().then((result) => {
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.status === 'fail' ? 1 : 0);
  });
}
