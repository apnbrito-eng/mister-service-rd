/**
 * Re-migración acotada masiva: setea `userId = <auth.uid correcto>` en las 44
 * notificaciones Caso A identificadas para 5 empleados específicos por la
 * auditoría de `scripts/auditoria-notis-legacy-todos.ts` (SPRINT-117 fase A2,
 * commits `ac54662` + `6defe8f`).
 *
 * Disparado por SPRINT-118 (autorizado por jorge en BLOQUEOS.md → desbloqueado
 * el 2026-05-08; coordinator NO ejecuta `--apply` autónomo, Jorge ejecuta
 * manualmente).
 *
 * Generaliza el patrón de `scripts/re-migrar-notificaciones-yohana.ts` a 5
 * empleados con scope hardcodeado y rígido (uids + personalDocIds + 44 doc IDs
 * autorizados explícitamente).
 *
 * Scope autorizado (rígido — el script aborta si algo no matchea):
 *
 *   | Empleado          | auth.uid                            | personalDocId          | Notis Caso A |
 *   |-------------------|-------------------------------------|------------------------|--------------|
 *   | Yohana Operaria   | HGkVoYpGKzL4JJI7FnTpHjdsM972        | zFhokrDoPH9lD63ZxKAY   | 3            |
 *   | Wilainy Operaria  | KT9LaszokWNmLCEIe8YOvNKc9rF3        | j944265Su9Hyw29YQTj8   | 14           |
 *   | Jorge (admin)     | dN2wxlTrLUMAff1gE2K4Q8IXi2m2        | 63ZMIT2LouKFLpBCQLUk   | 9            |
 *   | misterservicerd   | kAKPMRLe8aaAJxCrvyc8YeMoxRG3        | GqJfIoRgP4GJTAActUKy   | 9            |
 *   | Maria Teresa      | HgakSUkclXSyxmBeLm3GkayFOK63        | NXFORv7bqeksSg980icg   | 9            |
 *
 * Lo que hace:
 *  1. Para cada empleado:
 *     a. Verifica que `personal/{personalDocIdEsperado}` exista y tenga
 *        `uid == authUidEsperado`. Si no matchea → aborta sin escribir nada.
 *     b. Para cada doc autorizado del empleado:
 *        - Lee el doc.
 *        - Si `userId == authUidEsperado` → ya alineado, skip (idempotencia).
 *        - Si `userId == personalDocIdEsperado` o `userId == null` → migra
 *          a `authUidEsperado`.
 *        - Si `userId` está en otro valor → skip de ese doc, warn (no aborta
 *          el script entero — solo ese doc).
 *  2. Después de los updates: escribe entrada de auditoría en `auditoria_admin`
 *     con accion `remigracion_notificaciones_masivo`, listando docs tocados +
 *     empleados afectados.
 *
 * Lo que NO hace (por diseño):
 *  - NO toca `destinatarioId` (la lectura dual del service ya lo soporta).
 *  - NO toca campos `leida`, `leidaEn`, `tipo`, `titulo`, `descripcion`, etc.
 *  - NO migra notificaciones fuera de los 44 IDs autorizados.
 *  - NO modifica rules.
 *  - NO borra docs.
 *
 * Uso:
 *   npx tsx scripts/re-migrar-notificaciones-masivo.ts             # DRY-RUN por default (no escribe)
 *   npx tsx scripts/re-migrar-notificaciones-masivo.ts --apply     # ejecuta los updates reales
 *
 * Idempotencia: si los docs ya tienen `userId == auth.uid esperado`, el script
 * reporta "ya alineado" y no escribe. Seguro de correr múltiples veces.
 *
 * Requiere `service-account.json` en la raíz del repo (mismo patrón que
 * `scripts/re-migrar-notificaciones-yohana.ts` y `scripts/auditoria-notis-legacy-todos.ts`).
 */

import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import * as fs from 'fs';
import * as path from 'path';

