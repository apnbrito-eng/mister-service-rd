/** P-028, 2026-09-29: IA inert abierta y Atrás saltaba a rutas. Hash fix pendiente de commit coordinador. */
import { readFileSync } from 'node:fs';
import type { InvariantHit, InvariantResult } from './types.js';
const PATTERN_ID = 'P-028';
const PATTERN_NAME = 'IA interactiva y prioridad Atrás';
const ALLOWLIST_FILES = new Set<string>(); // si crece >5, refactorear el cazador
export function check(): InvariantResult {
  const hits: InvariantHit[] = [];
  const panel = 'src/components/AsistenteIAFlotante.tsx';
  const runtime = 'src/mobile/runtime.ts';
  const revisar = (file: string, valido: (texto: string) => boolean, explanation: string) => {
    if (ALLOWLIST_FILES.has(file)) return;
    const texto = readFileSync(file, 'utf8');
    if (!valido(texto)) hits.push({ file, line: 1, snippet: 'Cierre de capas IA', explanation });
  };
  revisar(panel, s => /inert:\s*abierto\s*\?\s*undefined\s*:\s*''/.test(s) && !/toggleAttribute\(['"]inert/.test(s), 'Motion debe recibir inert declarativo (abierto ? undefined : ""). Mutarlo mediante ref dejó el panel abierto inerte y los toques llegaron al menú inferior.');
  revisar(panel, s => /registrarCierreCapa\(cerrarPanel\)/.test(s), 'Registrar cerrarPanel mientras está abierto y limpiar al cerrar, para que Atrás no navegue fuera dejando IA encima.');
  revisar(runtime, s => {
    const listener = s.slice(s.indexOf("App.addListener('backButton'"));
    const prioridad = listener.indexOf('if (cerrarCapaSuperior()) return;');
    return prioridad >= 0 && prioridad < listener.indexOf('history.back()');
  }, 'Atrás nativo debe consumir primero cerrarCapaSuperior(), antes de history.back() o minimizeApp().');
  return { patternId: PATTERN_ID, patternName: PATTERN_NAME, status: hits.length ? 'fail' : 'pass', hits };
}
if (import.meta.url === `file://${process.argv[1]}`) { const r = check(); console.log(JSON.stringify(r, null, 2)); process.exitCode = r.status === 'fail' ? 1 : 0; }
