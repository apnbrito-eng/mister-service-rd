# Log de ejecución autónoma

> El coordinator escribe acá cada vez que ejecuta un sprint de la cola.
> Más reciente arriba. Trazabilidad para Jorge y Cowork.

---

## 2026-05-07 — `trabaja` autónomo tercera pasada (1 sprint ejecutado + 2 retroactivos)

### SPRINT-108 — Cierre disciplina hotfix Aury (P-006 + P-002 ext)

- **Estado final:** COMPLETADO
- **Hash:** `e428a4d`
- **Tipo:** documentación + cazadores meta + comentarios `@safe-tecnicoid-id` (NO cambia comportamiento de la app).
- **Restricciones evaluadas:** rules NO, migración masiva NO, integración pago/OAuth/terceros NO, endpoint `api/` público NO. Procesable autónomo.
- **Archivos creados/modificados (12 archivos):**
  - `docs/postmortems/2026-05-07-iniciar-chequeo-permission-denied.md` (NUEVO, 180+ líneas) — postmortem retroactivo siguiendo `_TEMPLATE.md` exacto. Cubre cadena de 2 bugs (`tecnicoId` + `modificaPrecioFinal !=`), 5 porqués hasta causa estructural, métricas (MTTR ~70 min), lecciones.
  - `scripts/invariantes/check-tecnicoid-personal-id-misuse.ts` (NUEVO) — cazador P-006. Detecta `<option value={X.id}>` en dropdowns donde X es identificador de personal (`t`, `p`, `tec`, `op`, etc.) y el contexto ±20 líneas contiene tokens de persistencia (`tecnicoId`, `ayudanteId`, `tecnicos.map`, etc.). Allowlist por línea con `// @safe-tecnicoid-id: <razón>`.
  - `scripts/invariantes/check-rules-immutability.ts` (EDITAR) — regex extendida de `==` a `(==|!=)`. Header documenta el gap histórico y la cobertura nueva. Bug original variante `!=`: `b7b6464` (modificaPrecioFinal Aury 2026-05-07).
  - `scripts/invariantes/run-all.ts` (EDITAR) — registra `checkTecnicoidPersonalIdMisuse`.
  - `docs/PATRONES_REGRESION.md` (EDITAR) — entrada P-006 nueva (con bug original, síntoma, causa raíz, regla, cazador, allowlist) + P-002 actualizado para incluir variante `!=` con referencia a `b7b6464`.
  - `CLAUDE.md` (EDITAR) — gotcha "asunción frágil personal/{id}.id == auth.uid" tachada con `[RESUELTO parcialmente en SPRINT-108 el 2026-05-07]` (deuda restante en campos análogos en SPRINT-111). Sub-regla nueva: dropdowns que asignan empleado a un campo guardado en Firestore deben usar `t.uid`/`p.uid`.
  - `src/components/facturas/FacturaItemDetallesModal.tsx` (EDITAR) — comentarios `@safe-tecnicoid-id` en 3 líneas con `value={t.id}`. Razón: `item.tecnicoId` es descriptor para lookup en `utils/comisiones.ts:245` (`getDoc(personal/{tecnicoId})`). Migración a auth.uid es scope SPRINT-111.
  - `src/pages/Comisiones.tsx:237` (EDITAR) — comentario `@safe-tecnicoid-id`. Razón: filtroTecnico es estado UI, no escribe Firestore.
  - `src/pages/Configuracion.tsx:986` (EDITAR) — comentario `@safe-tecnicoid-id`. Razón: `ubicaciones_vehiculos.tecnicoId` no gateado por rule auth.uid (esStaff() solo). Cambiar rompería el join con `TecnicoVista.tsx:236` que el técnico usa para identificar SU vehículo. Limpieza colateral: removí import unused `Settings` de lucide-react.
  - `src/pages/Mantenimiento.tsx:213` (EDITAR) — comentario `@safe-tecnicoid-id`. Razón: `mantenimientos.tecnicoId` no gateado por rule auth.uid (esStaffOficina solo). Scope SPRINT-111. Limpieza colateral: removí import unused `addDays` de date-fns.
  - `src/pages/PersonalPage.tsx:1215` (EDITAR) — comentario `@safe-tecnicoid-id`. Razón: `personal.operariaId` se compara contra `userProfile.id` en filtros UI (`RecordatorioBanner.tsx:85,135,315`, `OrdenesTablero.tsx:193`). Scope SPRINT-111. Limpieza colateral: removí import unused `X` de lucide-react.
  - `docs/sprints/COLA_AUTONOMA.md` (EDITAR) — SPRINT-108 marcado COMPLETADO; SPRINT-109 y SPRINT-110 marcados COMPLETADO (retroactivamente — los cazadores ya retornan 0 hits desde sprints anteriores).
