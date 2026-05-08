# Cola autónoma de sprints

> Cowork escribe acá. Coordinator lee y procesa cuando Jorge pega `trabaja`.
> Formato y reglas en `docs/sprints/COLA_AUTONOMA_PROTOCOLO.md`.

**Última actualización:** 2026-05-08 por coordinator (cuarta pasada autónoma, `procesa bloqueos` — SPRINT-115 fase write desbloqueada por jorge tras diagnóstico, ahora se procesa autónomo).

**Próximo ID disponible:** SPRINT-116

---

## Sprints

### SPRINT-100 — Validar que Yohana ve notificaciones después de b93625d

**Estado:** PENDIENTE (QA visual ejecutado 2026-05-08 con Yohana → resultado: "no hay nada en la campanita". Diagnóstico de causa raíz delegado a SPRINT-115. Este sprint queda PENDIENTE hasta que SPRINT-115 confirme y reparare; Yohana hará re-QA post-fix).
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

**Estado:** COMPLETADO 2026-05-06 (smoke test ejecutado por Cowork antes de crear SPRINT-103; baseline 35 hits documentado)
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

**Estado:** COMPLETADO 2026-05-06
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

### SPRINT-103 — Triaje y fix del baseline anti-regresión (35 hits)

**Estado:** COMPLETADO 2026-05-06 (P-001: 6 bugs reales fixeados con currentUser.uid + 16 falsos positivos allowlistados con `// @safe-userprofile-id:`. P-002: rules de campos opcionales convertidas a `.get(field, null)`, campos required marcados con `// @safe-required:`. Cazadores: 0 hits.)
**Prioridad:** alta
**Origen:** Cowork ejecutó smoke test `npm run check:regression` el 2026-05-06; cazadores devolvieron 22 hits P-001 + 13 hits P-002 + 0 hits P-003. Output completo en chat con Jorge.
**Riesgo:** medio (P-002 toca `firestore.rules` → BLOQUEAR ese sub-paso si aplica enforcement de la política)
**Touch-list previsto:** ~7 archivos `src/**`, `firestore.rules`, los 2 archivos cazadores en `scripts/invariantes/`

#### Objetivo
Procesar los 35 hits del baseline inicial: arreglar los bugs latentes reales (mismo patrón de `afc5e4a`), agregar los falsos positivos a allowlist documentada, y silenciar los hits legítimos en `firestore.rules` con `@safe-required` o convertir a `.get(field, null)` según corresponda.

#### Por qué
El sistema anti-regresión funciona pero por diseño bloquea commits hasta que el baseline esté limpio. Sin esto, `git commit` requiere `--no-verify` siempre. Además, hay ~7 bugs latentes del mismo vector que `afc5e4a` (Reactivación) que afectan operarias/técnicos cargados vía cascada `personal/`.

#### Triaje preliminar (Cowork)

**P-001 — bugs reales (probable, 7 hits) — fix con `currentUser.uid`:**
1. `src/components/cierre/ModalSugerirSoloChequeo.tsx:94` — `sugeridaPor: userProfile.id`
2. `src/pages/Reprogramaciones.tsx:115,123,173,237` — `resueltaPor: userProfile.id` (4 writes)
3. `src/pages/SugerenciasChequeo.tsx:99,136` — `resueltaPor: userProfile.id` (2 writes)
4. `src/pages/TecnicoVista.tsx:238` — `tecnicoId: userProfile.id` (write)

**P-001 — falsos positivos (15 hits) — agregar a allowlist:**
- Comparaciones de UI/filtros donde no hay write a Firestore (`Dashboard.tsx`, `OrdenDetalle.tsx`, varios `TecnicoVista.tsx`, `IniciarChequeoButton.tsx:224`).
- El builder debe verificar caso por caso antes de allowlistar.

**P-002 — auditar uno por uno (13 hits en `firestore.rules`):**
- Por cada campo, verificar en el código (`src/services/`, `crearOrden`, `crearCampana`, etc.) si el campo SIEMPRE se escribe en el create.
- Si SIEMPRE se escribe → agregar comentario `// @safe-required: <campo>` arriba del bloque (silencia el cazador).
- Si es OPCIONAL → cambiar a `request.resource.data.get('X', null) == resource.data.get('X', null)`.
- Si toca `firestore.rules`, requiere `regression_guardian` + `reviewer` con foco en rules + DEPLOY de rules con `npm run deploy:rules`.

#### Criterios de aceptación
- [ ] `npm run check:regression` pasa con `0 hits` (o todos en allowlist documentada).
- [ ] Los ~7 bugs reales P-001 corregidos con `currentUser.uid` siguiendo patrón de commit `afc5e4a`.
- [ ] Allowlist de cazador `check-userprofile-id-misuse.ts` documentada con cada archivo y razón.
- [ ] Rules con `@safe-required` o `.get()` aplicado según corresponda. Cambios a `firestore.rules` requieren reviewer + deploy explícito.
- [ ] `npm run build` OK al final.
- [ ] Commit + push + deploy Vercel Ready.

#### Restricciones / guardarrails
- Los cambios a `firestore.rules` cuentan como sub-sprint que SÍ requiere mi OK explícito (Jorge) → marcar BLOQUEADO ese paso si aplica el protocolo. Sin embargo, en este caso son los CAZADORES los que detectan rules ya existentes en producción que pueden estar rotas — el "fix" es en su mayoría agregar comentarios `@safe-required`. Aplicar autonomía pero invocar `regression_guardian` antes de cerrar.
- `regression_guardian` obligatorio antes del commit final.
- NO bypass del pre-commit hook con `--no-verify`. Si hay un hit legítimo que no se puede mover a allowlist, escalar a Jorge.

#### Notas para el coordinator
- Antes de hacer cualquier fix, **invocar a `architect` o `tech_lead`** para validar el plan de triaje (clasificar los 35 hits en BUG / FALSO POSITIVO / RULE-AUDIT). Mi triaje preliminar arriba es Cowork-side y puede tener errores.
- Patrón de fix de bugs reales P-001: replicar `afc5e4a`:
  1. Importar `useApp` en el componente si no está.
  2. `const { currentUser } = useApp();`
  3. Reemplazar `userProfile.id` por `currentUser.uid` en el write.
  4. Guard `if (!currentUser) return;` antes del write.
- Allowlist en `scripts/invariantes/check-userprofile-id-misuse.ts` se edita en la constante `ALLOWLIST_FILES`. Si agregás 5+ entradas, refactorear el cazador (regla del protocolo).
- Para auditar P-002 en rules: para cada campo X, hacer `grep "X:" src/services/` o equivalente para verificar si el create SIEMPRE escribe el campo. Ejemplo: `creadaPor` en `crearCampana()` SIEMPRE se escribe → `@safe-required`. `overrideCooldown*` SOLO cuando admin override → `.get(field, null)` (este ya está hecho en `c7c8e34`).

---

### SPRINT-104 — Recordatorios admin clickeables (push + override)

**Estado:** COMPLETADO 2026-05-06 (modal con 3 botones operativo, runTransaction recordatorio + auditoria_admin, regression_guardian PASS, sin tocar firestore.rules)
**Prioridad:** media
**Origen:** Jorge dijo "desde el administrador u operador también debemos poder dar click en esta notificación si queremos autorizarla y decirle a la joven que haga su trabajo" el 2026-05-06 (Cowork chat). Decisiones confirmadas vía AskUserQuestion: modal con 3 botones + ambos recordatorios (ruta + avisos a clientes).
**Riesgo:** bajo (UI + un service nuevo + 1 rule nueva mínima)
**Touch-list previsto:**
- `src/components/recordatorios/RecordatorioBanner.tsx` (hacer filas clickeables cuando rol es admin/coord)
- `src/components/recordatorios/ModalAccionRecordatorio.tsx` (NUEVO — modal con 3 botones)
- `src/services/recordatorios.service.ts` (agregar `enviarRecordatorioOperaria` y `marcarRecordatorioCompletadoPorAdmin`)
- `src/utils/whatsapp.ts` (helper para construir mensaje de empuje)
- `firestore.rules` (rule de update sobre el campo de recordatorio si requiere) — auditar primero
- Posiblemente `src/types/index.ts` si hay shape nuevo de `recordatorios`

#### Objetivo
Cuando el admin o coordinadora ven en el Dashboard una operaria con recordatorio pendiente (Ruta de mañana o Avisos a clientes), poder hacer click en su fila para abrir un modal con 3 acciones:

