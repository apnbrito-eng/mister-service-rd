/** P-032, 2026-09-29: fechaCobro ausente se convertía en hoy; hash del fix pendiente de coordinador. */
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import type { InvariantHit, InvariantResult } from './types.js';
const PATTERN_ID = 'P-032';
const PATTERN_NAME = 'Fechas financieras sin fecha inventada';
const ALLOWLIST_FILES = new Set<string>(); // si crece >5, refactorear el cazador
export function check(): InvariantResult {
  const hits: InvariantHit[] = [];
  for (const file of ['src/services/nomina.service.ts', 'src/services/estadoResultado.service.ts', 'src/pages/Comisiones.tsx']) {
    if (ALLOWLIST_FILES.has(file)) continue;
    const texto = readFileSync(file, 'utf8');
    const ast = ts.createSourceFile(file, texto, ts.ScriptTarget.Latest, true, file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    const agregar = (n: ts.Node, explanation: string) => hits.push({ file, line: ast.getLineAndCharacterOfPosition(n.getStart(ast)).line + 1, snippet: n.getText(ast), explanation });
    function visitar(n: ts.Node) {
      if (ts.isBinaryExpression(n) && [ts.SyntaxKind.BarBarToken, ts.SyntaxKind.QuestionQuestionToken].includes(n.operatorToken.kind) && /fechaCobro/.test(n.left.getText(ast)) && /new Date\s*\(\s*\)/.test(n.right.getText(ast))) agregar(n, 'No reemplazar fecha de devengo desconocida por hoy. Usar fechaFinanciera(raw.fechaCobro) y enviar null a conciliación.');
      if (file.endsWith('Comisiones.tsx') && ts.isCallExpression(n) && n.expression.getText(ast) === 'orderBy' && n.arguments[0] && /fechaCobro/.test(n.arguments[0].getText(ast))) agregar(n, 'orderBy fechaCobro oculta los documentos sin fecha. Leer la colección con gate admin/coordinadora y ordenar después del parseo para mostrar conciliación.');
      ts.forEachChild(n, visitar);
    }
    visitar(ast);
  }
  return { patternId: PATTERN_ID, patternName: PATTERN_NAME, status: hits.length ? 'fail' : 'pass', hits };
}
if (import.meta.url === `file://${process.argv[1]}`) { const r = check(); console.log(JSON.stringify(r, null, 2)); process.exitCode = r.status === 'fail' ? 1 : 0; }
