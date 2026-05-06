/**
 * P-004 — Alta de empleado sin crear doc espejo en usuarios/{uid}
 *
 * Bug original: SPRINT-105 (2026-05-06). Antes del fix, GestionUsuarios.tsx
 * creaba el Auth user + el doc personal/{auto-id} pero NO el doc usuarios/{uid}.
 * Resultado: el empleado nuevo cae al fallback `personal where email==` de
 * AppContext, su `userProfile.id == personalDocId !== auth.uid`, y cualquier
 * write gateado por rules tipo `X == request.auth.uid` falla con
 * permission-denied (clase de bug P-001 — patrón ya catalogado).
 *
 * Estrategia (heurística determinística):
 *
 * 1. Recorrer src/**.{ts,tsx} y api/**.{ts}.
 * 2. Para cada archivo que mencione `createUserWithEmailAndPassword`,
 *    verificar que en el mismo archivo aparezca un setDoc(doc(... , 'usuarios'...)).
 * 3. Si hay createUserWithEmailAndPassword pero NO hay setDoc(usuarios) en una
 *    ventana razonable (mismo archivo) → FAIL.
 *
 * Allowlist por archivo (raros): comentario `// @safe-no-usuarios-mirror: <razón>`
 * en el header del archivo lo excluye (ej: scripts de migración o endpoints
 * que crean Auth sin necesidad de espejo en usuarios/).
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { InvariantResult, InvariantHit } from './types.js';

const PATTERN_ID = 'P-004';
const PATTERN_NAME = 'Alta de empleado sin crear doc espejo en usuarios/{uid}';
const ROOT_DIR = path.resolve(process.cwd());

const TRIGGER_RE = /\bcreateUserWithEmailAndPassword\s*\(/;
// setDoc(doc(<algo>, 'usuarios', <algo>))
const ESPEJO_RE = /\bsetDoc\s*\(\s*doc\s*\(\s*[\w.]+\s*,\s*['"]usuarios['"]\s*,/;
const ALLOW_HEADER_RE = /@safe-no-usuarios-mirror:/;

async function walk(dir: string, files: string[] = []): Promise<string[]> {
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return files;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
      await walk(full, files);
    } else if (/\.(ts|tsx)$/.test(entry.name)) {
      files.push(full);
    }
  }
  return files;
}

export async function check(): Promise<InvariantResult> {
  const targets: string[] = [];
  for (const sub of ['src', 'api']) {
    const dir = path.join(ROOT_DIR, sub);
    await walk(dir, targets);
  }

  const hits: InvariantHit[] = [];
  let scanned = 0;

  for (const file of targets) {
    const rel = path.relative(ROOT_DIR, file);
    const content = await fs.readFile(file, 'utf8');
    if (!TRIGGER_RE.test(content)) continue;
    scanned++;

    // Allowlist por header
    const head = content.slice(0, 600);
    if (ALLOW_HEADER_RE.test(head)) continue;

    // Buscar todas las invocaciones de createUserWithEmailAndPassword.
    // Por cada una, buscar setDoc(... 'usuarios' ...) en el mismo archivo.
    const lines = content.split('\n');
    const triggerLines: number[] = [];
    for (let i = 0; i < lines.length; i++) {
      if (TRIGGER_RE.test(lines[i])) triggerLines.push(i + 1);
    }
    if (triggerLines.length === 0) continue;

    const tieneEspejo = ESPEJO_RE.test(content);
    if (tieneEspejo) continue;

    // Reportar 1 hit por trigger encontrado (suele ser 1-2 por archivo).
    for (const ln of triggerLines) {
      hits.push({
        file: rel,
        line: ln,
        snippet: `createUserWithEmailAndPassword sin setDoc(usuarios) en el mismo archivo`,
        explanation:
          `El archivo crea un user de Firebase Auth (línea ${ln}) pero no escribe el ` +
          `doc espejo en \`usuarios/{uid}\`. Sin ese espejo, el empleado nuevo cae al ` +
          `fallback de AppContext (cascada \`personal where email==\`) y cualquier rule ` +
          `que valide \`X == request.auth.uid\` rechazará sus writes (bug P-001). ` +
          `Patrón correcto: usar el secondaryDb del propio user creado y escribir ` +
          `usuarios/{cred.user.uid} antes del deleteApp(secondaryApp). ` +
          `Si este archivo NO necesita el espejo (raro, ej: migración one-shot), ` +
          `agregá comentario "// @safe-no-usuarios-mirror: <razón>" en el header.`,
      });
    }
  }

  return {
    patternId: PATTERN_ID,
    patternName: PATTERN_NAME,
    status: hits.length > 0 ? 'fail' : 'pass',
    hits,
    notes: [`Archivos con createUserWithEmailAndPassword escaneados: ${scanned}.`],
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  check().then((result) => {
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.status === 'fail' ? 1 : 0);
  });
}
