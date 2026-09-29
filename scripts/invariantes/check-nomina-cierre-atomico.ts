/** P-030, 2026-09-29: cierre continuaba tras fallo de cuota/comisión. Hash original/fix pendiente del commit del coordinador. */
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import type { InvariantHit, InvariantResult } from './types.js';
const PATTERN_ID = 'P-030';
const PATTERN_NAME = 'Cierre de nómina sin escrituras parciales';
const ALLOWLIST_FILES = new Set<string>(); // si crece >5, refactorear el cazador
export function check(): InvariantResult {
  const hits: InvariantHit[] = [];
  const file = 'src/services/nomina.service.ts';
  if (!ALLOWLIST_FILES.has(file)) {
    const texto = readFileSync(file, 'utf8');
    const ast = ts.createSourceFile(file, texto, ts.ScriptTarget.Latest, true);
    const funcion = ast.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === 'cerrarLiquidacion');
    const agregar = (n: ts.Node, explanation: string) => hits.push({ file, line: ast.getLineAndCharacterOfPosition(n.getStart(ast)).line + 1, snippet: n.getText(ast).slice(0, 140), explanation });
    if (!funcion) hits.push({ file, line: 1, snippet: 'cerrarLiquidacion ausente', explanation: 'Actualizar el cazador si se mueve el cierre: debe comprobar la nueva implementación antes de darla por protegida.' });
    else {
      let transacciones = 0;
      const visitar = (n: ts.Node) => {
        if (ts.isCatchClause(n)) agregar(n, 'No silenciar errores dentro del cierre. Un fallo de cuota/comisión debe abortar toda la transacción, sin marcar la nómina cerrada.');
        if (ts.isCallExpression(n)) {
          const llamada = n.expression.getText(ast);
          if (llamada === 'runTransaction') transacciones++;
          if (['updateDoc', 'setDoc', 'addDoc', 'writeBatch', 'aplicarCuota', 'liquidarComisiones'].includes(llamada)) agregar(n, 'El cierre no puede mezclar escrituras independientes con la transacción. Leer y actualizar cuotas, avances, comisiones y nómina dentro de la misma transacción.');
        }
        ts.forEachChild(n, visitar);
      };
      visitar(funcion);
      if (transacciones !== 1) agregar(funcion, 'El cierre debe tener una única transacción que incluya todos sus movimientos y estado final; múltiples commits permiten cierres parciales.');
    }
  }
  return { patternId: PATTERN_ID, patternName: PATTERN_NAME, status: hits.length ? 'fail' : 'pass', hits };
}
if (import.meta.url === `file://${process.argv[1]}`) { const r = check(); console.log(JSON.stringify(r, null, 2)); process.exitCode = r.status === 'fail' ? 1 : 0; }