1. **"Recordar a la operaria"** → manda WhatsApp + notificación in-app a la operaria diciendo "Jorge te recuerda organizar la ruta de mañana" (o "avisar a los clientes de mañana"). Mensaje WhatsApp pre-armado en español RD, abre `wa.me/...` con texto. Notif in-app via `crearNotificacion` con `tipo: 'recordatorio_admin'`, `userId: operaria.uid`. Toast "Recordatorio enviado a Wilainy" en éxito.

2. **"Marcar completado por admin"** → modal pide motivo corto (free text, 80 chars max). Al confirmar:
   - Update doc de recordatorios con `completadoPor: { uid: currentUser.uid, nombre: userProfile.nombre, motivo, fechaOverride: serverTimestamp() }`.
   - Audit log en `auditoria_admin` con `accion: 'override_recordatorio'`, `actorUid: currentUser.uid`, `recordatorioId`, `operariaId`.
   - Banner queda en estado "Completado (override admin)" con tooltip que muestra quién + motivo.
   - Toast "Marcado como completado".

3. **"Cancelar"** → cierra modal sin acción.

#### Por qué
Hoy el banner es read-only — el admin ve que Wilainy no organizó la ruta y solo puede llamarla por WhatsApp manualmente o esperar. Eliminar esa fricción permite empujar al equipo en segundos sin abandonar el dashboard, y registra forensia (quién recordó a quién, cuándo, override de quién y por qué). Es operativo, no es bug.

#### Criterios de aceptación
- [ ] Click en fila de operaria pendiente (rol admin o coordinadora) → abre `ModalAccionRecordatorio`. Click en fila completada → no abre nada (o muestra tooltip "ya completado por <quién>").
- [ ] Operaria/secretaria/técnico viendo el dashboard NO pueden hacer click — la fila no es clickeable para esos roles (gate por `userProfile.rol`).
- [ ] Botón "Recordar" → mensaje WhatsApp + notif in-app simultáneos. Mensaje WhatsApp en español RD, profesional, no agresivo. Ej: "Hola Wilainy, soy Jorge. Te recuerdo organizar la ruta de mañana antes de las 6 PM. Gracias." Para "Avisos a clientes" similar.
- [ ] Botón "Marcar completado" → motivo obligatorio min 5 chars, max 80. Update + audit log atómico vía `runTransaction` (P-003 cumplido). Ver gotcha CLAUDE.md "Mutaciones cross-collection deben ir en un solo runTransaction".
- [ ] El campo `actorUid` en `auditoria_admin` debe usar `currentUser.uid` del context, NO `userProfile.id` (P-001 cumplido — ya documentado, regression_guardian valida).
- [ ] regression_guardian invocado obligatoriamente (toca services + rules potencialmente).
- [ ] `npm run check:regression` sigue en 0 hits.
- [ ] Build OK, deploy Vercel Ready.
- [ ] Si toca `firestore.rules` → BLOQUEADO esperando OK de Jorge antes del `npm run deploy:rules`.

#### Restricciones / guardarrails
- regression_guardian obligatorio antes del commit final.
- Si se necesita rule nueva o modificada en `firestore.rules` para permitir update por admin → ese sub-paso BLOQUEADO esperando OK explícito (per protocolo).
- Mutación cross-collection (recordatorio + auditoria_admin) en `runTransaction`. NO commit con `await` encadenados.
- Mensaje WhatsApp NO debe contener PII innecesaria. Solo nombre operaria + recordatorio.
- Tono del mensaje: profesional, no condescendiente. Jorge revisará el copy si quiere — agregar comentario "// TODO: Jorge revisar copy si querés más cálido/firme" arriba del template.

#### Notas para el coordinator
- `RecordatorioBanner.tsx` ya existe — el sprint **modifica**, no crea desde cero. Leerlo primero.
- `recordatorios.service.ts` ya existe — agregar 2 funciones nuevas, no reescribir.
- El service `crearNotificacion` ya está alineado con el campo `userId` post SPRINT-2 del mega-sprint anterior. Usar tal cual.
- WhatsApp deep linking: usar `utils/whatsapp.ts` existente. Phone normalization RD ya está implementada ahí.
- Rule en `firestore.rules` para `recordatorios` (si existe el match): si admin/coord puede update con `completadoPorAdmin`, agregar rule explícita. Si NO existe el match todavía → toda la operación va a `auditoria_admin` y el "completado" se registra ahí, sin tocar el doc original. **Builder decide cuál enfoque tomar** según código actual; reportar decisión en commit message.
- Architect/tech_lead recomendado al inicio para validar que el shape del doc `recordatorios` aguanta los nuevos campos (`completadoPor`, `motivoOverride`).

---

### SPRINT-106 — Audit + fix flujo técnico (chequeo, falla, escalación)