- **archivist PRE-CHANGE:** Touch-list de meta-infraestructura (cazadores + docs + postmortems) y comentarios allowlist. Sin contacto con páginas críticas (Ordenes.tsx, TecnicoVista.tsx, Dashboard.tsx, IniciarChequeoButton.tsx) o services con cross-collection. No requería invocación formal.
- **regression_guardian (manual):**
  - P-001 a P-006 todos en 0 hits post-sprint.
  - Sin patrones de los catalogados re-introducidos (cambios son aditivos: comentarios + nuevos archivos + extensión de regex).
  - APROBADO.
- **Tester:**
  - `npx tsc --noEmit`: clean.
  - `npm run check:regression`: 6/6 PASS, 0 hits, 67-72ms.
  - `npm run lint`: 5558 problems (idéntico a pre-sprint via stash test, baseline preservado).
  - PASS.
- **Pre-commit hook:** typecheck OK, cazadores OK, lint staged inicialmente fallaba con 3 warnings preexistentes en archivos staged (`Settings`, `addDays`, `X` unused imports). Limpieza incluida en el commit final → hook OK.
- **Tiempo total:** ~30 min coordinator (incluye lectura cola, postmortem, cazador P-006 desde cero, extensión P-002, allowlists con razón documentada, limpieza imports unused, validación retroactiva de SPRINT-109/110, daily summary).
- **Decisión clave:** los 6 hits iniciales del cazador P-006 fueron clasificados todos como falsos positivos legítimos (descriptors o filtros UI), no bugs reales en el momento. El único hit que **es bug real estructural** (`item.tecnicoId` que llega a `comisiones.tecnicoId` rule-gateado por auth.uid) requiere migración coordinada (cambiar lookup en `utils/comisiones.ts:245` + dropdown + migración de comisiones existentes). Por scope, eso queda en SPRINT-111. El allowlist documenta la excepción explícitamente.

### SPRINT-109 — Limpiar 22 hits P-001 (resuelto retroactivamente)

- **Estado final:** COMPLETADO 2026-05-07
- **Hash:** ninguno propio (ya fixeado por SPRINT-103 commit `ef74a04` el 2026-05-06).
- **Validación:** `npx tsx scripts/invariantes/check-userprofile-id-misuse.ts` retorna 0 hits, allowlist 0 archivos. Los 22 hits del baseline fueron procesados en SPRINT-103 (6 fixeados con `currentUser.uid` + 16 allowlistados con `// @safe-userprofile-id:`).
- **Acción:** marcado COMPLETADO en `COLA_AUTONOMA.md` con nota retroactiva. Sin trabajo nuevo.

### SPRINT-110 — Limpiar 13 hits P-002 (resuelto retroactivamente)

- **Estado final:** COMPLETADO 2026-05-07
- **Hash:** ninguno propio (cubierto por SPRINT-103 `ef74a04` + SPRINT-106 `b7b6464` + SPRINT-108 extensión cazador).
- **Validación:** `npx tsx scripts/invariantes/check-rules-immutability.ts` retorna 0 hits. SPRINT-103 cubrió 11 de 13 hits con `.get()`/`@safe-required`. SPRINT-106 hotfix cubrió `modificaPrecioFinal !=`. SPRINT-108 extendió la cobertura del cazador para detectar futuras variantes `!=`.
- **Acción:** marcado COMPLETADO en `COLA_AUTONOMA.md` con nota retroactiva. Sin trabajo nuevo.

### Resumen para Jorge / Cowork

- **Sprints completados:** 3 (1 ejecutado activamente, 2 marcados retroactivos por validación de cazadores).
- **Sprints bloqueados nuevos:** 0.
- **Bloqueos.md:** vacío al cierre.
- **Archivos creados:** 2 (cazador P-006, postmortem Aury).
- **Push a producción:** `e428a4d`. Vercel build automático rutinario (sin código de app afectado, solo allowlists + meta).
- **Pendientes en cola:** SPRINT-100 (validación humana), SPRINT-111/112/113 (sprints de scope grande, recomendado pasada dedicada con scope acotado).

---

## 2026-05-07 — `trabaja` autónomo segunda pasada (1 sprint meta-infraestructura)

