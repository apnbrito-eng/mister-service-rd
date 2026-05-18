/**
 * P-014 — `addDoc(collection(db, 'clientes'), ...)` o `setDoc(doc(db, 'clientes', ...))`
 *           sin guard previo por `telefonoNormalizado`.
 *
 * Bug original: SPRINT-185 (2026-05-18). La página `/admin/clientes`
 * (`src/pages/Clientes.tsx:301` pre-fix) usaba `addDoc` con auto-id,
 * ignorando la convención de `buscarOCrearCliente` (ID = telefonoNormalizado).
 * Resultado: 2+ docs de clientes con mismo teléfono normalizado quedaron
 * en producción (caso "QA Test" detectado en QA puntual SPRINT-178 2026-05-18).
 * El descuento de chequeo previo no aplicó para órdenes asociadas a
 * `clienteId` distintos del mismo cliente físico.
 *
 * Síntoma: typeahead muestra 2 entradas idénticas con mismo tel; queries
 * cross-collection por `clienteId` fragmentan datos del mismo cliente
 * físico; métricas (servicios totales, historial) infrareportan.
 *
 * Causa raíz: la página de alta NO delegaba al helper `buscarOCrearCliente`
 * que ya tenía el guard correcto. Cualquier `addDoc` o `setDoc` directo
 * a `clientes` desde código nuevo bypassa el guard si no se hace explícito.
 *
 * Regla: cualquier write a `clientes` (alta nueva) en `src/` debe pasar
 * por uno de:
 *   - `buscarOCrearCliente()` del service (idempotente por telNorm).
 *   - `crearOActualizarClienteDesdeCita()` del service (idempotente).
 *   - `setDoc(doc(db, 'clientes', telNorm), ...)` con `telNorm` derivado
 *     de `normalizarTelefono(...)` (no auto-id).
 *   - `addDoc` solo si el caller ANTES llama `buscarClientePorTelefono`
 *     y bloquea si retorna != null.
 *
 * Estrategia (determinística):
 *
 *   1. Buscar en `src/**` apariciones de:
 *      - `addDoc(collection(db, 'clientes'), ...)` (cualquier mayúscula minúscula no — literal).
 *      - `setDoc(doc(db, 'clientes', <expr>), ...)` donde `<expr>` NO incluya
 *        `telNorm` o `normalizar` (heurística — cubre falsos positivos
 *        con allowlist explícita por línea).
 *   2. Para cada hit:
 *      a. Si el archivo es el service canónico (`src/services/clientes.service.ts`),
 *         skip (es donde el helper VIVE).
 *      b. Si hay tag `// @safe-cliente-create: <razón>` en la línea o 5 arriba,
 *         skip.
 *      c. Else, reportar hit.
 *
 * Allowlist por archivo: vacía. El service canónico se exime por path.
 *
 * Falsos positivos esperados (deben usar allowlist con razón):
 * - `setDoc(doc(db, 'clientes', telNorm), ...)` donde `telNorm` viene de
 *   `normalizarTelefono` arriba — el regex captura el literal "clientes"
 *   pero el id es seguro. Heurística: si la línea misma o las 5 arriba
 *   contienen `normalizarTelefono` o `telNorm`, NO es hit (auto-allowed).
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { InvariantResult, InvariantHit } from './types.js';

const PATTERN_ID = 'P-014';
const PATTERN_NAME =
  "addDoc/setDoc a 'clientes' sin guard de telefonoNormalizado";
const ROOT_DIR = path.resolve(process.cwd());

const ALLOWLIST_FILES: Set<string> = new Set([
  // El service canónico es donde el helper vive — exento por diseño.
  'src/services/clientes.service.ts',
  // El seed dev escribe con telNorm como id explícitamente.
  'src/firebase/seedData.ts',
]);

const SAFE_LINE_TAG = '@safe-cliente-create:';

/** Regex que matchea las dos formas problemáticas. */
const RE_ADDDOC = /\baddDoc\s*\(\s*collection\s*\(\s*db\s*,\s*['"]clientes['"]\s*\)/;
const RE_SETDOC = /\bsetDoc\s*\(\s*doc\s*\(\s*db\s*,\s*['"]clientes['"]\s*,/;

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

  for (const file of files) {
    const rel = path.relative(ROOT_DIR, file);
    if (ALLOWLIST_FILES.has(rel)) continue;

    const content = await fs.readFile(file, 'utf8');
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const matchAdd = RE_ADDDOC.test(line);
      const matchSet = RE_SETDOC.test(line);
      if (!matchAdd && !matchSet) continue;

      // Allowlist por tag.
      const windowStart = Math.max(0, i - 5);
      const ventana = lines.slice(windowStart, i + 1).join('\n');
      if (ventana.includes(SAFE_LINE_TAG)) continue;

      // Heurística auto-allow: si el setDoc/addDoc tiene `telNorm` o
      // `normalizarTelefono` cerca (líneas arriba en la misma función),
      // probablemente el caller ya hizo el guard. Buscamos en una ventana
      // más ancha (20 líneas arriba).
      const ventanaAncha = lines.slice(Math.max(0, i - 20), i + 1).join('\n');
      const tieneNormalizacion =
        /\bnormalizarTelefono\s*\(/.test(ventanaAncha) ||
        /\btelNorm\b/.test(ventanaAncha);
      const tieneGuard =
        /\bbuscarClientePorTelefono\s*\(/.test(ventanaAncha) ||
        /\bbuscarOCrearCliente\s*\(/.test(ventanaAncha);

      // setDoc con id explícito derivado de telNorm + guard previo → ok.
      if (matchSet && tieneNormalizacion && tieneGuard) continue;
      // addDoc nunca es safe sin guard (el id es auto-generado).
      // setDoc sin normalización ni guard tampoco.

      hits.push({
        file: rel,
        line: i + 1,
        snippet: line.trim(),
        explanation:
          `Write a 'clientes' sin guard de \`telefonoNormalizado\`. ` +
          `Riesgo: 2+ docs con mismo tel físico (bug SPRINT-185, caso QA Test). ` +
          `Solución: usar \`buscarOCrearCliente()\` del service o anteponer ` +
          `\`const existente = await buscarClientePorTelefono(tel); if (existente) { ... }\` ` +
          `+ usar \`setDoc(doc(db, 'clientes', telNorm), ...)\` con id explícito. ` +
          `Si este caller ya hace el guard de forma no detectada por el cazador, ` +
          `agregá \`// ${SAFE_LINE_TAG} <razón>\` en la misma línea o hasta 5 arriba.`,
      });
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
