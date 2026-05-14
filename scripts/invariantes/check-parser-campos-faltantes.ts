/**
 * P-009 — Campo persistido en Firestore pero omitido por el parser correspondiente
 *
 * Bug original: SPRINT-153-FIX (2026-05-13). `factura.notaConduce` se persistía
 * en `ProcesarFacturacionModal.tsx:534` desde SPRINT-151 (`863e804`) y se
 * renderizaba en `OrdenResumenLectura.tsx:259` desde SPRINT-153 (`79c7fcc`),
 * pero `parseFactura` en `src/utils/index.ts:1124-1170` nunca incluyó el campo
 * en el objeto retornado → el componente recibía siempre `undefined` y el
 * bloque "Nota del conduce" jamás renderizaba. QA E2E del 2026-05-13 sobre
 * CG-00018 confirmó 0 hits del texto en DOM.
 *
 * Síntoma: feature que escribe Y lee parece correcta en la code review pero
 * falla en producción porque el parser intermedio borra silenciosamente el
 * campo nuevo. NO hay error, NO hay warning — solo `undefined` donde debería
 * haber un valor.
 *
 * Causa raíz: los parsers `parseFactura` / `parseOrden` / `parseServicioPrecio`
 * / `parsePiezaInventario` en `src/utils/index.ts` listan campos explícitamente
 * (no usan spread `...raw`). Cuando un sprint agrega un campo al tipo y a la
 * persistencia, fácilmente se olvida actualizar el parser. Sin sistema de tipos
 * que enforce "todos los campos de Factura deben aparecer en parseFactura", el
 * bug solo aparece en runtime para datos reales.
 *
 * Regla: cada campo del tipo `Factura` declarado en `src/types/index.ts` debe
 * tener una asignación correspondiente en `parseFactura` (en `src/utils/index.ts`).
 * Idem `OrdenServicio` ↔ `parseOrden`. La excepción válida: campos con prefijo
 * `_` (privados) o anotados con `// @safe-parser-skip: <razón>` en la línea del
 * tipo.
 *
 * Estrategia (heurística determinística, scope acotado):
 *
 * 1. Leer `src/types/index.ts` y extraer las claves del shape `Factura {...}`.
 * 2. Leer `src/utils/index.ts` y extraer las claves asignadas en el `return {...}`
 *    de `parseFactura`.
 * 3. Reportar cada clave del tipo que NO aparezca en el parser, salvo allowlist.
 *
 * Limitación conocida: solo cubre `Factura` por ahora. Extender a `OrdenServicio`,
 * `ServicioPrecio`, `PiezaInventario` queda como sprint follow-up si el bug
 * vuelve a ocurrir sobre esos tipos.
 *
 * Allowlist por campo:
 *   - Los listados en SKIP_FACTURA_FIELDS abajo (con justificación).
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { InvariantResult, InvariantHit } from './types.js';

const PATTERN_ID = 'P-009';
const PATTERN_NAME =
  'Campo del tipo Factura ausente en parseFactura (parser silenciosamente filtra el campo)';
const ROOT_DIR = path.resolve(process.cwd());

/**
 * Campos del tipo `Factura` que NO deben listarse en `parseFactura`.
 * Razones aceptadas: campo derivado, alias legacy migrado, o documentación
 * explícita del por qué se ignora en lectura.
 */
const SKIP_FACTURA_FIELDS = new Set<string>([
  // Vacío inicialmente. Sumar con comentario justificando.
]);

interface ExtractedShape {
  /** Nombre del tipo encontrado (debug). */
  typeName: string;
  /** Claves del shape (sin `?` ni tipo). */
  keys: Set<string>;
}

/**
 * Extrae los campos de una interface TypeScript a partir del nombre.
 * Soporta `export interface X {` y captura hasta el `}` balanceado.
 */