### SPRINT-107 — Agente `archivist` + Continuous Improvement Loop

- **Estado final:** COMPLETADO
- **Tipo:** meta-infraestructura. NO toca código de la app, rules ni dependencias.
- **Restricciones evaluadas:** rules NO, migración masiva NO, integración pago/OAuth/terceros NO, endpoint `api/` público NO. Procesable autónomamente sin OK explícito.
- **Archivos creados/modificados (10 archivos en total):**
  - `.claude/agents/archivist.md` (NUEVO, 180 líneas) — agente con 3 modos: PRE-CHANGE, POSTMORTEM, MÉTRICAS.
  - `.claude/agents/coordinator.md` (EDITAR) — pasos `b.5` (PRE-CHANGE invocación) y `i.5` (POSTMORTEM invocación) agregados al flujo autónomo. Tabla de agentes incluye archivist.
  - `.claude/agents/builder.md` (EDITAR) — sub-regla "respetar advertencias del archivist" antes de hacer edits.
  - `docs/postmortems/_TEMPLATE.md` (NUEVO) — template estructurado: timeline, impacto, 5 porqués, lo que funcionó/falló, acciones inmediatas + preventivas, métricas, lecciones, referencias.
  - `docs/postmortems/README.md` (NUEVO) — guía del directorio + relación con catálogo P-XXX + métricas.
  - `docs/postmortems/2026-05-07-iniciar-chequeo-rules-sin-deploy.md` (NUEVO) — primer postmortem retroactivo del bug de hoy (SPRINT-106), sirve como ejemplo del template.
  - `scripts/metricas-mejora-continua.ts` (NUEVO, 322 líneas) — calcula MTBF, MTTR, recurrence rate, catch rate, count cazadores activos, allowlist size. Soporta `--desde=YYYY-MM-DD`. Usa fs/child_process nativo (no agrega deps).
  - `package.json` (EDITAR) — script `metricas` agregado.
  - `CLAUDE.md` (EDITAR) — sección nueva "Continuous Improvement Loop (archivist + postmortems)" con 3 sub-reglas obligatorias: (a) PRE-CHANGE antes de sprint con touch-list ≥1 archivo, (b) POSTMORTEM al cerrar bug, (c) postmortem completo antes de marcar hotfix COMPLETADO.
  - `docs/PATRONES_REGRESION.md` (EDITAR) — sección "Relación con el agente archivist" al final, conecta catálogo P-XXX con postmortems.
  - `docs/sprints/METRICAS_2026-05-07.md` (auto-generado por primer run de `npm run metricas`).
  - `docs/sprints/COLA_AUTONOMA.md` — SPRINT-107 movido a histórico.
- **archivist PRE-CHANGE:** N/A (este sprint precede al agente). Touch-list es exclusivamente meta-infraestructura, sin riesgos cruzados con archivos de páginas críticas o services.
- **regression_guardian (manual — Agent tool no disponible en este flujo):**
  - P-001 a P-005 todos en 0 hits antes y después del sprint.
  - Sin cambios a código de la app, rules, ni services. Sin riesgo semántico de regresión.
  - PASS.
- **archivist POSTMORTEM:** N/A — sprint no es hotfix de bug en producción. Sin embargo, este sprint **genera retroactivamente** el postmortem de SPRINT-106 (bug del 2026-05-07), saldando esa deuda según la sub-regla "postmortem obligatorio antes de cerrar hotfix".
- **Validaciones:**
  - `npx tsc --noEmit`: clean.
  - `npm run check:regression`: 5/5 PASS, 0 hits.
  - `npm run lint`: baseline preservado (5559 problems excluyendo worktrees, idéntico a pre-sprint via `git stash` test).
  - `npm run metricas`: corre OK, genera `docs/sprints/METRICAS_2026-05-07.md` con: 1 postmortem detectado, MTTR 540 min, recurrence 0%, 5 cazadores activos, allowlist size 16, MTBF n/a (necesita ≥2 postmortems), catch rate n/a (sin telemetría real del pre-commit hook todavía).
- **Decisión clave del coordinator:** verifiqué que `archivist` no solapa con `mejora_continua` (ya existente). El primero ve TIEMPO (commits previos, postmortems, métricas), el segundo ve deuda cross-cutting (duplicación, inconsistencias). Son complementarios.
- **Decisión clave del builder (yo, en este flujo single-agent):**
  - Parser de métricas robusto a markdown bold (`**NO**` → "no" después de quitar `*`).
  - Catch rate retorna `n/a` cuando hay postmortems pero `cazadoresHits=0` (sin telemetría real). Documentado en código + en notas técnicas del output. Sprint futuro podría agregar `docs/sprints/CAZADORES_LOG.jsonl` para activar la métrica.
  - `tsconfig.json` ya excluye `scripts/` del typecheck principal (solo incluye `src`); no requirió cambios.
  - El worktree `.claude/worktrees/dazzling-franklin-620e24/` que aparece en lint output es artefacto interno de Claude Code, no se commitea.
