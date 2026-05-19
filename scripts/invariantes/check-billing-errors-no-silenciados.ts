/**
 * P-019 — Catch que responde al cliente sobre código Meta sin logging,
 *         persistencia ni invocación a `manejarErrorMeta`.
 *
 * Bug original (anticipado, no histórico): SPRINT-WA-BILLING-VERIFY
 * (2026-05-19). Cazador preventivo. Sin él, una regresión típica sobre
 * `api/whatsapp/*.ts` es:
 *
 *   1. Un sprint agrega un nuevo path de error (ej. nuevo retry con catch).
 *   2. El catch responde con `res.status(502).json({ error: '...' })` SIN:
 *      a) loggear el evento con `console.error`,
 *      b) persistir el error en `whatsapp_errores_meta`, ni
 *      c) invocar `manejarErrorMeta` (que hace AMBAS y notifica admin).
 *   3. Resultado: Meta devuelve `131056` (billing) o similar, el endpoint
 *      responde 502 al frontend, el frontend muestra "no se pudo enviar",
 *      pero NADIE en oficina sabe que el sistema completo de WhatsApp está
 *      caído por billing. Cliente externo se queja → admin descubre el bug
 *      horas/días después.
 *
 * Causa raíz prevenida: error handling silencioso. Es trivial agregar un
 * catch que responda 502 — el dev futuro puede no notar que el patrón
 * canónico exige logging + persistencia. El cazador enforce el invariante.
 *
 * Regla: cualquier bloque `catch (...) { ... }` dentro de `api/whatsapp/*.ts`
 * (incluido helpers en `api/_lib/whatsapp*.ts`) que responda al cliente
 * (con `res.status(...)` o `res.json(...)` o `return res.`) DEBE contener
 * en el body del catch AL MENOS UNA de estas señales:
 *
 *   - `manejarErrorMeta(` — el helper canónico (hace 3-en-1: log + persist + notif).
 *   - `console.error(` — logging directo.
 *   - `escribirAuditoria` (cualquier identificador que empiece así, ej. `escribirAuditoriaSend`).
 *   - `db.collection('whatsapp_errores_meta')` o `collection('whatsapp_errores_meta')`.
 *
 * Si el catch NO responde al cliente (sólo loggea, sólo persiste, sólo
 * relanza), NO aplica la regla — es un catch interno de retry o similar.
 *
 * Allowlist por línea: tag `// @safe-meta-catch: <razón>` en la misma línea
 * o hasta 5 líneas arriba del `catch (` permite excluir el bloque.
 *
 * Allowlist por archivo: vacía al inicio. Si crece a >3 entradas,
 * refactorear el cazador (probablemente la regla está mal calibrada).
 *
 * Limitación conocida:
 *  - Detección heurística por regex sobre cada bloque `catch`. La
 *    extracción del body usa balanceo simple de llaves — funciona para
 *    catches estándar pero falla si hay strings con `{`/`}` literales muy
 *    largos. En la práctica los catches del repo son simples.
 *  - El cazador NO verifica que el orden sea correcto (log antes de
 *    response, etc.) — sólo presencia. Reviewer humano valida semánticamente.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { InvariantResult, InvariantHit } from './types.js';

const PATTERN_ID = 'P-019';
const PATTERN_NAME =
  'Error Meta swallowed sin logging/persistencia/notificación en catch que responde al cliente';
const ROOT_DIR = path.resolve(process.cwd());

/**
 * Globs de archivos a escanear. Cubrimos:
 *  - `api/whatsapp/*.ts` — todos los endpoints del módulo (webhook + send + crons futuros).
 *  - `api/_lib/whatsapp*.ts` — helpers compartidos (webhook parser, etc.).
 *
 * Adicionalmente, los archivos en `ARCHIVOS_EXTRA` se escanean explícitamente
 * (no caen en el patrón de prefix). Ej. `manejarErrorMeta.ts` — el helper
 * canónico mismo (paradójicamente también escaneado: si algún catch interno
 * del helper falla y devuelve al caller, debe loggear).
 */