function extractInterfaceFields(
  content: string,
  typeName: string,
): ExtractedShape | null {
  const re = new RegExp(
    `export\\s+interface\\s+${typeName}\\s*(?:extends\\s+[^{]+)?\\{`,
    'm',
  );
  const m = re.exec(content);
  if (!m) return null;
  const openIdx = content.indexOf('{', m.index);
  if (openIdx < 0) return null;
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
  if (depth !== 0) return null;
  const body = content.slice(openIdx + 1, i);
  // Capturar `clave?: tipo` o `clave: tipo` ignorando comentarios.
  // El parser de keys es heurístico — basta para shapes planos como Factura.
  const keys = new Set<string>();
  const lines = body.split('\n');
  let inBlockComment = false;
  for (const rawLine of lines) {
    let line = rawLine.trim();
    if (inBlockComment) {
      const end = line.indexOf('*/');
      if (end < 0) continue;
      line = line.slice(end + 2).trim();
      inBlockComment = false;
    }
    if (line.startsWith('//')) continue;
    if (line.startsWith('/*')) {
      const end = line.indexOf('*/');
      if (end < 0) {
        inBlockComment = true;
        continue;
      }
      line = line.slice(end + 2).trim();
    }
    if (!line) continue;
    // Match `keyName?:` o `keyName:` al inicio de línea (no anidados).
    const km = /^([a-zA-Z_][a-zA-Z0-9_]*)\??\s*:/.exec(line);
    if (km) keys.add(km[1]);
  }
  return { typeName, keys };
}

/**
 * Extrae las claves asignadas en el `return {...}` final de una función exportada.
 * Busca `export function <funcName>(...): <retType> {` y luego el último `return {`
 * dentro del cuerpo.
 */
function extractParserReturnKeys(
  content: string,
  funcName: string,
): Set<string> | null {
  const re = new RegExp(
    `export\\s+function\\s+${funcName}\\s*\\([^)]*\\)\\s*:\\s*\\w+\\s*\\{`,
    'm',
  );
  const m = re.exec(content);
  if (!m) return null;
  const openIdx = content.indexOf('{', m.index);
  if (openIdx < 0) return null;
  // Balanceamos hasta el `}` de cierre de la función.
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
  if (depth !== 0) return null;
  const body = content.slice(openIdx + 1, i);
  // Buscar el último `return {` dentro del cuerpo y balancear el objeto.
  const retIdx = body.lastIndexOf('return {');
  if (retIdx < 0) return null;
  const objOpen = body.indexOf('{', retIdx);
  if (objOpen < 0) return null;
  let d2 = 0;
  let j = objOpen;
  for (; j < body.length; j++) {
    const ch = body[j];
    if (ch === '{') d2++;
    else if (ch === '}') {
      d2--;
      if (d2 === 0) break;
    }
  }
  if (d2 !== 0) return null;
  const objBody = body.slice(objOpen + 1, j);
  // Capturamos `clave:` al inicio de líneas dentro del return.
  // Ignorar líneas anidadas (depth > 0 dentro del objeto literal).
  const keys = new Set<string>();
  let nest = 0;
  let inBlockComment = false;
  const lines = objBody.split('\n');
  for (const rawLine of lines) {
    let line = rawLine;
    // Strip comentarios de línea.
    const sl = line.indexOf('//');
    if (sl >= 0) line = line.slice(0, sl);
    // Manejar bloque.
    if (inBlockComment) {
      const end = line.indexOf('*/');
      if (end < 0) {
        // Aún así contar llaves para mantener nest si vienen en el comentario?
        // No — los comentarios bloque no traen `{` válidos para nest objetos.
        continue;
      }
      line = line.slice(end + 2);
      inBlockComment = false;
    }
    const bs = line.indexOf('/*');
    if (bs >= 0) {
      const be = line.indexOf('*/', bs + 2);
      if (be < 0) {
        line = line.slice(0, bs);
        inBlockComment = true;
      } else {
        line = line.slice(0, bs) + line.slice(be + 2);
      }
    }
    // Capturar key SOLO si nest == 0 (nivel raíz del objeto).
    // Dos shapes válidos en un object literal:
    //   - Asignación explícita:  `clave: <expr>,`
    //   - Property shorthand:    `clave,`  (equivale a `clave: clave`)
    // Ambos cuentan como "el campo está presente en el return".
    const trimmed = line.trim();
    if (nest === 0) {
      const kmAssign = /^([a-zA-Z_][a-zA-Z0-9_]*)\s*:/.exec(trimmed);
      if (kmAssign) {
        keys.add(kmAssign[1]);
      } else {
        // Shorthand: línea como `clave,` o `clave` (último campo sin coma).
        // Nunca dejar pasar líneas con operadores/funciones/etc.
        const kmShorthand = /^([a-zA-Z_][a-zA-Z0-9_]*)\s*,?\s*$/.exec(trimmed);
        if (kmShorthand) keys.add(kmShorthand[1]);
      }
    }
    // Actualizar nest counts (llaves netas en esta línea).
    for (const ch of line) {
      if (ch === '{') nest++;
      else if (ch === '}') nest--;
    }
  }
  return keys;
}

