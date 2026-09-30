/**
 * P-010 — Tipo de notificación declarado en TipoNotificacion sin call site emisor
 *
 * Bug original: SPRINT-169 (2026-05-15). Hash del fix: pendiente al momento de
 * crear este cazador (se commitea junto). El tipo `'orden_asignada'` quedó
 * declarado en `src/types/index.ts` `TipoNotificacion` desde una sesión previa
 * (likely SPRINT-157/158 redacción inicial) pero ningún `crearNotificacion({
 * tipo: 'orden_asignada', ... })` se emite desde el código. SPRINT-163 fue
 * marcado COMPLETADO en `docs/sprints/COLA_AUTONOMA.md` pero NUNCA produjo
 * commit que implementara el call site — git log no contiene referencia a
 * SPRINT-163 ni a "orden_asignada" en mensajes de commit. Síntoma reportado
 * en QA E2E distribuido 2026-05-14: ninguna campanita recibe la noti al crear
 * OS-0056. Postmortem:
 * `docs/postmortems/2026-05-15-orden-asignada-regresion-sprint-163-no-commit.md`.
 *
 * Síntoma: feature de notificación parece completa en código (tipo declarado,
 * service correcto, rule correcta) pero en producción nunca llega. NO hay
 * error, NO hay warning, NO hay request rojo en Network — simplemente nadie
 * llama a `crearNotificacion` con ese tipo, y los destinatarios reales no
 * tienen forma de saber que falta. Detección requiere que un humano se dé
 * cuenta de la ausencia (semanas/meses después típicamente).
 *
 * Causa raíz: `TipoNotificacion` es una unión de strings literales en
 * `src/types/index.ts`. Cualquiera puede agregar un valor nuevo "de bandera"
 * (anticipando un feature) sin agregar el call site correspondiente. TypeScript
 * no obliga a usar todos los valores de un union type — solo verifica que los
 * que se usan estén en la unión. Resultado: drift silencioso entre "tipos
 * declarados" y "tipos efectivamente emitidos".
 *
 * Regla: cada valor de la unión `TipoNotificacion` debe aparecer al menos una
 * vez como literal `'<valor>'` en `tipo:` dentro de un bloque
 * `crearNotificacion({...})` en `src/` o `api/`. Si no aparece, o es deuda
 * (planificado pero no implementado — agregar a allowlist con sprint
 * referenciado) o es feature huérfano que se debe limpiar.
 *
 * Estrategia (determinística):
 *
 * 1. Leer `src/types/index.ts` y extraer la unión `TipoNotificacion = | 'a' | 'b' | ...`.
 * 2. Buscar en `src/**` y `api/**` todas las apariciones de `crearNotificacion({...})`
 *    y extraer con AST los valores literales de `tipo:`, incluyendo ambas ramas
 *    de expresiones ternarias (sin contar strings de la condición).
 *    También captura usos transitivos: `crearNotificacion({ tipo, ... })` con
 *    `tipo` como variable se omite del análisis (el cazador no resuelve el
 *    flujo de la variable — esos casos quedan como "potencialmente cubiertos"
 *    pero no contribuyen al match).
 * 3. Para cada tipo declarado que NO aparezca como literal emitido, reportar
 *    como hit (salvo allowlist).
 *
 * Limitación conocida: si un call site emite `tipo: tipoVar` con `tipoVar`
 * resuelto en runtime a un valor del union, el cazador NO lo cuenta como
 * cobertura. Esto puede producir falso positivo si la única emisión de un
 * tipo es transitiva. Mitigación: documentar con allowlist (`// emit
 * dinámico desde X.tsx — ver SPRINT-Y`).
 *
 * Allowlist por tipo (con sprint referenciado):
 *   - 'otro' — catch-all genérico, emitido dinámicamente; sin sprint owner.
 *   - 'recordatorio' — emitido desde `scripts/cron-recordatorios.ts` (server-side,
 *     fuera del scope del cazador que solo escanea `src/` + `api/`); deuda
 *     histórica documentada.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import * as ts from 'typescript';
import { InvariantResult, InvariantHit } from './types.js';

const PATTERN_ID = 'P-010';
const PATTERN_NAME =
  'Tipo de notificación declarado en TipoNotificacion sin call site emisor';

// Tipos que conocemos NO se emiten desde `src/` o `api/` por razones legítimas.
// Cada entrada debe documentar el sprint/owner que justifica la ausencia.
const ALLOWLIST: Record<string, string> = {
  otro: 'catch-all genérico, sin owner específico',
  recordatorio:
    'emitido desde scripts/cron-recordatorios.ts (server-side, fuera de scope)',
  reclamo_garantia:
    'deuda priorizada: tipo declarado para futura noti al admin/coord cuando '
    + 'cliente abre reclamo desde /garantia/:token (api/garantia/[token].ts ya '
    + 'crea cita con origen=reclamo_garantia + audit log; falta noti in-app). '
    + 'Owner: sprint dedicado a flujo de reclamo de garantía (NO incluido en '
    + 'SPRINT-174, que solo cubrió precio_aprobado/cotizacion_lista/cierre_completado/'
    + 'pago_registrado).',
};

const REPO_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..');

async function readFile(rel: string): Promise<string> {
  return fs.readFile(path.join(REPO_ROOT, rel), 'utf8');
}

/**
 * Extrae los valores de la unión `TipoNotificacion = ...` de types/index.ts.
 * Patrón esperado:
 *   export type TipoNotificacion =
 *     | 'a'
 *     | 'b'
 *     ...
 */
