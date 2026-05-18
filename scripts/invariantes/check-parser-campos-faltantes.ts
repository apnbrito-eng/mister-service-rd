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
 * Recurrencia #2 (SPRINT-177-HOTFIX 2026-05-16): mismo patrón sobre
 * `CierreServicio.firmaClienteUrl` + `firmaClienteAt`. SPRINT-159 persistió la
 * firma, los 3 consumidores UI la leían, pero `parseOrden` la descartaba en la
 * IIFE de `cierreServicio` → "Sin firma" mostrado 14 días en producción. El
 * cazador NO cazó este caso porque solo cubría `Factura`. Ese sprint amplió
 * el cazador a `CierreServicio ↔ parseOrden.cierreServicio` (sub-objeto).
 *
 * Recurrencia #3 (SPRINT-187-FIX2-HOTFIX 2026-05-18): mismo patrón sobre
 * `Cliente.eliminado` + `eliminadoEn` + `eliminadoPor` + `mergedaCon`.
 * SPRINT-185 (`a3b56bf`) persistió los 4 campos soft-delete en `clientes/{id}`
 * desde el script de dedup y desde el UI cuando borra, pero `parseCliente`
 * en `src/utils/index.ts:601-678` nunca incluyó los campos → `Clientes.tsx:160`
 * filtraba `c.eliminado !== true` que evaluaba `undefined !== true === true` y
 * los soft-deleted seguían visibles en `/admin/clientes`. QA visual sidepanel
 * 2026-05-18 noche cazó 3 entradas "QA Test" en el listado. El cazador NO
 * cazó este caso porque solo cubría `Factura` + `CierreServicio`. Este sprint
 * amplía a `Cliente ↔ parseCliente` (return directo, no IIFE — reusa
 * `extractParserReturnKeys`).
 *
 * **TERCERA recurrencia del MISMO patrón en 5 días = bandera roja estructural.**
 * Ver `docs/postmortems/2026-05-18-parser-cliente-eliminado-olvido.md` para
 * el análisis. Lección: la deuda "extender cazador a más tipos" NO debe quedar
 * como anotación en este JSDoc — debe materializarse como sprint en
 * `COLA_AUTONOMA.md` con touch-list específico INMEDIATAMENTE. Las
 * recurrencias #2 y #3 fueron exactamente los tipos que la versión original
 * de este cazador listó como "follow-up si vuelve a ocurrir".
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
 * Idem `CierreServicio` ↔ la IIFE de `cierreServicio` en `parseOrden`. La
 * excepción válida: campos con prefijo `_` (privados) o agregados al allowlist
 * `SKIP_*_FIELDS` con justificación.
 *
 * Estrategia (heurística determinística, scope acotado):
 *
 * 1. Leer `src/types/index.ts` y extraer las claves del shape `Factura {...}` y
 *    `CierreServicio {...}`.
 * 2. Leer `src/utils/index.ts` y extraer las claves asignadas en el `return {...}`
 *    de `parseFactura` y en la IIFE `cierreServicio: raw.cierreServicio ? (() => {`
 *    dentro de `parseOrden`.
 * 3. Reportar cada clave del tipo que NO aparezca en el parser, salvo allowlist.
 *
 * Limitación conocida: cubre `Factura` y `CierreServicio` (sub-objeto de
 * OrdenServicio). Extender a otros sub-objetos parseados de `OrdenServicio`
 * (`inicioChequeo`, `trackingGPS`, etc.) o a `ServicioPrecio` / `PiezaInventario`
 * queda como sprint follow-up si el bug vuelve a ocurrir sobre esos tipos.
 *
 * Allowlist por campo:
 *   - Los listados en SKIP_FACTURA_FIELDS / SKIP_CIERRESERVICIO_FIELDS abajo
 *     (con justificación).
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { InvariantResult, InvariantHit } from './types.js';

const PATTERN_ID = 'P-009';
const PATTERN_NAME =
  'Campo del tipo (Factura/CierreServicio/Cliente) ausente en parser correspondiente (parser silenciosamente filtra el campo)';
const ROOT_DIR = path.resolve(process.cwd());

/**
 * Campos del tipo `Factura` que NO deben listarse en `parseFactura`.
 * Razones aceptadas: campo derivado, alias legacy migrado, o documentación
 * explícita del por qué se ignora en lectura.
 */