export async function check(): Promise<InvariantResult> {
  const typesPath = path.join(ROOT_DIR, 'src', 'types', 'index.ts');
  const utilsPath = path.join(ROOT_DIR, 'src', 'utils', 'index.ts');
  const hits: InvariantHit[] = [];

  let typesContent: string;
  let utilsContent: string;
  try {
    typesContent = await fs.readFile(typesPath, 'utf8');
    utilsContent = await fs.readFile(utilsPath, 'utf8');
  } catch (err) {
    return {
      patternId: PATTERN_ID,
      patternName: PATTERN_NAME,
      status: 'warn',
      hits: [],
      notes: [
        `No se pudo leer types/index.ts o utils/index.ts: ${(err as Error).message}.`,
        `Cazador deshabilitado de facto. Si los archivos se renombraron, actualizar este check.`,
      ],
    };
  }

  const facturaShape = extractInterfaceFields(typesContent, 'Factura');
  const parserKeys = extractParserReturnKeys(utilsContent, 'parseFactura');

  if (!facturaShape) {
    return {
      patternId: PATTERN_ID,
      patternName: PATTERN_NAME,
      status: 'warn',
      hits: [],
      notes: [
        `No se encontró \`export interface Factura\` en ${path.relative(ROOT_DIR, typesPath)}.`,
        `El cazador asume ese nombre — si se renombra, actualizar.`,
      ],
    };
  }

  if (!parserKeys) {
    return {
      patternId: PATTERN_ID,
      patternName: PATTERN_NAME,
      status: 'warn',
      hits: [],
      notes: [
        `No se encontró \`export function parseFactura(...)\` en ${path.relative(ROOT_DIR, utilsPath)}.`,
      ],
    };
  }

  const missing: string[] = [];
  for (const key of facturaShape.keys) {
    if (SKIP_FACTURA_FIELDS.has(key)) continue;
    if (!parserKeys.has(key)) missing.push(key);
  }

  if (missing.length > 0) {
    // Localizar la línea del campo en types/index.ts para el reporte.
    const typesLines = typesContent.split('\n');
    for (const key of missing) {
      // Buscar la primera línea dentro del bloque Factura que contenga `^  <key>?:`
      // (search ingenuo pero acotado al cuerpo del tipo es suficiente).
      let lineNo = 0;
      for (let i = 0; i < typesLines.length; i++) {
        const ln = typesLines[i];
        const m = new RegExp(`^\\s+${key}\\??\\s*:`).exec(ln);
        if (m) {
          lineNo = i + 1;
          break;
        }
      }
      hits.push({
        file: path.relative(ROOT_DIR, typesPath),
        line: lineNo || 1,
        snippet: (typesLines[(lineNo || 1) - 1] || '').trim(),
        explanation:
          `El campo \`${key}\` está declarado en el tipo Factura pero NO aparece en ` +
          `\`parseFactura\` (src/utils/index.ts). El \`onSnapshot\` de Facturas carga ` +
          `los docs con \`parseFactura(d.id, d.data())\` — cualquier campo no listado ` +
          `acá se filtra silenciosamente y los componentes lo reciben como \`undefined\`. ` +
          `Bug histórico: SPRINT-151 persistió \`notaConduce\` y SPRINT-153 agregó el ` +
          `render, pero el parser nunca lo incluyó → 24h de feature visible en código ` +
          `pero inerte en producción (QA E2E 2026-05-13 sobre CG-00018, 0 hits en DOM). ` +
          `Acción: agregá \`${key}: (raw.${key} as <tipo>) || undefined,\` al return de ` +
          `\`parseFactura\` con el cast correspondiente al tipo declarado. ` +
          `Si el campo legítimamente NO debe leerse del doc (campo derivado, etc.), ` +
          `agregalo a SKIP_FACTURA_FIELDS en scripts/invariantes/check-parser-campos-faltantes.ts ` +
          `con comentario de justificación.`,
      });
    }
  }

  return {
    patternId: PATTERN_ID,
    patternName: PATTERN_NAME,
    status: hits.length > 0 ? 'fail' : 'pass',
    hits,
    notes: [
      `Factura: ${facturaShape.keys.size} campos en tipo, ${parserKeys.size} ` +
      `campos en parseFactura. Skip explícito: ${SKIP_FACTURA_FIELDS.size}.`,
      `Limitación: solo cubre Factura ↔ parseFactura. OrdenServicio, ServicioPrecio, ` +
      `PiezaInventario quedan como follow-up.`,
    ],
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  check().then((result) => {
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.status === 'fail' ? 1 : 0);
  });
}