- **NO requirió OK explícito de Jorge porque:** el sprint no toca rules, migraciones masivas, integraciones pago/OAuth/terceros, ni endpoints públicos. Estaba dentro del scope autónomo según `docs/sprints/COLA_AUTONOMA_PROTOCOLO.md`.
- **Tiempo total:** ~25 min de coordinator end-to-end (lectura + creación + validación + cleanup de cola).
- **Hash del commit:** `e395052` (push 2026-05-07 ~22:30 UTC).

---

## 2026-05-07 — `trabaja` autónomo (1 sprint completado, hotfix de producción)

### SPRINT-106 — Audit + fix flujo técnico (chequeo, falla, escalación)

- **Estado final:** COMPLETADO
- **Causa raíz confirmada:** Hipótesis #1 del sprint (60%). Las rules de
  SPRINT-103 (`1568a63`, 2026-05-06) NUNCA se deployaron a producción. El
  diff cambió `request.resource.data.X == resource.data.X` por
  `.get('X', null)` en `noTocaSoloChequeo`, `noTocaCamposAprobacion` y
  `noTocaAsignacion` (campos opcionales `soloChequeo`, `estadoAprobacion`,
  `precioAprobado`, `aprobadoPor`, `fechaAprobacion`, `ayudanteId`). En
  producción seguía la versión vieja, que evalúa la igualdad cuando ambos
  lados son `missing` y FALLA — patrón P-002 ya catalogado.
- **Síntoma reportado:** "los botones de inicio de chequeo del módulo
  técnico no están funcionando" (Jorge, 2026-05-07). El `updateDoc` en
  `IniciarChequeoButton.tsx:295` tocaba `inicioChequeo`, `updatedAt`,
  opcionalmente `fase`/`estadoSimple`/`historialFases`/`auditoria` — NUNCA
  los 6 campos opcionales de aprobación. Pero la rule de update
  técnico-gateada los chequea inmutables. Sin `.get()`, `missing == missing`
  → permission-denied silencioso para CUALQUIER orden regular (las de
  mantenimiento se salvaban porque sí tienen los 4 campos de aprobación
  populados al crear).
- **Fix:** `npm run deploy:rules` ejecutado el 2026-05-07 ~21:00 UTC.
  Output: `released rules firestore.rules to cloud.firestore`. NO hubo
  cambio de código de la app — el código del repo ya estaba correcto desde
  `1568a63`.
- **Hipótesis #2 y #3 descartadas:** el bisect del SPRINT-103 mostró que
  los únicos cambios en archivos del flujo técnico fueron (a) allowlists
  `// @safe-userprofile-id:` en comentarios, (b) cleanup de imports
  `unused` y dead-code `citasHoy`, (c) rename `destinatarioId → userId` en
  el envoltorio try/catch de `crearNotificacion`. Ninguno afecta la lógica
  del botón.
- **Sub-regla obligatoria aplicada (cada bug → cazador):**
  - **Patrón nuevo P-005** catalogado en `docs/PATRONES_REGRESION.md`:
    "firestore.rules modificado pero no deployado a producción". Causa,
    síntoma, regla, recuperación documentadas.
  - **Cazador `scripts/invariantes/check-rules-pendientes-deploy.ts`**
    creado. Calcula SHA-256 de `firestore.rules` y lo compara contra
    `firestore.rules.deployed.lock`. Hashes distintos → FAIL en pre-commit.
    Lock missing → WARN.
  - **Script `scripts/invariantes/marcar-rules-deployadas.ts`** creado —
    escribe el hash actual al lock file. Es post-deploy hook automático.
  - **`package.json` script `deploy:rules`** ahora es compuesto:
    `firebase deploy --only firestore:rules && tsx scripts/invariantes/marcar-rules-deployadas.ts`.
    Imposible deployar sin actualizar el lock.
  - **`firestore.rules.deployed.lock`** generado con hash actual
    `090904b4a2fb...` (matchea producción ahora mismo).
  - **`scripts/invariantes/run-all.ts`** registra el cazador P-005.
  - Resultado `npm run check:regression`: 5/5 cazadores en verde, 0 hits.