const SKIP_FACTURA_FIELDS = new Set<string>([
  // Vacío inicialmente. Sumar con comentario justificando.
]);

/**
 * Campos del tipo `CierreServicio` que NO deben listarse en la IIFE
 * `cierreServicio` de `parseOrden`. Razones aceptadas: campo derivado,
 * alias legacy, o documentación explícita.
 */
const SKIP_CIERRESERVICIO_FIELDS = new Set<string>([
  // Vacío inicialmente. Sumar con comentario justificando.
]);

/**
 * Campos del tipo `Cliente` que NO deben listarse en `parseCliente`.
 * Razones aceptadas: campo derivado, alias legacy migrado, o documentación
 * explícita del por qué se ignora en lectura.
 */
const SKIP_CLIENTE_FIELDS = new Set<string>([
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
  // SPRINT-187-FIX2-HOTFIX: trackear `nest` del nivel de llaves para evitar
  // capturar keys de objetos anidados inline (ej: `legacyMetricas: {
  // totalServicios: number; ... }` dentro de `Cliente`). Solo se capturan
  // keys con `nest === 0` (nivel raíz del interface). Esto preserva el
  // comportamiento previo para shapes planos como `Factura` /
  // `CierreServicio` (sus claves siempre estaban en nest 0).
  const keys = new Set<string>();
  const lines = body.split('\n');
  let inBlockComment = false;
  let nest = 0;
  for (const rawLine of lines) {
    let line = rawLine;
    // Strip comentarios de línea (preservar resto de la línea por si tiene `{`).
    const sl = line.indexOf('//');
    if (sl >= 0) line = line.slice(0, sl);
    if (inBlockComment) {
      const end = line.indexOf('*/');
      if (end < 0) {
        // Línea entera dentro del bloque; las llaves del comentario no cuentan.
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
    const trimmed = line.trim();
    if (trimmed && nest === 0) {
      const km = /^([a-zA-Z_][a-zA-Z0-9_]*)\??\s*:/.exec(trimmed);
      if (km) keys.add(km[1]);
    }
    // Actualizar nest counts después de procesar la línea.
    for (const ch of line) {
      if (ch === '{') nest++;
      else if (ch === '}') nest--;
    }
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

/**
 * Extrae las claves asignadas en una IIFE `<prop>: raw.<prop> ? (() => { ... return {...} })() : undefined,`
 * dentro del cuerpo de una función. Usado para sub-objetos de `parseOrden` como
 * `cierreServicio`, `inicioChequeo`, etc.
 *
 * Busca el patrón: `<propName>: <expr> ? (() => {` y luego el último `return {`
 * dentro del cuerpo balanceado de la IIFE.
 */
function extractIifeReturnKeys(
  content: string,
  funcName: string,
  propName: string,
): Set<string> | null {
  // 1. Acotamos al cuerpo de la función.
  const funcRe = new RegExp(
    `export\\s+function\\s+${funcName}\\s*\\([^)]*\\)\\s*:\\s*\\w+\\s*\\{`,
    'm',
  );
  const fm = funcRe.exec(content);
  if (!fm) return null;
  const funcOpen = content.indexOf('{', fm.index);
  if (funcOpen < 0) return null;
  let fDepth = 0;
  let fEnd = funcOpen;
  for (; fEnd < content.length; fEnd++) {
    const ch = content[fEnd];
    if (ch === '{') fDepth++;
    else if (ch === '}') {
      fDepth--;
      if (fDepth === 0) break;
    }
  }
  if (fDepth !== 0) return null;
  const funcBody = content.slice(funcOpen + 1, fEnd);

  // 2. Buscar la IIFE: `<propName>: <expr> ? (() => {`
  const iifeRe = new RegExp(
    `${propName}\\s*:\\s*[^?]+\\?\\s*\\(\\s*\\(\\)\\s*=>\\s*\\{`,
    'm',
  );
  const im = iifeRe.exec(funcBody);
  if (!im) return null;
  const iifeOpen = funcBody.indexOf('{', im.index);
  if (iifeOpen < 0) return null;
  let iDepth = 0;
  let iEnd = iifeOpen;
  for (; iEnd < funcBody.length; iEnd++) {
    const ch = funcBody[iEnd];
    if (ch === '{') iDepth++;
    else if (ch === '}') {
      iDepth--;
      if (iDepth === 0) break;
    }
  }
  if (iDepth !== 0) return null;
  const iifeBody = funcBody.slice(iifeOpen + 1, iEnd);

  // 3. Buscar el último `return {` dentro de la IIFE.
  const retIdx = iifeBody.lastIndexOf('return {');
  if (retIdx < 0) return null;
  const objOpen = iifeBody.indexOf('{', retIdx);
  if (objOpen < 0) return null;
  let oDepth = 0;
  let oEnd = objOpen;
  for (; oEnd < iifeBody.length; oEnd++) {
    const ch = iifeBody[oEnd];
    if (ch === '{') oDepth++;
    else if (ch === '}') {
      oDepth--;
      if (oDepth === 0) break;
    }
  }
  if (oDepth !== 0) return null;
  const objBody = iifeBody.slice(objOpen + 1, oEnd);

  // 4. Mismo parser de keys que extractParserReturnKeys (capturar solo nest 0).
  const keys = new Set<string>();
  let nest = 0;
  let inBlockComment = false;
  const lines = objBody.split('\n');
  for (const rawLine of lines) {
    let line = rawLine;
    const sl = line.indexOf('//');
    if (sl >= 0) line = line.slice(0, sl);
    if (inBlockComment) {
      const end = line.indexOf('*/');
      if (end < 0) continue;
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
    const trimmed = line.trim();
    if (nest === 0) {
      const kmAssign = /^([a-zA-Z_][a-zA-Z0-9_]*)\s*:/.exec(trimmed);
      if (kmAssign) {
        keys.add(kmAssign[1]);
      } else {
        const kmShorthand = /^([a-zA-Z_][a-zA-Z0-9_]*)\s*,?\s*$/.exec(trimmed);
        if (kmShorthand) keys.add(kmShorthand[1]);
      }
    }
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

  // ─── Cobertura 1: Factura ↔ parseFactura ───────────────────────────────────
  const facturaShape = extractInterfaceFields(typesContent, 'Factura');
  const facturaParserKeys = extractParserReturnKeys(utilsContent, 'parseFactura');

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

  if (!facturaParserKeys) {
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

  const typesLines = typesContent.split('\n');

  const missingFactura: string[] = [];
  for (const key of facturaShape.keys) {
    if (SKIP_FACTURA_FIELDS.has(key)) continue;
    if (!facturaParserKeys.has(key)) missingFactura.push(key);
  }

  for (const key of missingFactura) {
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

  // ─── Cobertura 2 (SPRINT-177-HOTFIX): CierreServicio ↔ parseOrden.cierreServicio ───
  const cierreShape = extractInterfaceFields(typesContent, 'CierreServicio');
  const cierreParserKeys = extractIifeReturnKeys(
    utilsContent,
    'parseOrden',
    'cierreServicio',
  );

  // Warns en lugar de fail si no encontramos el shape o la IIFE — preserva
  // robustez ante refactors mientras se mantiene la cobertura de Factura.
  const notes: string[] = [
    `Factura: ${facturaShape.keys.size} campos en tipo, ${facturaParserKeys.size} ` +
    `campos en parseFactura. Skip explícito: ${SKIP_FACTURA_FIELDS.size}.`,
  ];

  if (cierreShape && cierreParserKeys) {
    const missingCierre: string[] = [];
    for (const key of cierreShape.keys) {
      if (SKIP_CIERRESERVICIO_FIELDS.has(key)) continue;
      if (!cierreParserKeys.has(key)) missingCierre.push(key);
    }

    for (const key of missingCierre) {
      let lineNo = 0;
      // Buscar la línea del campo en types/index.ts acotado al cuerpo de
      // CierreServicio (search ingenuo pero suficiente — el primer match
      // dentro del archivo es casi siempre el correcto si los nombres son
      // específicos).
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
          `El campo \`${key}\` está declarado en el tipo CierreServicio pero NO ` +
          `aparece en la IIFE \`cierreServicio\` dentro de \`parseOrden\` ` +
          `(src/utils/index.ts). Los componentes que renderean la orden la reciben ` +
          `via \`parseOrden\` desde Firestore — cualquier campo no listado en esa ` +
          `IIFE se filtra silenciosamente. Bug histórico: SPRINT-159 persistió ` +
          `\`firmaClienteUrl\` + \`firmaClienteAt\` y SPRINT-168 agregó el render, ` +
          `pero el parser nunca los incluyó → 14 días en producción con firmas ` +
          `capturadas pero invisibles (QA E2E 2026-05-16 sobre OS-0058). ` +
          `Acción: agregá \`${key}: (cs.${key} as <tipo>) || undefined,\` (o ` +
          `\`parseFirestoreDate(cs.${key}) || undefined\` para timestamps) dentro ` +
          `del return de la IIFE de \`cierreServicio\` en parseOrden. ` +
          `Si el campo legítimamente NO debe leerse, agregalo a ` +
          `SKIP_CIERRESERVICIO_FIELDS con justificación.`,
      });
    }
    notes.push(
      `CierreServicio: ${cierreShape.keys.size} campos en tipo, ` +
      `${cierreParserKeys.size} campos en parseOrden.cierreServicio. ` +
      `Skip explícito: ${SKIP_CIERRESERVICIO_FIELDS.size}.`,
    );
  } else {
    notes.push(
      `CierreServicio ↔ parseOrden.cierreServicio: no cubierto en esta corrida ` +
      `(no se encontró el tipo o la IIFE). Si fue refactorizada, ajustar el cazador.`,
    );
  }

  // ─── Cobertura 3 (SPRINT-187-FIX2-HOTFIX): Cliente ↔ parseCliente ────────
  const clienteShape = extractInterfaceFields(typesContent, 'Cliente');
  const clienteParserKeys = extractParserReturnKeys(utilsContent, 'parseCliente');

  if (clienteShape && clienteParserKeys) {
    const missingCliente: string[] = [];
    for (const key of clienteShape.keys) {
      if (SKIP_CLIENTE_FIELDS.has(key)) continue;
      if (!clienteParserKeys.has(key)) missingCliente.push(key);
    }

    for (const key of missingCliente) {
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
          `El campo \`${key}\` está declarado en el tipo Cliente pero NO aparece ` +
          `en \`parseCliente\` (src/utils/index.ts). El \`onSnapshot\` de Clientes ` +
          `carga los docs con \`parseCliente(d.id, d.data())\` — cualquier campo ` +
          `no listado acá se filtra silenciosamente y los componentes lo reciben ` +
          `como \`undefined\`. Bug histórico: SPRINT-185 (\`a3b56bf\`) persistió ` +
          `\`eliminado/eliminadoEn/eliminadoPor/mergedaCon\` (soft-delete del dedup) ` +
          `pero \`parseCliente\` nunca los incluyó → el filtro \`c.eliminado !== true\` ` +
          `en Clientes.tsx:160 evaluaba \`undefined !== true === true\` y los ` +
          `soft-deleted seguían apareciendo en /admin/clientes hasta que QA visual ` +
          `sidepanel del 2026-05-18 cazó las 3 entradas "QA Test". TERCERA ` +
          `recurrencia del patrón P-009 en 5 días (parseFactura, ` +
          `parseOrden.cierreServicio, parseCliente). ` +
          `Acción: agregá \`${key}: (raw.${key} as <tipo>) || undefined,\` ` +
          `(o \`parseFirestoreDate(raw.${key}) || undefined\` para timestamps, o ` +
          `\`raw.${key} === true ? true : undefined\` para boolean estricto) al ` +
          `return de \`parseCliente\` con el cast correspondiente al tipo declarado. ` +
          `Si el campo legítimamente NO debe leerse del doc (campo derivado, etc.), ` +
          `agregalo a SKIP_CLIENTE_FIELDS con comentario de justificación.`,
      });
    }
    notes.push(
      `Cliente: ${clienteShape.keys.size} campos en tipo, ` +
      `${clienteParserKeys.size} campos en parseCliente. ` +
      `Skip explícito: ${SKIP_CLIENTE_FIELDS.size}.`,
    );
  } else {
    notes.push(
      `Cliente ↔ parseCliente: no cubierto en esta corrida ` +
      `(no se encontró el tipo o el parser). Si fue refactorizada, ajustar el cazador.`,
    );
  }

  notes.push(
    `Limitación: cubre Factura, CierreServicio y Cliente. Otros sub-objetos ` +
    `parseados de OrdenServicio (inicioChequeo, trackingGPS, cierreChequeoHistorico) ` +
    `y ServicioPrecio / PiezaInventario quedan como follow-up — ` +
    `materializar como sprint en COLA_AUTONOMA.md, NO como anotación ` +
    `(antiprecedente: recurrencias #2 y #3 ocurrieron sobre tipos listados como ` +
    `follow-up no materializado en versiones previas del cazador).`,
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