// Constantes del scope autorizado por jorge en SPRINT-118 (2026-05-08).
// Si algo no matchea exactamente con estas constantes, el script aborta el
// empleado afectado (no el script entero — los demás empleados siguen).

interface EmpleadoScope {
  alias: string;
  authUidEsperado: string;
  personalDocIdEsperado: string;
  docsAutorizados: readonly string[];
}

const SCOPE: readonly EmpleadoScope[] = [
  {
    alias: 'Yohana Operaria',
    authUidEsperado: 'HGkVoYpGKzL4JJI7FnTpHjdsM972',
    personalDocIdEsperado: 'zFhokrDoPH9lD63ZxKAY',
    docsAutorizados: [
      'F9BV32k4JEoEOk97K4xc',
      'TVwtOtmNlzW334IUIUdF',
      'VWjdYBRmKgU8rGPlbJAv',
    ],
  },
  {
    alias: 'Wilainy Operaria',
    authUidEsperado: 'KT9LaszokWNmLCEIe8YOvNKc9rF3',
    personalDocIdEsperado: 'j944265Su9Hyw29YQTj8',
    docsAutorizados: [
      '2tPkAmQymtZgMLRRQfTr',
      '451UPKpR2vAmsCpsoFNv',
      '8WdJHYbEYdZ4wUc4eQnE',
      'BgAsQHZMPEfa3LL8ffyV',
      'DpQh90B38dmVjSEJVxFv',
      'ERtDuPDxeUXph8b8cSNv',
      'FMnk6RpFQyxiYRiKZQln',
      'JHa0TPJpGVH3OpzPPlV1',
      'PFRnT9GuahrydO8g8Hhz',
      'Q2Z0pBdjwo6vyK04koPZ',
      'SV5DhnuxPwEOCwBwNt2t',
      'vKdH6Q9dLRRYQZFUolNY',
      'vfbmwla7698GcANVUShS',
      'zWWMGk1UFV75sAjaOoVu',
    ],
  },
  {
    alias: 'Jorge (admin)',
    authUidEsperado: 'dN2wxlTrLUMAff1gE2K4Q8IXi2m2',
    personalDocIdEsperado: '63ZMIT2LouKFLpBCQLUk',
    docsAutorizados: [
      '5CZ6039fqvtRyGpiNseM',
      'cWDqvmuXpFJptULZ3eOD',
      'fjW4YYIq74MtaneORrCD',
      'gzSt5SBjTJBRmDmB1rUq',
      'lFOU7YDdREy6Rauyyp0q',
      'xBUxbB10ocEH2kjLADIl',
      'zisaxTDaX1vGmj6Cq9mu',
      '3hV65FcsI4HJ3Q0nc4Dv',
      'o5yco816RhNGwquDv8P1',
    ],
  },
  {
    alias: 'misterservicerd (admin)',
    authUidEsperado: 'kAKPMRLe8aaAJxCrvyc8YeMoxRG3',
    personalDocIdEsperado: 'GqJfIoRgP4GJTAActUKy',
    docsAutorizados: [
      '4WEMXrqqrAZyoxd7CfQs',
      'RXpcWGzERPpfnhc8IwcR',
      'WMansj9afOAJcFJbTvuH',
      'eFKbcOHszof28K3NVL9s',
      'k8dH5RIfMKeBx3QDHagB',
      'uRyZuUceQPnSgPBqNgtV',
      'xpZLRggHAA8goPfJ1Vhf',
      'SZe4ymcOeFWDgH9WFZDj',
      'T477a42VXV0oguzrZcTh',
    ],
  },
  {
    alias: 'Maria Teresa (coord)',
    authUidEsperado: 'HgakSUkclXSyxmBeLm3GkayFOK63',
    personalDocIdEsperado: 'NXFORv7bqeksSg980icg',
    docsAutorizados: [
      'DUZFo0j9pXuKL6oRYPZn',
      'DVnPHlYFH838E0xbOVWt',
      'LZKL5vbYCoUY4eueQOmW',
      'Oyz2NElDajHl2jDOlnD9',
      'jU1r9gmKH1oDBQPSMeXG',
      'pEwGvpvP0Fo8BUhf2Npc',
      'zv8qZ3oq97AXsaPKOCai',
      'XqrPkWoGtK65EGrf6yx0',
      'rrtigrKrsHyJgNKrprTX',
    ],
  },
] as const;

