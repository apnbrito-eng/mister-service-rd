/**
 * Métricas del Continuous Improvement Loop.
 *
 * Calcula desde `git log` y `docs/postmortems/`:
 *   - MTBF (días entre incidentes)
 *   - MTTR (minutos detección → fix)
 *   - Recurrence rate (% postmortems "es recurrencia: sí")
 *   - Catch rate (% bugs cazados pre-commit vs post-commit)
 *   - Cazadores activos (count P-XXX en docs/PATRONES_REGRESION.md)
 *   - Allowlist size (count `// @safe-...` en src/)
 *
 * Output: `docs/sprints/METRICAS_<YYYY-MM-DD>.md`.
 *
 * Uso:
 *   npm run metricas
 *   npm run metricas -- --desde=2026-05-01
 *
 * El agente `archivist` consume este script en modo MÉTRICAS y agrega
 * interpretación cualitativa al final del archivo generado.
 */
import { promises as fs } from 'node:fs';
import { execSync } from 'node:child_process';
import path from 'node:path';

const ROOT = path.resolve(process.cwd());
const POSTMORTEMS_DIR = path.join(ROOT, 'docs', 'postmortems');
const PATRONES_FILE = path.join(ROOT, 'docs', 'PATRONES_REGRESION.md');
const SPRINTS_DIR = path.join(ROOT, 'docs', 'sprints');

// ---------- argparse trivial ----------

interface Args {
  desde: Date | null;
}

function parseArgs(argv: string[]): Args {
  let desde: Date | null = null;
  for (const a of argv) {
    const m = a.match(/^--desde=(\d{4}-\d{2}-\d{2})$/);
    if (m) desde = new Date(m[1] + 'T00:00:00Z');
  }
  if (!desde) {
    desde = new Date();
    desde.setUTCDate(desde.getUTCDate() - 30);
  }
  return { desde };
}

// ---------- lectura de postmortems ----------

interface Postmortem {
  filename: string;
  fechaISO: string;
  detectadoPor: string | null;
  severidad: string | null;
  patron: string | null;
  esRecurrencia: boolean | null;
  mttrMin: number | null;
  introducidoAt: string | null;
  fixAt: string | null;
}

function parsePostmortemFilename(filename: string): string | null {
  const m = filename.match(/^(\d{4}-\d{2}-\d{2})-/);
  return m ? m[1] : null;
}

function extractField(body: string, label: string): string | null {
  const re = new RegExp(`\\*\\*${label}:\\*\\*\\s*([^\\n]+)`, 'i');
  const m = body.match(re);
  return m ? m[1].trim() : null;
}

