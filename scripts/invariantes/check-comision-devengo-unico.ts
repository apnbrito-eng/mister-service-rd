/** P-041, 2026-09-29. B3/B4 auditoría Claude: UID leído como docID y addDoc tras query
 * duplicaba devengos. Base auditada80f704d3833ddb9e37f0e2cc31d41cb8ac75dfa4;
 * hash de introducción exacto no determinado; fix pendiente commit coordinador.
 */
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import type { InvariantHit, InvariantResult } from './types.js';
const PATTERN_ID = 'P-041';
const PATTERN_NAME = 'Devengo único por identidad explícita y conduce manual atómico';
const ALLOWLIST_FILES = new Set<string>(); // si crece >5, refactorear el cazador
export function analizarDevengo(source: string, file = 'src/utils/comisiones.ts'): InvariantHit[] {
  const hits: InvariantHit[] = [];
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  const hit = (n: ts.Node, explanation: string) => hits.push({ file, line: ast.getLineAndCharacterOfPosition(n.getStart(ast)).line + 1, snippet: n.getText(ast).slice(0, 140), explanation });
  function visitar(n: ts.Node) {
    if (ts.isCallExpression(n) && n.expression.getText(ast) === 'addDoc' && /['"]comisiones['"]/.test(n.arguments[0]?.getText(ast) || '')) hit(n, 'No crear comisión con ID aleatorio tras query. Usar ID canónico leído y escrito en la misma transacción; dos usuarios no pueden devengar dos veces.');
    if (ts.isFunctionDeclaration(n) && n.body) {
      const name = n.name?.text, body = n.body.getText(ast);
      if (name === 'obtenerTecnicoParaComision' && (!/where\(['"]uid['"]/.test(body) || !/candidatos\.size !== 1/.test(body))) hit(n, 'Resolver UID y docID únicos, abortando identidad inexistente o ambigua; no aplicar default a persona ausente.');
      if (name === 'registrarComisionPorOrden' && (!body.includes('runTransaction') || !body.includes('tx.get(ordenRef)') || !body.includes('tx.get(canonica)'))) hit(n, 'Devengo relee orden y comisión canónica dentro de transacción para validar trabajo terminado y exclusión mutua.');
      if (name === 'registrarComisionesPorItems' && (!body.includes('tx.set(facturaRef') || !body.includes('tx.set(n.ref'))) hit(n, 'Conduce manual y comisiones deben crearse en la misma transacción, sin devengos huérfanos antes del conduce.');
    }
    ts.forEachChild(n, visitar);
  }
  visitar(ast); return hits;
}
export function check(): InvariantResult {
  const file = 'src/utils/comisiones.ts';
  const hits = ALLOWLIST_FILES.has(file) ? [] : analizarDevengo(readFileSync(file, 'utf8'), file);
  return { patternId: PATTERN_ID, patternName: PATTERN_NAME, status: hits.length ? 'fail' : 'pass', hits };
}
if (import.meta.url === `file://${process.argv[1]}`) { const r = check(); console.log(JSON.stringify(r, null, 2)); process.exitCode = r.status === 'fail' ? 1 : 0; }
