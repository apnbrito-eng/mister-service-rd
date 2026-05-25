/**
 * P-021 — Helper de comisión sin denormalización en doc factura
 *
 * Bug original (gotcha CLAUDE.md, no histórico-postmortem):
 * `registrarComisionPorFactura` y `registrarComisionesPorItems`
 * (definidos en `src/utils/comisiones.ts`) persisten en las colecciones
 * `comisiones` + `auditoria_admin` pero NO actualizan el doc factura.
 *
 * Si el caller olvida hacer `updateDoc(doc(db, 'facturas', id), {
 * comisionTecnicoMonto, comisionTecnicoNombre, comisionTecnicoId })`
 * post-llamada, la tabla de Facturas (`Facturas.tsx`) muestra `—`
 * aunque la comisión sí esté registrada en su colección.
 *
 * Patrón ya correcto en:
 *   - `FacturacionPendiente.tsx` post-`registrarComisionPorFactura`
 *   - `FacturaCrearModal.tsx` post-`registrarComisionesPorItems`
 *   - `ProcesarFacturacionModal.tsx` post-`registrarComisionesPorItems` y
 *     post-`registrarComisionPorFactura`
 *
 * Regla: cualquier archivo `.ts`/`.tsx` que llame a `registrarComisionPorFactura(`
 * o `registrarComisionesPorItems(` DEBE contener en alguna parte del mismo
 * archivo AL MENOS UNA de estas señales de denormalización:
 *   - `comisionTecnicoMonto`
 *   - `comisionTecnicoNombre`
 *   - `comisionTecnicoId`
 *
 * Si NO contiene ninguna → FAIL (el helper escribe a Firestore pero la UI
 * de Facturas no va a poder mostrar la comisión).
 *
 * Helpers EXENTOS (allowlist por archivo):
 *   - `src/utils/comisiones.ts` — define los helpers, no es caller.
 *   - tests/ — no aplica.
 *
 * Allowlist: si crece >3 entradas, refactorear (probablemente la regla
 * está mal calibrada).
 *
 * Falsos positivos esperados: ninguno conocido. Si aparecen, agregar
 * tag `// @safe-comision-no-denorm: <razón concreta>` en la misma línea
 * de la llamada al helper.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { InvariantResult, InvariantHit } from './types.js';

const PATTERN_ID = 'P-021';
const PATTERN_NAME =
  'Helper de comisión sin denormalización a campos comisionTecnicoMonto/Nombre/Id en doc factura';
const ROOT_DIR = path.resolve(process.cwd());

const HELPER_NAMES = ['registrarComisionPorFactura', 'registrarComisionesPorItems'];
const DENORM_FIELDS = ['comisionTecnicoMonto', 'comisionTecnicoNombre', 'comisionTecnicoId'];
const ALLOWLIST_FILES = new Set<string>([
  'src/utils/comisiones.ts', // define los helpers
]);

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
  for (const sub of ['src', 'api']) {
    await walk(path.join(ROOT_DIR, sub), targets);
  }

  const hits: InvariantHit[] = [];

  for (const file of targets) {
    const rel = path.relative(ROOT_DIR, file);
    if (ALLOWLIST_FILES.has(rel)) continue;
    const content = await fs.readFile(file, 'utf8');

    // Buscar llamadas a los helpers
    const lines = content.split('\n');
    const callsiteLines: { line: number; snippet: string; helper: string }[] = [];
    for (let i = 0; i < lines.length; i++) {
      const ln = lines[i];
      // ignore allowlist tag en la misma línea
      if (/@safe-comision-no-denorm:/.test(ln)) continue;
      for (const helper of HELPER_NAMES) {
        // matchear `await helper(` o `helper(` para excluir definiciones y
        // comments con la palabra. Una buena heurística es exigir paréntesis
        // open y excluir líneas que empiecen con `*` (jsdoc) o `//`.
        const trimmed = ln.trim();
        if (trimmed.startsWith('*') || trimmed.startsWith('//')) continue;
        const re = new RegExp(`\\b${helper}\\s*\\(`);
        if (re.test(ln)) {
          // ignore `export ... helper` (definición) — el helper se define con
          // `export async function helperName(args:` no con `helperName(args)`.
          // El archivo de definición está en allowlist; defensa adicional.
          if (/export\s+(async\s+)?function\s+/.test(ln)) continue;
          callsiteLines.push({ line: i + 1, snippet: ln.trim(), helper });
          break;
        }
      }
    }

    if (callsiteLines.length === 0) continue;

    // Verificar si el archivo contiene AL MENOS UN field de denormalización
    const tieneAlgunDenorm = DENORM_FIELDS.some((field) => {
      const re = new RegExp(`\\b${field}\\b`);
      return re.test(content);
    });

    if (!tieneAlgunDenorm) {
      for (const cs of callsiteLines) {
        hits.push({
          file: rel,
          line: cs.line,
          snippet: cs.snippet.slice(0, 120),
          explanation:
            `Llamada a "${cs.helper}" sin denormalización en doc factura. El helper ` +
            `escribe a las colecciones \`comisiones\` y \`auditoria_admin\` pero ` +
            `NO actualiza el doc factura. Sin denormalizar, la tabla de Facturas ` +
            `muestra "—" aunque la comisión exista. Patrón correcto: post-llamada, ` +
            `\`updateDoc(doc(db, 'facturas', id), { comisionTecnicoMonto, ` +
            `comisionTecnicoNombre, comisionTecnicoId })\`. ` +
            `Si la omisión es intencional (caso muy específico), agregar tag ` +
            `\`// @safe-comision-no-denorm: <razón concreta>\` en la línea de ` +
            `la llamada al helper.`,
        });
      }
    }
  }

  return {
    patternId: PATTERN_ID,
    patternName: PATTERN_NAME,
    status: hits.length > 0 ? 'fail' : 'pass',
    hits,
    notes: [
      `Escaneados ${targets.length} archivos en src/ y api/.`,
      `Helpers monitoreados: ${HELPER_NAMES.join(', ')}.`,
      `Fields de denormalización aceptados (al menos uno): ${DENORM_FIELDS.join(', ')}.`,
      `Allowlist: ${ALLOWLIST_FILES.size} archivos.`,
    ],
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  check().then((result) => {
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.status === 'fail' ? 1 : 0);
  });
}
