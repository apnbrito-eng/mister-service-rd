/** P-034, 2026-09-29. Bug original pendiente de identificar por coordinador: comisiones tardías omitidas permanentemente. */
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import type { InvariantHit, InvariantResult } from './types.js';
const PATTERN_ID = 'P-034';
const PATTERN_NAME = 'Recuperación de comisiones tardías y nómina única';
const ALLOWLIST_FILES = new Set<string>(); // si crece >5, refactorear el cazador
export function analizarNominaTardia(texto: string): InvariantResult {
 const file = 'src/services/nomina.service.ts';
 const hits: InvariantHit[] = [];
 if (!ALLOWLIST_FILES.has(file)) {
  const ast = ts.createSourceFile(file,texto,ts.ScriptTarget.Latest,true);
  for (const nodo of ast.statements) {
   if (!ts.isFunctionDeclaration(nodo) || !['generarLiquidacion','recalcularEmpleadoLiquidacion','actualizarConciliacionLiquidacion'].includes(nodo.name?.text || '')) continue;
   const cuerpo = nodo.getText(ast);
   const faltaRevision = nodo.name?.text === 'recalcularEmpleadoLiquidacion' && cuerpo.includes('const totalDevengado') && !cuerpo.includes('cuotasPendientesRevision');
   const faltaDescubrimiento = nodo.name?.text === 'actualizarConciliacionLiquidacion' && !cuerpo.includes('getDocs(');
   if (faltaRevision || faltaDescubrimiento) hits.push({file,line:ast.getLineAndCharacterOfPosition(nodo.getStart()).line+1,snippet:nodo.name?.text || '',explanation: faltaRevision ? 'Al pasar de devengado cero a positivo, exigir revisión explícita de cuotas omitidas; no habilitar pago con descuentos incompletos.' : 'Actualizar conciliaciones debe descubrir nuevas comisiones huérfanas además de revisar IDs del snapshot.'});
   const visitar = (n: ts.Node) => {
    const snippet = n.getText(ast);
    if ((ts.isCallExpression(n) && n.expression.getText(ast)==='addDoc') || (ts.isBinaryExpression(n) && /(?:fechaCobro|fecha)\s*>=\s*inicio/.test(snippet))) {
     hits.push({file,line:ast.getLineAndCharacterOfPosition(n.getStart()).line+1,snippet:snippet.slice(0,160),explanation:'Nómina debe recuperar pendientes anteriores conservando devengo real y crear documento canónico transaccional. No excluir fechas anteriores al inicio ni crear nóminas con ID aleatorio.'});
    }
    ts.forEachChild(n,visitar);
   }; visitar(nodo);
  }
 }
 return {patternId:PATTERN_ID,patternName:PATTERN_NAME,status:hits.length?'fail':'pass',hits};
}
export function check(): InvariantResult { return analizarNominaTardia(readFileSync('src/services/nomina.service.ts','utf8')); }
if (import.meta.url === `file://${process.argv[1]}`) { const r=check(); console.log(JSON.stringify(r,null,2)); process.exitCode=r.status==='fail'?1:0; }
