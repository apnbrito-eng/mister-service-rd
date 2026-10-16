# Entrega — CI de verificación sin secretos + separación verificación/publicación

- Fecha: 2026-10-15
- Rama: `claude/ci-main-20261015` (base remota `main` en `fa0cdb0`)
- Autor: Claude (construcción). Revisión y publicación: Codex.
- Estado: **código escrito, NADA ejecutado**. Ver "Pruebas NO ejecutadas".

## Qué cambia

| Archivo | Cambio |
|---|---|
| `.github/workflows/ci.yml` | Nuevo. Ubuntu 24.04, Node 24.14.1, `contents: read`, checkout con `persist-credentials: false`, cache npm por `package-lock.json`, concurrency por workflow+evento+ref con cancelación, timeout 15 min. Eventos `push`, `pull_request`, `workflow_dispatch`. Actions oficiales fijadas por SHA (checkout `3d3c42e5…`, setup-node `949feb24…`, ambos v7 según la verificación previa de la API). Sin secretos, sin deploy, sin artefactos. |
| `scripts/invariantes/estado-rules-deploy.ts` | Nuevo. Inspección compartida de P-005/P-013: una lectura por archivo y un estado tipado (`sin-rules`, `error-lectura`, `sin-lock`, `lock-invalido`, `pendiente`, `sincronizado`) basado en evidencia del FS (hash SHA-256, código de error). |
| `scripts/invariantes/politica-publicacion.ts` | Nuevo. Contextos `estandar` / `--local-commit` / `--verification` / `--publication` y la política sobre P-005/P-013. |
| `scripts/invariantes/check-rules-pendientes-deploy.ts`, `check-storage-rules-pendientes-deploy.ts` | Usan el módulo compartido. `check()` se mantiene exportado. Encabezados: se conserva la historia del defecto; se retiraron la sugerencia de regenerar el lock sin deploy y el bypass `git commit --no-verify`. La recuperación documentada es deploy real autorizado + verificación. Solo comentarios; sin cambio de lógica. |
| `scripts/invariantes/run-all.ts` | Resuelve el contexto antes de correr nada (exit 2 si es inválido), inspecciona P-005/P-013 una sola vez y aplica la política. Se conservan los otros 22 cazadores, en el mismo orden. Ya no recomienda `--no-verify`. |
| `package.json` | Scripts `check:verification:ci` y `check:publication`. No se tocaron dependencias ni `package-lock.json`. |
| `vercel.json` | `buildCommand: npm run check:publication && npm run build`. Rewrites intactos. Además deshabilita el deploy automático de Vercel **solo** para la rama `claude/ci-main-20261015`; el resto de ramas (incluida `main`) mantiene su comportamiento de deploy sin cambios. |
| `.husky/pre-commit` | Cazadores con `--local-commit`. |
| `.husky/pre-push` | Nuevo. Cazadores con `--verification`. |
| `tests/unit/controlPublicacion.test.ts` | Nuevo. Incluye una prueba que revisa la configuración de `vercel.json` (deploy automático deshabilitado solo para esta rama). No se ha ejecutado: no se afirma que pase; queda para Codex. `tests/unit/timelineUnificado.test.ts` sin cambios. |

## Pasos del workflow

`npm ci` → `tsc --noEmit -p tsconfig.json` → `npm run typecheck:api` → `npm run check:verification:ci` → ESLint sobre archivos versionados (`git ls-files -z` de `*.ts *.tsx *.js *.mjs *.cjs` | `xargs -0 -r eslint --no-warn-ignored --report-unused-disable-directives`, sin `--max-warnings 0`) → `node --import tsx --test tests/unit/*.test.ts` → `vite build`.

No usa `npm test` ni omite tests. No define variables `VITE_*`: según la inspección previa, el build no las necesita. Si no fuera así, el paso de build va a fallar en CI y hay que revisarlo, no inyectar secretos.