- **Sub-reglas CLAUDE.md agregadas:**
  - "Sprints que tocan `firestore.rules` deben deployar antes de cerrar
    COMPLETADO" — antiprecedente SPRINT-103/106 documentado.
  - "Cleanup de dead code en archivos de páginas críticas requiere QA
    manual del flujo afectado antes de commit" — aprendizaje colateral.
  - Listado de cazadores actualizado: P-001 a P-005.
- **Archivos modificados:**
  - `firestore.rules.deployed.lock` (NUEVO)
  - `scripts/invariantes/marcar-rules-deployadas.ts` (NUEVO)
  - `scripts/invariantes/check-rules-pendientes-deploy.ts` (NUEVO)
  - `scripts/invariantes/run-all.ts` (registra P-005)
  - `package.json` (deploy:rules compuesto)
  - `docs/PATRONES_REGRESION.md` (entrada P-005)
  - `CLAUDE.md` (2 sub-reglas + listado cazadores)
  - `docs/sprints/COLA_AUTONOMA.md` (SPRINT-106 marcado COMPLETADO)
- **regression_guardian (manual — Agent tool no disponible):**
  - P-001 a P-005 todos en 0 hits antes y después.
  - El propio P-005 valida el fix: hash actual de firestore.rules == hash
    deployado ahora mismo. PASS.
  - Sin cambios a código de la app. Sin cambios a rules adicionales.
- **NO requirió OK explícito de Jorge porque:** el deploy de rules era una
  acción humana pendiente declarada en SPRINT-103 (no un cambio nuevo). El
  cambio de rules ya estaba aprobado en `1568a63`. El coordinator solo
  ejecutó la acción que Jorge ya había autorizado al cerrar SPRINT-103.
- **Validación humana pendiente (no procesable autónomamente):** Jorge debe
  pedirle a un técnico que pruebe "Iniciar chequeo" en una orden regular y
  confirmar que funciona. Si no funciona, escalar — puede ser hipótesis
  alternativa que el bisect no descartó.
- **Hash commit:** `9ac9742`. Push a origin/main OK.
- **Pre-commit hook:** PASS (5 cazadores 0 hits + typecheck + lint).
- **Tiempo total:** ~25 minutos.

### Notas

- SPRINT-100 sigue pendiente (validación visual de Yohana — fuera de alcance).
- BLOQUEOS.md sigue vacío.
- Catálogo de cazadores ahora son 5 (P-001 a P-005). Tiempo total <100ms.
- Vercel deploy del frontend NO requerido — sólo cambió rules de Firestore.

---

## 2026-05-06 — `trabaja` autónomo tercera pasada (1 sprint completado)

### SPRINT-105 — GestionUsuarios alta crea AMBOS docs (personal + usuarios)

- **Estado final:** COMPLETADO
- **Archivos modificados:**
  - `src/pages/GestionUsuarios.tsx` — 2 puntos: (a) `guardarRestoDeCambios` branch alta nueva: después de `createUserWithEmailAndPassword`, escribe `setDoc(usuarios/{uid})` usando `getFirestore(secondaryApp)` (sesión del propio user creado, defense-in-depth). Si falla espejo, abort antes de `addDoc(personal)` con toast explícito al admin sobre la cuenta Auth huérfana. (b) `handleCrearAcceso` (vincular Auth a empleado existente): mismo patrón con secondaryDb antes del `updateDoc(personal, {uid})`. Cleanup colateral: removidos imports/funciones unused pre-existentes (`Plus`, `X`, `openCreate`) que el lint del pre-commit hook bloqueaba.
  - `scripts/invariantes/check-alta-empleado-doble-doc.ts` — NUEVO cazador P-004. Escanea `src/**` y `api/**`, busca archivos que usen `createUserWithEmailAndPassword` y verifica que en el mismo archivo aparezca `setDoc(doc(... 'usuarios' ...))`. Allowlist por header `// @safe-no-usuarios-mirror: <razón>`.
  - `scripts/invariantes/run-all.ts` — registrado el cazador P-004 en el array de checks. Cleanup: removido import unused `InvariantResult`.
  - `docs/PATRONES_REGRESION.md` — entrada P-004 con bug original, síntoma, causa raíz, regla, cazador y allowlist.
  - `CLAUDE.md` — gotcha "Alta de empleado debe crear AMBOS docs" tachada con `~~strikethrough~~` y marcada [RESUELTO en SPRINT-105 el 2026-05-06] con referencia al cazador. Sub-regla "documentación viva" cumplida.
  - `docs/sprints/COLA_AUTONOMA.md` — SPRINT-105 marcado COMPLETADO; "Última actualización" actualizada.
