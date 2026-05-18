/**
 * P-015 — `orderBy('<campo>')` sobre `<col>` donde `<campo>` NO se persiste a
 *         nivel raíz en TODOS los paths de write de esa colección
 *
 * Bug original: SPRINT-178 (commit `bd2b2a8`, 2026-05-18). El helper
 * `buscarChequeoVigentePorCliente` en `src/services/ordenes.service.ts`
 * usaba `orderBy('fechaCierre', 'desc')` sobre `ordenes_servicio`. Pero el
 * wizard de cierre persistía `fechaCierre` DENTRO de `cierreServicio` (objeto
 * anidado, NO raíz), y `AgendaDia.tsx::handleCerrarChequeo` no escribía el
 * campo en absoluto. Firestore EXCLUYE silenciosamente del orderBy los docs
 * sin el campo de orden → la query retornaba vacío → el helper devolvía
 * `null` → el banner descuento NUNCA aparecía en producción. 12 horas de
 * feature inerte hasta que QA visual sidepanel del 2026-05-18 noche lo cazó.
 * Postmortem: `docs/postmortems/2026-05-18-banner-descuento-query-orderby-mal-escrita.md`.
 * Fix: SPRINT-187 commit `4890dfa` (helper sin orderBy + sort client-side +
 * forward fix de denormalización en ambos paths de write).
 *
 * Síntoma: `snap.empty === true` después de la query Firestore aunque
 * inspección manual del doc en Firestore Console muestra valores razonables.
 * NO hay error, NO hay warning — Firestore filtra los docs sin el campo de
 * orden y devuelve un resultado vacío como si no hubiera matches. Bug
 * latente que sólo se manifiesta cuando un doc real tiene el campo missing/
 * anidado/no-persistido.
 *
 * Causa raíz: las queries Firestore con `orderBy` tienen una asunción
 * implícita sobre el shape de los docs que NO está reflejada en el tipo TS
 * ni en el código de los writes. El typecheck NO captura "el orderBy
 * referencia un campo opcional/anidado que no todos los writes escriben".
 * Si el campo es opcional o se persiste anidado en un sub-objeto, la query
 * excluye los docs que lo tienen ausente — y el caller no lo nota porque
 * "snap.empty === true" parece "no hay datos" en lugar de "filtrados por
 * shape".
 *
 * Regla: cada `orderBy('<campo>', ...)` debe satisfacer al menos una de:
 *   (a) El par (colección, campo) está en el allowlist GUARANTEED_PAIRS
 *       (campo garantizado a nivel raíz por contadores transaccionales,
 *       convención del repo verificada, o helper centralizado que lo
 *       enforza en todos los paths).
 *   (b) La línea tiene un tag `@safe-orderby: <razón>` en la misma línea
 *       o hasta 5 líneas arriba (verificación humana en sprint).
 *
 * Estrategia (pragmática, NO AST completo):
 *
 *   1. Escanear `src/**\/*.{ts,tsx}` + `api/**\/*.ts` buscando llamadas
 *      `orderBy('<campo>'` (regex; ignora comentarios JSDoc y bloque).
 *   2. Para cada hit, buscar hacia atrás (mismo `query(...)` o función) el
 *      `collection(db, '<col>')` o `.collection('<col>')` literal más
 *      cercano. Si no se puede determinar la colección estáticamente
 *      (variable resuelta en runtime sin literal cercano), reportar como
 *      WARN con "no se pudo determinar colección" (no FAIL — no queremos
 *      bloquear refactors legítimos con const COL).
 *   3. Si el par (colección, campo) está en GUARANTEED_PAIRS → PASS silent.
 *      Si la línea tiene tag `@safe-orderby:` → PASS silent.
 *      En otro caso → FAIL con explicación + cómo extender allowlist o
 *      cómo justificar con tag.
 *
 * GUARANTEED_PAIRS — el alma del cazador. Cada entrada documenta:
 *   - Por qué el campo está garantizado en TODOS los paths de write.
 *   - Cómo verificar (qué grep correr si querés re-validar a mano).
 *
 * Para agregar una entrada nueva al allowlist (de un sprint que introduce
 * una colección o campo nuevos), el sprint owner debe:
 *   1. Verificar manualmente con `grep -rn "addDoc.*<col>\|setDoc.*<col>\|
 *      updateDoc.*<col>"` que TODOS los paths de write incluyen el campo.
 *   2. Documentar la verificación en el comentario inline de la entry.
 *
 * Limitación conocida:
 * - Cobertura por par literal `(col, campo)`. Si la colección está detrás
 *   de una variable (`const COL = 'foo'; query(collection(db, COL), orderBy('x'))`),
 *   el cazador no puede asociar — reporta WARN. Solución: usar literal o
 *   agregar `@safe-orderby` con sprint owner.
 * - NO valida cross-paths automáticamente. Es una whitelist humana, NO un
 *   linter dinámico. Aprendizaje del postmortem 2026-05-18: "Pesado de
 *   implementar full AST → variante pragmática: lista hardcoded de pares
 *   garantizados + comentario explicando cómo extender" (línea 82 del
 *   postmortem).
 * - Chain Admin SDK (`.orderBy('x')` en `api/`) se cubre con el mismo
 *   regex porque captura tanto `orderBy('x'` como `.orderBy('x'` por la
 *   misma frontera de palabra.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { InvariantResult, InvariantHit } from './types.js';

const PATTERN_ID = 'P-015';
const PATTERN_NAME =
  "orderBy('<campo>') sobre colección con shape no garantizado (campo opcional/anidado/missing en algún write path)";
const ROOT_DIR = path.resolve(process.cwd());
const SAFE_LINE_TAG = '@safe-orderby:';

/**
 * Allowlist de pares (colección, campo) donde el invariante "campo
 * persistido a nivel raíz en TODOS los paths de write" está verificado
 * manualmente. Cada entrada documenta por qué se confirma garantizado.
 *
 * Formato: clave `<col>:<campo>`.
 */
