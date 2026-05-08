/**
 * P-007 — `crearNotificacion({ userId: <X>.id })` con doc id de personal en lugar de auth.uid
 *
 * Bug original: notis legacy con `userId == personalDocId` afectando a 5
 * empleados (Yohana, Wilainy, Jorge, misterservicerd, Maria Teresa). 44 docs
 * invisibles en campanita. Re-migrados en `b781f80` (2026-05-08). Postmortem:
 * docs/postmortems/2026-05-08-notis-legacy-multiples-empleados.md.
 *
 * Síntoma: el destinatario de una notificación NO la ve en su campanita
 * porque la rule de Firestore filtra por `userId == request.auth.uid` y el
 * doc tiene `userId == personal.id` (doc id auto-generado de `personal/`).
 *
 * Causa raíz: callers de `crearNotificacion({...})` enumeran personal
 * (`personal.filter(...)`, `personal.map(...)`) y pasan `<item>.id` como
 * `userId` o `destinatarioId`. El doc id de personal NO es auth.uid. Lo
 * correcto es pasar `<item>.uid` y filtrar items con `uid != ''` para
 * excluir empleados pre-SPRINT-105 sin Auth.
 *
 * Por qué un cazador específico (no extender P-001):
 * - P-001 caza el literal `userProfile.id` cerca de campos sensibles. NO
 *   caza variantes con identificadores indirectos como `admin.id`, `p.id`,
 *   `op.id`, `coord.id` que aparecen tipicamente en `personal.filter(...)
 *   .map(item => crearNotificacion({ userId: item.id }))`.
 * - Hacer P-001 ese match abre puerta a falsos positivos masivos sobre
 *   dropdowns de personal (ya cubiertos por P-006 con allowlist propia).
 * - P-007 es focal: solo dispara dentro de llamadas a `crearNotificacion(...)`
 *   o asignaciones a campos `userId` / `destinatarioId` cuando el RHS es
 *   `<X>.id` y `<X>` está en `PERSONAL_VAR_NAMES`.
 *
 * Estrategia (heurística determinística):
 *
 * 1. Recorrer `src/**`.
 * 2. Para cada llamada a `crearNotificacion({...})` (puede abarcar varias
 *    líneas), inspeccionar el bloque `{...}` y buscar:
 *    - `userId: <X>.id`
 *    - `destinatarioId: <X>.id`
 *    donde `<X>` ∈ `PERSONAL_VAR_NAMES` (admin, coord, p, t, op, sec, emp...).
 * 3. Reportar como hit cada match. Allowlist por línea con
 *    `// @safe-crearnotificacion-id: <razón>` en la misma línea o ±5 arriba.
 *
 * Allowlist por archivo: vacía. Si crece, refactorear el cazador.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { InvariantResult, InvariantHit } from './types.js';

const PATTERN_ID = 'P-007';
const PATTERN_NAME =
  'crearNotificacion({ userId: <X>.id }) con personal.id en lugar de auth.uid';
const ROOT_DIR = path.resolve(process.cwd());

const ALLOWLIST_FILES: Set<string> = new Set([
  // Vacía. Sumar solo con justificación si aparecen falsos positivos.
]);

const SAFE_LINE_TAG = '@safe-crearnotificacion-id:';

/**
 * Identificadores que tipicamente referencian un item de `personal/` cuando
 * se itera con `.filter(...)` / `.map(...)`. Si el RHS es `<X>.id` y `<X>`
 * está acá, asumimos que `<X>` es un Personal y `<X>.id` es el doc id, no
 * el auth.uid.
 */
const PERSONAL_VAR_NAMES = new Set([
  'admin',
  'coord',
  'coordinadora',
  'tecnico',
  'tec',
  't',
  'op',
  'operaria',
  'sec',
  'secretaria',
  'emp',
  'empleado',
  'p',
  'persona',
  'personal',
  'ayudante',
  'responsable',
  'destinatario',
  'usuario',
  'miembro',
]);

const SENSITIVE_KEYS = ['userId', 'destinatarioId'];

/**
 * Captura el bloque `{...}` que sigue a `crearNotificacion(`. Trabajamos
 * con balanceo simple de llaves para soportar bloques multi-línea.
 * Devuelve el texto del bloque y la línea de inicio (1-indexed).
 */