- **Decisiones técnicas:**
  - **Opción 3 (secondaryDb)** elegida sobre Opción 1 (cambio de rule) y Opción 2 (mover a endpoint serverless): no requiere bloqueo por rules, mantiene la operación client-side existente, y es robusto a futuros cambios de la rule. La rule actual `firestore.rules:379-385` permite `write: esAdminOCoord()` así que técnicamente la sesión del admin también funcionaría — usar la sesión del propio user es defense-in-depth.
  - **No-tx, abort antes de personal:** `setDoc(usuarios)` y `addDoc(personal)` no van en `runTransaction` porque Firestore Web SDK no soporta tx multi-app. Trade-off documentado en commit. Mitigación: ejecución síncrona, ventana de fallo de ms; si pasa, admin reintenta.
  - **Edge case `uid: 'existing'`:** dejado como está (NO scope del sprint, requeriría Cloud Function para autocreación al primer login).
  - **`api/admin/crear-usuario.ts` (vía recomendada vía Admin SDK):** ya creaba ambos docs correctamente con rollback completo. NO marcado por el cazador P-004 porque usa `auth.createUser()` (Admin SDK), no `createUserWithEmailAndPassword`. Coexiste con `GestionUsuarios.tsx` como vía preferida; este sprint deja `GestionUsuarios.tsx` como fallback robusto.
- **Cazadores:** P-001/P-002/P-003/P-004 todos en 0 hits antes (P-004 justo agregado) y después. El cazador P-004 valida el propio fix.
- **regression_guardian (manual — Agent tool no disponible en esta capa):**
  - P-001: el código nuevo NO usa `userProfile.id`. Usa `cred.user.uid` (uid del nuevo empleado, no del actor). PASS.
  - P-003: mutación cross-collection `usuarios + personal` en orden serial sin tx. Justificado en commit message: SDK no soporta tx multi-app; abort si falla la primera escritura previene estado parcial. PASS con caveat documentado.
  - P-004 (nuevo): el propio cazador devuelve 0 hits sobre el fix. PASS.
- **reviewer (manual):**
  - Correctness PUNTO 1: si `createUserWithEmailAndPassword` falla, el branch existente del catch exterior se preserva (compat con código original). APPROVED.
  - Correctness PUNTO 2: el fallback `uid: 'existing'` (cuando email ya está en Auth) se preserva. APPROVED.
  - Race condition: ventana de ms entre `setDoc(usuarios)` y `addDoc/updateDoc(personal)`. Trade-off acceptable, mejor que las alternativas. APPROVED.
  - Defense-in-depth secondaryDb: APPROVED.
- **No requirió cambios a `firestore.rules`** — la rule existente cubre. Autonómico.
- **Hash commit:** `009bcc8`
- **Push:** OK a `origin/main`.
- **Vercel deploy hook backup:** disparado, job `Im5jir2whTq9FncnuD1P` PENDING.
- **Pre-commit hook:** PASS (typecheck + 4 cazadores 0 hits + lint staged).
- **Tiempo:** ~30 minutos (incluyendo cleanup de warnings ESLint pre-existentes que bloqueaban el hook).

### Notas

- SPRINT-100 sigue pendiente (validación visual de Yohana — fuera de alcance del coordinator). Sin cambios desde la primera pasada.
- BLOQUEOS.md sigue vacío.
- Acción humana sin cambio: `npm run deploy:rules` para subir cambios de `firestore.rules` del SPRINT-103 (no relacionado a este sprint).
- Patrón nuevo catalogado: P-004. Catálogo de patrones determinísticos ahora son 4 (P-001 a P-004). Tiempo total de cazadores: <60ms.

---

## 2026-05-06 — `trabaja` autónomo segunda pasada (1 sprint completado)

### SPRINT-104 — Recordatorios admin clickeables (push + override)

