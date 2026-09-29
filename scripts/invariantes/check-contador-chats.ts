/** P-027 (2026-09-28): badge mostraba suma de mensajes, no conversaciones. Hash fix pendiente de commit coordinador. */
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import type { InvariantHit, InvariantResult } from './types.js';
const PATTERN_ID = 'P-027';
const PATTERN_NAME = 'Badge WhatsApp no debe sumar mensajes';
const ALLOWLIST_FILES = new Set<string>(); // si crece >5, refactorear el cazador
export function check(): InvariantResult {
 const file = 'src/services/whatsappInbox.service.ts', hits: InvariantHit[] = [];
 if (!ALLOWLIST_FILES.has(file)) {
  const texto = readFileSync(file, 'utf8'), ast = ts.createSourceFile(file, texto, ts.ScriptTarget.Latest, true);
  const funcion = ast.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === 'suscribirContadorSinLeer');
  if (funcion) {
   const visit = (n: ts.Node) => {
    if (ts.isBinaryExpression(n) && n.operatorToken.kind === ts.SyntaxKind.PlusToken && /\bnoLeidos\b/.test(n.getText(ast))) hits.push({ file, line: ast.getLineAndCharacterOfPosition(n.getStart(ast)).line + 1, snippet: n.getText(ast), explanation: 'El badge representa personas/conversaciones: cada chat con noLeidos>0 aporta1, aunque tenga varios mensajes. Contar chats, no sumar c.noLeidos.' });
    ts.forEachChild(n, visit);
   }; visit(funcion);
  }
 }
 return { patternId: PATTERN_ID, patternName: PATTERN_NAME, status: hits.length ? 'fail' : 'pass', hits };
}
if (import.meta.url === `file://${process.argv[1]}`) { const r = check(); console.log(JSON.stringify(r, null, 2)); process.exitCode = r.status === 'fail' ? 1 : 0; }