## Matriz de la política (P-005 y P-013 por igual)

| Estado del FS | estándar | `--local-commit` | `--verification` | `--publication` |
|---|---|---|---|---|
| sincronizado | PASS | PASS | PASS | PASS |
| pendiente (mismatch demostrado) | FAIL | WARN + evidencia | WARN + ambos hashes | FAIL |
| sin-lock | WARN | WARN | FAIL | FAIL |
| lock-invalido | WARN | WARN | FAIL | FAIL |
| sin-rules | PASS (N/A) | PASS (N/A) | FAIL | FAIL |
| error-lectura | FAIL | FAIL | FAIL | FAIL |

- Los FAIL de los demás cazadores no cambian en ningún contexto.
- Los contextos son excluyentes: cualquier combinación sale con exit 2.
- `--local-commit` está prohibido si `CI` o `VERCEL` tienen valor, o junto a `--ci`.
- Para bajar a WARN se necesita que el estado inspeccionado sea `pendiente` **y** que el resultado del cazador sea FAIL. El texto del mensaje no interviene.
- `main` tiene hoy los dos locks versionados, así que en `--verification` un lock faltante se trata como regresión (FAIL).

**Cambio deliberado en el modo estándar:** antes, un error de lectura de `*.rules` distinto de ENOENT (por ejemplo, permisos o una ruta que es un directorio) contaba como "no hay rules" y daba PASS. Ahora da FAIL. Es más estricto que el original.

**TOCTOU:** `run-all` lee rules y lock una sola vez por archivo, y ese mismo estado se usa para el resultado y para la política. Queda una ventana entre que el runner lee los archivos y que Vercel construye; dentro de un mismo build eso no es un vector práctico.

## Lo que esto NO hace

- No crea protección de rama en GitHub ni required checks: hay que configurarlos aparte. Hasta entonces, un push a `main` con CI en rojo no queda bloqueado en el remoto.
- No prueba nada sobre producción. `--verification` deja pasar código cuyas reglas todavía no están deployadas; el único bloqueo de publicación es el `buildCommand` de Vercel.
- Si un proyecto de Vercel tiene un Build Command definido en el dashboard, ese gana sobre `vercel.json`: hay que verificarlo.
- `.husky/pre-push` se creó sin cambiar permisos (no hubo shell). Husky 9 invoca los hooks con `sh`, pero conviene revisar que el hook efectivamente corra.
- La referencia `--local-commit` se adaptó de la rama de control de publicación y se extendió a P-013. No se trajeron otros commits ni cazadores de esa rama.

## Pruebas NO ejecutadas

En esta sesión no se ejecutó ningún comando: no hubo Bash, red, commits ni push. **Ningún test, typecheck, lint, build ni workflow se corrió.** Pendiente para Codex:

1. `npm ci`
2. `npx tsc --noEmit -p tsconfig.json`
3. `npm run typecheck:api` (incluye los scripts nuevos)
4. `node --import tsx --test tests/unit/*.test.ts`: la base `main` tiene un solo test unitario previo más este archivo nuevo. No se debe citar cobertura de la rama local.
5. ESLint sobre los archivos versionados (como en el workflow), en especial el test nuevo.
6. `npm run check:regression`, `npm run check:verification:ci` y `npm run check:publication` sobre el estado real del repo (con los locks actuales, los tres deberían comportarse igual).
7. Pruebas manuales negativas: modificar una copia de `firestore.rules` → verification WARN y publication FAIL; quitar el lock → verification FAIL.
8. `vite build` sin variables `VITE_*`.
9. Que el workflow corra en GitHub y que las actions se resuelvan por SHA.
10. Que la prueba unitaria de `controlPublicacion.test.ts` sobre `vercel.json` pase, y confirmar en Vercel que el deploy automático queda deshabilitado solo para `claude/ci-main-20261015` y que las demás ramas siguen igual.