const TOTAL_DOCS_AUTORIZADOS = SCOPE.reduce(
  (acc, e) => acc + e.docsAutorizados.length,
  0,
);

const SERVICE_ACCOUNT_PATH = path.resolve('service-account.json');

if (!getApps().length) {
  if (!fs.existsSync(SERVICE_ACCOUNT_PATH)) {
    console.error('[ERROR] No existe service-account.json en la raíz del repo.');
    process.exit(1);
  }
  const serviceAccount = JSON.parse(fs.readFileSync(SERVICE_ACCOUNT_PATH, 'utf-8'));
  initializeApp({ credential: cert(serviceAccount) });
}

const db = getFirestore();

type Resultado =
  | 'actualizado'
  | 'ya_alineado'
  | 'skip_userId_inesperado'
  | 'no_existe'
  | 'empleado_aborto_validacion';

interface ShapeAntesDespues {
  empleadoAlias: string;
  authUidEsperado: string;
  id: string;
  userIdAntes: string | null;
  userIdDespues: string;
  destinatarioIdAntes: string | null;
  resultado: Resultado;
  notas?: string;
}

async function procesarEmpleado(
  empleado: EmpleadoScope,
  apply: boolean,
): Promise<ShapeAntesDespues[]> {
  const resultados: ShapeAntesDespues[] = [];

  console.log(`\n────── ${empleado.alias} ──────`);
  console.log(`  authUidEsperado:       ${empleado.authUidEsperado}`);
  console.log(`  personalDocIdEsperado: ${empleado.personalDocIdEsperado}`);
  console.log(`  docs autorizados:      ${empleado.docsAutorizados.length}`);

  // 1. Verificar contra realidad: leer personal/{personalDocIdEsperado} y
  //    confirmar uid == authUidEsperado. Si no matchea, abortamos solo este
  //    empleado (no el script entero) — los demás siguen.
  const personalRef = db.collection('personal').doc(empleado.personalDocIdEsperado);
  const personalSnap = await personalRef.get();

  if (!personalSnap.exists) {
    console.error(`  [WARN] No existe personal/${empleado.personalDocIdEsperado}. Skip empleado.`);
    for (const docId of empleado.docsAutorizados) {
      resultados.push({
        empleadoAlias: empleado.alias,
        authUidEsperado: empleado.authUidEsperado,
        id: docId,
        userIdAntes: null,
        userIdDespues: empleado.authUidEsperado,
        destinatarioIdAntes: null,
        resultado: 'empleado_aborto_validacion',
        notas: `personal/${empleado.personalDocIdEsperado} no existe — empleado entero skipped.`,
      });
    }
    return resultados;
  }

  const personalData = personalSnap.data() ?? {};
  const authUidReal: string | undefined = personalData.uid;

  if (authUidReal !== empleado.authUidEsperado) {
    console.error(
      `  [WARN] personal.uid (${authUidReal ?? '(null)'}) no matchea authUidEsperado (${empleado.authUidEsperado}). Skip empleado.`,
    );
    for (const docId of empleado.docsAutorizados) {
      resultados.push({
        empleadoAlias: empleado.alias,
        authUidEsperado: empleado.authUidEsperado,
        id: docId,
        userIdAntes: null,
        userIdDespues: empleado.authUidEsperado,
        destinatarioIdAntes: null,
        resultado: 'empleado_aborto_validacion',
        notas: `personal.uid (${authUidReal ?? '(null)'}) no matchea authUidEsperado.`,
      });
    }
    return resultados;
  }

  console.log(`  [OK] Validación contra realidad: personal.uid == authUidEsperado.`);

  // 2. Para cada doc autorizado, leer y validar antes de tocar.
  for (const docId of empleado.docsAutorizados) {
    const ref = db.collection('notificaciones').doc(docId);
    const snap = await ref.get();

    if (!snap.exists) {
      resultados.push({
        empleadoAlias: empleado.alias,
        authUidEsperado: empleado.authUidEsperado,
        id: docId,
        userIdAntes: null,
        userIdDespues: empleado.authUidEsperado,
        destinatarioIdAntes: null,
        resultado: 'no_existe',
        notas: 'Doc no existe en notificaciones/. Skip.',
      });
      continue;
    }

    const data = snap.data() ?? {};
    const userIdAntes = typeof data.userId === 'string' ? data.userId : null;
    const destinatarioIdAntes =
      typeof data.destinatarioId === 'string' ? data.destinatarioId : null;

    // Idempotencia: ya alineado.
    if (userIdAntes === empleado.authUidEsperado) {
      resultados.push({
        empleadoAlias: empleado.alias,
        authUidEsperado: empleado.authUidEsperado,
        id: docId,
        userIdAntes,
        userIdDespues: empleado.authUidEsperado,
        destinatarioIdAntes,
        resultado: 'ya_alineado',
        notas: 'userId ya está en authUidEsperado. Skip.',
      });
      continue;
    }

    // Defensa: solo migramos si userId == personalDocIdEsperado (Caso A
    // confirmado por la auditoría) o userId == null (mismo vector). Si es
    // otro valor, skip de ese doc — señal de algo que no entendemos.
    if (userIdAntes !== null && userIdAntes !== empleado.personalDocIdEsperado) {
      resultados.push({
        empleadoAlias: empleado.alias,
        authUidEsperado: empleado.authUidEsperado,
        id: docId,
        userIdAntes,
        userIdDespues: empleado.authUidEsperado,
        destinatarioIdAntes,
        resultado: 'skip_userId_inesperado',
        notas: `userId actual (${userIdAntes}) no es null ni personalDocIdEsperado. NO se sobrescribe — revisar manualmente.`,
      });
      continue;
    }

    // Aplicar (o dry-run).
    if (apply) {
      await ref.update({
        userId: empleado.authUidEsperado,
        // sello de auditoría de la propia mutación.
        remigradoEn: FieldValue.serverTimestamp(),
        remigradoPor: 'script_re-migrar-notificaciones-masivo',
      });
    }

    resultados.push({
      empleadoAlias: empleado.alias,
      authUidEsperado: empleado.authUidEsperado,
      id: docId,
      userIdAntes,
      userIdDespues: empleado.authUidEsperado,
      destinatarioIdAntes,
      resultado: 'actualizado',
    });
  }

  return resultados;
}

