# Postmortem — Botones de "Iniciar Chequeo" rotos por rules sin deployar

**Fecha del incidente:** 2026-05-07
**Detectado por:** Jorge (reporte directo: "los botones de inicio de chequeo del módulo técnico no están funcionando")
**Severidad:** alta
**Patrón asociado:** P-005 (clase nueva — catalogada como consecuencia de este postmortem)
**Commits relacionados:**
- Introduce: `1568a63` (SPRINT-103, 2026-05-06) — modificó `firestore.rules` con `.get(field, null)` para campos opcionales pero no deployó.
- Fix: `9ac9742` (SPRINT-106, 2026-05-07) — `npm run deploy:rules` ejecutado + cazador P-005 + lock file.
- Sub-reglas y refinamiento: `caa21bf` (SPRINT-106 follow-up, 2026-05-07).

---

## Resumen ejecutivo

El SPRINT-103 (2026-05-06) modificó `firestore.rules` correctamente para arreglar el patrón P-002 (campos opcionales con acceso directo) en `noTocaSoloChequeo`, `noTocaCamposAprobacion` y `noTocaAsignacion`. El sprint cerró COMPLETADO con commit y push, pero NUNCA se ejecutó `npm run deploy:rules`. Las rules deployadas en producción siguieron siendo la versión vieja, que rechazaba con `permission-denied` cualquier `updateDoc` técnico sobre órdenes regulares (sin `soloChequeo`/`estadoAprobacion`/`ayudanteId` previos). Detectado ~24h después por Jorge cuando los técnicos reportaron que el botón "Iniciar Chequeo" no respondía.

---

## Timeline

| Hora (UTC aprox) | Evento |
|---|---|
| 2026-05-06 noche | SPRINT-103 cierra COMPLETADO con commit `1568a63`. Rules en repo cambiadas. EJECUCION_AUTONOMA.md anota "Acción humana sin cambio: `npm run deploy:rules`" como pendiente. |
| 2026-05-06 → 2026-05-07 | ~24h sin deploy. Las rules de producción quedan desincronizadas. |
| 2026-05-07 mañana | Técnicos en campo intentan iniciar chequeo en órdenes regulares. Botón rompe silenciosamente (permission-denied no surfaceaba como toast rojo en algunos puntos del flujo). |
| 2026-05-07 ~mediodía | Jorge reporta a Cowork: "los botones de inicio de chequeo del módulo técnico no están funcionando". |
| 2026-05-07 ~mediodía | SPRINT-106 abierto en cola con 3 hipótesis (60% rules sin deploy, 30% lógica rota, 10% GPS/cámara). |
| 2026-05-07 ~21:00 UTC | Coordinator ejecuta `trabaja`. Diagnóstico confirma Hipótesis #1. `npm run deploy:rules` ejecutado. |
| 2026-05-07 ~21:05 UTC | Cazador P-005 + lock file + sub-reglas committeadas en `9ac9742` y `caa21bf`. |
| 2026-05-07 ~21:10 UTC | Validación implícita: patrón anterior P-002 ya no aplica con rules nuevas; flujo técnico vuelve a funcionar. |

---

## Impacto

- **Usuarios afectados:** todos los técnicos activos del campo. La operación diaria de Mister Service depende del flujo "técnico inicia chequeo → diagnostica → cierra".
- **Funcionalidad bloqueada:** botón "Iniciar Chequeo" no avanzaba la fase de la orden ni grababa la hora de inicio en Firestore. El técnico veía el click sin efecto.
- **Tiempo total fuera:** ~24 horas desde commit `1568a63` hasta `9ac9742`.
- **Severidad de negocio:** alta. Bloqueó operación diaria de campo. Salvaguarda parcial: las órdenes de mantenimiento programado (que sí tienen los 4 campos de aprobación populados al crear) seguían funcionando — eso enmascaró el bug y retrasó la detección hasta que un técnico tocó una orden regular.
- **Pérdida de datos:** no.