const GUARANTEED_PAIRS = new Map<string, string>([
  // ─── Campos universales del repo (timestamps + numero de contador) ─────
  // 'createdAt' está garantizado por convención del repo: TODOS los modales
  // y servicios que crean docs incluyen `createdAt: Timestamp.now()` o
  // `serverTimestamp()`. Si un futuro path no lo escribe, agregar tag
  // @safe-orderby o quitar este allowlist y migrar a tag.
  ['ordenes_servicio:createdAt', 'Convención del repo + verificado en todos los addDoc del modal de crear orden (useOrdenCreateForm.ts) + script de import calendar.'],
  ['clientes:createdAt', 'Convención del repo + addDoc en buscarOCrearCliente + script import calendar siempre incluye createdAt.'],
  ['calendarios:createdAt', 'Modal de crear calendario incluye createdAt; no hay otros paths de write.'],
  ['citas_por_confirmar:createdAt', 'addDoc desde formulario público (Agendar.tsx) + admin (Citas.tsx) ambos incluyen createdAt.'],
  ['cotizaciones:createdAt', 'addDoc desde Ordenes.tsx + Cotizaciones.tsx ambos incluyen createdAt.'],
  ['equipos_taller:createdAt', 'Modal de equipos taller único path de write incluye createdAt.'],
  ['facturas:createdAt', 'addDoc en FacturacionPendiente.tsx::handleGenerar incluye createdAt + numero transaccional.'],
  ['standby_piezas:createdAt', 'Standby.tsx::handleCrear incluye createdAt.'],

  // 'nombre' es campo obligatorio del schema para `personal`, `bancos`,
  // `precios_servicios`, `piezas_inventario` — no hay docs sin él porque
  // los modales lo exigen como required.
  ['personal:nombre', 'Required UI + Firestore rules permiten escritura solo si nombre ≠ undefined (validado UI-side).'],
  ['bancos:nombre', 'Modal de bancos UI exige nombre.'],
  ['precios_servicios:marca', 'Schema del catálogo de precios: marca + modelo es la PK lógica; todos los addDoc lo incluyen.'],
  ['piezas_inventario:nombre', 'Required UI en Inventario.tsx::handleCrear.'],

  // ─── Campos específicos verificados a mano ─────────────────────────────
  ['mantenimiento:proximaFecha', 'Modal de crear mantenimiento exige proximaFecha como required (Mantenimiento.tsx).'],
  ['gastos:fecha', 'Modal de gastos exige fecha como required (Gastos.tsx::handleSubmit).'],
  ['comisiones:fechaCobro', 'Comisión solo se crea via registrarComisionPorFactura/Items con fechaCobro siempre seteada.'],
  ['liquidaciones_nomina:fechaGeneracion', 'Liquidación se crea solo en Nomina.tsx::generarLiquidacion con fechaGeneracion = Timestamp.now().'],
  ['movimientos_piezas:fecha', 'Movimientos.service registra cada entrada/salida con fecha siempre seteada.'],
  ['ponches:timestamp', 'Ponches.service::registrarPonche siempre setea timestamp via serverTimestamp().'],
  ['ponches:fechaRD', 'Ponches.service::registrarPonche siempre setea fechaRD (string YYYY-MM-DD RD timezone).'],
  ['conversaciones_ia:ultimoMensajeAt', 'AsistenteIA service actualiza ultimoMensajeAt en cada mensaje del flujo (api/_lib/iaTools.ts).'],
  ['campanas_marketing:fecha', 'Campañas se crean solo via TabReactivacion con fecha = Timestamp.now() siempre.'],
]);

