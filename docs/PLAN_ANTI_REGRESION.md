# Plan anti-regresión — Mister Service RD

> Cada bug que rompió producción se convierte en un **chequeo ejecutable**.
> Ese chequeo vive para siempre y se corre antes de cada commit, gratis,
> sin gastar tokens de razonamiento.

---

## El problema que estamos resolviendo

Patrón observado en los últimos 30 días:

| Fecha | Sprint | Bug que rompió | Hotfix(es) |
|---|---|---|---|
| 2026-05-04 | Mapa+Reactivación (`a38eb89`) | Campañas no se podían crear (rule rechaza) | `afc5e4a`, `5f8f256`, `c7c8e34` |
| 2026-05-05 | Migración notifs `userId` | Yohana operaria no veía notifs | `b93625d` |
| 2026-04-28 | Webhook GitHub→Vercel stale | Deploys no disparaban | Rotación de Deploy Hook |
| 2026-04-XX | Sprint counter Mantenimiento | Race condition en numeración | Refactor transaccional |

**El patrón común:** una clase de bug se documenta como gotcha en `CLAUDE.md`,
pero la próxima feature reintroduce la misma clase en otro lugar porque
**el gotcha vive en lenguaje natural y nadie lo aplica sistemáticamente al diff**.

Ejemplos concretos del re-uso de la misma clase:

- **Gotcha "userProfile.id ≠ auth.uid"** apareció en `afc5e4a` (Reactivación, escritura) y volvió a romper en `b93625d` (Notificaciones, lectura). Mismo patrón, distinto lugar.
- **Gotcha "rules con campos opcionales"** apareció en `c7c8e34`. La próxima rule con campo opcional puede caer igual si nadie hace grep proactivo.
- **Gotcha "mutación cross-collection sin transacción"** documentado tras `a38eb89`. La próxima feature puede reintroducirlo si nadie audita.

---

## Filosofía: 3 capas de defensa

```
┌─────────────────────────────────────────────┐
│ Capa 3: Reviewer humano (Jorge)             │  ← último recurso
├─────────────────────────────────────────────┤
│ Capa 2: regression-guardian (agente IA)     │  ← análisis semántico del diff
├─────────────────────────────────────────────┤
│ Capa 1: scripts/invariantes/ (determinístico)│  ← grep estructurado, AST
├─────────────────────────────────────────────┤
│ Pre-commit hook (husky)                     │  ← gate automático
└─────────────────────────────────────────────┘
```

**Capa 1 — Cazadores determinísticos (sin tokens):**
Scripts TypeScript que recorren el repo o el diff y buscan patrones específicos
correspondientes a bugs ya vistos. Son falsos negativos cero para los patrones
que conocen, falsos positivos manejables vía allowlist. Corren en <5s.

**Capa 2 — Agente regression-guardian (tokens controlados):**
Antes de cerrar un sprint, el coordinator invoca `regression-guardian` con el
diff. El agente lee `docs/PATRONES_REGRESION.md` (catálogo curado), aplica
razonamiento sobre el diff buscando instancias semánticas que el grep no
puede atrapar, y retorna PASS/CHANGES_NEEDED.

**Capa 3 — Pre-commit hook:**
Pega las dos capas anteriores. Si capa 1 falla, bloquea. Si pasa, sigue.
Capa 2 se invoca on-demand desde el coordinator cuando el sprint cierra.

---

## Catálogo de patrones de regresión (vivo)

Ubicación: `docs/PATRONES_REGRESION.md` (creado en este plan).

Cada patrón tiene esta forma:

```
ID: P-XXX
Nombre: <descripción corta>
Bug original: <commit hash + fecha>
Síntoma: <cómo se manifiesta en producción>
Causa raíz: <por qué pasa>
Detección automática: <script en scripts/invariantes/>
Allowlist: <archivos donde el patrón es válido>
```

**Patrones iniciales (basados en bugs reales del último mes):**

| ID | Nombre | Bug original | Cazador |
|---|---|---|---|
| P-001 | userProfile.id usado donde se requiere auth.uid | `afc5e4a` (2026-05-05) | `check-userprofile-id-misuse.ts` |
| P-002 | Rule de inmutabilidad sobre campo opcional sin .get() | `c7c8e34` (2026-05-05) | `check-rules-immutability.ts` |
| P-003 | Mutación cross-collection sin runTransaction | (riesgo activo) | `check-cross-collection-tx.ts` |
| P-004 | Helper que escribe + retorna sin denormalizar | `ded0124` (2026-05-04) | (manual, candidato futuro) |
| P-005 | Effect persiste a localStorage sin guard restaurado | (gotcha CLAUDE.md) | (manual, candidato futuro) |
| P-006 | Export non-component desde .tsx | (gotcha CLAUDE.md) | ya cubierto por ESLint react-refresh/only-export-components |

A medida que aparezcan bugs nuevos, **el sprint que los cierra debe agregar
su patrón aquí + cazador en `scripts/invariantes/`**. Sub-regla nueva en
`CLAUDE.md`.

---

## Arquitectura de los cazadores

Cada cazador en `scripts/invariantes/check-*.ts` exporta una función con esta
firma:

```ts
export interface InvariantResult {
  patternId: string;       // 'P-001'
  patternName: string;     // 'userProfile.id misuse'
  status: 'pass' | 'fail' | 'warn';
  hits: Array<{
    file: string;
    line: number;
    snippet: string;
    explanation: string;   // "esto rompió commit afc5e4a, evita repetir"
  }>;
}

export async function check(): Promise<InvariantResult>;
```

