import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, writeFile, mkdir, rm, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  SPEC_FIRESTORE,
  SPEC_STORAGE,
  inspeccionarRulesDeploy,
  resultadoRulesDeploy,
  type EstadoRules,
  type SpecRulesDeploy,
} from '../../scripts/invariantes/estado-rules-deploy.js';
import {
  resolverModo,
  aplicarPolitica,
  type ModoControl,
} from '../../scripts/invariantes/politica-publicacion.js';
import type { InvariantResult } from '../../scripts/invariantes/types.js';

// Fixtures temporales: nunca se leen ni escriben las reglas reales del repo.
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const RUN_ALL = path.join(ROOT, 'scripts/invariantes/run-all.ts');
const REGLAS = "rules_version = '2';\nservice cloud.firestore { match /databases/{db}/documents {} }\n";
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const lockDe = (hash: string) => `# fixture\nsha256: ${hash}\n`;
const SPECS: SpecRulesDeploy[] = [SPEC_FIRESTORE, SPEC_STORAGE];

type Entrada = string | { directorio: true };

async function estadoDe(spec: SpecRulesDeploy, archivos: Record<string, Entrada>): Promise<EstadoRules> {
  const dir = await mkdtemp(path.join(tmpdir(), 'control-publicacion-'));
  try {
    for (const [nombre, contenido] of Object.entries(archivos)) {
      if (typeof contenido === 'string') await writeFile(path.join(dir, nombre), contenido, 'utf8');
      else await mkdir(path.join(dir, nombre));
    }
    return await inspeccionarRulesDeploy(dir, spec);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/** Los seis estados posibles, construidos desde el FS real (no a mano). */
async function estadosDe(spec: SpecRulesDeploy): Promise<Record<EstadoRules['tipo'], EstadoRules>> {
  return {
    pendiente: await estadoDe(spec, { [spec.rulesFile]: REGLAS, [spec.lockFile]: lockDe(sha('otra')) }),
    sincronizado: await estadoDe(spec, { [spec.rulesFile]: REGLAS, [spec.lockFile]: lockDe(sha(REGLAS)) }),
    'sin-lock': await estadoDe(spec, { [spec.rulesFile]: REGLAS }),
    'lock-invalido': await estadoDe(spec, { [spec.rulesFile]: REGLAS, [spec.lockFile]: 'sha256: no-es-hash\n' }),
    'sin-rules': await estadoDe(spec, {}),
    'error-lectura': await estadoDe(spec, { [spec.rulesFile]: { directorio: true } }),
  };
}

const otroFail: InvariantResult = {
  patternId: 'P-999',
  patternName: 'otro cazador',
  status: 'fail',
  hits: [{ file: 'src/x.ts', line: 3, snippet: 'x', explanation: 'y' }],
};

function politica(modo: ModoControl, spec: SpecRulesDeploy, estado: EstadoRules) {
  const r = resultadoRulesDeploy(estado, spec);
  const [rules, otro] = aplicarPolitica(modo, [r, otroFail], [{ spec, estado }]);
  return { original: r, rules, otro };
}

// --- Inspección y resultado estricto ---

for (const spec of SPECS) {
  test(`${spec.patternId} inspección: cada fixture produce el estado esperado`, async () => {
    const e = await estadosDe(spec);
    for (const [tipo, estado] of Object.entries(e)) assert.equal(estado.tipo, tipo);
    const pend = e.pendiente;
    assert.ok(pend.tipo === 'pendiente' && pend.hashActual === sha(REGLAS) && pend.hashDeployado === sha('otra'));
  });

  test(`${spec.patternId} lock ilegible (directorio) es error-lectura, no sin-lock`, async () => {
    const e = await estadoDe(spec, { [spec.rulesFile]: REGLAS, [spec.lockFile]: { directorio: true } });
    assert.equal(e.tipo, 'error-lectura');
    assert.equal(resultadoRulesDeploy(e, spec).status, 'fail');
  });

  test(`${spec.patternId} estándar: estricto original (mismatch FAIL, lock ausente/inválido WARN)`, async () => {
    const e = await estadosDe(spec);
    const status = (t: EstadoRules['tipo']) => resultadoRulesDeploy(e[t], spec).status;
    assert.equal(status('pendiente'), 'fail');
    assert.equal(status('sincronizado'), 'pass');
    assert.equal(status('sin-lock'), 'warn');
    assert.equal(status('lock-invalido'), 'warn');
    assert.equal(status('sin-rules'), 'pass');
    assert.equal(status('error-lectura'), 'fail');
    for (const estado of Object.values(e)) {
      const { original, rules, otro } = politica('estandar', spec, estado);
      assert.deepEqual(rules, original);
      assert.equal(otro.status, 'fail');
    }
  });

  test(`${spec.patternId} verificación: sólo el mismatch demostrado baja a WARN con evidencia`, async () => {
    const e = await estadosDe(spec);
    const { rules } = politica('verificacion', spec, e.pendiente);
    assert.equal(rules.status, 'warn');
    assert.ok(rules.notes?.some((n) => n.includes(sha(REGLAS))));
    assert.ok(rules.notes?.some((n) => n.includes(sha('otra'))));
    assert.equal(politica('verificacion', spec, e.sincronizado).rules.status, 'pass');
    for (const t of ['sin-lock', 'lock-invalido', 'sin-rules', 'error-lectura'] as const) {
      assert.equal(politica('verificacion', spec, e[t]).rules.status, 'fail', t);
    }
    for (const estado of Object.values(e)) {
      assert.equal(politica('verificacion', spec, estado).otro.status, 'fail');
    }
  });

  test(`${spec.patternId} publicación: sólo sincronizado pasa`, async () => {
    const e = await estadosDe(spec);
    assert.equal(politica('publicacion', spec, e.sincronizado).rules.status, 'pass');
    for (const t of ['pendiente', 'sin-lock', 'lock-invalido', 'sin-rules', 'error-lectura'] as const) {
      const { rules, otro } = politica('publicacion', spec, e[t]);
      assert.equal(rules.status, 'fail', t);
      assert.ok(rules.hits.length > 0, t);
      assert.equal(otro.status, 'fail');
    }
  });

  test(`${spec.patternId} commit local: mismatch WARN, el resto como estándar`, async () => {
    const e = await estadosDe(spec);
    assert.equal(politica('commit-local', spec, e.pendiente).rules.status, 'warn');
    assert.equal(politica('commit-local', spec, e['error-lectura']).rules.status, 'fail');
    assert.equal(politica('commit-local', spec, e['sin-lock']).rules.status, 'warn');
    assert.equal(politica('commit-local', spec, e.pendiente).otro.status, 'fail');
  });
}

// --- Adversariales: la política no se guía por texto ni por status sueltos ---

test('adversarial: FAIL de P-005 con estado no-pendiente no baja a WARN en verificación', async () => {
  const e = await estadosDe(SPEC_FIRESTORE);
  const falso: InvariantResult = {
    ...resultadoRulesDeploy(e.pendiente, SPEC_FIRESTORE),
    notes: ['cambió desde el último deploy'],
  };
  for (const t of ['error-lectura', 'sin-lock', 'lock-invalido', 'sincronizado'] as const) {
    const [r] = aplicarPolitica('verificacion', [falso], [{ spec: SPEC_FIRESTORE, estado: e[t] }]);
    assert.equal(r.status, 'fail', t);
  }
});

test('adversarial: un FAIL ajeno con patternId sin estado inspeccionado queda intacto', async () => {
  const e = await estadosDe(SPEC_FIRESTORE);
  const ajeno: InvariantResult = { ...otroFail, patternId: 'P-013' };
  const [r] = aplicarPolitica('verificacion', [ajeno], [{ spec: SPEC_FIRESTORE, estado: e.pendiente }]);
  assert.deepEqual(r, ajeno);
});

test('adversarial: P-005 pendiente no afecta a P-013 sincronizado ni viceversa', async () => {
  const f = await estadosDe(SPEC_FIRESTORE);
  const s = await estadosDe(SPEC_STORAGE);
  const res = aplicarPolitica(
    'publicacion',
    [resultadoRulesDeploy(f.pendiente, SPEC_FIRESTORE), resultadoRulesDeploy(s.sincronizado, SPEC_STORAGE)],
    [{ spec: SPEC_FIRESTORE, estado: f.pendiente }, { spec: SPEC_STORAGE, estado: s.sincronizado }],
  );
  assert.deepEqual(res.map((r) => r.status), ['fail', 'pass']);
});

// --- Resolución de contexto ---

test('resolverModo: flags, conflictos y prohibiciones de commit local', () => {
  assert.deepEqual(resolverModo([], {}), { ok: true, modo: 'estandar' });
  assert.deepEqual(resolverModo(['--verification'], { CI: 'true' }), { ok: true, modo: 'verificacion' });
  assert.deepEqual(resolverModo(['--ci', '--verification'], { CI: 'true' }), { ok: true, modo: 'verificacion' });
  assert.deepEqual(resolverModo(['--publication'], { VERCEL: '1' }), { ok: true, modo: 'publicacion' });
  assert.deepEqual(resolverModo(['--local-commit'], { CI: '' }), { ok: true, modo: 'commit-local' });
  const pares = [
    ['--local-commit', '--verification'],
    ['--local-commit', '--publication'],
    ['--verification', '--publication'],
    ['--local-commit', '--verification', '--publication'],
  ];
  for (const p of pares) assert.equal(resolverModo(p, {}).ok, false, p.join(' '));
  assert.equal(resolverModo(['--local-commit'], { CI: 'true' }).ok, false);
  assert.equal(resolverModo(['--local-commit'], { VERCEL: '1' }).ok, false);
  assert.equal(resolverModo(['--local-commit', '--ci'], {}).ok, false);
});

// --- Runner real: combinaciones inválidas salen con 2 antes de correr cazadores ---

function runner(args: string[], env: Record<string, string | undefined>) {
  const base: NodeJS.ProcessEnv = { ...process.env };
  delete base.CI;
  delete base.VERCEL;
  return spawnSync(process.execPath, ['--import', 'tsx', RUN_ALL, ...args], {
    cwd: ROOT,
    env: { ...base, ...env },
    encoding: 'utf8',
    timeout: 60_000,
  });
}

test('runner real: rechaza contextos en conflicto y commit local en CI', () => {
  for (const [args, env] of [
    [['--verification', '--publication'], {}],
    [['--local-commit', '--publication'], {}],
    [['--local-commit'], { CI: 'true' }],
    [['--local-commit'], { VERCEL: '1' }],
    [['--local-commit', '--ci'], {}],
  ] as const) {
    const r = runner([...args], env);
    assert.equal(r.status, 2, `${args.join(' ')} ${JSON.stringify(env)}\n${r.stderr}`);
    assert.match(r.stderr, /\[run-all\]/);
  }
});

// --- Hooks y configuración ---

const leer = (rel: string) => readFile(path.join(ROOT, rel), 'utf8');

test('hooks: pre-commit usa --local-commit y pre-push usa --verification', async () => {
  const preCommit = await leer('.husky/pre-commit');
  const prePush = await leer('.husky/pre-push');
  assert.match(preCommit, /check:regression --silent -- --local-commit/);
  assert.match(prePush, /run-all\.ts --verification/);
  assert.doesNotMatch(prePush, /--local-commit|--publication|--no-verify/);
});

test('config: scripts, vercel.json y workflow de CI', async () => {
  const pkg = JSON.parse(await leer('package.json')) as { scripts: Record<string, string> };
  assert.equal(pkg.scripts['check:verification:ci'], 'tsx scripts/invariantes/run-all.ts --ci --verification');
  assert.equal(pkg.scripts['check:publication'], 'tsx scripts/invariantes/run-all.ts --publication');

  const vercel = JSON.parse(await leer('vercel.json')) as {
    buildCommand: string;
    rewrites: Array<{ source: string; destination: string }>;
    git?: { deploymentEnabled?: Record<string, boolean> };
  };
  assert.equal(vercel.buildCommand, 'npm run check:publication && npm run build');
  assert.deepEqual(vercel.rewrites, [{ source: '/((?!api/).*)', destination: '/index.html' }]);
  // La rama de CI no despliega en Vercel; ninguna entrada (ni wildcard) la vuelve a habilitar.
  assert.deepEqual(vercel.git?.deploymentEnabled, { 'claude/ci-main-20261015': false });
  assert.ok(!Object.values(vercel.git?.deploymentEnabled ?? {}).includes(true));

  const ci = await leer('.github/workflows/ci.yml');
  assert.match(ci, /actions\/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1/);
  assert.match(ci, /actions\/setup-node@949feb2413d6458794dcd2491c4babbbce0c15c1/);
  assert.match(ci, /persist-credentials: false/);
  assert.match(ci, /contents: read/);
  assert.match(ci, /npm run check:verification:ci/);
  assert.doesNotMatch(ci, /secrets\.|--local-commit|--publication|deploy|upload-artifact/);
});