function extractRecurrencia(body: string): boolean | null {
  // Busca línea "Es recurrencia de clase ya catalogada: ..."
  const m = body.match(/Es recurrencia de clase ya catalogada:\*\*\s*([^\n]+)/i);
  if (!m) return null;
  // Normalizar: quitar markdown bold/italics y trim.
  const v = m[1].toLowerCase().replace(/[*_`]/g, '').trim();
  if (v.startsWith('sí') || v.startsWith('si ') || v === 'si') return true;
  if (v.startsWith('no')) return false;
  return null;
}

function extractMttrMin(body: string): number | null {
  // Busca "MTTR ... :" con número de minutos/horas
  const m = body.match(/MTTR[^:]*:\*\*\s*~?(\d+(?:\.\d+)?)\s*(min|minutos|hora|horas|h)/i);
  if (!m) return null;
  const n = parseFloat(m[1]);
  const unit = m[2].toLowerCase();
  if (unit.startsWith('hora') || unit === 'h') return n * 60;
  return n;
}

async function loadPostmortems(desde: Date): Promise<Postmortem[]> {
  let files: string[];
  try {
    files = await fs.readdir(POSTMORTEMS_DIR);
  } catch {
    return [];
  }
  const out: Postmortem[] = [];
  for (const f of files) {
    if (!f.endsWith('.md') || f.startsWith('_') || f === 'README.md') continue;
    const fechaISO = parsePostmortemFilename(f);
    if (!fechaISO) continue;
    const fecha = new Date(fechaISO + 'T00:00:00Z');
    if (fecha < desde) continue;
    const body = await fs.readFile(path.join(POSTMORTEMS_DIR, f), 'utf8');
    out.push({
      filename: f,
      fechaISO,
      detectadoPor: extractField(body, 'Detectado por'),
      severidad: extractField(body, 'Severidad'),
      patron: extractField(body, 'Patrón asociado'),
      esRecurrencia: extractRecurrencia(body),
      mttrMin: extractMttrMin(body),
      introducidoAt: null,
      fixAt: null,
    });
  }
  out.sort((a, b) => a.fechaISO.localeCompare(b.fechaISO));
  return out;
}

// ---------- métricas derivadas ----------

interface Metricas {
  ventana: { desde: string; hasta: string };
  postmortems: number;
  mtbfDias: number | null;
  mttrMin: number | null;
  recurrenceRate: number | null;
  catchRate: number | null;
  cazadoresActivos: number;
  allowlistSize: number;
  postmortemsList: Postmortem[];
}

function calcMTBF(postmortems: Postmortem[]): number | null {
  if (postmortems.length < 2) return null;
  const fechas = postmortems
    .map((p) => new Date(p.fechaISO + 'T00:00:00Z').getTime())
    .sort((a, b) => a - b);
  const gaps: number[] = [];
  for (let i = 1; i < fechas.length; i++) {
    gaps.push((fechas[i] - fechas[i - 1]) / (1000 * 60 * 60 * 24));
  }
  if (gaps.length === 0) return null;
  return gaps.reduce((a, b) => a + b, 0) / gaps.length;
}

function calcMTTR(postmortems: Postmortem[]): number | null {
  const mttrs = postmortems.map((p) => p.mttrMin).filter((x): x is number => x !== null);
  if (mttrs.length === 0) return null;
  return mttrs.reduce((a, b) => a + b, 0) / mttrs.length;
}

function calcRecurrenceRate(postmortems: Postmortem[]): number | null {
  const decided = postmortems.filter((p) => p.esRecurrencia !== null);
  if (decided.length === 0) return null;
  const recur = decided.filter((p) => p.esRecurrencia === true).length;
  return (recur / decided.length) * 100;
}

function calcCatchRate(postmortems: Postmortem[], cazadoresHits: number): number | null {
  // Catch rate = bugs cazados pre-commit / total bugs (pre + post commit).
  //
  // Limitación actual: no hay telemetría persistente del pre-commit hook, así
  // que `cazadoresHits` siempre es 0 hasta que se agregue logging. Sin esa
  // dato, sólo podemos decir:
  //   - 0 postmortems en ventana + 0 hits conocidos → 100% (sistema sano por
  //     ausencia de incidentes).
  //   - 1+ postmortems pero no podemos medir hits pre-commit → n/a.
  //
  // Para activar esta métrica con datos reales: el pre-commit hook debe loguear
  // a `docs/sprints/CAZADORES_LOG.jsonl` (sprint futuro). Mientras tanto este
  // valor es indicativo, no medido.
  if (postmortems.length === 0 && cazadoresHits === 0) return 100;
  if (postmortems.length === 0) return null;
  if (cazadoresHits === 0) return null; // sin telemetría, no medible
  const totalBugs = postmortems.length + cazadoresHits;
  if (totalBugs === 0) return null;
  return (cazadoresHits / totalBugs) * 100;
}

async function countCazadoresActivos(): Promise<number> {
  try {
    const body = await fs.readFile(PATRONES_FILE, 'utf8');
    const matches = body.match(/^## P-\d{3} —/gm);
    return matches ? matches.length : 0;
  } catch {
    return 0;
  }
}

async function countAllowlistSize(): Promise<number> {
  // Cuenta `// @safe-...` en src/
  try {
    const out = execSync(
      `git ls-files src/ | xargs grep -l "// @safe-" 2>/dev/null || true`,
      { cwd: ROOT, encoding: 'utf8' },
    );
    if (!out.trim()) return 0;
    const archivos = out.trim().split('\n').filter(Boolean);
    let total = 0;
    for (const archivo of archivos) {
      const body = await fs.readFile(path.join(ROOT, archivo), 'utf8');
      const matches = body.match(/\/\/\s*@safe-[a-z-]+:/g);
      if (matches) total += matches.length;
    }
    return total;
  } catch {
    return 0;
  }
}

// ---------- output ----------

function fmt(n: number | null, suffix = '', digits = 1): string {
  if (n === null || Number.isNaN(n)) return 'n/a';
  return n.toFixed(digits) + suffix;
}

function buildMarkdown(m: Metricas): string {
  const lines: string[] = [];
  const today = new Date().toISOString().slice(0, 10);
  lines.push(`# Métricas mejora continua — ${today}`);
  lines.push('');
  lines.push(`> Generado por \`scripts/metricas-mejora-continua.ts\`.`);
  lines.push(`> Ventana: ${m.ventana.desde} → ${m.ventana.hasta}.`);
  lines.push('');
  lines.push('## Resumen');
  lines.push('');
  lines.push('| Métrica | Valor | Objetivo |');
  lines.push('|---|---|---|');
  lines.push(`| Postmortems en ventana | ${m.postmortems} | — |`);
  lines.push(`| MTBF (días entre incidentes) | ${fmt(m.mtbfDias, ' d')} | creciente |`);
  lines.push(`| MTTR (minutos detección → fix) | ${fmt(m.mttrMin, ' min', 0)} | decreciente |`);
  lines.push(`| Recurrence rate | ${fmt(m.recurrenceRate, '%')} | <5% |`);
  lines.push(`| Catch rate | ${fmt(m.catchRate, '%')} | >80% |`);
  lines.push(`| Cazadores activos (P-XXX) | ${m.cazadoresActivos} | creciente |`);
  lines.push(`| Allowlist size (\`// @safe-...\`) | ${m.allowlistSize} | estable |`);
  lines.push('');
  if (m.postmortemsList.length > 0) {
    lines.push('## Postmortems en ventana');
    lines.push('');
    lines.push('| Fecha | Archivo | Severidad | Patrón | Recurrencia | MTTR (min) |');
    lines.push('|---|---|---|---|---|---|');
    for (const p of m.postmortemsList) {
      const recur = p.esRecurrencia === null ? 'n/a' : p.esRecurrencia ? 'sí' : 'no';
      lines.push(
        `| ${p.fechaISO} | ${p.filename} | ${p.severidad ?? 'n/a'} | ${p.patron ?? 'n/a'} | ${recur} | ${
          p.mttrMin !== null ? p.mttrMin.toFixed(0) : 'n/a'
        } |`,
      );
    }
    lines.push('');
  } else {
    lines.push('## Postmortems en ventana');
    lines.push('');
    lines.push('Ninguno — no hubo bugs en producción registrados en este período.');
    lines.push('');
  }
  lines.push('## Notas técnicas');
  lines.push('');
  lines.push('- **MTBF** se calcula como promedio de gaps entre fechas de postmortems consecutivos. Requiere ≥2 postmortems para tener valor; con 1 o 0 retorna `n/a`.');
  lines.push('- **MTTR** lee el campo "MTTR" de cada postmortem (parseado desde `_TEMPLATE.md`). Si un postmortem no lo declara, no contribuye al promedio.');
  lines.push('- **Recurrence rate** lee la línea "Es recurrencia de clase ya catalogada: sí/no". `n/a` si ningún postmortem la declara.');
  lines.push('- **Catch rate** es heurística sin telemetría real. Si no hay postmortems en la ventana, asume el sistema cazó todo pre-commit. Si hay postmortems, retorna `n/a` (no podemos medir cuántos cazadores gritaron sin sumar logs externos).');
  lines.push('- **Allowlist size** cuenta matches de `// @safe-<algo>:` en `src/` via git ls-files. No incluye scripts ni docs.');
  lines.push('');
  lines.push('## Interpretación cualitativa');
  lines.push('');
  lines.push('> El agente `archivist` debe agregar interpretación acá cuando ejecute en modo MÉTRICAS. Este placeholder existe para que la sección no quede vacía.');
  lines.push('');
  return lines.join('\n');
}

async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const desde = args.desde ?? new Date();
  const hasta = new Date();

  const postmortems = await loadPostmortems(desde);
  const cazadoresActivos = await countCazadoresActivos();
  const allowlistSize = await countAllowlistSize();
  const cazadoresHits = 0; // sin telemetría real

  const m: Metricas = {
    ventana: {
      desde: desde.toISOString().slice(0, 10),
      hasta: hasta.toISOString().slice(0, 10),
    },
    postmortems: postmortems.length,
    mtbfDias: calcMTBF(postmortems),
    mttrMin: calcMTTR(postmortems),
    recurrenceRate: calcRecurrenceRate(postmortems),
    catchRate: calcCatchRate(postmortems, cazadoresHits),
    cazadoresActivos,
    allowlistSize,
    postmortemsList: postmortems,
  };

  const md = buildMarkdown(m);
  const today = new Date().toISOString().slice(0, 10);
  const outFile = path.join(SPRINTS_DIR, `METRICAS_${today}.md`);
  await ensureDir(SPRINTS_DIR);
  await fs.writeFile(outFile, md, 'utf8');

  console.log(`[metricas] generado: ${path.relative(ROOT, outFile)}`);
  console.log(`[metricas] postmortems: ${m.postmortems}`);
  console.log(`[metricas] MTBF: ${fmt(m.mtbfDias, ' d')}`);
  console.log(`[metricas] MTTR: ${fmt(m.mttrMin, ' min', 0)}`);
  console.log(`[metricas] recurrence: ${fmt(m.recurrenceRate, '%')}`);
  console.log(`[metricas] catch: ${fmt(m.catchRate, '%')}`);
  console.log(`[metricas] cazadores P-XXX: ${m.cazadoresActivos}`);
  console.log(`[metricas] allowlist size: ${m.allowlistSize}`);
}

main().catch((err) => {
  console.error('[metricas] error:', err);
  process.exit(1);
});
