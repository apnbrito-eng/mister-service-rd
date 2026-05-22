/**
 * P-020 — Helper de limpieza recursiva sin guard de prototipo plano que
 *         escribe a Firestore con sentinels FieldValue/Date/Timestamp.
 *
 * Bug original: `142d4da` (SPRINT-WA-1, 2026-05-19). Síntoma silencioso —
 * el helper `stripUndefinedDeep` en `api/_lib/whatsappWebhook.ts` recursaba
 * sobre cualquier `typeof === 'object'`, incluyendo sentinels FieldValue,
 * Date y Timestamp. Resultado: `FieldValue.increment(1)` se guardaba como
 * `{operand:1}`, `FieldValue.serverTimestamp()` y `Date` como `{}`,
 * corrompiendo contadores y fechas en `whatsapp_conversaciones` /
 * `whatsapp_mensajes_inbox` / `whatsapp_mensajes_outbox`. La conversación
 * no subía al tope, no marcaba no leídos, la ventana 24h quedaba rota.
 *
 * Fix: `0baf8b7` (2026-05-22). Guard `Object.getPrototypeOf === Object.prototype || null`
 * antes de recursar.
 *
 * Postmortem: `docs/postmortems/2026-05-22-stripundefineddeep-mangle-fieldvalue.md`.
 *
 * Causa raíz prevenida: ningún cazador determinístico verifica que helpers
 * de "limpieza recursiva" (`stripUndefinedDeep`, `deepClone`,
 * `sanitizePayload`, etc.) preserven instancias de clase antes de recursar.
 * Cualquier helper futuro de este shape en archivos backend (que escriben
 * a Firestore con Admin SDK + FieldValue) repite el bug en silencio.
 *
 * Regla: cualquier archivo bajo `api/**` o `src/services/**` que defina
 * una función con shape de "limpieza recursiva" (heurística: contiene
 * `Object.entries` o `Object.keys` + se llama a sí misma + el archivo
 * importa `firebase-admin`/`firebase/firestore` O vive en `api/_lib/`
 * — los helpers de `api/_lib/` son típicamente puros pero importados
 * por endpoints que SÍ escriben FieldValue/Date/Timestamp) DEBE contener en el
 * cuerpo de la función AL MENOS UNA de estas señales:
 *
 *  1. Check explícito de prototipo plano:
 *     `Object.getPrototypeOf(...)` comparado con `Object.prototype` o `null`.
 *  2. Check explícito de instancias preservables:
 *     `instanceof Date` Y `instanceof Timestamp` (ambos — el frontend usa
 *     `firebase/firestore::Timestamp`, el backend `firebase-admin/firestore::Timestamp`).
 *  3. Tag de allowlist `// @safe-recursive-strip: <razón>` en la misma línea
 *     del `function`/`const ... =` o hasta 5 líneas arriba.
 *
 * Si NO contiene ninguna señal → FAIL con explicación de cómo arreglarlo.
 *
 * Cómo se detecta un "helper de limpieza recursiva":
 *  - Match de declaración de función exportada o no: `function NAME(` o
 *    `const NAME = (` o `export function NAME(` o `export const NAME = (`.
 *  - El cuerpo de la función (delimitado por balanceo de llaves o por
 *    fin de archivo) menciona el `NAME` de la función (recursión) Y
 *    menciona `Object.entries` o `Object.keys`.
 *  - El archivo tiene un import desde `firebase-admin` o `firebase/firestore`.
 *
 * Allowlist por archivo: vacía al inicio. Si crece a >5 entradas, refactorear.
 *
 * Limitación conocida:
 *  - Heurística por regex sobre archivo entero. El balanceo de llaves para
 *    extraer el cuerpo es básico — si una función tiene strings con `{`/`}`
 *    literales muy largos podría fallar; en la práctica no es el caso.
 *  - No detecta helpers definidos como arrow function inline en otra función
 *    (closure interno). Si aparece ese patrón, agregar el archivo a la
 *    allowlist con razón documentada.
 *  - Patrón pasa si la función NO se exporta y solo se usa internamente
 *    sin escribir directo a Firestore — el riesgo bajará pero igual aplica
 *    porque puede llamarse desde otro código que SÍ escribe.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { InvariantResult, InvariantHit } from './types.js';

const PATTERN_ID = 'P-020';
const PATTERN_NAME =
  'Helper de limpieza recursiva sin guard de prototipo plano (FieldValue/Date/Timestamp safe)';
const ROOT_DIR = path.resolve(process.cwd());

/**
 * Directorios a escanear. Si crece a >5 entradas, refactorear.
 */