function extraerTiposDeclarados(src: string): string[] {
  const idx = src.indexOf('TipoNotificacion');
  if (idx < 0) return [];
  // A partir de "TipoNotificacion", buscar el primer `=` y leer hasta el `;`
  const tail = src.slice(idx);
  const eqIdx = tail.indexOf('=');
  if (eqIdx < 0) return [];
  const semiIdx = tail.indexOf(';', eqIdx);
  const body = tail.slice(eqIdx + 1, semiIdx > 0 ? semiIdx : tail.length);
  const re = /'([a-zA-Z0-9_-]+)'/g;
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    out.push(m[1]);
  }
  return out;
}

/**
 * Escanea recursivamente un dir y retorna paths relativos a REPO_ROOT.
 */
async function walk(rel: string, exts: string[]): Promise<string[]> {
  const out: string[] = [];
  const abs = path.join(REPO_ROOT, rel);
  let entries: import('node:fs').Dirent[];
  try {
    entries = await fs.readdir(abs, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const child = path.join(rel, e.name);
    if (e.isDirectory()) {
      if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
      out.push(...(await walk(child, exts)));
    } else if (exts.some(x => e.name.endsWith(x))) {
      out.push(child);
    }
  }
  return out;
}

/**
 * Busca tipos emitidos en un archivo:
 *   - dentro de bloques `crearNotificacion({...})`: extrae literales de tipo
 *     directo o condicional; ignora comentarios y condiciones del ternario.
 *   - en archivos que escriben directo a la colección `notificaciones` (api
 *     serverless con Admin SDK, ej: `db.collection('notificaciones').add(...)`):
 *     extrae cualquier `tipo: '<v>'` literal del archivo. Heurística — los
 *     archivos en `api/` con esa firma tienden a tener un único `tipo:` por
 *     bloque, y el costo de falso positivo es bajo (un tipo extra cuenta como
 *     "cubierto" pero el cazador igual sirve para detectar tipos huérfanos).
 */
export function extraerTiposEmitidos(src: string, filePath: string): Set<string> {
  const out = new Set<string>();
  if (!/\btipo\s*:/.test(src)) return out;
  const referenciaColeccion = /collection\(\s*['"]notificaciones['"]\s*\)/;
  // Conserva el alcance Admin SDK anterior; el AST evita comentarios y distingue
  // las ramas resultantes del ternario de los strings usados en su condición.
  const archivo = ts.createSourceFile(filePath, src, ts.ScriptTarget.Latest, true,
    filePath.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  let emisionTransaccional = false;
  const detectarTransaccion = (n: ts.Node): void => {
    if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression)
      && ts.isIdentifier(n.expression.expression) && n.expression.expression.text === 'tx' && n.expression.name.text === 'set') {
      const ref = n.arguments[0];
      if (ref && ts.isCallExpression(ref) && ts.isIdentifier(ref.expression) && ref.expression.text === 'doc'
        && ref.arguments[1] && ts.isStringLiteral(ref.arguments[1]) && ref.arguments[1].text === 'notificaciones') emisionTransaccional = true;
    }
    ts.forEachChild(n, detectarTransaccion);
  };
  detectarTransaccion(archivo);
  const emisionAdmin = referenciaColeccion.test(src) || filePath.startsWith('api/') || emisionTransaccional;
  function extraerValor(valor: ts.Expression): void {
    if (ts.isStringLiteral(valor) || ts.isNoSubstitutionTemplateLiteral(valor)) {
      out.add(valor.text);
    } else if (ts.isConditionalExpression(valor)) {
      extraerValor(valor.whenTrue);
      extraerValor(valor.whenFalse);
    } else if (ts.isParenthesizedExpression(valor) || ts.isAsExpression(valor) || ts.isSatisfiesExpression(valor) || ts.isTypeAssertionExpression(valor)) {
      extraerValor(valor.expression);
    }
    // Variables y llamadas dinámicas siguen sin atribuirse a un tipo literal.
  }
  function recorrer(nodo: ts.Node, dentroEmision = false): void {
    const llamadaEmisora = ts.isCallExpression(nodo)
      && ts.isIdentifier(nodo.expression) && nodo.expression.text === 'crearNotificacion';
    const emite = dentroEmision || llamadaEmisora;
    if ((emisionAdmin || emite) && ts.isPropertyAssignment(nodo)
      && (ts.isIdentifier(nodo.name) || ts.isStringLiteral(nodo.name)) && nodo.name.text === 'tipo') {
      extraerValor(nodo.initializer);
    }
    ts.forEachChild(nodo, hijo => recorrer(hijo, emite));
  }
  recorrer(archivo);
  return out;
}

export async function check(): Promise<InvariantResult> {
  const hits: InvariantHit[] = [];
  const notes: string[] = [];

  // 1. Tipos declarados
  const typesSrc = await readFile('src/types/index.ts');
  const declarados = extraerTiposDeclarados(typesSrc);
  if (declarados.length === 0) {
    return {
      patternId: PATTERN_ID,
      patternName: PATTERN_NAME,
      status: 'warn',
      hits: [],
      notes: ['No se pudo extraer TipoNotificacion de src/types/index.ts. Revisar parser.'],
    };
  }
  notes.push(`Tipos declarados: ${declarados.length}`);

  // 2. Tipos emitidos (escaneando src/ y api/)
  const archivos = [
    ...(await walk('src', ['.ts', '.tsx'])),
    ...(await walk('api', ['.ts'])),
  ];
  const emitidos = new Set<string>();
  for (const rel of archivos) {
    const contenido = await readFile(rel);
    const tipos = extraerTiposEmitidos(contenido, rel);
    for (const t of tipos) emitidos.add(t);
  }
  notes.push(`Tipos emitidos (literal): ${emitidos.size}`);

  // 3. Reportar tipos huérfanos (declarados pero no emitidos), excluyendo allowlist
  for (const tipo of declarados) {
    if (emitidos.has(tipo)) continue;
    if (tipo in ALLOWLIST) continue;
    hits.push({
      file: 'src/types/index.ts',
      line: 0, // posición exacta no calculada — el tipo está en la unión TipoNotificacion
      snippet: `'${tipo}' declarado pero sin crearNotificacion({ tipo: '${tipo}' })`,
      explanation:
        `El tipo '${tipo}' está en la unión TipoNotificacion pero ningún ` +
        `call site lo emite. O es deuda (agregar a ALLOWLIST con sprint owner) ` +
        `o un sprint dejó el tipo huérfano sin implementar el call site. ` +
        `Ver patrón P-010 en docs/PATRONES_REGRESION.md.`,
    });
  }

  return {
    patternId: PATTERN_ID,
    patternName: PATTERN_NAME,
    status: hits.length > 0 ? 'fail' : 'pass',
    hits,
    notes,
  };
}
