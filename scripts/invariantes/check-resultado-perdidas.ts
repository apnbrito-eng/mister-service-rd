/** P-031, 2026-09-29: utilidad bruta negativa se truncaba a cero. Hash original/fix pendiente del commit del coordinador. */
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import type { InvariantHit, InvariantResult } from './types.js';
const PATTERN_ID = 'P-031';
const PATTERN_NAME = 'Resultado conserva pérdidas';
const ALLOWLIST_FILES = new Set<string>(); // si crece >5, refactorear el cazador
export function check(): InvariantResult {
  const hits: InvariantHit[] = [];
  const file = 'src/services/estadoResultado.service.ts';
  if (!ALLOWLIST_FILES.has(file)) {
    const texto = readFileSync(file, 'utf8');
    const ast = ts.createSourceFile(file, texto, ts.ScriptTarget.Latest, true);
    let encontrada = false;
    const visitar = (n: ts.Node) => {
      if (ts.isVariableDeclaration(n) && n.name.getText(ast) === 'utilidadBruta') {
        encontrada = true;
        const valor = n.initializer;
        if (!valor || !ts.isBinaryExpression(valor) || valor.operatorToken.kind !== ts.SyntaxKind.MinusToken || valor.left.getText(ast) !== 'ventasNetas' || valor.right.getText(ast) !== 'costoPiezas') {
          hits.push({ file, line: ast.getLineAndCharacterOfPosition(n.getStart(ast)).line + 1, snippet: n.getText(ast), explanation: 'La utilidad bruta debe conservar ventasNetas - costoPiezas, incluso negativa. Math.max(0, ...) ocultaba pérdidas y alteraba utilidad operativa.' });
        }
      }
      ts.forEachChild(n, visitar);
    };
    visitar(ast);
    if (!encontrada) hits.push({ file, line: 1, snippet: 'utilidadBruta ausente', explanation: 'Si se mueve el cálculo, actualizar este cazador y mantener la prueba de pérdidas; no dejar sin vigilancia el nuevo cálculo.' });
  }
  return { patternId: PATTERN_ID, patternName: PATTERN_NAME, status: hits.length ? 'fail' : 'pass', hits };
}
if (import.meta.url === `file://${process.argv[1]}`) { const r = check(); console.log(JSON.stringify(r, null, 2)); process.exitCode = r.status === 'fail' ? 1 : 0; }
