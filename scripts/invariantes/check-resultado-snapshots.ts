/** P-040, 2026-09-29. Base 80f704d3833ddb9e37f0e2cc31d41cb8ac75dfa4:
 * salario actual se mostraba como costo histórico; riesgo doble comisión al usar snapshots.
 */
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import type { InvariantHit, InvariantResult } from './types.js';
const PATTERN_ID = 'P-040';
const PATTERN_NAME = 'Resultado histórico usa nóminas cerradas sin doble comisión';
const ALLOWLIST_FILES = new Set<string>(); // si crece >5, refactorear el cazador
export function check(): InvariantResult {
  const hits: InvariantHit[] = [];
  const file = 'src/services/estadoResultado.service.ts';
  if (!ALLOWLIST_FILES.has(file)) {
    const source = readFileSync(file, 'utf8'); const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
    function visitar(n: ts.Node) {
      if (ts.isVariableDeclaration(n) && n.initializer) {
        const nombre = n.name.getText(ast), valor = n.initializer.getText(ast);
        if ((nombre === 'sueldoBase' && /personal/.test(valor)) || (nombre === 'totalNomina' && /\btotalComisiones\b/.test(valor))) hits.push({ file, line: ast.getLineAndCharacterOfPosition(n.getStart(ast)).line + 1, snippet: n.getText(ast), explanation: 'Costo salarial histórico proviene de snapshots cerrados; salarios actuales solo referencia. totalComisiones devengadas es informativo: sumar únicamente comisionesNominaCerrada evita duplicar atrasadas.' });
      }
      ts.forEachChild(n, visitar);
    }
    visitar(ast);
  }
  return { patternId: PATTERN_ID, patternName: PATTERN_NAME, status: hits.length ? 'fail' : 'pass', hits };
}
if (import.meta.url === `file://${process.argv[1]}`) { const r = check(); console.log(JSON.stringify(r, null, 2)); process.exitCode = r.status === 'fail' ? 1 : 0; }
