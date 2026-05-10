/**
 * Entry point — corre todos los cazadores en paralelo y reporta.
 *
 * Uso:
 *   npm run check:regression
 *   npm run check:regression -- --verbose
 *   npm run check:regression -- --ci      (output JSON, no colores)
 *
 * Exit codes:
 *   0 — todos los cazadores pasaron (o sólo warns).
 *   1 — al menos un cazador falló.
 *
 * NOTA — P-008 NO está acá por diseño:
 *   `scripts/invariantes/check-notis-legacy-data-shape.ts` escanea DATOS LIVE
 *   en Firestore via Admin SDK. Requiere `service-account.json` + cuota
 *   Firebase + 10-60s de tiempo de ejecución. NO es apto para pre-commit
 *   hook (que corre en <5s sobre archivos locales). Se invoca manualmente
 *   con `npm run audit:notis-legacy`. Ver entrada P-008 en
 *   `docs/PATRONES_REGRESION.md` para frecuencia recomendada.
 */
import { check as checkUserprofileId } from './check-userprofile-id-misuse.js';
import { check as checkRulesImmutability } from './check-rules-immutability.js';
import { check as checkCrossCollectionTx } from './check-cross-collection-tx.js';
import { check as checkAltaEmpleadoDobleDoc } from './check-alta-empleado-doble-doc.js';
import { check as checkRulesPendientesDeploy } from './check-rules-pendientes-deploy.js';
import { check as checkTecnicoidPersonalIdMisuse } from './check-tecnicoid-personal-id-misuse.js';
import { check as checkCrearnotificacionUseridShape } from './check-crearnotificacion-userid-shape.js';
import { COLOR } from './types.js';

const argv = process.argv.slice(2);
const VERBOSE = argv.includes('--verbose');
const CI = argv.includes('--ci');

const c = (color: keyof typeof COLOR, s: string) =>
  CI ? s : `${COLOR[color]}${s}${COLOR.reset}`;

async function main() {
  const checks = [
    checkUserprofileId,
    checkRulesImmutability,
    checkCrossCollectionTx,
    checkAltaEmpleadoDobleDoc,
    checkRulesPendientesDeploy,
    checkTecnicoidPersonalIdMisuse,
    checkCrearnotificacionUseridShape,
  ];

  const t0 = Date.now();
  const results = await Promise.all(checks.map((fn) => fn()));
  const elapsed = Date.now() - t0;

  if (CI) {
    console.log(JSON.stringify({ results, elapsedMs: elapsed }, null, 2));
    process.exit(results.some((r) => r.status === 'fail') ? 1 : 0);
  }

  console.log(c('bold', `\n=== Cazadores anti-regresión (${elapsed}ms) ===\n`));

  let failCount = 0;
  let warnCount = 0;
  let totalHits = 0;

  for (const r of results) {
    const icon =
      r.status === 'pass'
        ? c('green', '✓')
        : r.status === 'warn'
        ? c('yellow', '⚠')
        : c('red', '✗');
    const head = `${icon} ${c('bold', r.patternId)} — ${r.patternName}`;
    console.log(head);

    if (VERBOSE && r.notes) {
      for (const n of r.notes) console.log(c('dim', `   ${n}`));
    }

    if (r.hits.length === 0) {
      if (!VERBOSE) console.log(c('dim', `   sin hits`));
    } else {
      totalHits += r.hits.length;
      console.log(c('dim', `   ${r.hits.length} hit(s):`));
      for (const h of r.hits) {
        console.log(`   ${c('cyan', h.file)}:${c('cyan', String(h.line))}`);
        console.log(`     ${c('dim', '|')} ${h.snippet}`);
        // Wrap explanation a ~80 cols
        const words = h.explanation.split(' ');
        let line = '     ';
        for (const w of words) {
          if ((line + ' ' + w).length > 90) {
            console.log(c('dim', line));
            line = '       ' + w;
          } else {
            line += (line === '     ' ? '' : ' ') + w;
          }
        }
        if (line.trim()) console.log(c('dim', line));
        console.log('');
      }
    }

    if (r.status === 'fail') failCount++;
    else if (r.status === 'warn') warnCount++;
  }

  console.log('');
  if (failCount === 0 && warnCount === 0) {
    console.log(c('green', `✓ Todos los cazadores pasaron. 0 hits.`));
    process.exit(0);
  } else if (failCount === 0) {
    console.log(
      c('yellow', `⚠ ${warnCount} cazador(es) con warns, ${totalHits} hit(s).`),
    );
    process.exit(0);
  } else {
    console.log(
      c('red', `✗ ${failCount} cazador(es) fallaron, ${totalHits} hit(s) total.`),
    );
    console.log(
      c('dim', `\nEl pre-commit hook bloqueó este commit. Para bypassear ` +
        `(SÓLO si el hit es un falso positivo legítimo), usá:\n   git commit --no-verify\n\n` +
        `Y agregá el archivo a la allowlist del cazador en el siguiente commit.`),
    );
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('[run-all] error inesperado:', err);
  process.exit(2);
});