async function main() {
  const apply = process.argv.includes('--apply');
  const modo = apply ? 'APLICAR' : 'DRY-RUN';
  console.log(`[INFO] Modo: ${modo}`);
  console.log(
    `[INFO] Scope: ${SCOPE.length} empleados, ${TOTAL_DOCS_AUTORIZADOS} docs autorizados (SPRINT-118).`,
  );

  const resultados: ShapeAntesDespues[] = [];

  for (const empleado of SCOPE) {
    const r = await procesarEmpleado(empleado, apply);
    resultados.push(...r);
  }

  // Reporte por doc.
  console.log(`\n─── Resultado por doc ───`);
  for (const r of resultados) {
    console.log(`  - [${r.empleadoAlias}] ${r.id}`);
    console.log(`      userIdAntes:         ${r.userIdAntes ?? '(null)'}`);
    console.log(`      userIdDespues:       ${r.userIdDespues}`);
    console.log(`      destinatarioIdAntes: ${r.destinatarioIdAntes ?? '(null)'} (NO modificado)`);
    console.log(`      resultado:           ${r.resultado}`);
    if (r.notas) console.log(`      notas:               ${r.notas}`);
  }

  const actualizados = resultados.filter((r) => r.resultado === 'actualizado').length;
  const yaAlineados = resultados.filter((r) => r.resultado === 'ya_alineado').length;
  const skips = resultados.filter(
    (r) =>
      r.resultado === 'skip_userId_inesperado' ||
      r.resultado === 'no_existe' ||
      r.resultado === 'empleado_aborto_validacion',
  ).length;

  console.log(`\n─── Resumen ───`);
  console.log(`  Modo:                     ${modo}`);
  console.log(`  Empleados en scope:       ${SCOPE.length}`);
  console.log(`  Total docs autorizados:   ${TOTAL_DOCS_AUTORIZADOS}`);
  console.log(`  ${apply ? 'Actualizados' : 'Que se actualizarían'}: ${actualizados}`);
  console.log(`  Ya alineados (idempotencia): ${yaAlineados}`);
  console.log(`  Skips (revisar):          ${skips}`);

  // Desglose por empleado.
  console.log(`\n─── Desglose por empleado ───`);
  for (const empleado of SCOPE) {
    const delEmpleado = resultados.filter((r) => r.empleadoAlias === empleado.alias);
    const act = delEmpleado.filter((r) => r.resultado === 'actualizado').length;
    const ya = delEmpleado.filter((r) => r.resultado === 'ya_alineado').length;
    const sk = delEmpleado.filter(
      (r) =>
        r.resultado === 'skip_userId_inesperado' ||
        r.resultado === 'no_existe' ||
        r.resultado === 'empleado_aborto_validacion',
    ).length;
    console.log(
      `  - ${empleado.alias.padEnd(28)} act=${act}, ya=${ya}, skip=${sk} (total=${delEmpleado.length})`,
    );
  }

  // Auditoría — solo en modo apply, solo si hubo updates.
  if (apply && actualizados > 0) {
    await db.collection('auditoria_admin').add({
      accion: 'remigracion_notificaciones_masivo',
      sprintId: 'SPRINT-118',
      actorScript: 'scripts/re-migrar-notificaciones-masivo.ts',
      ejecutadoEn: FieldValue.serverTimestamp(),
      docsAfectados: resultados
        .filter((r) => r.resultado === 'actualizado')
        .map((r) => ({ id: r.id, empleadoAlias: r.empleadoAlias, authUid: r.authUidEsperado })),
      docsNoModificados: resultados
        .filter((r) => r.resultado !== 'actualizado')
        .map((r) => ({ id: r.id, empleadoAlias: r.empleadoAlias, resultado: r.resultado })),
      empleadosAfectados: SCOPE.map((e) => ({
        alias: e.alias,
        authUid: e.authUidEsperado,
        personalDocId: e.personalDocIdEsperado,
        docsAutorizadosCount: e.docsAutorizados.length,
      })),
      totales: {
        actualizados,
        yaAlineados,
        skips,
        totalScope: TOTAL_DOCS_AUTORIZADOS,
      },
    });
    console.log(`\n  [OK] Entrada de auditoría escrita en auditoria_admin/`);
  }

  if (!apply) {
    console.log(`\n[INFO] DRY-RUN — nada fue escrito a Firestore.`);
    console.log(
      `       Para ejecutar real: npx tsx scripts/re-migrar-notificaciones-masivo.ts --apply`,
    );
  } else {
    console.log(`\n[OK] Re-migración aplicada.`);
    console.log(`     Próximo paso: pedirle a los 5 empleados hard refresh y verificar campanita.`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('\n[ERROR] Falló la re-migración masiva:', err);
    process.exit(1);
  });