const DIRS_A_ESCANEAR: ReadonlyArray<{ dir: string; prefix: string }> = [
  { dir: 'api/whatsapp', prefix: '' },
  { dir: 'api/_lib', prefix: 'whatsapp' },
];

const ARCHIVOS_EXTRA: readonly string[] = [
  'api/_lib/manejarErrorMeta.ts',
];

/**
 * Allowlist por archivo. Vacía al inicio. Si crece >3 entradas, refactorear
 * el cazador o introducir tags por línea más granulares.
 */
const ALLOWLIST_FILES: ReadonlySet<string> = new Set<string>();

/**
 * Señales que indican que el catch SÍ está haciendo algo con el error
 * (logging, persistencia o invocación al helper centralizado). Si NINGUNA
 * está presente en el body del catch + responde al cliente → FAIL.
 */
const SENALES_OK: RegExp[] = [
  /\bmanejarErrorMeta\s*\(/,
  /\bconsole\.error\s*\(/,
  /\bescribirAuditoria[A-Za-z_]*\s*\(/,
  /(?:db\.)?collection\s*\(\s*['"`]whatsapp_errores_meta['"`]/,
];

/**
 * Señales de que el catch responde al cliente. Si NINGUNA aparece, el catch
 * es interno (retry, log, rethrow) y NO aplica la regla.
 */
const SENALES_RESPONDE: RegExp[] = [
  /\bres\.status\s*\(/,
  /\bres\.json\s*\(/,
  /\bres\.send\s*\(/,
  /\bres\.end\s*\(/,
  /\breturn\s+res\b/,
];

// El tag exige razón non-trivial (≥10 chars totales — pueden incluir
// espacios) para evitar uso fantasma tipo `@safe-meta-catch: xxx` o
// `@safe-meta-catch: TODO`. Si querés allowlistear con razón corta,
// escribilo más completo.
const TAG_SAFE = /\/\/\s*@safe-meta-catch:\s*\S[\S ]{9,}/;

interface CatchBlock {
  file: string;
  startLine: number;
  body: string;
}

/**
 * Lista los archivos a escanear bajo los dirs configurados + ARCHIVOS_EXTRA.
 * Deduplica para que un archivo no se escanee dos veces si aparece en ambos.
 */
async function listarArchivos(): Promise<string[]> {
  const set = new Set<string>();
  for (const { dir, prefix } of DIRS_A_ESCANEAR) {
    const full = path.join(ROOT_DIR, dir);
    let entries: string[] = [];
    try {
      entries = await fs.readdir(full);
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!entry.endsWith('.ts')) continue;
      if (prefix && !entry.startsWith(prefix)) continue;
      const rel = path.join(dir, entry);
      if (ALLOWLIST_FILES.has(rel)) continue;
      set.add(rel);
    }
  }
  for (const rel of ARCHIVOS_EXTRA) {
    if (ALLOWLIST_FILES.has(rel)) continue;
    // Verificar existencia para no crashear si el archivo todavía no existe.
    try {
      const stat = await fs.stat(path.join(ROOT_DIR, rel));
      if (stat.isFile()) set.add(rel);
    } catch {
      // skip
    }
  }
  return Array.from(set).sort();
}

/**
 * Extrae todos los bloques `catch (...) { ... }` de un archivo. Usa balanceo
 * simple de llaves para encontrar el cierre del bloque. Retorna la línea de
 * inicio (1-based) + el body crudo del catch (entre las llaves).
 */
function extraerCatches(contenido: string, file: string): CatchBlock[] {
  const out: CatchBlock[] = [];
  // Match `catch (...)` o `catch {` (sin paréntesis, ES2019+).
  const re = /\bcatch\s*(?:\([^)]*\))?\s*\{/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(contenido)) !== null) {
    const startIdx = m.index;
    const openBrace = contenido.indexOf('{', startIdx);
    if (openBrace === -1) continue;
    // Balance simple de llaves desde openBrace.
    let depth = 1;
    let i = openBrace + 1;
    while (i < contenido.length && depth > 0) {
      const ch = contenido[i];
      if (ch === '{') depth++;
      else if (ch === '}') depth--;
      i++;
    }
    if (depth !== 0) continue; // no se cerró → skip
    const body = contenido.substring(openBrace + 1, i - 1);
    const startLine = contenido.substring(0, startIdx).split('\n').length;
    out.push({ file, startLine, body });
  }
  return out;
}

/**
 * Verifica si las líneas previas al catch contienen el tag de allowlist.
 * Ventana: la misma línea + hasta 5 líneas arriba.
 */
function tieneTagSafe(contenido: string, startLine: number): boolean {
  const lineas = contenido.split('\n');
  const desde = Math.max(0, startLine - 6);
  const hasta = Math.min(lineas.length, startLine);
  for (let i = desde; i < hasta; i++) {
    if (TAG_SAFE.test(lineas[i])) return true;
  }
  return false;
}

export async function check(): Promise<InvariantResult> {
  const hits: InvariantHit[] = [];
  const notes: string[] = [];

  const archivos = await listarArchivos();

  if (archivos.length === 0) {
    notes.push(
      'No se encontró ningún archivo bajo `api/whatsapp/` ni helpers `api/_lib/whatsapp*.ts`. PASS silent.',
    );
    return {
      patternId: PATTERN_ID,
      patternName: PATTERN_NAME,
      status: 'pass',
      hits,
      notes,
    };
  }

  let totalCatches = 0;
  let catchesQueResponden = 0;

  for (const rel of archivos) {
    const full = path.join(ROOT_DIR, rel);
    let contenido: string;
    try {
      contenido = await fs.readFile(full, 'utf8');
    } catch {
      continue;
    }
    const catches = extraerCatches(contenido, rel);
    totalCatches += catches.length;

    for (const c of catches) {
      // El catch responde al cliente?
      const responde = SENALES_RESPONDE.some((r) => r.test(c.body));
      if (!responde) continue;
      catchesQueResponden++;

      // Tiene alguna señal OK?
      const tieneSenal = SENALES_OK.some((r) => r.test(c.body));
      if (tieneSenal) continue;

      // Tag allowlist?
      if (tieneTagSafe(contenido, c.startLine)) continue;

      // Snippet de la primera línea del body para el reporte.
      const primeraLinea =
        c.body.split('\n').map((l) => l.trim()).filter((l) => l.length > 0)[0] ?? '(body vacío)';

      hits.push({
        file: c.file,
        line: c.startLine,
        snippet: primeraLinea.substring(0, 120),
        explanation:
          'Este `catch` responde al cliente (vía `res.status`/`res.json`/`return res.`) ' +
          'pero NO contiene ninguna de las señales requeridas: ' +
          '`manejarErrorMeta(...)`, `console.error(...)`, `escribirAuditoria*(...)`, ' +
          'o `db.collection(\'whatsapp_errores_meta\')`. Sin esto, errores billing/ban/spam ' +
          'de Meta caen silenciosamente al frontend sin que oficina se entere. ' +
          'Patrón canónico: invocar `manejarErrorMeta({ db, errorMeta, contexto: { fuente, wa_id, ... } })` ' +
          'antes de responder — hace logging + persistencia + notificación a admins ' +
          'en best-effort. Si el catch es legítimamente silencioso (raro), agregar ' +
          'tag `// @safe-meta-catch: <razón>` en la misma línea o hasta 5 arriba.',
      });
    }
  }

  notes.push(
    `Archivos escaneados: ${archivos.length} (${archivos.join(', ')}).`,
  );
  notes.push(
    `Catches totales: ${totalCatches}. Catches que responden al cliente: ${catchesQueResponden}. ` +
      `Hits: ${hits.length}.`,
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