---

## Causa raíz (5 porqués)

1. **¿Por qué los botones no funcionaban?** — Porque `updateDoc` en `IniciarChequeoButton.tsx` recibía `permission-denied` silencioso de Firestore.
2. **¿Por qué permission-denied?** — Porque las rules de producción rechazaban la igualdad estructural sobre campos opcionales ausentes (`request.resource.data.X == resource.data.X` con ambos lados missing → false en Firestore Rules, no `null == null`).
3. **¿Por qué las rules de producción tenían esa lógica vieja, si en el repo ya estaban con `.get(field, null)`?** — Porque las rules nuevas (commit `1568a63`) nunca se deployaron a producción.
4. **¿Por qué no se deployaron?** — Porque `npm run deploy:rules` requiere ejecución humana manual y SPRINT-103 lo dejó documentado como "acción humana pendiente" en `EJECUCION_AUTONOMA.md` sin enforcement.
5. **¿Por qué no había enforcement?** — **Causa raíz:** el proceso confiaba en disciplina humana en lugar de automation. Hay un gap estructural entre "código pusheado al repo" (que dispara Vercel auto-deploy del frontend vía webhook) y "rules deployadas a Firebase" (que requiere `firebase deploy` ejecutado a mano). Sin un mecanismo que bloquee commits con desincronía, el gap es explotable por simple olvido.

---

## Lo que funcionó bien

- **El catálogo P-002 ya predecía el síntoma exacto.** SPRINT-106 diagnosticó la hipótesis correcta en menos de 10 minutos porque el patrón "campo opcional missing == missing" estaba documentado.
- **El diseño del SPRINT-106 con 3 hipótesis ranqueadas evitó debug exploratorio.** Hipótesis #1 (60%) era la correcta.
- **El reporte de Jorge fue inmediato.** El botón rompía un flujo crítico que él prueba a diario, así que el lag de detección fue ~24h en lugar de días.
- **El log `EJECUCION_AUTONOMA.md` del SPRINT-103 dejó la acción humana pendiente documentada.** Eso permitió cazar la causa rápido sin necesidad de bisect completo.

---

## Lo que falló

- **No había cazador determinístico para "rules sin deployar".** Era un patrón ausente. P-001 a P-004 cubrían otros vectores pero ninguno cazaba este.
- **El proceso confiaba en disciplina humana.** "Acordate de correr `npm run deploy:rules`" no es enforcement — es un comentario.
- **Vercel auto-deploya frontend, Firebase no auto-deploya rules.** Esa asimetría no estaba reflejada en ningún checkpoint del flujo del coordinator.
- **El bug fue silencioso para órdenes de mantenimiento** (que sí tienen los campos de aprobación populados). Eso enmascaró el problema y demoró la detección.
- **Ningún cazador semántico (`regression_guardian`) estaba programado para alertar cuando un sprint toca rules.** El SPRINT-103 cerró sin esa verificación adicional.

---

## Acciones tomadas (fix inmediato)

- `npm run deploy:rules` ejecutado el 2026-05-07 ~21:00 UTC. Output: `released rules firestore.rules to cloud.firestore`.
- No hubo cambio de código de la app — el código del repo ya estaba correcto desde `1568a63`.

---

## Acciones preventivas (para que no vuelva)