`scripts/invariantes/run-all.ts` corre todos los cazadores en paralelo, agrega
hits y retorna exit code 0 (todo pass) o 1 (al menos un fail).

`package.json` expone:

```json
{
  "scripts": {
    "check:regression": "tsx scripts/invariantes/run-all.ts",
    "check:regression:ci": "tsx scripts/invariantes/run-all.ts --ci"
  }
}
```

---

## Pre-commit hook (husky)

Archivo `.husky/pre-commit`:

```bash
#!/usr/bin/env sh
. "$(dirname -- "$0")/_/husky.sh"

# Capa 1 — chequeos rápidos y determinísticos
npx tsc --noEmit || { echo '[ABORT] typecheck falló'; exit 1; }
npm run check:regression || { echo '[ABORT] regression check falló'; exit 1; }

# Lint sólo de archivos modificados (rápido, no bloquea por errores legacy)
STAGED=$(git diff --cached --name-only --diff-filter=ACMR | grep -E '\.(ts|tsx)$' || true)
if [ -n "$STAGED" ]; then
  npx eslint $STAGED --max-warnings 0 || { echo '[ABORT] lint falló en archivos staged'; exit 1; }
fi
```

**Decisión clave:** `tsc --noEmit` se corre sobre TODO el repo (necesario, los
errores TypeScript pueden ser cross-file). `eslint` sólo sobre archivos
staged porque hay 80+ errores pre-existentes en legacy. Esto evita que el
hook bloquee siempre, pero garantiza que cada archivo nuevo o modificado
queda limpio.

**Bypass de emergencia:** `git commit --no-verify`. Sólo para casos donde
el hook tiene un falso positivo y hay que desbloquear; el bug del falso
positivo se corrige en el próximo commit.

---

## Agente regression-guardian

Ubicación: `.claude/agents/regression-guardian.md`.

**Cuándo se invoca:** el coordinator lo llama después de que `builder` termina
y antes de que `tester`/`reviewer` arranquen. Recibe el diff completo del
sprint (no solo archivos modificados — el diff con `git diff main...HEAD`).

**Qué hace:**
1. Lee `docs/PATRONES_REGRESION.md` para tener el catálogo en contexto.
2. Lee el diff entero.
3. Para cada patrón del catálogo, evalúa si el diff lo viola.
4. Reporta hits con archivo, línea, explicación, y sugerencia de fix.
5. Si encuentra hits → `CHANGES_NEEDED`. Si no → `PASS`.

**Diferencia con capa 1:** los cazadores determinísticos son grep / AST muy
estricto. El agente puede detectar instancias semánticas:

- Capa 1: caza `userProfile.id` literal en archivos sensibles.
- Capa 2: caza una variable que viene de `userProfile` aunque tenga otro nombre,
  usado en una posición que la rule espera `auth.uid`.

**Costo:** ~5-10k tokens por invocación. Se invoca 1 vez por sprint.

---

## Sub-regla nueva en CLAUDE.md

> **Cada bug que rompió producción debe convertirse en un cazador ejecutable.**
> El sprint que cierra el bug debe (a) actualizar gotcha en CLAUDE.md como
> antes, Y ADEMÁS (b) agregar entrada en `docs/PATRONES_REGRESION.md` y
> cazador en `scripts/invariantes/`. Sin esto, la próxima feature
> reintroduce el bug en otro lugar y volvemos a empezar. Patrón establecido
> en este plan (commit hash a determinar).

---

## Plan de adopción (hoy)

1. Documento maestro (este archivo). ✅
2. Catálogo `docs/PATRONES_REGRESION.md` con P-001, P-002, P-003.
3. Scripts `scripts/invariantes/check-{userprofile-id-misuse, rules-immutability, cross-collection-tx}.ts` + `run-all.ts`.
4. `package.json`: agregar `check:regression`, devDep `tsx` y `husky`.
5. `.husky/pre-commit` configurado.
6. `CLAUDE.md`: agregar sub-regla.
7. `.claude/agents/regression-guardian.md` con instrucciones detalladas.
8. Smoke test: correr `npm run check:regression` en HEAD actual y validar que pasa (o, si encuentra hits viejos, agregarlos a allowlist documentada).
9. Commit + push.

---

## Métricas de éxito (revisar en 30 días)

- ¿Bajaron los hotfixes follow-up a sprints? Ratio actual: ~3 hotfix por sprint mediano. Objetivo: <0.5.
- ¿Cuántos bugs cazó el pre-commit hook antes de merge? Loguear en `docs/sprints/RETRO_*.md`.
- ¿Cuántos patrones nuevos se agregaron al catálogo? Objetivo: ≥1 cada 2 semanas mientras la deuda se va pagando.

---

## Falsos positivos: política

Cuando un cazador grita por algo legítimo:

1. **NO** desactivar el cazador.
2. Agregar el archivo o snippet específico a la **allowlist documentada** en el header del cazador, con comentario que explica por qué es legítimo.
3. Si la allowlist crece a >5 entradas, el patrón está mal definido — refactor del cazador.

---

## Lo que NO hace este plan

- No reemplaza tests automatizados (no los tenemos y no es momento de meterlos).
- No reemplaza al `reviewer` agent (mantiene su rol de code review independiente).
- No previene bugs de UX o de lógica de negocio — sólo regresiones de patrones técnicos conocidos.
- No corre en CI todavía. Vive en pre-commit local. CI es un siguiente paso si vemos tracción.