function extractCrearNotifBlocks(
  content: string,
): Array<{ text: string; startLine: number }> {
  const out: Array<{ text: string; startLine: number }> = [];
  const re = /crearNotificacion\s*\(\s*\{/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    const openIdx = content.indexOf('{', m.index);
    if (openIdx < 0) continue;
    let depth = 0;
    let i = openIdx;
    for (; i < content.length; i++) {
      const ch = content[i];
      if (ch === '{') depth++;
      else if (ch === '}') {
        depth--;
        if (depth === 0) break;
      }
    }
    if (depth !== 0) continue; // bloque mal formado
    const text = content.slice(openIdx, i + 1);
    const startLine = content.slice(0, openIdx).split('\n').length;
    out.push({ text, startLine });
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

  // Regex que matchea `userId: <X>.id` o `destinatarioId: <X>.id` dentro del bloque.
  // Capturamos también `userProfile.id` literal por si aparece adentro de crearNotificacion
  // (P-001 ya lo caza pero el contexto crearNotificacion lo hace doblemente claro).
  const fieldRe = new RegExp(
    `\\b(${SENSITIVE_KEYS.join('|')})\\s*:\\s*(\\w+(?:\\??\\.\\w+)?)\\.id\\b`,
    'g',
  );

  for (const file of files) {
    const rel = path.relative(ROOT_DIR, file);
    if (ALLOWLIST_FILES.has(rel)) continue;

    const content = await fs.readFile(file, 'utf8');
    const fileLines = content.split('\n');
    const blocks = extractCrearNotifBlocks(content);

    for (const block of blocks) {
      const blockLines = block.text.split('\n');
      let lineCursor = 0;
      let lastIndexInLine = 0;
      // Recorremos el bloque línea por línea para localizar la línea exacta del hit.
      for (let bi = 0; bi < blockLines.length; bi++) {
        const lineText = blockLines[bi];
        const absLine = block.startLine + bi; // 1-indexed
        // Reset regex para cada línea
        const lineRe = new RegExp(fieldRe.source, 'g');
        let mm: RegExpExecArray | null;
        while ((mm = lineRe.exec(lineText)) !== null) {
          const fieldName = mm[1];
          const lhsRoot = mm[2];
          // El path antes de `.id` puede ser `admin` o `userProfile?` etc.
          // Para chequear PERSONAL_VAR_NAMES, tomamos solo el primer segmento.
          const firstSeg = lhsRoot.replace(/\?$/, '').split('?.')[0].split('.')[0];

          // Caso A: userProfile.id literal — siempre fail (redundante con P-001
          // pero lo cazamos también para doblar la red dentro de crearNotificacion).
          const isUserProfileLiteral = /^userProfile\??$/.test(lhsRoot);

          // Caso B: <X>.id donde X es identificador de personal.
          const isPersonalVar = PERSONAL_VAR_NAMES.has(firstSeg);

          if (!isUserProfileLiteral && !isPersonalVar) continue;

          // Allowlist por línea sobre la línea absoluta del archivo.
          const absLineText = fileLines[absLine - 1] ?? '';
          if (absLineText.includes(SAFE_LINE_TAG)) continue;
          const tagWindowStart = Math.max(0, absLine - 1 - 5);
          const tagWindow = fileLines
            .slice(tagWindowStart, absLine - 1)
            .join('\n');
          if (tagWindow.includes(SAFE_LINE_TAG)) continue;

          hits.push({
            file: rel,
            line: absLine,
            snippet: absLineText.trim(),
            explanation:
              `crearNotificacion({ ${fieldName}: ${lhsRoot}.id }) — el RHS es un doc id ` +
              `de personal/ (auto-generado), NO el auth.uid. La rule de Firestore filtra ` +
              `notificaciones por ${fieldName} == request.auth.uid; el destinatario no ` +
              `verá su notificación. Cambiá a ${lhsRoot}.uid y filtrá la lista con ` +
              `.filter(x => x.uid) para excluir empleados pre-SPRINT-105 sin Auth. ` +
              `Si por alguna razón legítima querés guardar el doc id (no debería pasar ` +
              `en notificaciones), agregá comentario "// ${SAFE_LINE_TAG} <razón>" en la ` +
              `misma línea o hasta 5 líneas arriba. Bug original: 44 notis legacy ` +
              `re-migradas el 2026-05-08 (postmortem 2026-05-08-notis-legacy-multiples-empleados.md).`,
          });
        }
        lineCursor++;
        lastIndexInLine = 0;
      }
      void lineCursor;
      void lastIndexInLine;
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