- [x] **Cazador determinístico P-005:** `scripts/invariantes/check-rules-pendientes-deploy.ts`. Calcula SHA-256 de `firestore.rules` y lo compara contra `firestore.rules.deployed.lock`. Hashes distintos → FAIL en pre-commit. Lock missing → WARN. Imposible deployar sin actualizar el lock porque el script `deploy:rules` ahora es compuesto.
- [x] **Lock file:** `firestore.rules.deployed.lock` generado automáticamente por `scripts/invariantes/marcar-rules-deployadas.ts` post-deploy.
- [x] **`package.json` script `deploy:rules` compuesto:** `firebase deploy --only firestore:rules && tsx scripts/invariantes/marcar-rules-deployadas.ts`. Imposible deployar sin actualizar el lock.
- [x] **Sub-regla en CLAUDE.md:** "Sprints que tocan `firestore.rules` deben ejecutar `npm run deploy:rules` ANTES de marcar COMPLETADO. El coordinator/devops es responsable. Sin esto, el código nuevo en producción puede chocar con rules viejas y romper flujos críticos silenciosamente."
- [x] **Sub-regla en CLAUDE.md:** "Cleanup de 'dead code' en archivos de páginas críticas requiere QA manual del flujo afectado antes de commit."
- [x] **Catálogo P-005** en `docs/PATRONES_REGRESION.md`.
- [x] **Agente `archivist`** (SPRINT-107, este postmortem) — modo PRE-CHANGE recordará al coordinator P-005 cuando un touch-list incluya `firestore.rules`.

---

## Métricas

- **Tiempo desde introducción hasta detección:** ~24 horas (SPRINT-103 cerró noche 2026-05-06 → reporte de Jorge mediodía 2026-05-07).
- **MTTR (detección hasta fix):** ~9 horas (mediodía → 21:00 UTC). Nota: si Jorge hubiese pegado `trabaja` inmediatamente, MTTR efectivo era ~30 minutos. Los 8.5h adicionales son tiempo de cola / disponibilidad humana, no tiempo de diagnóstico/fix.
- **MTTR puro (diagnóstico + ejecución del fix):** ~30 minutos.
- **Es recurrencia de clase ya catalogada:** **NO** — clase nueva. Ningún P-XXX previo cubría "rules en repo ≠ rules deployadas".
- **Predicción del cazador previo:** parcial. P-002 predecía el síntoma final ("permission-denied por campo opcional sin `.get()`") pero el cazador P-002 sólo escanea `firestore.rules` del repo — no detectaba que esas rules correctas no estuvieran activas en producción.

---

## Lecciones aprendidas

**Patrón de pensamiento que llevó al error:** asumir que "código mergeado al repo == código en producción". Esa asunción es válida para Vercel (auto-deploy de frontend vía webhook GitHub→Vercel) pero **falsa** para Firebase Firestore Rules, que requieren un comando manual. Esa asimetría entre sistemas autom-deployables y manualmente-deployables es invisible para quien no la conoce explícitamente.

**Hábito a cambiar:** todo cambio que requiere acción humana adicional para tomar efecto en producción debe tener (a) detección automática de la desincronía y (b) bloqueo del próximo commit hasta que se sincronice. La disciplina humana sin enforcement es deuda técnica latente.

**Presunción implícita falsa:** "el log de `EJECUCION_AUTONOMA.md` que dice 'acción humana pendiente' es suficiente recordatorio". No lo es. Los recordatorios pasivos en docs son ignorados con ~100% de probabilidad si no están conectados a un check ejecutable.

**Email de 3 frases al equipo del futuro:**

> Si modificás `firestore.rules`, deploy ANTES de cerrar el sprint. El pre-commit hook ahora bloquea automáticamente cualquier commit que tenga diff entre `firestore.rules` y `firestore.rules.deployed.lock`. Si querés bypassear (no deberías): ejecutá `npm run deploy:rules` y el lock se actualiza solo.

---

## Referencias

- Sprint hotfix: `docs/sprints/COLA_AUTONOMA.md` SPRINT-106
- Log de ejecución: `docs/sprints/EJECUCION_AUTONOMA.md` (sección 2026-05-07)
- Patrón: `docs/PATRONES_REGRESION.md` P-005
- Cazador: `scripts/invariantes/check-rules-pendientes-deploy.ts`
- Hooks de deploy: `scripts/invariantes/marcar-rules-deployadas.ts`
- Lock file: `firestore.rules.deployed.lock`