/**
 * Tags allowlist por línea adicional a GUARANTEED_PAIRS. Permite el caso
 * "esta query es legítima, ya verifiqué a mano, lo dejo documentado en el
 * código" sin tocar el cazador.
 */
function lineHasSafeTag(lines: string[], lineIdx: number): boolean {
  for (let i = Math.max(0, lineIdx - 5); i <= lineIdx; i++) {
    if (lines[i] && lines[i].includes(SAFE_LINE_TAG)) return true;
  }
  return false;
}

/**
 * Camina archivos `.ts`/`.tsx` recursivamente bajo `dir`. Excluye
 * node_modules, dist, scripts/, .next, etc.
 */
async function walkSource(dir: string, out: string[]): Promise<void> {
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const ent of entries) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (
        ent.name === 'node_modules' ||
        ent.name === 'dist' ||
        ent.name === 'dist-lazy' ||
        ent.name === '.next' ||
        ent.name === 'build' ||
        ent.name.startsWith('.')
      ) continue;
      await walkSource(full, out);
    } else if (
      ent.isFile() &&
      (ent.name.endsWith('.ts') || ent.name.endsWith('.tsx')) &&
      !ent.name.endsWith('.d.ts')
    ) {
      out.push(full);
    }
  }
}

/**
 * Strip line + block comments para evitar matchear orderBy mencionados
 * en JSDoc / comentarios explicativos.
 */
function stripComments(content: string): string {
  // Strip block comments primero.
  let out = '';
  let i = 0;
  while (i < content.length) {
    if (content[i] === '/' && content[i + 1] === '*') {
      const end = content.indexOf('*/', i + 2);
      if (end < 0) {
        // Bloque abierto sin cerrar — replace todo lo restante por whitespace
        // preservando newlines para que los numeros de línea no se desplacen.
        for (let j = i; j < content.length; j++) {
          out += content[j] === '\n' ? '\n' : ' ';
        }
        break;
      }
      // Reemplazar el bloque por whitespace + preserve newlines.
      for (let j = i; j < end + 2; j++) {
        out += content[j] === '\n' ? '\n' : ' ';
      }
      i = end + 2;
    } else if (content[i] === '/' && content[i + 1] === '/') {
      // Line comment — replace hasta el newline.
      while (i < content.length && content[i] !== '\n') {
        out += ' ';
        i++;
      }
    } else {
      out += content[i];
      i++;
    }
  }
  return out;
}

