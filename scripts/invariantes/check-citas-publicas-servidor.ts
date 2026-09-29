/** P-026 — dedup público ineficaz (666cb14, 2026-09-28): lectura anónima denegada seguida de addDoc. */
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import type { InvariantHit, InvariantResult } from './types.js';
const PATTERN_ID = 'P-026';
const PATTERN_NAME = 'Citas públicas deben pasar por servidor y cuota atómica';
const ALLOWLIST_FILES = new Set<string>(); // si crece >5, refactorear el cazador
export function check(): InvariantResult {
  const hits: InvariantHit[] = [];
  for (const file of ['src/services/formularioAgendar.service.ts', 'src/pages/CitaPublica.tsx', 'src/services/solicitudesPublicas.service.ts', 'src/components/public/FormularioAgendarPublico.tsx', 'src/pages/public/FormularioPublico.tsx']) {
    if (ALLOWLIST_FILES.has(file)) continue;
    const texto = readFileSync(file, 'utf8'), ast = ts.createSourceFile(file, texto, ts.ScriptTarget.Latest, true, file.endsWith('tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    const visit = (n: ts.Node) => {
      if (ts.isCallExpression(n) && /^(addDoc|setDoc|updateDoc|uploadBytes|uploadBytesResumable)$/.test(n.expression.getText(ast))) hits.push({ file, line: ast.getLineAndCharacterOfPosition(n.getStart(ast)).line + 1, snippet: n.getText(ast).slice(0, 150), explanation: 'Un visitante no puede leer citas para deduplicar. Usar enviarCitaPublicaSegura; cuota y creación deben ser una transacción servidor.' });
      ts.forEachChild(n, visit);
    }; visit(ast);
  }
  const rules = readFileSync('firestore.rules', 'utf8');
  const bloque = rules.slice(rules.indexOf('match /citas_por_confirmar/'), rules.indexOf('match /solicitudes_servicio/'));
  if (!/allow create:\s*if esStaff\(\)\s*&&/.test(bloque)) hits.push({ file: 'firestore.rules', line: rules.slice(0, rules.indexOf('match /citas_por_confirmar/')).split('\n').length, snippet: 'allow create citas_por_confirmar', explanation: 'Cerrar create directo anónimo; conservar esStaff() para Citas/garantías. Visitantes usan endpoint con App Check y cuota.' });
  const solicitudes = rules.slice(rules.indexOf('match /solicitudes_servicio/'), rules.indexOf('// 4. Colecciones'));
  if (!/allow create:\s*if esStaff\(\)\s*;/.test(solicitudes)) hits.push({file:'firestore.rules',line:rules.slice(0,rules.indexOf('match /solicitudes_servicio/')).split('\n').length,snippet:'create solicitudes_servicio',explanation:'Los formularios dinámicos públicos requieren API con App Check y cuota, no create anónimo directo.'});
  const servicio = readFileSync('src/services/solicitudes.service.ts','utf8');
  if (/\baddDoc\s*\(/.test(servicio)) hits.push({file:'src/services/solicitudes.service.ts',line:1,snippet:'addDoc directo',explanation:'crearSolicitud debe usar /api/publico/solicitud con validación servidor.'});
  const storage = readFileSync('storage.rules','utf8');
  for (const ruta of ['fotos-equipos-publico','solicitudes-publico']) {
    const inicio = storage.indexOf(`match /${ruta}/`), bloque = storage.slice(inicio, storage.indexOf('}', storage.indexOf('allow write:', inicio)));
    if (!/allow write:\s*if false;/.test(bloque)) hits.push({file:'storage.rules',line:storage.slice(0,inicio).split('\n').length,snippet:ruta,explanation:'Subidas públicas requieren permiso firmado y cuota servidor; no reabrir write anónimo directo.'});
  }
  return { patternId: PATTERN_ID, patternName: PATTERN_NAME, status: hits.length ? 'fail' : 'pass', hits };
}
if (import.meta.url === `file://${process.argv[1]}`) { const r = check(); console.log(JSON.stringify(r, null, 2)); process.exitCode = r.status === 'fail' ? 1 : 0; }