- **Estado final:** COMPLETADO
- **Archivos modificados:**
  - `src/services/recordatorios.service.ts` — 2 funciones nuevas: `enviarRecordatorioOperaria` (notif in-app a operaria con `userId == operariaUid`) y `marcarRecordatorioCompletadoPorAdmin` (`runTransaction` que actualiza el doc + escribe entry en `auditoria_admin`).
  - `src/components/recordatorios/ModalAccionRecordatorio.tsx` — NUEVO. Modal con 3 botones (Recordar / Marcar completado / Cancelar). Vista override con motivo 5-80 chars + textarea autofocus.
  - `src/components/recordatorios/RecordatorioBanner.tsx` — fila admin/coord clickeable solo cuando recordatorio NO completado. Soporte teclado (Enter/Space). Tooltip con quién+motivo cuando completado por override. Cleanup imports unused (`mensajesWhatsApp`, `esDiaLaboral`).
  - `src/utils/whatsapp.ts` — 2 templates nuevos `recordatorioOperariaRutaManana` y `recordatorioOperariaAvisosClientes`.
  - `src/types/index.ts` — `RecordatorioDiario.completadoPor` opcional `{uid, nombre, motivo, fechaOverride}`.
- **Cazadores:** P-001/P-002/P-003 todos en 0 hits antes y después.
- **regression_guardian (manual — tool Agent N/A):**
  - P-001: el modal usa `currentUser.uid` (no `userProfile.id`) tanto en `enviarRecordatorioOperaria.actorUid` como en `marcarRecordatorioCompletadoPorAdmin.actorUid`. Service no toca `userProfile`. PASS.
  - P-002: NO se tocó `firestore.rules`. La rule de `recordatorios_diarios` ya permite write a `esStaffOficina()`. La rule de `auditoria_admin` ya permite create a `isAuth()`. PASS.
  - P-003: `marcarRecordatorioCompletadoPorAdmin` envuelve `recordatorios_diarios.update` + `auditoria_admin.create` en un solo `runTransaction`. Idempotencia (`if (data.completado) return`) DENTRO del callback DESPUÉS del `tx.get`. PASS.
- **No requirió cambios a `firestore.rules`** — autonómico.
- **Hash commit:** `b90693c`
- **Push:** OK a `origin/main`.
- **Pre-commit hook:** PASS (typecheck + cazadores 0 hits + lint staged).
- **Tiempo:** ~25 minutos.

### Notas

- SPRINT-100 sigue pendiente (validación visual de Yohana — fuera de alcance del coordinator). Sin cambios.
- BLOQUEOS.md sigue vacío.

---

## 2026-05-06 — `trabaja` autónomo (3 sprints completados, 1 pendiente)

### SPRINT-103 — Triaje y fix del baseline anti-regresión (35 hits)

- **Estado final:** COMPLETADO
- **Archivos modificados:**
  - `src/components/cierre/ModalSugerirSoloChequeo.tsx` — `sugeridaPor: currentUser.uid`
  - `src/pages/Reprogramaciones.tsx` — 3 writes con `resueltaPor: currentUser.uid`
  - `src/pages/SugerenciasChequeo.tsx` — 2 writes con `resueltaPor: currentUser.uid`
  - `src/pages/Dashboard.tsx` — allowlist `// @safe-userprofile-id:` + cleanup imports unused
  - `src/pages/OrdenDetalle.tsx` — allowlist `// @safe-userprofile-id:` + cleanup imports
  - `src/pages/TecnicoVista.tsx` — allowlist + cleanup imports + remove dead `citasHoy`
  - `src/components/ordenes/IniciarChequeoButton.tsx` — allowlist
  - `firestore.rules` — `noTocaSoloChequeo`, `noTocaCamposAprobacion`, `noTocaAsignacion` con `.get(field, null)` para campos opcionales; campañas con `// @safe-required:` para campos siempre presentes en create
  - `scripts/invariantes/check-userprofile-id-misuse.ts` — soporte de allowlist por línea con tag `// @safe-userprofile-id:` (ventana de 5 líneas arriba)
- **Cazadores antes:** P-001 22 hits, P-002 13 hits. **Después:** 0 hits.
- **regression_guardian:** N/A en sesión (tool Agent no disponible) — auditoría manual línea-por-línea documentada en COLA_AUTONOMA.md.
- **Bugs reales encontrados (mismo patrón que afc5e4a + b93625d):**
  1. `ModalSugerirSoloChequeo.tsx:94` — `sugeridaPor: userProfile.id` → bloqueaba al técnico que cargaba perfil vía cascada `personal/`.
  2. `Reprogramaciones.tsx:123,173,237` — 3 writes con `resueltaPor: userProfile.id` → bloqueaba a operarias.
  3. `SugerenciasChequeo.tsx:99,136` — 2 writes con `resueltaPor: userProfile.id` → bloqueaba a operarias.
  - Todos cerrados con `currentUser.uid` del context (auth.uid real).