**Estado:** COMPLETADO 2026-05-07 (causa raíz confirmada Hipótesis #1: rules de SPRINT-103 nunca deployadas; `npm run deploy:rules` ejecutado; cazador P-005 + sub-reglas CLAUDE.md agregadas para evitar repetición)
**Prioridad:** ALTA — bug en producción, técnicos bloqueados, afecta operación diaria.
**Origen:** Jorge reportó el 2026-05-07 "los botones de inicio de chequeo del módulo técnico no están funcionando". Sospecha regresión introducida en SPRINT-103 (cleanup masivo de imports + comentarios allowlist + remoción dead-code `citasHoy`).
**Riesgo:** alto — toca el flujo crítico de operación (técnico → diagnóstico → operaria → cliente).
**Touch-list previsto:** depende del diagnóstico. Probable: `firestore.rules` (deploy pendiente desde SPRINT-103), `IniciarChequeoButton.tsx`, `TecnicoVista.tsx`, posiblemente `ModalSugerirSoloChequeo.tsx`, `Reprogramaciones.tsx`, `SugerenciasChequeo.tsx`.

#### Diagnóstico preliminar (Cowork)

**Hipótesis #1 (60%) — rules de SPRINT-103 NUNCA se deployaron a producción.**
El diario de SPRINT-103 (`docs/sprints/EJECUCION_AUTONOMA.md`) dice explícitamente: *"Acción humana sin cambio: `npm run deploy:rules` para subir cambios de `firestore.rules` del SPRINT-103."* Las rules locales tienen ahora `.get(field, null)` para campos opcionales (`soloChequeo`, `estadoAprobacion`, `precioAprobado`, `aprobadoPor`, `fechaAprobacion`, `ayudanteId`). Las de producción siguen con acceso directo. El código del cliente (post SPRINT-103) puede estar enviando writes que las rules viejas rechazan silenciosamente con `permission-denied`.

**Hipótesis #2 (30%) — `usuarioId = userProfile?.id || orden.tecnicoId || ''` rompe para algún caso.**
En `IniciarChequeoButton.tsx:228`. SPRINT-103 NO cambió la lógica, sólo agregó comentario allowlist. Pero si el técnico tiene `userProfile.id == personalDocId` (cargado vía cascada `personal/`) Y la orden tiene `orden.tecnicoId == auth.uid`, el descriptor queda inconsistente. NO debería rechazar el write (la rule no valida el nested), pero puede causar errores de UI downstream.

**Hipótesis #3 (10%) — GPS/cámara fallando en mobile específico.**
Es la hipótesis menos probable porque Jorge no mencionó "cámara no abre" o "GPS no responde".

#### Pasos OBLIGATORIOS antes de tocar código

**Paso 1 — confirmar con Jorge si ejecutó `npm run deploy:rules` desde SPRINT-103.**
Si NO, ejecutarlo PRIMERO. Después pedirle a Jorge que pruebe el botón otra vez. Si funciona, sprint cerrado con un solo comando.

**Paso 2 — bisect dirigido del SPRINT-103 (commit `1568a63`):**
`git diff c7c8e34..1568a63 -- src/components/ordenes/IniciarChequeoButton.tsx src/pages/TecnicoVista.tsx src/components/cierre/ModalSugerirSoloChequeo.tsx src/pages/Reprogramaciones.tsx src/pages/SugerenciasChequeo.tsx firestore.rules`. Validar que ningún cambio rompe lógica.

**Paso 3 — fix del bug encontrado:**
- Si causa = rules sin deploy → `npm run deploy:rules`.
- Si causa = lógica rota en algún archivo del SPRINT-103 → revertir solo ese cambio + commit.
- Si causa = otra cosa → builder + tester + reviewer normal.

**Paso 4 — auditoría completa del flujo técnico (regresión preventiva):**

Ejercer manualmente en producción con técnico + operaria reales:
1. Técnico inicia chequeo (cámara + GPS + Firestore + cambio fase).
2. Técnico hace diagnóstico (sugerir solo chequeo / reportar falla).
3. Operaria recibe notificación + puede aprobar/rechazar.
4. Cliente aprueba precio (simulado por operaria).
5. Técnico ejecuta + cierra (wizard + foto + firma).
6. Operaria envía a facturación.

#### Criterios de aceptación

- [ ] El botón "Iniciar Chequeo" funciona end-to-end.
- [ ] Los 6 pasos del flujo arriba se ejecutan SIN errores `permission-denied` ni toasts rojos.
- [ ] Las rules locales == rules deployadas (sin diff pendiente).
- [ ] regression_guardian PASS sobre cualquier diff aplicado.
- [ ] `npm run check:regression` sigue en 0 hits.
- [ ] Build OK + deploy Vercel Ready.
- [ ] Commit message detalla: causa raíz + fix + qué pasos del flujo se validaron.

#### Restricciones / guardarrails

- Si causa requiere modificar `firestore.rules` adicional (más allá del deploy del SPRINT-103) → **BLOQUEAR** y esperar OK explícito de Jorge.
- regression_guardian obligatorio antes del commit final.

#### Sub-reglas / cazadores a agregar tras cerrar

1. **CLAUDE.md sub-regla nueva:** "Sprints que tocan `firestore.rules` deben ejecutar `npm run deploy:rules` ANTES de marcar COMPLETADO. El coordinator/devops es responsable. Sin esto, el código nuevo en producción puede chocar con rules viejas y romper flujos críticos silenciosamente." Antiprecedente: SPRINT-103.

2. **Cazador P-005 nuevo:** `scripts/invariantes/check-rules-pendientes-deploy.ts`. Detecta si `firestore.rules` cambió desde el último commit que tiene `[rules-deployed]` en su mensaje. Si hay diff pendiente → bloquea pre-commit.

3. **CLAUDE.md sub-regla:** "Cleanup de 'dead code' en archivos de páginas críticas requiere QA manual del flujo afectado antes de commit."

#### Notas para el coordinator

- **Pre-flight obligatorio:** confirmar con Jorge si ejecutó `npm run deploy:rules` desde SPRINT-103.
- **No improvisar fixes** — si el diagnóstico no es claro tras paso 2, escalar a Jorge.
- **Probar en producción real, no en local** — el bug es de producción.

---

## Sprints completados (histórico)

### SPRINT-107 — Agente `archivist` + Continuous Improvement Loop
- **Completado:** 2026-05-07 por coordinator (segunda pasada del día)
- **Hash:** `e395052`
- **Touch-list real:**
  - `.claude/agents/archivist.md` (NUEVO — 180 líneas, 3 modos: PRE-CHANGE / POSTMORTEM / MÉTRICAS)
  - `.claude/agents/coordinator.md` (pasos `b.5` PRE-CHANGE y `i.5` POSTMORTEM agregados al flujo autónomo + tabla de agentes actualizada)
  - `.claude/agents/builder.md` (sub-regla "respetar advertencias del archivist")
  - `docs/postmortems/_TEMPLATE.md` (NUEVO — template estructurado: timeline, impacto, 5 porqués, lo que funcionó/falló, acciones, métricas, lecciones)
  - `docs/postmortems/README.md` (NUEVO — guía del directorio + relación con catálogo P-XXX)
  - `docs/postmortems/2026-05-07-iniciar-chequeo-rules-sin-deploy.md` (NUEVO — primer postmortem retroactivo del bug SPRINT-106)
  - `scripts/metricas-mejora-continua.ts` (NUEVO — 6 métricas: MTBF, MTTR, recurrence rate, catch rate, cazadores activos, allowlist size; soporta `--desde=YYYY-MM-DD`)
  - `package.json` (script `metricas` agregado)
  - `CLAUDE.md` (sección "Continuous Improvement Loop" + 3 sub-reglas obligatorias: PRE-CHANGE, POSTMORTEM al cerrar bug, postmortem antes de marcar hotfix COMPLETADO)
  - `docs/PATRONES_REGRESION.md` (sección "Relación con el agente archivist" al final)
  - `docs/sprints/METRICAS_2026-05-07.md` (auto-generado por primer run de `npm run metricas`)
- **Sin tocar código de la app, rules, ni dependencias.**
- **Validaciones:**
  - `npx tsc --noEmit` clean.
  - `npm run check:regression` 5/5 PASS, 0 hits.
  - `npm run lint` baseline preservado (5559 problems excluyendo worktrees, idéntico al pre-sprint).
  - `npm run metricas` corre y genera `docs/sprints/METRICAS_2026-05-07.md` con 1 postmortem detectado, MTTR 540 min, recurrence 0%, 5 cazadores activos, allowlist size 16.
- **Decisión clave:** el archivist es agente complementario a `mejora_continua` y `regression_guardian`, no solapa. `mejora_continua` ve deuda cross-cutting; `regression_guardian` ve diff actual vs catálogo P-XXX; `archivist` ve el TIEMPO (commits previos, postmortems, métricas).
- **Detalle completo:** ver `docs/sprints/EJECUCION_AUTONOMA.md` sección 2026-05-07 segunda pasada.

---

### SPRINT-105 — GestionUsuarios alta crea AMBOS docs (personal + usuarios)
- **Completado:** 2026-05-06 por coordinator (tercera pasada)
- **Hash:** `009bcc8`
- **Implementación:** Opción 3 — `secondaryDb` con sesión del propio user creado para escribir `usuarios/{uid}` antes del `deleteApp(secondaryApp)`. Si falla espejo, abort antes de crear/actualizar `personal` (no hay estado parcial). Aplicado en 2 puntos: alta nueva (`guardarRestoDeCambios`) y dar acceso a empleado existente (`handleCrearAcceso`).
- **Cazador nuevo:** P-004 en `scripts/invariantes/check-alta-empleado-doble-doc.ts`. Escanea archivos con `createUserWithEmailAndPassword` y verifica que aparezca `setDoc(doc(... 'usuarios' ...))` cercano. Allowlist por header `// @safe-no-usuarios-mirror: <razón>`.
- **Sin cambios a rules:** la rule `firestore.rules:379-385` (write a `usuarios/{docId}` permitido para esAdminOCoord) ya cubre.
- **Documentación sincronizada:** gotcha "Alta de empleado debe crear AMBOS docs" en CLAUDE.md tachada con `~~strikethrough~~` + nota [RESUELTO en SPRINT-105 el 2026-05-06]. Catálogo P-004 agregado a `docs/PATRONES_REGRESION.md`.
- **Detalle completo:** ver `docs/sprints/EJECUCION_AUTONOMA.md` sección "tercera pasada".

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

---

### SPRINT-108 — Cierre disciplina hotfix 2026-05-07 (P-006 + P-002 variante !=)

**Estado:** COMPLETADO 2026-05-07 (tercera pasada — postmortem + cazador P-006 + cazador P-002 extendido a `!=` + 5 archivos con allowlist `@safe-tecnicoid-id:` documentada)
**Prioridad:** alta (deuda obligatoria por sub-reglas CLAUDE.md)
**Origen:** Bug en producción 2026-05-07 — Aury Mon no podía iniciar chequeo. Cadena de 2 bugs:
1. `tecnicoId` guardado como `personal.id` en lugar de `auth.uid` (commits c4be345 y migración)
2. Rule `modificaPrecioFinal()` con acceso directo a campo opcional (commit b7b6464)
**Riesgo:** bajo (todo es documentación + cazador determinístico)
**Touch-list previsto:** docs/postmortems/, docs/PATRONES_REGRESION.md, scripts/invariantes/, CLAUDE.md, scripts/invariantes/run-all.ts

#### Objetivo
Cerrar la disciplina obligatoria que CLAUDE.md exige al cerrar un hotfix de producción. Sin esto, los aprendizajes quedan anecdóticos.

#### Por qué
Las sub-reglas obligatorias en CLAUDE.md dicen:
- "postmortem completo es obligatorio antes de marcar un sprint hotfix como COMPLETADO"
- "cada bug capturado se convierte en cazador ejecutable"

El hotfix de Aury cerró sin cumplir estas dos reglas (Jorge eligió A en vez de A+ para descansar). Este sprint paga la deuda.

#### Criterios de aceptación
- [ ] Crear `docs/postmortems/2026-05-07-iniciar-chequeo-permission-denied.md` siguiendo `_TEMPLATE.md`. Incluir:
  - Timeline (Aury reporta → diagnóstico → migración tecnicoId → fix rules → resolución).
  - Impacto: técnicos bloqueados ~1 día post-deploy SPRINT-106.
  - 5 porqués hasta causa raíz estructural.
  - Acciones preventivas: extender cazador P-002, crear cazador P-006.
- [ ] Agregar P-006 a `docs/PATRONES_REGRESION.md` siguiendo plantilla:
  - Síntoma: técnico recibe permission-denied al hacer cualquier write sobre orden suya.
  - Causa raíz: dropdowns de "Asignar técnico" guardan `personal.id` (doc id) en lugar de `personal.uid` (auth.uid). La rule compara `tecnicoId == request.auth.uid`.
  - Regla: cualquier dropdown que asigna a un técnico/operaria/secretaria debe guardar `uid`, no `id`.
  - Cazador: `scripts/invariantes/check-tecnicoid-personal-id-misuse.ts`.
- [ ] Crear cazador `scripts/invariantes/check-tecnicoid-personal-id-misuse.ts`:
  - Escanea `src/**/*.tsx` buscando `<option value={` seguido de `t.id` o `p.id` cerca de un select que filtra `tecnicos` o `personal where rol == 'tecnico'`.
  - Falla si encuentra hits sin allowlist documentada.
  - Allowlist en header con regla: "el dropdown es solo para selección visual (filtro), no se guarda en Firestore".
- [ ] Extender cazador P-002 (`scripts/invariantes/check-rules-immutability.ts`) para que también detecte `!=`:
  - Hoy solo busca `==`. Bug en `modificaPrecioFinal()` usaba `!=` y no se detectó.
  - Cambiar regex para capturar ambos.
  - Re-correr smoke test, verificar 0 hits nuevos.
- [ ] Registrar P-006 en `scripts/invariantes/run-all.ts`.
- [ ] Update gotcha en `CLAUDE.md`:
  - Agregar/extender la gotcha "asunción frágil personal/{id}.id == auth.uid" para incluir el caso del dropdown que escribe a `tecnicoId`.
  - Marcar como "[RESUELTO en SPRINT-108]" la deuda anterior si aplica.
- [ ] Verificar que `npm run check:regression` pasa con 0 hits.
- [ ] Commit con mensaje descriptivo + push.

#### Restricciones / guardarrails
- regression_guardian OBLIGATORIO antes de cerrar (la sub-regla "sprints que tocan rules, services o context" aplica porque toca cazadores y patrón).
- NO desactivar cazadores si grita por algo legítimo en el extender de P-002 — agregar al allowlist con justificación.
- Archivist debe consultarse en modo PRE-CHANGE antes de tocar `scripts/invariantes/`.

#### Notas para el coordinator
- Este sprint paga deuda de hoy. Es chico (~1h) pero crítico para el sistema de aprendizaje continuo.
- El postmortem debe responder: ¿por qué tardamos tanto en encontrar el bug? Hipótesis: el cazador P-002 tenía gap (solo `==`).
- Para extender P-002 a `!=`: revisar `scripts/invariantes/check-rules-immutability.ts` línea con la regex y agregar variante `!=` con misma lógica de detección de campo opcional.

---

### SPRINT-109 — Limpiar 22 hits de P-001 (userProfile.id misuse)

**Estado:** COMPLETADO 2026-05-07 (resuelto retroactivamente — SPRINT-103 commit `ef74a04` ya cazó los 22 hits con fixes + allowlists. El cazador P-001 retorna 0 hits hoy. No requiere trabajo adicional).
**Prioridad:** alta (auditoría pedida por Jorge)
**Origen:** Smoke test del 2026-05-06 dejó 22 hits del cazador P-001 sin atender. Triaje preliminar en SPRINT-103 dijo "~7 bugs reales mismo patrón que afc5e4a, ~15 falsos positivos" pero nunca se cerró.
**Riesgo:** medio (toca services y context; misma clase de bug que rompió producción 2 veces)
**Touch-list previsto:** ver lista abajo

#### Objetivo
Auditar uno por uno los 22 hits del cazador P-001 (`userProfile.id` cerca de campos sensibles gateados por `auth.uid`). Para cada hit decidir:
- **Bug real** → reemplazar `userProfile?.id` por `currentUser?.uid` del context.
- **Falso positivo** (filtro de UI sin write a Firestore) → agregar a allowlist documentada en el header del cazador.
- **Requiere refactor** (ej: estructural) → escalar a sprint propio.

#### Por qué
Los 22 hits son bugs latentes del mismo vector que ya rompió producción dos veces (afc5e4a Reactivación, b93625d Notificaciones). Cualquiera puede ser el próximo "Iniciar Chequeo" de Aury.

#### Lista de archivos con hits (referencia)
- `src/components/cierre/ModalSugerirSoloChequeo.tsx:94` — campo `sugeridaPor`
- `src/components/ordenes/IniciarChequeoButton.tsx:224` — campo `tecnicoId` nested
- `src/pages/Dashboard.tsx:453,454` — filtro UI por `operariaId` (probablemente FP, pero verificar)
- `src/pages/OrdenDetalle.tsx:238,245,268` — comparaciones `orden.tecnicoId === userProfile.id` (FP si la migración P-006 ya alineó tecnicoId con auth.uid; verificar)
- `src/pages/Reprogramaciones.tsx:115,123,173,237` — campo `resueltaPor`
- `src/pages/SugerenciasChequeo.tsx:99,136` — campo `resueltaPor`
- `src/pages/TecnicoVista.tsx:155,195,204,208,212,238,259,264,1213` — varios; algunos FP de filtros, otros writes (verificar uno por uno)

#### Criterios de aceptación
- [ ] Cada hit clasificado en una tabla en EJECUCION_AUTONOMA.md: archivo:línea, decisión (FIX/ALLOWLIST/SPRINT_PROPIO), justificación.
- [ ] Para los FIX: PR con cambios + verificación typecheck/lint.
- [ ] Para los ALLOWLIST: header del cazador actualizado con regla "// @safe-userprofile-id: <razón>" y comentario en código en el mismo archivo.
- [ ] Para los SPRINT_PROPIO: agregarlos a la cola con ID SPRINT-XXX.
- [ ] `npm run check:regression` pasa con 0 hits o con allowlist documentada al 100%.
- [ ] Cada FIX correspondiente a un campo sensible (sugeridaPor, resueltaPor, etc.) requiere QA manual de que el flujo afectado siga funcionando para todos los roles (admin/coord/secretaria/operaria/tecnico).
- [ ] Build + lint + cazadores pasan en pre-commit.

#### Restricciones / guardarrails
- regression_guardian OBLIGATORIO (toca services y context).
- archivist en modo PRE-CHANGE antes de tocar cualquier archivo del touch-list.
- NO bypassear con `--no-verify`. Si el cazador grita, decidir entre FIX o ALLOWLIST.
- Para `Reprogramaciones.tsx` y `SugerenciasChequeo.tsx` (campo `resueltaPor`): verificar primero la rule de Firestore. Si la rule compara contra `auth.uid`, ES bug real; si compara contra otro campo, podría ser FP.
- Para `TecnicoVista.tsx`: tener cuidado especial — la migración P-006 puede haber alineado `tecnicoId` con `auth.uid`, así que comparaciones `orden.tecnicoId === userProfile.id` ahora podrían fallar para usuarios con `userProfile.id == personalDocId`. Considerar si conviene cambiar a `currentUser.uid` por consistencia.

#### Notas para el coordinator
- Este sprint puede dividirse en sub-sprints por archivo si se vuelve grande.
- Si encuentra un patrón nuevo, agregar P-XXX y cazador.
- Coordinar con SPRINT-108 (extender cazador) si los nuevos cazadores deben capturar variantes.

---

### SPRINT-110 — Limpiar 13 hits P-002 (rules con .get faltantes)

**Estado:** COMPLETADO 2026-05-07 (resuelto retroactivamente — SPRINT-103 commit `ef74a04` cubrió 11 de los 13 hits con `.get()`/`@safe-required`. SPRINT-106 hotfix `b7b6464` cubrió el 12º (`modificaPrecioFinal !=`). SPRINT-108 cubrió la cobertura del cazador para detectar futuras variantes `!=`. El cazador P-002 retorna 0 hits hoy. No requiere trabajo adicional).
**Prioridad:** alta (auditoría pedida por Jorge)
**Origen:** Smoke test del 2026-05-06 dejó 13 hits del cazador P-002 (rules de inmutabilidad sobre campo opcional sin `.get()`). Algunos posiblemente ya se arreglaron en SPRINT-103 pero el smoke no se re-corrió.
**Riesgo:** medio-alto (toca firestore.rules — vector que ya rompió producción 2 veces)
**Touch-list previsto:** firestore.rules

#### Objetivo
Auditar cada uno de los 13 hits en `firestore.rules`. Para cada uno:
- **Campo opcional** → convertir a `request.resource.data.get('campo', null) == resource.data.get('campo', null)`.
- **Campo required** (garantizado present desde el create) → agregar comentario `// @safe-required: <campo>` antes de la línea para que el cazador lo ignore.

#### Por qué
Vector P-002 ya rompió producción 2 veces (c7c8e34 Reactivación, b7b6464 Iniciar Chequeo). La regla de pulgar es: si el campo no aparece en el create base de la colección, es opcional → usar `.get`.

#### Lista de archivos con hits (referencia, requiere revalidación)
- `firestore.rules:138` — `soloChequeo` (probablemente ya .get post-SPRINT-103)
- `firestore.rules:187-190` — `estadoAprobacion`, `precioAprobado`, `aprobadoPor`, `fechaAprobacion` (probablemente ya .get post-SPRINT-103)
- `firestore.rules:199-200` — `tecnicoId`, `ayudanteId` (verificar si tecnicoId es required tras SPRINT-105)
- `firestore.rules:584-591` — `creadaPor`, `creadaPorNombre`, `fecha`, `creadaEn`, `plantillaId`, `plantillaNombre` (campañas marketing — verificar create base)

#### Criterios de aceptación
- [ ] Re-correr `npm run check:regression` para tener lista actualizada de hits (algunos pueden estar resueltos).
- [ ] Por cada hit vivo: leer la rule completa, leer el create de la colección, decidir si campo es required u opcional.
- [ ] Para required: agregar `// @safe-required: <campo>` arriba de la línea con justificación.
- [ ] Para opcional: convertir a `.get()` (ambos lados de la comparación).
- [ ] QA manual del flujo afectado (happy path + caso campo missing) para cada rule modificada.
- [ ] `npm run deploy:rules` (despliega + actualiza lock).
- [ ] `npm run check:regression` pasa con 0 hits.
- [ ] Test E2E: técnico hace update de orden sin precioFinal/estadoAprobacion seteados, debe pasar.

#### Restricciones / guardarrails
- **Sprint que toca rules → deploy obligatorio antes de cerrar (sub-regla CLAUDE.md, P-005).**
- regression_guardian OBLIGATORIO.
- Reviewer obligatorio con foco en rules (sub-regla CLAUDE.md).
- archivist en modo PRE-CHANGE antes de tocar firestore.rules.

#### Notas para el coordinator
- Este sprint depende de SPRINT-108 (extender cazador para `!=`) — si ya se hizo, re-correr el cazador puede traer hits nuevos.
- El reviewer debe validar que ninguna rule cambió la semántica (de inmutable a mutable accidental).

---

### SPRINT-111 — Auditar otros campos de ID con vector P-001/P-006

**Estado:** COMPLETADO 2026-05-08 (fase 111a — auditoría documental completa de 12 campos. Resultado: 0 bugs latentes nuevos. P-001 + P-006 + gotchas vigentes cubren todos los vectores activos. 4 inconsistencias de bajo riesgo identificadas → SPRINT-114 sugerido. NO se creó cazador determinístico genérico nuevo — solaparía con P-001/P-006 sin agregar señal. Documento completo en `docs/sprints/AUDITORIA_CAMPOS_ID_2026-05-08.md`).
**Prioridad:** alta (auditoría pedida por Jorge)
**Origen:** P-006 demostró que el bug de `tecnicoId` afecta a CUALQUIER campo que guarde un ID de personal/usuario. Otros campos similares pueden tener el mismo problema.
**Riesgo:** alto (puede requerir migración de datos similar a P-006)
**Touch-list previsto:** múltiples (a determinar)

#### Objetivo
Auditar TODOS los campos del esquema que guardan un ID de un empleado y verificar:
1. ¿Se compara con `auth.uid` en alguna rule? → debe ser auth.uid (no personal.id)
2. ¿Se guarda como `personal.id` o como `personal.uid` (auth.uid)?
3. Si hay desalineación: code fix + migración + nuevo cazador.

#### Campos a auditar
- `operariaId` — Dashboard filter, recordatorios, comisiones
- `ayudanteId` — orden + rule de ayudante en ordenes_servicio
- `responsableId` — orden (creado por staff)
- `creadaPor` — campañas marketing, plantillas
- `creadoPor` — orden
- `eliminadaPorId` — orden (auditoría)
- `aprobadoPor` — orden
- `sugeridaPor` — sugerencias solo chequeo
- `resueltaPor` — sugerencias, reprogramaciones
- `usuarioId` (audit logs, conversaciones_ia, notificaciones)
- `personalUid` (ponches)
- `cerradaPor` — orden

#### Criterios de aceptación
- [ ] Tabla en EJECUCION_AUTONOMA.md con cada campo: dónde se escribe, dónde se lee, regla aplicable, valor actual (personal.id / auth.uid / mixto).
- [ ] Para cada campo donde haya bug: PR con code fix (cambiar dropdown/asignación a usar `uid`).
- [ ] Para cada campo donde haya datos viejos mal guardados: script de migración idempotente con dry-run.
- [ ] Crear cazador genérico `scripts/invariantes/check-id-vs-authuid-misuse.ts` que detecta el patrón en código nuevo.
- [ ] Run cazadores, deben pasar.

#### Restricciones / guardarrails
- Migraciones de datos > 500 docs requieren OK de Jorge (queda en BLOQUEOS.md).
- regression_guardian + reviewer obligatorios.
- Cualquier nueva rule que se cree para validar uno de estos campos debe pasar P-002.

#### Notas para el coordinator
- Este sprint puede ser el más grande de los 5. Considerá dividirlo por colección (ordenes_servicio, campanas_marketing, comisiones, etc.).
- Si encuentra que `eliminadaPorId` está mal en >50% de las órdenes eliminadas, es marcador del mismo bug P-006 propagado.

---

### SPRINT-112 — Schema drift y matriz de permisos por rol

**Estado:** PENDIENTE
**Prioridad:** media (auditoría pedida por Jorge — la última)
**Origen:** Auditoría completa solicitada por Jorge tras hotfix de Aury.
**Riesgo:** bajo-medio (mayormente documentación + tests manuales)
**Touch-list previsto:** docs/MATRIZ_PERMISOS.md (nuevo), src/types/index.ts (validación), tests manuales

#### Objetivo
Crear documentación viva de:
1. **Schema drift**: qué campos están en TypeScript types pero no en docs reales de Firestore (y viceversa).
2. **Matriz de permisos por rol**: para cada rol (admin/coord/secretaria/operaria/tecnico/ayudante), qué flujos críticos puede ejecutar y cuáles no, con verificación E2E.

#### Por qué
- El schema drift causa bugs sutiles (campos opcionales vs required en TS distintos a Firestore).
- La matriz de permisos hoy está implícita en rules + permisos.ts. No hay un lugar único donde un nuevo dev (o Claude) consulte "¿qué puede hacer una operaria?".

#### Criterios de aceptación
- [ ] Script `scripts/auditoria/schema-drift.ts` que samplea N docs de cada colección y reporta campos no documentados en TS.
- [ ] `docs/MATRIZ_PERMISOS.md` con tabla: para cada flujo crítico (crear orden, iniciar chequeo, marcar realizado, facturar, generar conduce, ver comisiones, agendar cita, eliminar orden, etc.), columna por rol con ✓ / ✗ / condicional.
- [ ] QA manual: testear cada celda ≠ ✗ con un usuario real de cada rol. Documentar resultado.
- [ ] Si hay celdas que el código permite pero la matriz pretende negar (o viceversa): bug. Crear sprint específico de fix.

#### Restricciones / guardarrails
- archivist PRE-CHANGE antes de empezar.
- No tocar code de aplicación; sólo agregar tests/docs.
- Si encuentra bugs reales, crear sprint nuevo (no fix dentro de este).

#### Notas para el coordinator
- Este es el sprint más "ligero" pero el de mayor impacto a largo plazo: prevenir bugs futuros mediante documentación enforcement-friendly.
- Considerá usar Cypress/Playwright para automatizar el QA por rol (sprint follow-up).

---

### SPRINT-113 — UX flujo de orden paso a paso intuitivo (técnico/operaria/secretaria)

**Estado:** EN_PROGRESO — 4 de 6 criterios COMPLETADOS por las fases 113a/b/c (commits `9603da3` + `dd24bb2` + `49af624` + `0909237` en producción). Pendientes: QA manual end-to-end con técnicos/operarias reales (humano) y cazador anti-regresión de tooltips (sprint propio futuro si Jorge lo prioriza).
**Prioridad:** alta (pedido directo de Jorge — "más entendible, paso a paso, intuitivo")
**Origen:** Jorge tras hotfix Aury: "tenemos que hacer un flujo de orden visualmente más organizado y entendible".
**Riesgo:** medio (toca UI de un flujo crítico; no toca rules ni datos)
**Touch-list previsto:** FaseStepper.tsx, OrdenDetalle.tsx, TecnicoVista.tsx, OrdenCard.tsx, posibles componentes nuevos

#### Objetivo
Rediseñar la presentación del flujo de orden para que cada rol sepa **cuál es el siguiente paso a realizar**, sin necesidad de manual ni capacitación.

#### Por qué
Hoy el stepper muestra fases (Nuevo Lead → En Gestión → ...) pero NO indica al usuario:
- ¿Qué acción concreta tiene que hacer ahora?
- ¿Qué está esperando el sistema (de él o de otro rol)?
- ¿Por qué un botón está deshabilitado?

Específico — la sugerencia de chequeo del técnico no se refleja en el stepper, generando confusión ("¿se envió o no?").

#### Criterios de aceptación
- [x] **Banner de "siguiente paso"** en OrdenDetalle/TecnicoVista, contextual al rol del usuario logueado y a la fase actual: **Implementado en SPRINT-113a (commits `9603da3` + `dd24bb2`, COMPLETADO 2026-05-08, validado visualmente por Jorge en producción)**.
  - Técnico en orden agendada: "Próximo paso: Iniciar chequeo cuando llegues al cliente."
  - Técnico en orden en_diagnostico: "Próximo paso: Cotizar reparación o sugerir solo chequeo."
  - Operaria en orden con sugerencia pendiente: "Aury sugirió cobrar solo chequeo (RD$2,000). Aprobá o rechazá."
  - Etc. — cubrir las 8 fases × 3 roles principales.
- [x] **Badge "Sugerencia pendiente"** visible en stepper cuando hay una sugerencia de chequeo no resuelta. Color amarillo. **Implementado en SPRINT-113b (commit `49af624`, 2026-05-08). Decisión: presentacional sin onClick — el banner de 113a ya direcciona la acción a oficina; click-to-modal queda como mejora futura.**
- [x] **Tooltips en botones deshabilitados** explicando por qué. **Implementado en SPRINT-113b (commit `49af624`, 2026-05-08) con helper puro `src/utils/tooltipsBotones.ts`. Cubiertos: Iniciar chequeo, Cerrar servicio (5 razones), Enviar a conduce.**
- [x] **Indicador visual de "esperando otro rol"** — **Cubierto por el banner de SPRINT-113a (tono `espera` gris) y reforzado por el badge "Sugerencia pendiente" de SPRINT-113b.**
- [x] **Resumen visual del flujo** al pie de OrdenDetalle: timeline horizontal con últimas 5 acciones (quién, qué, cuándo). **Implementado en SPRINT-113c (segunda pasada 2026-05-08). Helper `obtenerTimelineAcciones` + componente `TimelineAcciones` montado al pie del bloque "Flujo de la orden". Auto-oculta con <2 acciones. Responsive vertical/horizontal.**
- [ ] QA manual con usuarios reales (Jorge + técnico + operaria) recorriendo un flujo end-to-end. Identificar friction points y resolver. **(BLOQUEADO — requiere humanos.)**
- [ ] Cazador anti-regresión: ningún botón crítico debe quedar sin tooltip explicativo cuando esté disabled (regla nueva, opcional). **(NO IMPLEMENTADO — sprint propio futuro si Jorge lo prioriza; el cazador requeriría análisis AST o convención de naming, scope mediano.)**

#### Restricciones / guardarrails
- NO cambiar la lógica de transición de fase (eso es seguro y testeado).
- NO cambiar los identificadores internos.
- archivist PRE-CHANGE — los archivos que se tocan son críticos.
- Reviewer obligatorio con foco en accesibilidad (color contrast, aria-labels en tooltips).

#### Notas para el coordinator
- Considerá hacerlo en 3 sub-sprints: SPRINT-113a (banner siguiente paso), 113b (badges sugerencia/esperando), 113c (timeline acciones).
- Pedir a Jorge mockups o screenshots de referencia si hay alguno.
- Bloqueo conocido: la lógica de "siguiente paso" depende de muchos campos opcionales (sugerencias, aprobaciones, pagos). Definir matriz fase × rol × condiciones antes de empezar a codear.

---

### SPRINT-113b — Badges de sugerencia pendiente + tooltips en botones disabled

**Estado:** COMPLETADO 2026-05-08 (segunda pasada autónoma — badge "Sugerencia pendiente" en `FaseStepper`, helper `tooltipsBotones.ts` puro testeable, tooltips `title` en Iniciar chequeo / Cerrar servicio / Enviar a conduce. Sin escrituras nuevas, sin tocar rules, sin tocar services. 6/6 cazadores PASS, 0 hits.)
**Prioridad:** alta (continuación de 113a, ya aprobado por Jorge)
**Origen:** SPRINT-113 padre (UX flujo paso a paso). Fase 113a (banner) completada y validada en producción 2026-05-08.
**Riesgo:** bajo (UI puramente presentacional; no toca rules, services, mutaciones)
**Touch-list previsto:**
- `src/components/ordenes/FaseStepper.tsx` (agregar slot/badge "Sugerencia pendiente")
- `src/components/ordenes/IniciarChequeoButton.tsx` (tooltip cuando está disabled)
- `src/components/cierre/CierreServicioWizard.tsx` o componentes de aprobación de precio (tooltip cuando disabled)
- Posiblemente helper nuevo `src/utils/tooltipsBotones.ts` que dado orden + rol retorne razón humana de por qué un botón está bloqueado
- `src/pages/OrdenDetalle.tsx` y `src/pages/TecnicoVista.tsx` (cablear el tooltip al botón disabled)

#### Objetivo
Que el stepper deje claro cuándo hay una sugerencia de "solo chequeo" pendiente sin tener que abrir un modal, y que ningún botón disabled del flujo deje al usuario adivinando por qué no se puede clickear.

#### Por qué
Hoy el técnico hace una sugerencia de solo chequeo y el stepper no cambia visualmente — la operaria solo ve la notificación in-app pero al entrar a la orden no encuentra señal visual fuerte. El banner de 113a ya cubre el mensaje pero un badge en el stepper resuelve el caso de "tengo 30 órdenes en lista, en cuál hay sugerencia?".

Tooltips en botones disabled: hoy el técnico ve "Iniciar chequeo" gris y no sabe si le falta GPS, si la orden no está agendada, o si la rule rechazó. Pasa lo mismo con "Cerrar servicio" cuando falta foto/firma.

#### Criterios de aceptación
- [ ] **Badge "Sugerencia pendiente"** visible junto al stepper o sobre el chip de fase actual cuando `obtenerSugerenciaSoloChequeoPendiente(orden)` retorna no-null. Color amarillo (consistente con tono `alerta` del banner). Click → abre el modal de aprobación de la sugerencia (reutiliza el modal existente).
- [ ] El badge desaparece cuando la sugerencia se aprueba o rechaza.
- [ ] **Tooltip explicativo** en cada botón crítico que pueda quedar disabled:
  - Iniciar chequeo (técnico): "Necesitás permiso de GPS para iniciar" / "Esperá a que la orden esté agendada" / etc.
  - Aprobar/rechazar sugerencia (oficina): no aplica disabled (siempre activo).
  - Cerrar servicio (técnico): "Faltó foto del cierre" / "Faltó firma del cliente" / "Falta marcar 'equipo funciona'".
  - Enviar a facturación (oficina): "Falta cierre del técnico" / "Ya enviada a facturación".
- [ ] Tooltips usan `title` HTML nativo o componente accesible (preferir nativo para mantener bundle chico). Si se usa componente, debe tener `aria-describedby`.
- [ ] La razón de disabled vive en un helper puro testeable, no inline en el componente.
- [ ] `npm run check:regression` sigue en 0 hits.
- [ ] Build OK, typecheck OK, lint OK.

#### Restricciones / guardarrails
- archivist PRE-CHANGE — `IniciarChequeoButton.tsx` y `FaseStepper.tsx` están en la lista de archivos críticos del flujo técnico (sub-regla CLAUDE.md sobre cleanup en páginas críticas).
- regression_guardian RECOMENDADO — toca componentes con historia de bugs P-001/P-006.
- NO cambiar la condición que decide si el botón está disabled — solo agregar la explicación. La lógica de gating sigue intacta.
- NO tocar rules, services ni mutaciones. Si necesitás un dato derivado (ej. razón de disabled), calcularlo client-side desde props.
- El badge NO escribe a Firestore. Solo lee de la orden ya cargada.

#### Notas para el coordinator
- El helper `calcularSiguientePaso` de 113a ya tiene la lógica del caso "sugerencia pendiente". Reutilizarla — no duplicar.
- Antes de codear, hacer matriz `botón → razón_disabled`: técnico tiene 3-4 botones críticos, oficina tiene 2-3. Sin esta matriz se va a olvidar uno.
- Para el badge en el stepper, considerar si conviene como overlay sobre la fase actual o como pill suelta arriba. El stepper actual probablemente no tiene espacio sobrado — leer su layout primero.
- Si Jorge tiene preferencia visual (ej. icono de campana vs estrella), preguntarle vía AskUserQuestion antes de elegir.

---

### SPRINT-113c — Timeline horizontal de últimas 5 acciones al pie de OrdenDetalle

**Estado:** COMPLETADO 2026-05-08 (segunda pasada autónoma — helper `src/utils/timelineAcciones.ts` mezcla `historialFases` + `auditoria` con parser tolerante a shapes legacy. Componente `src/components/ordenes/TimelineAcciones.tsx` responsive (vertical mobile / horizontal scroll md+) montado al pie del bloque "Flujo de la orden" en `OrdenDetalle.tsx`. Auto-oculta con <2 acciones. Iconografía por tipo de acción. Sin escrituras, sin migraciones. 6/6 cazadores PASS.)
**Prioridad:** media (continuación de 113a/b, mejora de visibilidad histórica)
**Origen:** SPRINT-113 padre (UX flujo paso a paso). Criterio de aceptación pendiente.
**Riesgo:** bajo (UI presentacional, lectura del campo `historialFases` o `auditoria` ya existente)
**Touch-list previsto:**
- `src/components/ordenes/TimelineAcciones.tsx` (NUEVO — componente presentacional)
- `src/utils/timelineAcciones.ts` (NUEVO — helper que dado una orden retorne las últimas 5 acciones normalizadas)
- `src/pages/OrdenDetalle.tsx` (montar el componente al pie del bloque "Flujo de la orden" o como sección propia)

#### Objetivo
Mostrar al pie de OrdenDetalle un timeline visual horizontal con las últimas 5 acciones registradas en la orden: quién, qué, cuándo. Sin clicks, sin modales — solo lectura visual rápida.

#### Por qué
Hoy `historialFases` y `auditoria` viven dentro de la orden pero no se renderizan visualmente — solo en logs internos. El admin/coordinadora que entra a una orden con problema necesita reconstruir mentalmente "¿quién hizo qué cuándo?" abriendo cada modal. Un timeline al pie resuelve ese caso de uso en 1 segundo.

#### Criterios de aceptación
- [ ] Helper `obtenerTimelineAcciones(orden, max=5)` retorna array de `{ accion, actorNombre, fechaIso, descripcion }` ordenado de más reciente a más viejo.
- [ ] Lee de `orden.historialFases` Y `orden.auditoria` (cubrir ambas shapes — gotcha CLAUDE.md sobre cierre legacy + nuevo).
- [ ] Si una entrada no tiene `actorNombre` o `descripcion`, fallbacks razonables (ej: "Sistema").
- [ ] Componente `TimelineAcciones` renderiza horizontalmente con scroll-x si hay overflow en mobile, y verticalmente en pantallas chicas (responsive).
- [ ] Cada item muestra: icono según tipo de acción, nombre del actor, descripción corta, hora relativa (`hace 3h`) y absoluta en tooltip (`2026-05-07 14:32`).
- [ ] Si la orden tiene `<2` acciones registradas, no se renderiza el componente (evitar pollution visual en órdenes recién creadas).
- [ ] Sin emojis. Iconos de `lucide-react` consistentes con el resto de la app.
- [ ] `npm run check:regression` sigue en 0 hits.
- [ ] Build, typecheck, lint OK.

#### Restricciones / guardarrails
- archivist PRE-CHANGE recomendado — `OrdenDetalle.tsx` es archivo crítico del flujo.
- NO escribir a Firestore. Solo lectura del shape ya cargado.
- NO normalizar/migrar datos viejos. Si el shape legacy tiene campos faltantes, mostrar fallback. La normalización es un sprint propio futuro si se necesita.
- date-fns ya está en el bundle — usar `formatDistanceToNow` con locale `es` para hora relativa.

#### Notas para el coordinator
- Antes de codear, hacer dump real de `orden.historialFases` y `orden.auditoria` de 3-4 órdenes en producción para ver qué shapes legacy hay vivas. Sin esto se rompe en órdenes viejas.
- Si el timeline horizontal no entra bien en mobile (muchas órdenes se abren desde celular del técnico), preferir vertical compacto.
- Coordinar con el banner de 113a y los badges de 113b para que el conjunto se vea coherente: stepper arriba → banner siguiente paso → flujo (acciones manuales) → timeline al pie.

---

### SPRINT-114 — Migrar 4 hits descriptivos `userProfile.id` a `currentUser.uid` (consistencia)

**Estado:** COMPLETADO 2026-05-08 (segunda pasada autónoma — los 4 sitios migrados a `currentUser.uid`. Plus fix colateral de warning eslint preexistente en `Ordenes.tsx` con `useMemo` para estabilizar la referencia de `hoy`. Sin migración de datos viejos. 6/6 cazadores PASS.)
**Prioridad:** baja (no urgente — campos no gateados por rule, cambio defensivo de consistencia)
**Origen:** Auditoría SPRINT-111 (fase 111a, 2026-05-08). Detectó 4 hits descriptivos legítimos (no bugs latentes) que escriben `userProfile?.id` a campos NO gateados pero que por convención del esquema post-SPRINT-105 deberían ser `auth.uid`.
**Riesgo:** bajo (los campos no están gateados, el cambio es defensivo; no requiere migración de datos viejos)
**Touch-list previsto:** 4 archivos
- `src/components/ordenes/RegistrarPagoModal.tsx:95` — `pago.registradoPorId`
- `src/components/ordenes/EnviarFacturacionButton.tsx:38` — `enviadaAFacturacionPorId`
- `src/components/facturacion-pendiente/ProcesarFacturacionModal.tsx:321` — `emisorFacturaId` y similares
- `src/hooks/useOrdenCreateForm.ts:612` — `responsableId`

#### Objetivo
Reemplazar los 4 hits descriptivos restantes de `userProfile?.id` por `currentUser?.uid` para que TODOS los campos `*Id` que identifican a un actor humano usen la misma convención (`auth.uid`).

#### Por qué
Hoy el esquema mezcla:
- Campos gateados por rule contra `auth.uid` (tecnicoId, ayudanteId, creadaPor, usuarioId, personalUid) — usan `currentUser.uid` post-fixes.
- Campos descriptivos (`registradoPorId`, `responsableId`, etc.) — usan `userProfile?.id` que para usuarios cargados vía cascada `personal/` es `personalDocId !== auth.uid`.

La inconsistencia no rompe producción hoy (no hay rule que valide estos campos), pero:
- Confunde a futuros desarrolladores (¿cuál uso aquí?).
- Si en el futuro se agrega rule de validación a uno de estos campos (ej. para auditoría), reintroduce el bug `permission-denied` silencioso.
- La auditoría completa de SPRINT-111 documenta que estos 4 son los únicos restantes.

#### Criterios de aceptación
- [ ] Importar `useApp` en cada componente si no está; obtener `currentUser`.
- [ ] Reemplazar `userProfile?.id` por `currentUser?.uid` en los 4 sitios. El nombre puede seguir siendo `userProfile?.nombre`.
- [ ] Guard `if (!currentUser) return` antes del write si la función puede correr sin usuario auth.
- [ ] `npm run check:regression` sigue en 0 hits (P-001 ya cazaba estos pero estaban allowlistados con `@safe-userprofile-id:` — quitar el allowlist comment de los que se hayan migrado).
- [ ] Build OK + lint OK + deploy Vercel Ready.
- [ ] NO migrar datos viejos — los pagos/facturas con `personalDocId` siguen siendo válidos (no hay rule que los rechace).

#### Restricciones / guardarrails
- regression_guardian RECOMENDADO (toca services/components, vector P-001).
- Sin tocar rules ni schema. Sin migración de datos.
- archivist PRE-CHANGE recomendado (toca componentes con historia de bugs P-001).

#### Notas para el coordinator
- Cuando lo ejecutés, después del fix, abrir `scripts/invariantes/check-userprofile-id-misuse.ts` y verificar si los 4 archivos modificados tenían comentarios `@safe-userprofile-id:` que ahora son obsoletos. Si quedan obsoletos, eliminarlos para evitar mensajes confusos.
- Bajo prioridad — solo procesar si la cola se queda sin sprints urgentes.
- Si después de migrar los 4, el cazador P-001 vuelve a 0 hits, el sistema queda totalmente alineado con la convención `auth.uid` para todos los campos de actor humano.

---

### SPRINT-115 — Diagnóstico + re-migración de notificaciones de Yohana

**Estado:** EN_EJECUCION (fase write — DESBLOQUEADA 2026-05-08 por jorge vía `BLOQUEOS.md` tras output del diagnóstico read-only ejecutado el mismo día). Caso A confirmado: 3 docs de Yohana (`F9BV32k4JEoEOk97K4xc`, `TVwtOtmNlzW334IUIUdF`, `VWjdYBRmKgU8rGPlbJAv`) tienen `userId == personalDocId == zFhokrDoPH9lD63ZxKAY`. Scope acotado autorizado: setear `userId = HGkVoYpGKzL4JJI7FnTpHjdsM972` (auth.uid de Yohana, email `melissabalbuena08@gmail.com`). NO tocar `destinatarioId`, NO tocar otros campos, NO migrar a otros usuarios.

**desbloqueadoPor:** jorge 2026-05-08

**Prioridad:** alta condicional (sólo si la condición se dispara)
**Origen:** SPRINT-100 falló en QA visual con Yohana 2026-05-08 (a confirmar). Hipótesis Cowork: las notificaciones legacy de Yohana tienen `destinatarioId == auth.uid` pero `userId == personalDocId` post-migración fallida del 2026-05-06.
**Riesgo:** alto — toca datos en producción (re-migración) y posiblemente rules. Migración limitada a docs específicos de un usuario, NO masiva.
**Touch-list previsto:**
- `scripts/diagnostico-notificaciones-yohana.ts` (NUEVO — script de diagnóstico read-only con Admin SDK)
- `scripts/re-migrar-notificaciones-yohana.ts` (NUEVO opcional — sólo si diagnóstico confirma docs problemáticos)
- Posiblemente `firestore.rules` (si la rule de update sobre `notificaciones` tiene un gap)

#### Hipótesis principal de Cowork

El service `notificaciones.service.ts` hace lectura DUAL (`userId == auth.uid` OR `destinatarioId == auth.uid`) — eso explica que el commit `b93625d` "arregló" el problema de visibilidad. Pero la rule `firestore.rules:528-534` valida UPDATE/DELETE únicamente contra `userId == auth.uid`. Resultado:

- Caso A — doc legacy con `destinatarioId == personalDocId`, sin `userId`: Yohana NO la ve (ningún query la matchea).
- Caso B — doc legacy con `destinatarioId == auth.uid`, sin `userId`: Yohana SÍ la ve (query legacy la trae) PERO al marcar leída → permission-denied silencioso.
- Caso C — doc post-migración con `userId == auth.uid`: funciona perfecto.

Si Yohana reporta "ve pero no puede marcar", es Caso B. Si reporta "no ve nada", es Caso A.

#### Objetivo

1. Generar un dump claro de las notificaciones de Yohana mostrando shape real de cada doc (qué campos tiene, qué valores).
2. Clasificar cada doc según los Casos A/B/C.
3. Si Caso B existe → script de re-migración idempotente que setea `userId = auth.uid` en cada doc legacy de Yohana (NO masivo, solo sus docs).
4. Si Caso A existe → mismo script que setea `userId = auth.uid` cuando `destinatarioId == personalDocId` mapeable.
5. Confirmar con Yohana que post-migración ve todo y puede marcar.

#### Inputs requeridos del coordinator antes de ejecutar

- `auth.uid` de Yohana (Jorge tiene que dárselo o el script puede buscar por email — preferir email para evitar acoplamiento a uid hardcodeado).
- email de Yohana (Jorge puede confirmarlo en sesión Cowork o el coordinator lo lee de `personal where rol == 'operaria'`).
- Confirmación explícita de Jorge en `BLOQUEOS.md`: "OK Jorge — re-migración de notificaciones de Yohana autorizada, scope acotado a docs cuyo destinatarioId/personalUid mapean a su auth.uid". El script es < 50 docs por usuario, pero es migración de datos → requiere OK por sub-regla CLAUDE.md.

#### Criterios de aceptación

- [ ] Script `scripts/diagnostico-notificaciones-yohana.ts` corre con dry-run forzado (NO escribe). Reporta:
  - Email + auth.uid + personalDocId de Yohana.
  - Cantidad de docs en `notificaciones` matcheando `userId == auth.uid`, `destinatarioId == auth.uid`, `userId == personalDocId`, `destinatarioId == personalDocId`.
  - Para cada doc problemático (Caso A o B): id, campos presentes, fecha, leida sí/no.
- [ ] Si diagnóstico reporta 0 docs problemáticos → escribir resultado en EJECUCION_AUTONOMA.md, marcar SPRINT-100 + SPRINT-115 ambos COMPLETADOS, y proponer otra hipótesis (cache, App Check, etc.).
- [ ] Si reporta docs problemáticos → escribir `scripts/re-migrar-notificaciones-yohana.ts` con dry-run + ejecución idempotente:
  - Sólo toca docs que matchean Caso A/B con destinatarioId/personalUid del usuario autorizado.
  - Sólo escribe campo `userId` faltante con valor `auth.uid` correcto.
  - NUNCA borra ni modifica otros campos.
  - Genera log con cada doc tocado (antes/después).
- [ ] Coordinator deja sprint en BLOQUEADO esperando OK Jorge antes de la ejecución real.
- [ ] Post-ejecución: Jorge le pide a Yohana QA otra vez. Si funciona → COMPLETADO. Si no → diagnóstico extra (App Check? cache? rule gap?).
- [ ] Si la causa raíz resulta ser un gap en la rule de update (ej: la rule no permite update a operaria sobre notificación con `userId == auth.uid` por algún branch raro), agregar P-XXX a `docs/PATRONES_REGRESION.md` + cazador.
- [ ] `npm run check:regression` sigue en 0 hits.

#### Restricciones / guardarrails

- **Migración de datos requiere OK Jorge en BLOQUEOS.md** ANTES de la ejecución real. Diagnóstico (read-only) no requiere OK.
- archivist PRE-CHANGE OBLIGATORIO — toca services y posiblemente rules; vector P-001/P-002 vivo.
- regression_guardian OBLIGATORIO antes del commit de cualquier cambio a rules o services.
- Si toca `firestore.rules` → `npm run deploy:rules` antes de cerrar (sub-regla CLAUDE.md, P-005).
- NUNCA hacer migración masiva (todos los usuarios) en este sprint. Sólo Yohana. Si después aparece que otros usuarios tienen el mismo problema, abrir SPRINT-116 distinto.

#### Notas para el coordinator

- El gotcha en CLAUDE.md "bug pre-existente en notificaciones" describe el mismo vector pero en sentido contrario (rule gateaba `userId` mientras código escribía `destinatarioId`). Ese gotcha está fechado pre `b93625d`. Después de `b93625d` el código escribe `userId` y la rule se mantiene en `userId`. Pero los docs legacy (escritos antes de `b93625d`) pueden estar en cualquier shape. Este sprint los limpia para Yohana.
- Si el script de diagnóstico encuentra que el problema afecta a >5 usuarios distintos (no solo Yohana), escalar a Jorge antes de procesar — probablemente requiere migración masiva con OK explícito.
- Después de cerrar SPRINT-115, considerar:
  - Eliminar la query legacy `where('destinatarioId', '==', userId)` del service una vez TODOS los docs estén migrados a `userId`. Eso es un sprint follow-up.
  - Endurecer rule de update para validar también `destinatarioId == auth.uid` como fallback temporal hasta que la migración masiva (futura) limpie todo.
- Postmortem obligatorio si confirma Caso B (vector recurrente del bug histórico). Sub-regla CLAUDE.md.