const SCAN_DIRS: readonly string[] = [
  'api',
  'src/services',
];

/**
 * Allowlist por archivo: vacía al inicio. Agregar acá con razón
 * documentada si un archivo legítimamente define un helper "deep" que
 * no requiere el guard (ej: helper que SOLO opera sobre strings/primitivos
 * y no recibe payloads de Firestore).
 */
const ALLOWLIST_FILES: ReadonlySet<string> = new Set<string>();

/**
 * Extensiones a escanear (solo TS/TSX — el repo no tiene JS de producción).
 */
const SCAN_EXTS = new Set(['.ts', '.tsx']);

/**
 * Walk recursivo del directorio. Skip `node_modules`, `dist`, `.next`,
 * tests y declaraciones `.d.ts`.
 */
async function walk(dir: string, out: string[]): Promise<void> {
  let entries: import('node:fs').Dirent[];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === 'node_modules' || e.name === 'dist' || e.name.startsWith('.')) continue;
      await walk(full, out);
    } else if (e.isFile()) {
      if (e.name.endsWith('.d.ts')) continue;
      if (e.name.endsWith('.test.ts') || e.name.endsWith('.test.tsx')) continue;
      const ext = path.extname(e.name);
      if (!SCAN_EXTS.has(ext)) continue;
      out.push(full);
    }
  }
}

interface HelperCandidato {
  filePath: string;
  fileRel: string;
  contenido: string;
  /** Nombre de la función candidata. */
  nombre: string;
  /** Linea donde aparece la declaración (1-indexed). */
  lineaDecl: number;
  /** Cuerpo de la función (desde `{` que abre hasta `}` que cierra). */
  cuerpo: string;
  /** Líneas previas a la declaración (para chequear allowlist). */
  preludioLineas: string[];
}

/**
 * Detecta declaraciones de función candidata en el archivo. Captura nombre
 * + linea + cuerpo balanceando llaves desde el primer `{` post-firma.
 */
