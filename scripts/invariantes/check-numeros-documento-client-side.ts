/**
 * P-022 — Números de documento (OS/QT/CG/FAC) generados client-side
 *
 * Bug original (gotcha CLAUDE.md, riesgo activo): OS-####, QT-#####, CG-#####
 * son secuencias atómicas transaccionales generadas únicamente por
 * `src/services/contadores.service.ts` (`siguienteNumeroOrden`,
 * `siguienteNumeroCotizacion`, `siguienteNumeroFactura`).
 *
 * Si un dev genera el número client-side (ej. `\`OS-\${Date.now()}\``,
 * `Math.random()`, padding manual sobre un contador en localStorage),
 * crea duplicados o gaps que rompen:
 *   - la auditoría (números no son secuenciales).
 *   - DGII downstream (Conduces con número repetido).
 *   - búsquedas por número (filtros de UI esperan formato exacto).
 *
 * El único lugar legítimo para construir el literal `OS-XXXX` /
 * `CG-XXXXX` / `QT-XXXXX` / `FAC-XXXXX` es:
 *   - `src/services/contadores.service.ts` (origen oficial).
 *   - hard-coded strings de UI (`"OS-####"`, `"Ej. OS-0001"`) en placeholder.
 *   - regex de validación o testing.
 *
 * Regla: cualquier archivo `.ts`/`.tsx` que contenga una template literal
 * `\`(OS|QT|CG|FAC)-...\${...}...\`` donde el `${...}` NO sea evidentemente
 * el resultado de `await siguiente...()` → FAIL.
 *
 * Heurística: matcheamos `` `(OS|QT|CG|FAC)-${...}` `` y excluimos:
 *   - `contadores.service.ts` (definición legítima — allowlist por archivo).
 *   - líneas con tag `// @safe-numero-doc: <razón>`.
 *
 * Los strings literales sin interpolación (ej. placeholder `"OS-0001"`,
 * ejemplos en docs) NO matchean — el patrón exige `${`.
 *
 * Allowlist por archivo: si crece >2, refactorear el cazador.
 *
 * Limitaciones conocidas:
 *  - NO detecta concatenación con `+` (ej. `'OS-' + padStart(...)`).
 *    Si aparece en producción, extender heurística.
 *  - NO valida que el helper sea exactamente el de `contadores.service` —
 *    sólo bloquea construcción inline. Confiar en code review para el
 *    caso de "función helper local que padea sin usar transaction".
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { InvariantResult, InvariantHit } from './types.js';

const PATTERN_ID = 'P-022';
const PATTERN_NAME =
  'Número de documento (OS/QT/CG/FAC) generado client-side fuera de contadores.service';
const ROOT_DIR = path.resolve(process.cwd());

const ALLOWLIST_FILES = new Set<string>([
  'src/services/contadores.service.ts',
  // tests/scripts pueden hardcodear números para datos de prueba — agregar acá
  // específicamente si aparecen, con justificación.
]);

// Matchea `OS-${...}`, `QT-${...}`, `CG-${...}`, `FAC-${...}` dentro de
// template literals (backticks). El `[\s\S]*?` permite cualquier texto
// dentro del template, incluyendo padStart, expresiones, etc.
const REGEX = /`[^`]*\b(OS|QT|CG|FAC)-\$\{[\s\S]*?`/g;

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
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const ln = lines[i];
      // Ignorar comments
      const trimmed = ln.trim();
      if (trimmed.startsWith('*') || trimmed.startsWith('//')) continue;
      // Allowlist por tag — busca en la misma línea o hasta 3 líneas arriba
      // (cubre `{/* @safe-numero-doc: ... */}` en JSX y `// @safe-numero-doc: ...`
      // arriba de funciones deprecated).
      const prevCtx = lines.slice(Math.max(0, i - 3), i + 1).join('\n');
      if (/@safe-numero-doc:/.test(prevCtx)) continue;

      // Reset regex state (global flag)
      REGEX.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = REGEX.exec(ln)) !== null) {
        const prefix = m[1]; // OS | QT | CG | FAC
        hits.push({
          file: rel,
          line: i + 1,
          snippet: ln.trim().slice(0, 150),
          explanation:
            `Construcción client-side de número "${prefix}-..." con template ` +
            `literal e interpolación. Los números de documento (OS, QT, CG, FAC) ` +
            `son secuencias atómicas transaccionales y SOLO deben generarse vía ` +
            `\`src/services/contadores.service.ts\` (\`siguienteNumeroOrden()\`, ` +
            `\`siguienteNumeroCotizacion()\`, \`siguienteNumeroFactura()\`). ` +
            `Generarlos en otro lado causa duplicados o gaps que rompen la ` +
            `auditoría y la integridad con DGII. Si el caso es intencional ` +
            `(ej. mostrar formato esperado en placeholder UI), agregar tag ` +
            `\`// @safe-numero-doc: <razón>\` en la misma línea.`,
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
      `Único origen legítimo: src/services/contadores.service.ts.`,
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
