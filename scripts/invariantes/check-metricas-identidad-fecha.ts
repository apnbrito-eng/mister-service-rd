/** P-037 (2026-09-29), base 80f704d3833ddb9e37f0e2cc31d41cb8ac75dfa4:
 * métricas agrupaban homónimos y usaban updatedAt/estado pagada como cierre/cobro.
 */
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import type { InvariantHit, InvariantResult } from './types.js';
const PATTERN_ID = 'P-037';
const PATTERN_NAME = 'Métricas con identidad y fecha verificables';
const ALLOWLIST_FILES = new Set<string>(); // si crece >5, refactorear el cazador
export function check(): InvariantResult {
  const hits: InvariantHit[] = [];
  for (const nombre of ['MetricasMensuales', 'Rendimiento', 'ReporteAvanzado', 'Feedback']) {
    const file = `src/pages/${nombre}.tsx`;
    if (ALLOWLIST_FILES.has(file)) continue;
    const source = readFileSync(file, 'utf8');
    const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    function visitar(n: ts.Node) {
      if (ts.isBinaryExpression(n)) {
        const texto = n.getText(ast);
        const nombres = [ts.SyntaxKind.EqualsEqualsEqualsToken, ts.SyntaxKind.EqualsEqualsToken].includes(n.operatorToken.kind) && /\.(?:tecnicoNombre|clienteNombre|responsableNombre|creadoPor)\b/.test(texto) && /\.nombre\b|\.clienteNombre\b/.test(texto);
        const fechaActual = [ts.SyntaxKind.BarBarToken, ts.SyntaxKind.QuestionQuestionToken].includes(n.operatorToken.kind) && /fechaCobro/.test(n.left.getText(ast)) && /new Date\(\)/.test(n.right.getText(ast));
        const actualizado = /\.updatedAt\b/.test(texto) && [ts.SyntaxKind.GreaterThanEqualsToken, ts.SyntaxKind.LessThanEqualsToken].includes(n.operatorToken.kind);
        const pagada = [ts.SyntaxKind.EqualsEqualsEqualsToken, ts.SyntaxKind.EqualsEqualsToken].includes(n.operatorToken.kind) && /\.estado\b/.test(texto) && /['"]pagada['"]/.test(texto);
        if (nombres || fechaActual || actualizado || pagada) hits.push({ file, line: ast.getLineAndCharacterOfPosition(n.getStart(ast)).line + 1, snippet: texto, explanation: 'Relacionar por identidadPersonal única; fechas con fechaFinanciera/fechaCierreMetrica y cobros con proyectarCobrosCaja RAW. No usar nombre, updatedAt, hoy ni estado documental para atribuir resultados.' });
      }
      ts.forEachChild(n, visitar);
    }
    visitar(ast);
  }
  return { patternId: PATTERN_ID, patternName: PATTERN_NAME, status: hits.length ? 'fail' : 'pass', hits };
}
if (import.meta.url === `file://${process.argv[1]}`) { const r = check(); console.log(JSON.stringify(r, null, 2)); process.exitCode = r.status === 'fail' ? 1 : 0; }
