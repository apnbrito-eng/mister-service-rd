/**
 * P-002 — Rule de inmutabilidad sobre campo opcional sin .get()
 *
 * Bug original: c7c8e34 (Reactivación rules, 2026-05-05).
 * Ver docs/PATRONES_REGRESION.md.
 *
 * Estrategia:
 * 1. Parsear firestore.rules buscando comparaciones del estilo
 *    `request.resource.data.X == resource.data.X` dentro de funciones de
 *    update/validación.
 * 2. Para cada hit, verificar que `X` aparezca en alguna lista de campos
 *    REQUIRED (heurística: aparece en `affectedKeys()` con `hasOnly` o en
 *    una validación `.keys().hasAll([...])`).
 * 3. Si X NO aparece como required → WARN/FAIL (debería usar `.get(field, null)`).
 * 4. Allowlist en el archivo: comentarios `// @safe-required: campoX, campoY`
 *    arriba de la rule indican que esos campos son required y la
 *    comparación directa es válida.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { InvariantResult, InvariantHit } from './types.js';

const PATTERN_ID = 'P-002';
const PATTERN_NAME = 'Rule de inmutabilidad sobre campo opcional sin .get()';
const ROOT_DIR = path.resolve(process.cwd());

export async function check(): Promise<InvariantResult> {
  const rulesPath = path.join(ROOT_DIR, 'firestore.rules');
  let content: string;
  try {
    content = await fs.readFile(rulesPath, 'utf8');
  } catch {
    return {
      patternId: PATTERN_ID,
      patternName: PATTERN_NAME,
      status: 'pass',
      hits: [],
      notes: ['firestore.rules no encontrado, skip.'],
    };
  }

  const lines = content.split('\n');
  const hits: InvariantHit[] = [];

  // Capturar campos marcados como @safe-required (allowlist por comentario)
  // Ej: `// @safe-required: titulo, descripcion`
  const safeRequired = new Set<string>();
  for (const line of lines) {
    const m = line.match(/@safe-required:\s*(.+)/);
    if (m) {
      m[1]
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
        .forEach((f) => safeRequired.add(f));
    }
  }

  // Regex: request.resource.data.X == resource.data.X (mismo X, sin .get())
  // No matchear `.get(`
  const directCmp = /request\.resource\.data\.(\w+)\s*==\s*resource\.data\.\1\b/g;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Excluir si la línea ya usa .get(
    if (line.includes('.get(')) continue;
    // Excluir comentarios
    const trimmed = line.trim();
    if (trimmed.startsWith('//')) continue;

    let m: RegExpExecArray | null;
    directCmp.lastIndex = 0;
    while ((m = directCmp.exec(line)) !== null) {
      const field = m[1];
      // Skip si está marcado como safe-required
      if (safeRequired.has(field)) continue;

      // Heurística: si en las ~30 líneas previas aparece `hasOnly([... '<field>' ...])`
      // o `hasAll([... '<field>' ...])`, asumimos que es required → safe.
      const start = Math.max(0, i - 30);
      const ctx = lines.slice(start, i).join('\n');
      const isRequired = new RegExp(
        `(hasOnly|hasAll)\\([^\\)]*['"]${field}['"]`,
        'm',
      ).test(ctx);
      if (isRequired) continue;

      hits.push({
        file: 'firestore.rules',
        line: i + 1,
        snippet: trimmed,
        explanation:
          `Campo "${field}" comparado directamente sin .get(). Si "${field}" es opcional ` +
          `(no garantizado present en el doc), Firestore Rules NO resuelve null==null para ` +
          `acceso directo y rechaza con permission-denied. ` +
          `Usá: request.resource.data.get('${field}', null) == resource.data.get('${field}', null). ` +
          `Si "${field}" SÍ es required, agregá comentario "// @safe-required: ${field}" en la rule. ` +
          `Bug original: c7c8e34 (2026-05-05).`,
      });
    }
  }

  return {
    patternId: PATTERN_ID,
    patternName: PATTERN_NAME,
    status: hits.length > 0 ? 'fail' : 'pass',
    hits,
    notes: [
      `Allowlist por comentario @safe-required: ${safeRequired.size} campos.`,
    ],
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  check().then((result) => {
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.status === 'fail' ? 1 : 0);
  });
}
