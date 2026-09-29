/** P-030, 2026-09-29: cierre continuaba tras fallo de cuota/comisión. Hash original/fix pendiente del commit del coordinador. */
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import type { InvariantHit, InvariantResult } from './types.js';
const PATTERN_ID = 'P-030';
const PATTERN_NAME = 'Cierre atómico del lote elegible de nómina';
const ALLOWLIST_FILES = new Set<string>(); // si crece >5, refactorear el cazador
export function analizarCierreNomina(texto: string, file = 'src/services/nomina.service.ts'): InvariantResult {
  const hits: InvariantHit[] = [];
  if (!ALLOWLIST_FILES.has(file)) {
    const ast = ts.createSourceFile(file, texto, ts.ScriptTarget.Latest, true);
    const funcion = ast.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === 'cerrarLiquidacion');
    const agregar = (n: ts.Node, explanation: string) => hits.push({ file, line: ast.getLineAndCharacterOfPosition(n.getStart(ast)).line + 1, snippet: n.getText(ast).slice(0, 140), explanation });
    if (!funcion) hits.push({ file, line: 1, snippet: 'cerrarLiquidacion ausente', explanation: 'Actualizar el cazador si se mueve el cierre: debe comprobar la nueva implementación antes de darla por protegida.' });
    else {
      let transacciones = 0;
      const visitar = (n: ts.Node) => {
        if (ts.isCatchClause(n)) agregar(n, 'No silenciar errores dentro del cierre. Un fallo de cuota/comisión debe abortar toda la transacción del lote elegible, sin cerrar esos empleados ni descontar nada.');
        if (ts.isCallExpression(n)) {
          const llamada = n.expression.getText(ast);
          if (llamada === 'runTransaction') transacciones++;
          if (/^tx\.(update|set|delete|create)$/.test(llamada)) {
            let padre: ts.Node | undefined = n.parent;
            let dentroTransaccion = false;
            while (padre && padre !== funcion) {
              if (ts.isCallExpression(padre) && padre.expression.getText(ast) === 'runTransaction') dentroTransaccion = true;
              padre = padre.parent;
            }
            if (!dentroTransaccion) agregar(n, 'Las escrituras del cierre deben permanecer dentro de runTransaction; nunca cerrar empleados fuera del commit que descuenta sus movimientos.');
          }
          if (['updateDoc', 'setDoc', 'addDoc', 'writeBatch', 'aplicarCuota', 'liquidarComisiones'].includes(llamada)) agregar(n, 'El cierre no puede mezclar escrituras independientes con la transacción. Leer y actualizar cuotas, avances, comisiones y nómina dentro de la misma transacción.');
        }
        ts.forEachChild(n, visitar);
      };
      visitar(funcion);
      const cuerpo = funcion.getText(ast);
      if (!/todosEmpleados\.filter\(e\s*=>\s*!e\.estadoCierre\s*\|\|\s*e\.estadoCierre\s*===\s*['"]listo['"]\)/.test(cuerpo) || !/empleados\s*=\s*empleados\.filter\(e\s*=>\s*e\.estadoCierre\s*!==\s*['"]bloqueado['"]\)/.test(cuerpo)) {
        agregar(funcion, 'Seleccionar sólo empleados listos (incluido legacy sin estado) y volver a excluir los bloqueados al validar fechas. Un empleado cerrado o bloqueado no participa del nuevo lote.');
      }
      if (!/estado:\s*completa\s*\?\s*['"]cerrada['"]\s*:\s*['"]abierta['"]/.test(cuerpo) || !/asistenciaBloqueada:\s*completa/.test(cuerpo) || !/actualizados\.every/.test(cuerpo) || !/raw\.comisionesSinEmpleado/.test(cuerpo)) {
        agregar(funcion, 'El estado global sólo se cierra cuando todos están cerrados y no quedan incidencias. Un lote parcial conserva abierta la nómina y la asistencia de los pendientes.');
      }
      if (transacciones !== 1) agregar(funcion, 'El cierre debe tener una única transacción que incluya todos sus movimientos y estado final; varios commits pueden dejar un mismo empleado parcialmente descontado.');
    }
  }
  return { patternId: PATTERN_ID, patternName: PATTERN_NAME, status: hits.length ? 'fail' : 'pass', hits };
}
export function check(): InvariantResult { return analizarCierreNomina(readFileSync('src/services/nomina.service.ts', 'utf8')); }
if (import.meta.url === `file://${process.argv[1]}`) { const r = check(); console.log(JSON.stringify(r, null, 2)); process.exitCode = r.status === 'fail' ? 1 : 0; }