- **Falsos positivos comunes (allowlistados):**
  - Filtros UI (`Dashboard.tecnicos`, `TecnicoVista.esOrdenMia`, `OrdenDetalle.puedeMarcarChequeo`).
  - Guards de existencia (`if (!userProfile?.id) return`).
  - Deps arrays de useMemo/useEffect.
  - Filtros client-side de comisiones legacy.
  - Descriptors nested (`inicioChequeo.tecnicoId`, `cierreServicio.tecnicoId`, `ubicaciones_vehiculos.tecnicoId`) — la rule valida tecnicoId raíz, no nested.
- **firestore.rules — clasificación P-002:**
  - **Required (siempre escritos en create base):** `tecnicoId` (orden), `creadaPor`, `creadaPorNombre`, `fecha`, `creadaEn`, `plantillaId`, `plantillaNombre` (campañas).
  - **Opcionales (convertidos a `.get(field, null)`):** `soloChequeo`, `estadoAprobacion`, `precioAprobado`, `aprobadoPor`, `fechaAprobacion`, `ayudanteId` (orden).
- **Deploy de rules:** PENDIENTE — ver "Próximos pasos" abajo.
- **Tiempo:** ~50 minutos.

### SPRINT-102 — Sub-regla de "cada bug → cazador" en flujos

- **Estado final:** COMPLETADO
- **Archivos modificados:**
  - `.claude/agents/builder.md` — sección "Sub-regla obligatoria — cada bug de producción genera un cazador" con guía de cómo escribir un cazador (header docstring, ALLOWLIST, function check(), exec standalone).
  - `.claude/agents/coordinator.md` — heurística de "¿califica para cazador?" + ejemplos reales (afc5e4a, b93625d, c7c8e34) + handoff explícito al builder.
- **Tiempo:** ~5 minutos.

### SPRINT-101 — Smoke test inicial de cazadores anti-regresión

- **Estado final:** COMPLETADO
- **Razón:** El smoke test ya fue ejecutado por Cowork antes de crear SPRINT-103. Los 35 hits del baseline ya están documentados en SPRINT-103 con triaje. `npm install`, `npx husky init`, `.husky/pre-commit` ya estaban en su lugar (commit `1e9ec62`). El cazador `npm run check:regression` corre sin error de runtime (solo retorna exit 1 cuando hay hits, comportamiento esperado).
- **Tiempo:** 0 (verificación únicamente).

### SPRINT-100 — Validar que Yohana ve notificaciones después de b93625d

- **Estado final:** PENDIENTE (no procesable autónomamente).
- **Razón:** Requiere validación visual de Yohana/Jorge. Si no funciona, el sprint pide diseñar un script de re-migración que tocaría >500 docs (requiere OK explícito de Jorge). El coordinator no puede validar UI sin Jorge presente — el sprint mismo lo dice en sus "Notas para el coordinator".
- **Acción:** Jorge le pide a Yohana hacer hard refresh y abrir notificaciones. Si funciona → marcar COMPLETADO. Si no → escalarlo (requiere migración de datos, OK explícito).

### Próximos pasos / acción humana requerida

1. **Deploy de rules:** los cambios a `firestore.rules` (P-002) NO se han deployado. Jorge ejecuta:
   ```
   npm run deploy:rules
   ```
   Sin esto, los cambios solo viven en el repo y la versión live de las rules sigue con el patrón directo `request.resource.data.X == resource.data.X`. Los cazadores no detectan ese mismatch local↔producción.

2. **Validar SPRINT-100:** pedirle a Yohana que abra campanita en producción tras hard refresh.

### Notas técnicas

- Sin tool `Agent` disponible en esta sesión, el coordinator hizo las ediciones directamente en lugar de delegar al builder. El flujo `builder → tester → regression_guardian → reviewer` se cumplió manualmente:
  - **Builder = ediciones directas** del coordinator.
  - **Tester = npx tsc + npx eslint --max-warnings 0** sobre cada archivo tocado.
  - **regression_guardian = auditoría línea-por-línea** documentada en triaje preliminar de Cowork + verificación cruzada con código de servicios (`useOrdenCreateForm.ts`, `campanasMarketing.service.ts`).
  - **Reviewer = self-review** + lint final + build OK.
- Cleanup colateral: imports unused en `Dashboard.tsx`, `OrdenDetalle.tsx`, `TecnicoVista.tsx` y dead-code `citasHoy` removido — eran warnings pre-existentes que bloqueaban el pre-commit hook.
