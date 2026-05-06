/**
 * P-001 — userProfile.id usado donde se requiere auth.uid
 *
 * Bug original: afc5e4a (Reactivación, 2026-05-05) y b93625d (Notificaciones,
 * 2026-05-06). Ver docs/PATRONES_REGRESION.md.
 *
 * Estrategia:
 * 1. Buscar uso literal de `userProfile.id` o `userProfile?.id` en src/.
 * 2. Para cada hit, marcar como FAIL si:
 *    - está cerca (±10 líneas) de un nombre de campo gateado por auth.uid:
 *      creadaPor, actorUid, userId, destinatarioId, tecnicoId, sugeridaPor,
 *      resueltaPor, ponchadoPor, registradoPor.
 *    - o está pasado como argumento a una función conocida que requiere
 *      auth.uid: suscribirNotificaciones, marcarTodasLeidas, marcarOrdenReactivada,
 *      marcarClienteEnviado, registrarPonche.
 * 3. Allowlist: archivos donde `userProfile.id` es legítimamente el
 *    personalDocId/usuarios doc id (ej: GestionUsuarios.tsx que edita el
 *    propio doc del personal).
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { InvariantResult, InvariantHit } from './types.js';

const PATTERN_ID = 'P-001';
const PATTERN_NAME = 'userProfile.id usado donde se requiere auth.uid';
const ROOT_DIR = path.resolve(process.cwd());

/**
 * Allowlist: paths relativos al repo donde `userProfile.id` es legítimo.
 * Ej: pantallas que editan el propio doc en `usuarios/{userProfile.id}` —
 * ahí `userProfile.id` ES el doc id correcto.
 *
 * Mantener corto. Si crece >5, refactorear el cazador.
 */
const ALLOWLIST_FILES: Set<string> = new Set([
  // Ejemplo (no agregado aún):
  // 'src/pages/GestionUsuarios.tsx',
]);

/**
 * Allowlist por línea: comentario `// @safe-userprofile-id: <razón>` en la
 * misma línea o en la línea inmediatamente anterior silencia el hit.
 * Útil para checks UI (filtros, gates de permisos visuales) donde NO hay
 * write a Firestore — la rule no aplica.
 *
 * Cada uso debe explicar la razón. Si crece sin control, refactorear el
 * cazador (probablemente la heurística está mal calibrada).
 */
const SAFE_LINE_TAG = '@safe-userprofile-id:';

/** Campos cuyas rules de Firestore validan contra auth.uid. */
const SENSITIVE_FIELDS = [
  'creadaPor',
  'actorUid',
  'userId',
  'destinatarioId',
  'tecnicoId',
  'sugeridaPor',
  'resueltaPor',
  'ponchadoPor',
  'registradoPor',
  'uid',
];

/** Funciones que esperan auth.uid en el primer argumento. */
const FUNCTIONS_REQUIRING_AUTH_UID = [
  'suscribirNotificaciones',
  'marcarTodasLeidas',
  'marcarOrdenReactivada',
  'marcarClienteEnviado',
  'registrarPonche',
];

const NEAR_LINES = 10;

async function walk(dir: string, files: string[] = []): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
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
  const srcDir = path.join(ROOT_DIR, 'src');
  const files = await walk(srcDir);
  const hits: InvariantHit[] = [];

  for (const file of files) {
    const rel = path.relative(ROOT_DIR, file);
    if (ALLOWLIST_FILES.has(rel)) continue;

    const content = await fs.readFile(file, 'utf8');
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // Buscar `userProfile.id` o `userProfile?.id` (no como key de objeto literal)
      if (!/userProfile\??\.id\b/.test(line)) continue;
      // Excluir comentarios
      const trimmed = line.trim();
      if (trimmed.startsWith('//') || trimmed.startsWith('*')) continue;

      // Allowlist por línea: comentario `// @safe-userprofile-id: <razón>`
      // en la misma línea o hasta 5 líneas arriba (ventana suficiente para
      // bloques de comentarios multi-línea con explicación + código entre
      // medio, ej: line con const + line con .filter()).
      if (line.includes(SAFE_LINE_TAG)) continue;
      const tagWindowStart = Math.max(0, i - 5);
      const tagWindow = lines.slice(tagWindowStart, i).join('\n');
      if (tagWindow.includes(SAFE_LINE_TAG)) continue;

      // ¿Está cerca de un campo sensible?
      const start = Math.max(0, i - NEAR_LINES);
      const end = Math.min(lines.length, i + NEAR_LINES);
      const window = lines.slice(start, end).join('\n');

      const sensitiveFieldHit = SENSITIVE_FIELDS.find((f) => {
        // El campo aparece en la ventana, asignándose un valor (`f:` o `f =`)
        const re = new RegExp(`\\b${f}\\s*[:=]`, 'g');
        return re.test(window);
      });

      const fnHit = FUNCTIONS_REQUIRING_AUTH_UID.find((fn) => {
        // La función se llama con userProfile.id como argumento, mismo línea o cercana
        const re = new RegExp(`${fn}\\s*\\([^)]*userProfile\\??\\.id`, 'm');
        return re.test(window);
      });

      if (sensitiveFieldHit || fnHit) {
        const reason = sensitiveFieldHit
          ? `cerca del campo sensible "${sensitiveFieldHit}" gateado por auth.uid en rules`
          : `pasado a función "${fnHit}" que espera auth.uid`;
        hits.push({
          file: rel,
          line: i + 1,
          snippet: line.trim(),
          explanation:
            `userProfile.id usado ${reason}. ` +
            `Cuando el perfil viene del fallback personal/, userProfile.id es el ` +
            `personalDocId, NO auth.uid. Usá currentUser.uid del context. ` +
            `Bug original: afc5e4a (2026-05-05).`,
        });
      }
    }
  }

  return {
    patternId: PATTERN_ID,
    patternName: PATTERN_NAME,
    status: hits.length > 0 ? 'fail' : 'pass',
    hits,
    notes: [
      `Escaneados ${files.length} archivos en src/. Allowlist: ${ALLOWLIST_FILES.size} archivos.`,
    ],
  };
}

// Permitir ejecutar el cazador standalone para debug
if (import.meta.url === `file://${process.argv[1]}`) {
  check().then((result) => {
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.status === 'fail' ? 1 : 0);
  });
}
