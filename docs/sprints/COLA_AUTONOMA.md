# Cola autónoma de sprints

> Cowork escribe acá. Coordinator lee y procesa cuando Jorge pega `trabaja`.
> Formato y reglas en `docs/sprints/COLA_AUTONOMA_PROTOCOLO.md`.

**Última actualización:** 2026-05-06 por Cowork (creación inicial)

**Próximo ID disponible:** SPRINT-100

---

## Sprints

### SPRINT-100 — Validar que Yohana ve notificaciones después de b93625d

**Estado:** PENDIENTE
**Prioridad:** alta
**Origen:** Jorge dijo "no veo las notificaciones" como Yohana operaria, 2026-05-06.
**Riesgo:** bajo
**Touch-list previsto:** ninguno (sólo validación)

#### Objetivo
Confirmar que después del deploy de `b93625d` (NotificacionesPanel usa
`currentUser.uid`), Yohana puede ver las 3 notificaciones que tiene
pendientes y marcarlas como leídas. Si NO funciona, escalar al builder
para investigar si la migración `migrar-notificaciones-userid.ts` copió
valores correctos.

#### Por qué
El sprint anterior (`b93625d`) arregló la consulta. Pero la migración previa
copió `destinatarioId` verbatim a `userId`. Si `destinatarioId` viejo era
`personalDocId` en lugar de `auth.uid`, la migración propagó el bug — la
consulta nueva tampoco matchearía.

#### Criterios de aceptación
- [ ] Yohana hace hard refresh, click en campanita, ve ≥1 notificación.
- [ ] Yohana puede marcar una como leída y persiste.
- [ ] Si no ve nada: builder corre script de diagnóstico que dump
      `notificaciones where userId == <auth.uid de Yohana>` y compara
      con `notificaciones where destinatarioId == <auth.uid Yohana>`.
- [ ] Si los dos queries devuelven 0 docs pero Yohana SÍ tenía notifs antes:
      diseñar script `re-migrar-notificaciones-personaldocid-a-authuid.ts`
      que mapea `usuarios where rol != 'administrador' → personal where uid==`
      y reemplaza `userId == personalDocId` por `userId == auth.uid`.
- [ ] Reportar resultado en EJECUCION_AUTONOMA.md.

#### Restricciones / guardarrails
- Si requiere correr script de migración → marcar BLOQUEADO (>500 docs no, pero migración de datos sí requiere OK).
- Si encuentra un patrón nuevo de regresión → agregar P-XXX a `docs/PATRONES_REGRESION.md` + cazador.

#### Notas para el coordinator
- Usar Yohana como caso de prueba; ID en `usuarios/{auth.uid}` debería ser conocido.
- El bug original es pre-existente en CLAUDE.md como "asunción frágil técnico personal/{id}.id == auth.uid" extendido a operarias.
- Si Jorge no está disponible para confirmar visualmente, dejar el sprint en PENDIENTE — no hay forma de "validar UI" desde el coordinator.

---

### SPRINT-101 — Smoke test inicial de cazadores anti-regresión

**Estado:** PENDIENTE
**Prioridad:** alta
**Origen:** Cowork creó el sistema anti-regresión hoy.
**Riesgo:** bajo
**Touch-list previsto:** ninguno (sólo validación), o updates a allowlists si hay falsos positivos.

#### Objetivo
Correr `npm run check:regression` por primera vez en HEAD actual y
documentar los hits encontrados. Decidir cuáles son hits legítimos
(arreglar en sprints futuros) y cuáles son falsos positivos (agregar a
allowlist documentada).

#### Por qué
El sistema nuevo no se probó en el repo actual. Puede haber hits viejos
de P-001/P-002/P-003 que ya están en la rama main. Necesitamos saber el
baseline.

#### Criterios de aceptación
- [ ] `npm install` corre OK (instalando `tsx` y `husky`).
- [ ] `npx husky init` configura `.husky/`.
- [ ] El `.husky/pre-commit` que escribimos sobrevive (si husky lo sobreescribió, restaurarlo).
- [ ] `npm run check:regression` corre sin error de runtime.
- [ ] Reportar en EJECUCION_AUTONOMA.md cuántos hits por patrón.
- [ ] Si hay <5 hits totales: arreglarlos en sprint follow-up (SPRINT-102).
- [ ] Si hay ≥5 hits: agregar todos a allowlist documentada con comentario "//baseline 2026-05-06" y crear sprint de cleanup gradual.

#### Restricciones / guardarrails
- NO bypass del hook si falla. Si hay un hit que no se puede arreglar fácil, agregar a allowlist con justificación.
- regression_guardian no es necesario en este sprint (no toca código de la app).

#### Notas para el coordinator
- `npm install` puede dar warnings de peer deps; son aceptables si no son errors.
- `husky init` puede sobreescribir `.husky/pre-commit`. Antes de correrlo, hacer backup: `cp .husky/pre-commit /tmp/pre-commit.bak && npx husky init && cp /tmp/pre-commit.bak .husky/pre-commit && chmod +x .husky/pre-commit`.

---

### SPRINT-102 — Fijar la sub-regla de "cada bug → cazador" en flujos

**Estado:** PENDIENTE
**Prioridad:** media
**Origen:** Cowork, 2026-05-06.
**Riesgo:** bajo
**Touch-list previsto:** `.claude/agents/coordinator.md`, `.claude/agents/builder.md`

#### Objetivo
Actualizar instrucciones del coordinator y del builder para que cuando un
sprint cierre un bug que rompió producción, automáticamente:
1. Agreguen entrada P-XXX en `docs/PATRONES_REGRESION.md`.
2. Creen cazador en `scripts/invariantes/check-<algo>.ts`.
3. Lo registren en `run-all.ts`.

Sin esto, la sub-regla queda en CLAUDE.md pero los agentes no la aplican
sistemáticamente.

#### Criterios de aceptación
- [ ] coordinator.md menciona explícitamente: "si el sprint cierra un bug de producción, agregar P-XXX + cazador".
- [ ] builder.md tiene instrucciones de cómo escribir un cazador (estructura, allowlist, .test).
- [ ] Ejemplo concreto: el sprint actual de NotificacionesPanel debería haber agregado P-001 actualizado (hit cazado por b93625d).
- [ ] regression_guardian sigue funcionando.

#### Restricciones / guardarrails
- Sólo edición de archivos `.claude/agents/*.md`.
- Sin tocar código de la app.

#### Notas para el coordinator
- Es meta-trabajo. Hacelo después de que los sprints urgentes (100, 101) cierren.

---

## Sprints completados (histórico)

_(El coordinator mueve sprints aquí cuando los completa)_

---

## Plantilla para sprints nuevos (para Cowork)

```markdown
### SPRINT-XXX — <título>

**Estado:** PENDIENTE
**Prioridad:** alta | media | baja
**Origen:** <Jorge dijo X | Cowork detectó Y>
**Riesgo:** bajo | medio | alto
**Touch-list previsto:** <archivos>

#### Objetivo
...

#### Por qué
...

#### Criterios de aceptación
- [ ] ...

#### Restricciones / guardarrails
- ...

#### Notas para el coordinator
- ...
```