function detectarCandidatos(
  fileRel: string,
  filePath: string,
  contenido: string,
): HelperCandidato[] {
  // Solo procesar archivos que (a) importen Firestore o (b) sean helpers
  // bajo `api/_lib/` que típicamente son importados por endpoints que SÍ
  // escriben a Firestore (caso del bug original `stripUndefinedDeep` que
  // vive en `api/_lib/whatsappWebhook.ts` — módulo puro, pero el caller
  // pasa FieldValue al helper y todo el daño ocurre adentro).
  const importaFirestore =
    /from\s+['"`]firebase-admin(?:\/firestore)?['"`]/.test(contenido) ||
    /from\s+['"`]firebase\/firestore['"`]/.test(contenido);
  const esHelperApiLib = fileRel.startsWith('api/_lib/');
  if (!importaFirestore && !esHelperApiLib) return [];

  const candidatos: HelperCandidato[] = [];
  const lineas = contenido.split('\n');

  // Patrón de declaración:
  //   function NAME(  | export function NAME(  | const NAME = (  | export const NAME = (
  const DECL_RE = /^(?:\s*)(?:export\s+)?(?:function\s+(\w+)\s*[<(]|const\s+(\w+)\s*=\s*(?:async\s+)?(?:function\s*[<(]|<[^>]*>\s*\(|\())/;

  for (let i = 0; i < lineas.length; i++) {
    const m = lineas[i].match(DECL_RE);
    if (!m) continue;
    const nombre = m[1] ?? m[2];
    if (!nombre) continue;

    // Buscar el primer `{` desde esta linea en adelante (puede estar
    // en la misma linea o varias debajo si la firma es multi-line).
    let openIdx = -1;
    let openLineRel = 0;
    for (let j = i; j < Math.min(lineas.length, i + 20); j++) {
      const idx = lineas[j].indexOf('{');
      if (idx >= 0) {
        openIdx = idx;
        openLineRel = j;
        break;
      }
    }
    if (openIdx < 0) continue;

    // Balancear llaves desde ahí.
    let depth = 0;
    let cuerpo = '';
    let cerrado = false;
    outer: for (let j = openLineRel; j < lineas.length; j++) {
      const startIdx = j === openLineRel ? openIdx : 0;
      const linea = lineas[j];
      for (let k = startIdx; k < linea.length; k++) {
        const ch = linea[k];
        if (ch === '{') depth++;
        else if (ch === '}') {
          depth--;
          if (depth === 0) {
            cuerpo += linea.slice(startIdx, k + 1) + '\n';
            cerrado = true;
            break outer;
          }
        }
      }
      cuerpo += (j === openLineRel ? linea.slice(openIdx) : linea) + '\n';
    }
    if (!cerrado) continue;

    // Heurística "limpieza recursiva":
    //   - cuerpo menciona Object.entries o Object.keys
    //   - cuerpo menciona el nombre de la función (recursión)
    const tieneObjectIter = /\bObject\.(entries|keys)\s*\(/.test(cuerpo);
    if (!tieneObjectIter) continue;
    const recursivo = new RegExp(`\\b${nombre}\\s*\\(`).test(cuerpo);
    if (!recursivo) continue;

    // Preludio: hasta 5 líneas antes de la declaración (para chequear allowlist).
    const preludio = lineas.slice(Math.max(0, i - 5), i + 1);

    candidatos.push({
      filePath,
      fileRel,
      contenido,
      nombre,
      lineaDecl: i + 1,
      cuerpo,
      preludioLineas: preludio,
    });
  }

  return candidatos;
}

/**
 * Verifica que el helper tenga al menos una señal de "preserva instancias".
 */
function cumpleInvariante(c: HelperCandidato): {
  ok: boolean;
  senalDetectada?: string;
} {
  // Señal 1: Object.getPrototypeOf + Object.prototype | null
  if (
    /Object\.getPrototypeOf\s*\(/.test(c.cuerpo) &&
    /Object\.prototype|=== null|=== Object\.prototype/.test(c.cuerpo)
  ) {
    return { ok: true, senalDetectada: 'Object.getPrototypeOf guard' };
  }

  // Señal 2: instanceof Date && instanceof Timestamp
  const tieneDate = /instanceof\s+Date\b/.test(c.cuerpo);
  const tieneTimestamp = /instanceof\s+Timestamp\b/.test(c.cuerpo);
  if (tieneDate && tieneTimestamp) {
    return { ok: true, senalDetectada: 'instanceof Date && Timestamp' };
  }

  // Señal 3: allowlist por línea — tag en preludio.
  const ALLOW_TAG = /@safe-recursive-strip\s*:/;
  if (c.preludioLineas.some((l) => ALLOW_TAG.test(l))) {
    return { ok: true, senalDetectada: 'allowlist @safe-recursive-strip' };
  }

  return { ok: false };
}

export async function check(): Promise<InvariantResult> {
  const hits: InvariantHit[] = [];
  const notes: string[] = [];

  // 1. Walk de directorios.
  const archivos: string[] = [];
  for (const rel of SCAN_DIRS) {
    const full = path.join(ROOT_DIR, rel);
    try {
      const stat = await fs.stat(full);
      if (stat.isDirectory()) {
        await walk(full, archivos);
      }
    } catch {
      // Directorio no existe — skip.
    }
  }

  if (archivos.length === 0) {
    notes.push(
      `No se encontraron archivos en ${SCAN_DIRS.join(', ')}. PASS silent.`,
    );
    return {
      patternId: PATTERN_ID,
      patternName: PATTERN_NAME,
      status: 'pass',
      hits,
      notes,
    };
  }

  // 2. Para cada archivo, detectar candidatos y verificar invariante.
  let totalCandidatos = 0;
  let okCount = 0;
  for (const filePath of archivos) {
    const fileRel = path.relative(ROOT_DIR, filePath);
    if (ALLOWLIST_FILES.has(fileRel)) continue;

    let contenido: string;
    try {
      contenido = await fs.readFile(filePath, 'utf8');
    } catch {
      continue;
    }

    const candidatos = detectarCandidatos(fileRel, filePath, contenido);
    totalCandidatos += candidatos.length;

    for (const c of candidatos) {
      const r = cumpleInvariante(c);
      if (r.ok) {
        okCount++;
        notes.push(
          `${c.fileRel}:${c.lineaDecl} helper \`${c.nombre}\` PASS (${r.senalDetectada}).`,
        );
        continue;
      }

      // Extraer snippet (linea de declaración).
      const lineas = contenido.split('\n');
      const snippet = (lineas[c.lineaDecl - 1] ?? '').trim();
      hits.push({
        file: c.fileRel,
        line: c.lineaDecl,
        snippet: snippet || `(helper ${c.nombre})`,
        explanation:
          `Helper de limpieza recursiva \`${c.nombre}\` detectado en archivo que importa Firestore ` +
          `(Admin SDK o cliente). El helper recursa sobre \`Object.entries\`/\`Object.keys\` pero ` +
          `NO contiene ninguna señal de preservación de instancias de clase. ` +
          `Riesgo (P-020): si el caller pasa \`FieldValue.increment(...)\`, \`FieldValue.serverTimestamp()\`, ` +
          `\`Date\`, \`Timestamp\`, \`GeoPoint\`, \`DocumentReference\` o \`Buffer\`, el helper los recursa ` +
          `como mapas planos y los reconstruye destruyendo el sentinel — el doc en Firestore queda ` +
          `con contadores como \`{operand:N}\` y fechas como \`{}\`. ` +
          `Bug original: commit \`142d4da\` (SPRINT-WA-1, 2026-05-19); fix \`0baf8b7\` (2026-05-22). ` +
          `Postmortem: \`docs/postmortems/2026-05-22-stripundefineddeep-mangle-fieldvalue.md\`. ` +
          `Cómo arreglar: agregar AL MENOS UNA de — ` +
          `(a) guard \`Object.getPrototypeOf(val) !== Object.prototype && proto !== null → return val\` ANTES de recursar; ` +
          `(b) checks explícitos \`if (val instanceof Date) return val; if (val instanceof Timestamp) return val;\`; ` +
          `(c) si el helper es legítimamente seguro (ej. solo procesa strings/primitivos), agregar tag ` +
          `\`// @safe-recursive-strip: <razón>\` en la línea de la declaración o hasta 5 líneas arriba.`,
      });
    }
  }

  notes.push(
    `Escaneados ${archivos.length} archivo(s) en ${SCAN_DIRS.join(', ')}. ` +
      `Candidatos detectados: ${totalCandidatos}. PASS: ${okCount}. HIT: ${hits.length}.`,
  );

  return {
    patternId: PATTERN_ID,
    patternName: PATTERN_NAME,
    status: hits.length > 0 ? 'fail' : 'pass',
    hits,
    notes,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  check().then((result) => {
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.status === 'fail' ? 1 : 0);
  });
}