/**
 * Para una posición de match en `content`, buscar hacia atrás (en ~400
 * chars) el último `collection(db, '<col>')` o `.collection('<col>')`
 * literal. Retorna el nombre de la colección o null si no se encuentra.
 */
function findCollectionBefore(content: string, matchIdx: number): string | null {
  const start = Math.max(0, matchIdx - 400);
  const window = content.slice(start, matchIdx);
  // Match último (lookbehind manual): re.exec en loop hasta agotar.
  const re = /(?:collection\s*\(\s*\w+\s*,\s*|\.collection\s*\()\s*['"`]([a-zA-Z_][a-zA-Z0-9_]*)['"`]/g;
  let last: string | null = null;
  let m: RegExpExecArray | null;
  while ((m = re.exec(window)) !== null) {
    last = m[1];
  }
  return last;
}

export async function check(): Promise<InvariantResult> {
  const srcDir = path.join(ROOT_DIR, 'src');
  const apiDir = path.join(ROOT_DIR, 'api');
  const files: string[] = [];
  await walkSource(srcDir, files);
  await walkSource(apiDir, files);

  const hits: InvariantHit[] = [];
  const notes: string[] = [];
  let totalOrderBy = 0;
  let guaranteedCount = 0;
  let safeTagCount = 0;
  let warnCount = 0;

  // Match `orderBy('campo'` o `.orderBy('campo'` o `orderBy("campo"`.
  // El segundo argumento ('asc'|'desc') es opcional — solo nos interesa el campo.
  const orderByRe = /\borderBy\s*\(\s*['"`]([a-zA-Z_][a-zA-Z0-9_.]*)['"`]/g;

  for (const filePath of files) {
    let raw: string;
    try {
      raw = await fs.readFile(filePath, 'utf8');
    } catch {
      continue;
    }
    const stripped = stripComments(raw);
    const lines = raw.split('\n');

    let m: RegExpExecArray | null;
    orderByRe.lastIndex = 0;
    while ((m = orderByRe.exec(stripped)) !== null) {
      totalOrderBy++;
      const campo = m[1];
      // Calcular línea (1-indexed) en el archivo original a partir del
      // offset del match en `stripped`. Como stripComments preserva
      // newlines, los offsets calzan.
      const offset = m.index;
      let lineNo = 1;
      for (let j = 0; j < offset; j++) if (stripped[j] === '\n') lineNo++;
      const lineIdx = lineNo - 1;
      const fileRel = path.relative(ROOT_DIR, filePath);

      // ¿Tiene tag @safe-orderby cerca? Buscar en las líneas ORIGINALES
      // (raw), no en stripped — el tag VIVE en un comentario que
      // stripComments ya reemplazó por whitespace.
      if (lineHasSafeTag(lines, lineIdx)) {
        safeTagCount++;
        continue;
      }

      // Buscar la colección literal hacia atrás.
      const col = findCollectionBefore(stripped, offset);

      if (!col) {
        // No pudimos determinar la colección — WARN, no FAIL.
        warnCount++;
        hits.push({
          file: fileRel,
          line: lineNo,
          snippet: (lines[lineIdx] || '').trim(),
          explanation:
            `\`orderBy('${campo}')\` sin literal de colección cercano ` +
            `(<400 chars hacia atrás). Probable causa: la colección está ` +
            `detrás de una variable (\`const COL = ...; collection(db, COL)\`) ` +
            `o el helper que arma la query vive en otro archivo. El cazador ` +
            `P-015 no puede asociar (colección, campo) estáticamente. ` +
            `Acción: (a) usar literal de colección en el mismo bloque ` +
            `\`query(collection(db, '<col>'), orderBy('${campo}'))\`, O ` +
            `(b) agregar comentario \`// ${SAFE_LINE_TAG} <razón>\` en la ` +
            `misma línea del orderBy con sprint owner y verificación humana ` +
            `de que el campo se persiste a nivel raíz en TODOS los paths.`,
        });
        continue;
      }

      const key = `${col}:${campo}`;
      if (GUARANTEED_PAIRS.has(key)) {
        guaranteedCount++;
        continue;
      }

      // FAIL — par no garantizado y sin tag.
      hits.push({
        file: fileRel,
        line: lineNo,
        snippet: (lines[lineIdx] || '').trim(),
        explanation:
          `\`orderBy('${campo}')\` sobre colección \`${col}\` NO está en el ` +
          `allowlist GUARANTEED_PAIRS y NO tiene tag \`${SAFE_LINE_TAG}\`. ` +
          `Si el campo \`${campo}\` no se persiste a nivel raíz en TODOS los ` +
          `paths de write de \`${col}\` (\`addDoc\`/\`setDoc\`/\`updateDoc\`), ` +
          `Firestore EXCLUYE silenciosamente los docs sin el campo del ` +
          `orderBy → la query retorna vacío sin error. ` +
          `Bug histórico: SPRINT-178 (\`bd2b2a8\`) usó \`orderBy('fechaCierre')\` ` +
          `sobre \`ordenes_servicio\` pero la fecha se persistía en ` +
          `\`cierreServicio.fechaCierre\` anidado, NO raíz → 12h de feature ` +
          `inerte en producción. Postmortem: ` +
          `docs/postmortems/2026-05-18-banner-descuento-query-orderby-mal-escrita.md. ` +
          `Acción: ` +
          `(a) verificar a mano con \`grep -rn "addDoc.*${col}\\|setDoc.*${col}\\|updateDoc.*${col}"\` ` +
          `que TODOS los paths escriben \`${campo}\` a nivel raíz; si SÍ, ` +
          `agregá el par \`'${col}:${campo}'\` a GUARANTEED_PAIRS en ` +
          `scripts/invariantes/check-firestore-orderby-campo-no-persistido.ts ` +
          `con comentario justificando la verificación. ` +
          `(b) Si el campo es legítimamente opcional/anidado, reemplazar el ` +
          `\`orderBy\` por sort client-side post-snapshot (ver patrón en ` +
          `\`buscarChequeoVigentePorCliente\` de src/services/ordenes.service.ts ` +
          `post-fix \`4890dfa\`). ` +
          `(c) Si la query es one-off legítima con shape conocido en runtime, ` +
          `agregar tag \`// ${SAFE_LINE_TAG} <sprint + razón>\` arriba del ` +
          `\`orderBy\` con verificación humana documentada.`,
      });
    }
  }

  notes.push(
    `Escaneo: ${totalOrderBy} llamadas \`orderBy\` totales. ` +
    `${guaranteedCount} en allowlist GUARANTEED_PAIRS (${GUARANTEED_PAIRS.size} pares definidos). ` +
    `${safeTagCount} con tag \`${SAFE_LINE_TAG}\`. ` +
    `${warnCount} warn (sin colección literal cercana). ` +
    `${hits.length - warnCount} fail (no allowlist + no tag).`,
  );
  notes.push(
    `Limitación: pragmatic allowlist (NO full AST cross-reference). Si una ` +
    `colección está detrás de variable, el cazador reporta warn — agregar ` +
    `\`@safe-orderby:\` tag con razón o refactorizar a literal.`,
  );
  notes.push(
    `Para agregar par al allowlist, el sprint owner debe verificar manualmente ` +
    `con \`grep\` que TODOS los paths de write de la colección incluyen el ` +
    `campo a nivel raíz, y documentar la verificación en el comentario inline ` +
    `de la entry en GUARANTEED_PAIRS.`,
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
