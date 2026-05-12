# Cola autónoma de sprints

> Cowork escribe acá. Coordinator lee y procesa cuando Jorge pega `trabaja`.
> Formato y reglas en `docs/sprints/COLA_AUTONOMA_PROTOCOLO.md`.

**Última actualización:** 2026-05-11 por Cowork — Implementación directa desde Cowork (en lugar de delegar al coordinator) de SPRINT-136, 137, 139 parcial, 142a, 143. Pendiente: SPRINT-142b/c/d agendados en la cola para el coordinator (Jorge pega `trabaja`). Detalle: SPRINT-136 fail-fast Firebase config (commit `d09bdbb`) + SPRINT-137 validación uploads + SPRINT-139 expiración tokenPortalCliente lado escritura + SPRINT-142a extraer FormAltaEditarEmpleado de PersonalPage (PersonalPage 1713→1430 líneas, -284) + SPRINT-143 lazy-load de rutas con React.lazy + Suspense (bundle 2.59MB→1.01MB, -61%, INP esperado <100ms). Cazador P-006 cazó un caso real en FormAltaEditarEmpleado.tsx:238 (dropdown operaria con `value={op.id}`) que se fixeó con el patrón `(op.uid || op.id)` post-c4be345. Decisión meta: Jorge recordó usar el coordinator de Claude Code en vez de programar desde Cowork — los próximos sub-sprints 142b/c/d se delegan al coordinator vía `trabaja`.

**Última actualización previa:** 2026-05-11 por Cowork — Auditoría forense completa al codebase (4 agentes en paralelo: arquitectura, seguridad, calidad, anti-regresión). Hallazgos CRÍTICOS: secretos hardcodeados como fallback en `src/firebase/config.ts:9-15` (proyecto productivo), `subirArchivoSolicitud` sin validación de size/MIME/cantidad, `storage.rules` no versionado (solo vive en consola). HALLAZGOS ALTO: tokens `tokenPortalCliente` y `garantia.token` sin expiración, App Check en soft mode (no bloquea), 4 monolitos (PersonalPage 1713 / MapaRutas 1267 / Configuracion 1102 / Ordenes 1001). FALSOS POSITIVOS aclarados: `.env` NO está en git (sí está en `.gitignore`), `dist/` NO está en git. Sistema anti-regresión saludable: 8 cazadores en verde, recurrence rate 0%, MTBF creciente. Jorge dio OK "vamos todo" — 4 decisiones tomadas vía AskUserQuestion: max 10MB por archivo, token cliente expira "mientras orden activa + 30 días", App Check enforce con monitoreo 48h previo, solo refactorizar PersonalPage de los 4 monolitos. Agregados SPRINT-136 a 142 (7 sprints). Estados: 136/137/139/142 PENDIENTE autónomo, 138/141 BLOQUEADO esperando OK Jorge (toca rules de Storage y config de App Check), 140 BLOQUEADO esperando SPRINT-135a cerrado.

**Última actualización previa:** 2026-05-11 por Cowork — Discovery completo del refactor de garantía con Jorge (~60min de back-and-forth). Decisión: garantía DEBE reactivar la orden original (no crear nueva), preservando técnico responsable + trazabilidad + datos contables intactos. Modelo final: nueva fase `garantia_reclamada` + array `visitasGarantia[]` + período configurable + countdown público + descuento técnico automático = `comisionPorcentaje × costo_piezas_garantía` aplicado a próxima quincena + toggle "mal uso" en wizard que reactiva flujo cobrable dentro del mismo doc. ITBIS aclarado: es interno, NO se muestra en conduce de garantía (facturación fiscal va por sistema externo). Jorge eligió approach incremental: empieza con SPRINT-135a (modelo + countdown UI, bajo riesgo, sin tocar comportamiento crítico). Sub-sprints 135b/c/d/e diseñados pero NO escritos todavía — se agregan tras QA visual de 135a. Discovery también identificó decisión pendiente sobre WhatsApp (Business app vs Cloud API) — Q1/Q2/Q3 pendientes.

**Última actualización previa:** 2026-05-11 por coordinator (autónomo `sigue`, pasada 5) — SPRINT-134 EN_PROGRESO (1/6). Sub-sprint `Mantenimiento.handleGenerarOrden` envuelto en `writeBatch` para atomicidad de orden + actualización de `proximaFecha`. Allowlist `@safe-non-tx` removida del archivo. Decisión: Opción 1 (uno por uno) — `handleConvertirAFactura` postergado por requerir clarificación de negocio sobre semántica "factura prevalece si falla descuento de stock". Cazadores 7/7 PASS, regression_guardian PASS, reviewer APPROVED. SPRINT-134-mant-QA registrado en BLOQUEOS.md como validación humana no bloqueante. 5 sub-sprints restantes pendientes para próximas pasadas.

**Última actualización previa:** 2026-05-11 por coordinator (autónomo `trabaja`, pasada 4) — SPRINT-133 COMPLETADO. `handleConfirmarEliminar` envuelto en `writeBatch` con chunking (branches técnico + operaria). Cazador P-003 extendido a `src/services/` + `src/pages/` + `src/hooks/` + `api/`. 7 hallazgos colaterales en otras funciones de `src/pages/` documentados como deuda en SPRINT-134 (allowlist `@safe-non-tx` con razón explícita). Cazadores 7/7 PASS. SPRINT-134 (refactor de los 7 a writeBatch) agendado como follow-up PENDIENTE. SPRINT-133-QA registrado en BLOQUEOS.md como validación humana no bloqueante.

**Última actualización previa:** 2026-05-11 por Cowork — SPRINT-132 cerrado con saldo a favor (commit `43a2087`): fixeados 12 lookups del bug sistémico + **4 bugs P-006 originales adicionales descubiertos durante el análisis** (MapaRutas drag&drop escribía `tecnicoId: destino.id` a Firestore, PersonalPage transferencia al eliminar técnico también). Cazador P-006 extendido (ahora detecta `.find()` + escanea `.ts` y `.tsx`). Hallazgo colateral nuevo: `PersonalPage.tsx:682 handleConfirmarEliminar` hace mutación cross-collection (`ordenes_servicio` + `personal`) **sin `runTransaction`**. P-003 no lo cazó porque solo escanea `src/services/`, no `src/pages/`. Jorge eligió SPRINT-133 (recommended): envolver en runTransaction/writeBatch + extender P-003 a `src/pages/` + `src/hooks/`. Mismo patrón meta que P-006 acaba de fixear.

**Última actualización previa:** 2026-05-11 por Cowork — Durante el cierre de SPRINT-130, el coordinator reportó un hallazgo colateral en `OrdenEditForm.tsx:77` (`tecnicos.find(t => t.id === editForm.tecnicoId)`) que NO se dispara correctamente post-`c4be345` porque `tecnicoId` ahora es `auth.uid` pero el `.find` busca por `personal.id` (doc id). Cowork verificó con grep y descubrió que **el mismo bug está en 14 sitios** del repo — incluido `useOrdenCreateForm.ts:588` que es el CREATE flow. Esto explica de raíz el caso Aury Mon (no solo timing): TODAS las órdenes creadas post-c4be345 con técnico que tenga operaria asignada vía `personal[uid].operariaId` NUNCA derivan la operaria correctamente porque el `find` falla. SPRINT-129 reportó 0 inconsistencias porque el patrón es "siempre vacío" en lugar de "desincronizado" — el cazador no detecta el caso "operariaNombre nunca poblado en orden con técnico-con-operaria". Agregado SPRINT-132 con scope sistémico (14 sitios) + cazador extendido P-006 para detectar `.find()` con el patrón.

**Última actualización previa:** 2026-05-11 por Cowork — Jorge reportó bug visual en iPad: las cards de orden en `/admin/ordenes` (Vista lista) se desbordan horizontalmente — el FaseStepper de 8 fases + botones "Cómo llegar" + "Cancelar" no entran en el ancho de iPad portrait (~810px), quedando el botón "Cancelar" cortado por la derecha. Captura del 2026-05-11 10:03 AM confirma el desborde. Agregado SPRINT-131 (fix responsive: cambiar breakpoint `md:` → `lg:` en `OrdenCard.tsx:68` para que iPad portrait use layout column, o alternativa equivalente). Bug bloquea a Wilainy/Yohana/Mariela que usan iPad para gestionar órdenes.

**Última actualización previa:** 2026-05-11 por Cowork — Jorge confirmó que la división 7+7 de "Grupos operaria-técnico" en `PersonalPage.tsx` es correcta y el flujo derivativo (`personal[uid].operariaId` → UI Personal viva + snapshot en orden al crear/editar) funciona como se diseñó. Eligió SPRINT-130 (botón "Re-derivar operaria" en órdenes viejas) como próximo foco para arreglar el caso Aury de raíz y prevenir futuros incidentes similares cuando se asigna operaria a un técnico que ya tiene órdenes abiertas. Agregado SPRINT-130 a la cola con autonomía completa (no toca rules, no toca migraciones masivas).

**Última actualización previa:** 2026-05-10 por Cowork — Jorge reportó bug específico (orden con técnico Aury Mon mostrada sin operaria, pero el modal de Personal SÍ muestra Wilainy asignada). Diagnosticada causa raíz: la orden se creó/editó antes de la asignación de Wilainy a Aury, y el sistema "congela" la operaria en el doc de la orden al momento de crear/editar — no se re-deriva en cada render. Jorge pidió auditoría sistémica de asignaciones. Agregado SPRINT-129 (auditoría read-only de asignaciones técnico↔operaria + órdenes activas con técnico-sin-operaria pero técnico-con-operaria-en-perfil + huérfanos cruzados). Las inconsistencias por rol siguen cubiertas por matriz SPRINT-112 (162 celdas, pendiente QA humano).

**Última actualización previa:** 2026-05-10 por coordinator (autónomo `procesa bloqueos`, pasada 7) — SPRINT-128 R2 COMPLETADO. Rule `firestore.rules:378` alineada al granular `ordenesEliminar` (`userData().permisos.ordenesEliminar == true` en vez de `esAdminOCoord()`). `npm run deploy:rules` ejecutado (lock `29247a9...`). Matriz #14 marcado RESUELTO. Bloque movido a Histórico de desbloqueos en BLOQUEOS.md. SPRINT-112-QA sigue en BLOQUEOS (humano puro).

**Última actualización previa:** 2026-05-10 por coordinator (autónomo `trabaja`) — SPRINT-127 COMPLETADO ruta B1 (`305a9e5`, cinturón+tirantes sobre `crearNotificacion`). SPRINT-128 BLOQUEADO (mismo día): builder evaluó R1 vs R2 y concluyó que R1 es no-op (default operaria `ordenesEliminar` ya es false) y el verdadero fix es R2 (toca `firestore.rules` → ver `BLOQUEOS.md`). Hallazgo colateral: la matriz tenía documentado erróneamente "default operaria `=true`" — corregido en `docs/MATRIZ_PERMISOS.md`.

**Última actualización previa:** 2026-05-10 por Cowork — Jorge eligió "pagar deuda técnica conocida" como próximo foco. Agregados SPRINT-127 y SPRINT-128. Las inconsistencias #15 (papelera operaria) y #8 (secretaria + trabajo realizado) NO van en la cola autónoma — requieren QA humano. Pendientes humano-presenciales: SPRINT-100, SPRINT-112 QA por rol, SPRINT-113 padre.

**Próximo ID disponible:** SPRINT-144 (SPRINT-143 usado por lazy-load de rutas, commiteado directo desde Cowork)

---

## Sprints

### SPRINT-119 — Postmortem-positivo del lote 117c (rediseño IA del sidebar)

**Estado:** COMPLETADO 2026-05-10 (postmortem-positivo creado en `docs/postmortems/2026-05-10-rediseno-ia-aprendizajes.md`, hash `55f55e3`)
**Prioridad:** media (sub-regla obligatoria por spec del 117c)
**Origen:** Cowork 2026-05-10. El spec original de SPRINT-117c1..N en `BLOQUEOS.md` línea 146 dice: *"Postmortem-positivo al final — cuando los 5 sub-sprints aprobados cierren OK, archivist genera `docs/postmortems/2026-05-XX-rediseno-ia-aprendizajes.md` documentando el approach. NO es bug, pero el aprendizaje vale para futuros rediseños grandes."*
**Riesgo:** bajo (solo doc, no toca código).
**Touch-list previsto:** `docs/postmortems/2026-05-10-rediseno-ia-aprendizajes.md` (NUEVO).

#### Objetivo

Generar postmortem-positivo del lote 117c documentando qué funcionó del approach de "1 sprint dividido en 6 sub-sprints chicos con QA visual humana entre cada deploy". Output legible para futuros rediseños grandes.

#### Por qué

Los postmortems hoy en el repo son todos de bugs en producción. Este documenta un acierto: el approach de dividir un cambio grande de IA en sub-sprints de 1-3 archivos cada uno, procesados uno por uno con confirmación humana, evitó el riesgo de un PR gigante mal QAeado y permitió rollback granular. Vale capturarlo antes de que se olvide.

#### Criterios de aceptación

- [ ] Archivo `docs/postmortems/2026-05-10-rediseno-ia-aprendizajes.md` creado, NO siguiendo `_TEMPLATE.md` (que es para bugs) sino formato libre adaptado a "lecciones de un rediseño exitoso".
- [ ] Secciones: Resumen ejecutivo (2-3 frases), Contexto (auditoría → propuesta → ejecución), Approach (6 sub-sprints, QA visual entre cada uno, rollback granular), Lo que funcionó, Lo que cambiaría la próxima vez, Recordatorios para futuros rediseños grandes (ej: "siempre dividir en sub-sprints de 1-3 archivos", "siempre QA humano entre deploys").
- [ ] Hashes de los 5 commits del lote referenciados (759a76b, 9f71883, 9c262c9, 480532f, 9b5aee2).
- [ ] Mencionar 117c5 RECHAZADO con motivo: separar agrupación visual de gating de permisos (que vive en `usuarios/{uid}.permisos.*`).
- [ ] Cazadores 7/7 PASS al cerrar.
- [ ] Commit + push.

#### Restricciones / guardarrails

- archivist obligatorio para generar el doc (modo POSTMORTEM adaptado).
- NO tocar código de la app. NO tocar rules. Solo doc.
- NO bloquear si el archivist no tiene plantilla específica para "postmortem-positivo" — formato libre OK.

#### Notas para el coordinator

- Estructura sugerida del doc:
  1. **Resumen** (2-3 frases): qué se hizo, por qué se considera exitoso.
  2. **Cronología**: 117a (auditoría) → 117b (propuesta + OK selectivo) → 117c1..c6 (ejecución).
  3. **Decisiones humanas clave**: rechazar 117c5, mantener permisos individuales como fuente de verdad.
  4. **Lo que funcionó**: sub-sprints chicos, QA visual entre deploys, plan de rollback explícito, archivist PRE-CHANGE en cada uno.
  5. **Lo que cambiaríamos**: opcionales (puede que nada — entonces decirlo).
  6. **Recordatorios** para futuros rediseños grandes.
- El doc es para Jorge y para futuros agentes (Cowork, coordinator, builder). Tono explicativo no técnico.

---

### SPRINT-120 — Cazador P-008: health-check notis legacy con userId == personalDocId

**Estado:** COMPLETADO 2026-05-10 (cazador P-008 creado en `scripts/invariantes/check-notis-legacy-data-shape.ts` + comando `npm run audit:notis-legacy` + entrada P-008 en catálogo, hash `a61022e`)
**Prioridad:** media (prevención del bug masivo de SPRINT-118)
**Origen:** Cowork 2026-05-10. Sugerencia documentada en `BLOQUEOS.md` SPRINT-118 línea 88: *"Considerar agregar P-XXX nuevo al catálogo: 'notificaciones legacy con userId/destinatarioId apuntando a personalDocId en lugar de auth.uid'. Cazador difícil porque es bug de datos, no de código — pero el cazador puede ser un script de health-check periódico (ej: `npm run audit:notis-legacy` que corre la auditoría general y avisa si aparecen nuevos casos)."*
**Riesgo:** bajo (script read-only nuevo, no toca data ni rules).
**Touch-list previsto:** `scripts/invariantes/check-notis-legacy-data-shape.ts` (NUEVO), `scripts/invariantes/run-all.ts` (registrar), `docs/PATRONES_REGRESION.md` (entrada P-008), `package.json` (script `npm run audit:notis-legacy`).

#### Objetivo

Crear un cazador de **datos en producción** (no de código) que corra como health-check semanal/manual y reporte si aparecen notificaciones nuevas con `userId` o `destinatarioId` apuntando a `personalDocId` en lugar de `auth.uid`. Si el cazador detecta hits, alerta a Jorge para re-migración acotada.

#### Por qué

El bug del SPRINT-118 afectó a 5 empleados con 44 docs invisibles. Las causas raíz (alta de empleado pre-SPRINT-105 + service que escribía notis con `userProfile.id`) ya están resueltas. Pero si en el futuro:
- Algún empleado nuevo se da de alta sin doble doc (regresión P-004), o
- Algún service nuevo escribe notis con un identificador indirecto que no detecta P-007,

el bug puede reaparecer silenciosamente. Un health-check periódico de los DATOS detecta el shape problemático aunque el código esté limpio.

#### Criterios de aceptación

- [ ] Script `scripts/invariantes/check-notis-legacy-data-shape.ts`:
  - Lee `notificaciones` colección via Admin SDK (requiere `service-account.json`).
  - Para cada doc, compara `userId` y `destinatarioId` contra la tabla `usuarios` y la colección `personal`.
  - Reporta hits donde el ID matchea con un `personal.id` (doc id) pero NO con un `auth.uid` válido.
  - Output legible: nombre empleado afectado, cantidad de docs, IDs de docs.
  - Read-only por diseño (sin `--apply`, sin escrituras).
- [ ] Comando `npm run audit:notis-legacy` agregado a `package.json` que ejecuta el script.
- [ ] Entrada P-008 en `docs/PATRONES_REGRESION.md` siguiendo plantilla:
  - Síntoma: empleados no ven sus notis en la campanita después de un cambio de cuenta o alta nueva.
  - Causa raíz: `userId/destinatarioId == personal.id` cuando debería ser `auth.uid`.
  - Regla: el campo de target del lectura siempre debe ser `auth.uid`.
  - Cazador: este script + cazadores P-007 y P-001 para el lado del código.
  - Frecuencia recomendada: ejecutar manualmente tras cualquier alta de empleado o sprint que toque `notificaciones.service.ts`.
- [ ] NO se ejecuta en pre-commit hook (consume cuota Firebase y requiere service-account). Es manual / programable como scheduled task futura.
- [ ] Cazadores 7/7 (los actuales) siguen en PASS. P-008 es nuevo y queda registrado en `run-all.ts` con flag `read-only-data` o equivalente que lo excluye del pre-commit.
- [ ] Commit + push.

#### Restricciones / guardarrails

- archivist PRE-CHANGE obligatorio (toca `scripts/invariantes/`).
- regression_guardian RECOMENDADO.
- NO ejecutar contra prod en este sprint — solo crear el script. Jorge decide cuándo correrlo manualmente.
- Idempotente: si se corre 100 veces, mismo output. Sin escrituras nunca.

#### Notas para el coordinator

- Reutilizar lógica de `scripts/auditoria-notis-legacy-todos.ts` (ya existe del SPRINT-117 A2). El cazador nuevo es esa auditoría + envoltura de "fail si hay hits" + integración con catálogo P-XXX.
- Considerar si vale la pena hacer el cazador GENÉRICO (escanea cualquier colección con campo `userId`/`destinatarioId`) o ESPECÍFICO (solo `notificaciones`). Recomendación: empezar específico, generalizar si aparece otra colección con mismo problema.
- Si el cazador encuentra hits al correrlo en prod, **NO autorizar re-migración automática**. Reportar a Jorge y abrir sprint write acotado por uid (mismo patrón que SPRINT-118).

---

### SPRINT-121 — Eliminar `/admin/productos` (Catálogo legacy) del routing

**Estado:** COMPLETADO 2026-05-10 (`src/pages/Productos.tsx` eliminado, ruta `/admin/productos` reemplazada por redirect 301 a `/admin/precios`, hash `03e24df`)
**Prioridad:** baja (limpieza de deuda)
**Origen:** Cowork 2026-05-10. Decisión documentada en `BLOQUEOS.md` SPRINT-117c línea 125: *"Catálogo legacy (`/admin/productos`) en sidebar admin → ocultar en 117c1, eliminar del routing en sprint propio futuro."* SPRINT-117c1 ya ocultó del sidebar; este sprint cierra el ciclo eliminando del routing.
**Riesgo:** bajo (ruta sin tráfico interno, sin enlaces externos conocidos).
**Touch-list previsto:** `src/App.tsx` (eliminar `<Route path="productos" />`), `src/pages/Productos.tsx` (decidir si eliminar el archivo o dejarlo huérfano), `docs/sprints/AUDITORIA_IA_2026-05-08.md` (cross-reference si aplica).

#### Objetivo

Eliminar la ruta `/admin/productos` y sus referencias del routing. Si el componente `Productos.tsx` no tiene importadores fuera de App.tsx, eliminar el archivo. Si tiene (ej: un test o un import muerto), dejar el archivo pero quitar la ruta y agregar redirect 301 a `/admin/precios` (que cubre la funcionalidad real).

#### Por qué

`Productos` (Catálogo legacy) está duplicado con `Precios` e `Inventario`. El sidebar ya lo oculta desde SPRINT-117c1. Eliminar del routing previene que un bookmark viejo o un link de WhatsApp lleve a una pantalla muerta. Reduce surface area sin riesgo (ya está oculto hace días).

#### Criterios de aceptación

- [ ] `<Route path="productos" element={<Productos />} />` eliminado de `src/App.tsx` o reemplazado por `<Route path="productos" element={<Navigate to="/admin/precios" replace />} />` (redirect 301).
- [ ] Si `Productos.tsx` no tiene importadores fuera de App.tsx (`grep -r "from.*Productos" src/`): eliminar el archivo.
- [ ] Si tiene importadores: dejar el archivo, quitar la ruta, agregar redirect.
- [ ] Build OK, typecheck OK, lint OK.
- [ ] Cazadores 7/7 PASS.
- [ ] Commit + push.

#### Restricciones / guardarrails

- archivist PRE-CHANGE para `App.tsx` (archivo crítico).
- Si `Productos.tsx` tiene lógica única no replicada en `Precios.tsx` o `Inventario.tsx`: PARAR y escalar a Jorge antes de eliminar. La lógica única no se pierde, se migra al componente vivo.
- Mantener redirect 301 si hay duda — bookmarks viejos no rompen.
- NO tocar `firestore.rules`, NO tocar services, NO migrar datos.

#### Notas para el coordinator

- Antes de eliminar el archivo, hacer `grep -rn "Productos" src/` para confirmar que no hay imports activos.
- Revisar si `Precios.tsx` tiene la funcionalidad equivalente. Si no, escalar.
- Plan de rollback: revertir el commit. Operación 100% reversible.

---

### SPRINT-122 — Correr `npm run metricas` por primera vez + interpretación archivist

**Estado:** COMPLETADO 2026-05-10 (`docs/sprints/METRICAS_2026-05-10.md` generado + interpretación cualitativa agregada por archivist, hash `ee4cecc`. Veredicto: salud BUENA, recurrence rate 0%, ninguna acción urgente)
**Prioridad:** baja (visibilidad, no urgente)
**Origen:** Cowork 2026-05-10. SPRINT-107 (commit `e395052`) creó el comando `npm run metricas` y el modo MÉTRICAS del archivist, pero nunca se corrió la primera pasada formal con interpretación cualitativa. Ahora hay base suficiente (8 sprints procesados, 7 cazadores activos, 1 postmortem real + 1 retroactivo) para una primera lectura útil.
**Riesgo:** nulo (read-only, solo doc).
**Touch-list previsto:** `docs/sprints/METRICAS_2026-05-10.md` (NUEVO, generado por el script).

#### Objetivo

Ejecutar `npm run metricas` por primera vez en HEAD actual y dejar que el archivist en modo MÉTRICAS agregue interpretación cualitativa al final del archivo generado. Output: foto del estado de salud del sistema anti-regresión a 2026-05-10.

#### Por qué

El sistema anti-regresión lleva ~5 días vivo (SPRINT-103 fue el 2026-05-06). Hay datos suficientes para medir: MTBF, MTTR, recurrence rate, catch rate, cazadores activos, allowlist size. Sin la lectura, las decisiones futuras (ej: "¿vale la pena agregar P-XXX?") se toman a ojo. Este sprint da la primera línea de base.

#### Criterios de aceptación

- [ ] `npm run metricas` ejecutado sin error.
- [ ] `docs/sprints/METRICAS_2026-05-10.md` generado.
- [ ] archivist (modo MÉTRICAS) agrega sección "Interpretación cualitativa" al final del archivo con:
  - Salud general: buena | regular | preocupante.
  - Alertas (si las hay): recurrence rate creciente, catch rate bajo, allowlist explotando, etc.
  - Sugerencias de acción concretas (ej: "refinar cazador X", "agregar cazador para clase Y", o "ninguna acción necesaria — sistema saludable").
- [ ] Output al chat de Jorge en formato corto: 4-6 líneas con números clave + veredicto.
- [ ] Commit + push.

#### Restricciones / guardarrails

- NO modificar el script `scripts/metricas-mejora-continua.ts` salvo bug obvio (ej: division by zero). Si hay bug, fix mínimo + commit separado.
- archivist obligatorio para la interpretación. No saltar ese paso.
- NO ejecutar contra prod (el script lee solo metadata local de git + docs/postmortems/).

#### Notas para el coordinator

- Si las métricas tienen valores raros (ej: catch rate 0%), validar primero si es bug del script o realidad del sistema.
- Considerar si vale la pena programar una scheduled task que corra `npm run metricas` semanal automático y comitee el output (sprint follow-up).

---

### SPRINT-123 — Decidir destino de `COWORK_CONTEXTO.md` (versionar o eliminar)

**Estado:** COMPLETADO 2026-05-10 (DECISIÓN YA APLICADA: versionado en commit `0181778` del 2026-05-08, antes de que se escribiera este sprint. `git status` limpio, sin cambios pendientes. Sin acción adicional necesaria — sprint cierra como no-op administrativo. Hash `ba5180a`)
**Prioridad:** baja (limpieza, low-stakes)
**Origen:** Cowork 2026-05-10. SPRINT-117a (commit `f1a89d0`) cerró con nota: *"Pendiente menor: COWORK_CONTEXTO.md untracked en la raíz — fuera de scope, decime si querés sprint propio."* Quedó untracked desde hace varios días.
**Riesgo:** nulo (decisión binaria, sin código).
**Touch-list previsto:** o bien `COWORK_CONTEXTO.md` (versionar) o bien `.gitignore` (eliminar/ignorar).

#### Objetivo

Decidir si `COWORK_CONTEXTO.md` (en raíz, untracked) va al repo o se elimina. Si va al repo, agregarlo al commit. Si no va, agregarlo a `.gitignore` y eliminar el archivo local.

#### Por qué

Tener archivos untracked en raíz pollucionan `git status` y confunden a futuros builders ("¿es importante? ¿lo borro? ¿lo commit?"). Resolver ahora (5 minutos) evita confusión recurrente.

#### Criterios de aceptación

- [ ] Coordinator lee `COWORK_CONTEXTO.md` y decide:
  - **Opción A — versionar:** si el contenido es valioso para futuros agentes (ej: contexto de Cowork sobre el negocio que CLAUDE.md no cubre). `git add COWORK_CONTEXTO.md` + commit.
  - **Opción B — eliminar:** si el contenido es efímero o duplicado de CLAUDE.md / README.md. Agregar `COWORK_CONTEXTO.md` a `.gitignore` + `rm COWORK_CONTEXTO.md` + commit del `.gitignore`.
  - **Opción C — escalar:** si el contenido es ambiguo, preguntar a Jorge vía AskUserQuestion antes de decidir.
- [ ] `git status` queda limpio post-commit (no untracked).
- [ ] Build OK, cazadores 7/7 PASS (deberían ser unaffected — es solo un .md).
- [ ] Commit con mensaje explícito sobre la decisión tomada.
- [ ] Push.

#### Restricciones / guardarrails

- NO eliminar el archivo sin antes leerlo y resumir en el commit message qué contenía. Forensia.
- NO duplicar contenido en CLAUDE.md sin chequear que no esté ya ahí.
- Si la opción es C (escalar), DETENER el sprint y abrir entrada en BLOQUEOS.md.

#### Notas para el coordinator

- 90% probable que Opción A o B aplique sin escalar. C es para casos raros donde el contenido tiene info de negocio que solo Jorge sabe si es relevante.
- Si va a `.gitignore`, agregar también el patrón general `COWORK_*.md` por si Cowork genera más archivos similares en el futuro (preventivo).

---

### SPRINT-124 — Auditoría: cobertura de permisos granulares vs módulos del sidebar

**Estado:** COMPLETADO 2026-05-10 (`docs/MATRIZ_PERMISOS_VS_MODULOS.md` creado, 43 ítems mapeados, hallazgo central: 6 keys TypeScript NO expuestas en modal, 18 módulos rol-only sin control granular. Opción A propuesta para exponer 3 keys low-hanging — Bancos/Avances/Reactivación — vía SPRINT-125 si Jorge aprueba.)
**Prioridad:** alta (decisión arquitectural sobre fuente de gating, pedida por Jorge tras inspeccionar modal Editar Usuario)
**Origen:** Jorge 2026-05-10 vía Cowork. Al revisar el modal "Editar Usuario" para Wilainy, detectó que los permisos granulares cubren solo 7 categorías (Órdenes, Cotizaciones, Facturas, Clientes, Personal, Gastos, "Otros" con 4 permisos sueltos) mientras que el sidebar tiene ~20+ módulos visibles. Pregunta crítica: ¿el modelo "los permisos vienen del módulo de usuarios" (regla establecida que llevó a rechazar SPRINT-117c5) realmente cubre todo el software, o hay módulos cuyo gating depende solo del rol en el código?
**Riesgo:** bajo (read-only, solo doc + posiblemente sprints follow-up).
**Touch-list previsto:** `docs/MATRIZ_PERMISOS_VS_MODULOS.md` (NUEVO). NO toca código de la app.

#### Objetivo

Mapear cada módulo visible en el sidebar (para los 5 roles: admin, coord, operaria, secretaria, técnico) contra la fuente real de gating en el código. Output: tabla `módulo → fuente de gating` que responde la pregunta "¿este ítem se controla desde el modal de Usuarios o solo desde el rol?". Identificar gaps entre la regla declarada de Jorge y la realidad del código.

#### Por qué

Hay un conflicto latente entre dos verdades:
1. **Regla declarada de Jorge:** "los permisos se dan desde el módulo de usuarios donde se debe quitar o dar permisos a cada módulo dependiendo de su función" (rechazó SPRINT-117c5 sobre esta base).
2. **Realidad observable del modal:** solo aparecen ~17 checkboxes granulares + 1 toggle de Asistente IA, mientras que el sidebar admin tiene 44 ítems y operaria 17.

Si la realidad muestra que muchos módulos dependen solo del rol (gating en código), entonces:
- La regla de Jorge no es ejecutable hoy para esos módulos.
- Quitarle a una operaria el acceso a, por ejemplo, "Reactivación de clientes" no se puede hacer desde el modal — solo cambiándole el rol o tocando código.
- Es importante saber esto antes de decidir si vale la pena un sprint B (expandir el modal con más checkboxes) o si la cobertura actual es suficiente.

Este sprint es la auditoría que da la foto. NO toma decisiones — Jorge las toma después de leer el output.

#### Criterios de aceptación

- [ ] `docs/MATRIZ_PERMISOS_VS_MODULOS.md` creado con tabla principal:

  | Módulo (label sidebar) | Ruta | Permiso granular en modal | Fuente de gating actual (código) | Cobertura |
  |---|---|---|---|---|
  | Dashboard | `/admin` | (ninguno) | rol === admin/coord/operaria/secretaria | rol-only |
  | Órdenes | `/admin/ordenes` | `ordenesVer` | `puede('ordenesVer')` | granular |
  | Reactivación de clientes | `/admin/reactivacion` | ??? | ??? | a determinar |
  | ... (los ~20 módulos restantes) | | | | |

- [ ] Para cada módulo, builder lee:
  - `src/components/Sidebar.tsx` para identificar el `show:` y el rol/permiso usado.
  - El componente de la página para ver si tiene gate adicional al render.
  - `firestore.rules` para ver si hay rule de read/write asociada al módulo y qué la gatea.
- [ ] Sección "Hallazgos clave" con conteo: cuántos módulos tienen permiso granular, cuántos rol-only, cuántos mixtos.
- [ ] Sección "Módulos sin gating granular pero con sensibilidad" — listado de módulos donde sería razonable que Jorge pudiera controlarlo persona-por-persona y hoy no puede (ej: ¿debería poder restringir "Reactivación" a operarias específicas?).
- [ ] Sección "Recomendaciones" — el builder propone (NO decide):
  - Qué módulos vale la pena expandir al modal (si alguno).
  - Qué módulos están bien con gating solo por rol (porque no son sensibles o porque la persona del rol siempre debe ver).
  - Si vale la pena crear un sistema más genérico (ej: `modulosHabilitados: string[]` por usuario).
- [ ] NO modificar código. NO modificar el modal. Solo doc.
- [ ] Cazadores 7/7 PASS (deberían — es solo .md).
- [ ] Commit + push.

#### Restricciones / guardarrails

- archivist PRE-CHANGE obligatorio (consulta el historial de los archivos que va a leer).
- NO tomar decisiones por Jorge. Solo presentar la foto + recomendaciones.
- NO empezar a modificar el modal aunque sea tentador — eso es sprint B (no autorizado hoy).
- Si encuentra un bug real (ej: una operaria puede ver un módulo que NO debería por bug de gating), NO arreglar en este sprint — abrir sprint follow-up acotado.

#### Notas para el coordinator

- Punto de partida útil: `docs/sprints/AUDITORIA_IA_2026-05-08.md` ya tiene el listado de módulos por rol. Reusar.
- El permiso `puede(...)` del módulo Usuarios vive probablemente en `src/utils/permisos.ts` o `src/utils/index.ts`. Leerlo para entender qué checkboxes están definidos hoy en TypeScript.
- Los checkboxes vivos en el modal de la captura de Jorge son (transcripción literal):
  - Órdenes: `ordenesVer`, `ordenesCrear`, `ordenesModificar`, `ordenesModificarFueraGrupo`, `ordenesEliminar`, `ordenesVerEliminadas`
  - Cotizaciones: `cotizacionesVer`, `cotizacionesCrear`, `cotizacionesModificar`, `cotizacionesAprobarPrecio`
  - Facturas: `facturasVer`, `facturasCrear`, `facturasModificar`, `facturasEliminar`
  - Clientes: `clientesVer`, `clientesCrear`, `clientesModificar`, `clientesEliminar`
  - Personal: `personalVer`, `personalCrear`, `personalModificar`, `personalEliminar`
  - Gastos: `gastosVer`, `gastosCrear`, `gastosEliminar`
  - Otros: `rendimientoVer`, `configuracionVer`, `configuracionModificar`, `cierreDiaEjecutar`
  - Y un toggle adicional al final del modal: `habilitarAsistenteIA`
- Módulos del sidebar que claramente NO tienen permiso granular en esa lista (a confirmar leyendo Sidebar.tsx): Dashboard, Agenda del Día, Calendario, Calendarios públicos (Calendly), Mantenimiento, Citas por Confirmar, Reprogramaciones, Sugerencias chequeo, Conduces Pendientes, Conduces de Garantía, Equipos de Taller, Standby de Piezas, Productos, Precios, Inventario, Marketing/Campañas, Plantillas Marketing, Reactivación de clientes, Reporte de Ponches, Nómina, Comisiones, Web, Solicitudes, Usuarios y Permisos.
- Si Jorge lee este doc y dice "expandí el modal con X módulos", eso es SPRINT-125 (sprint B nuevo, riesgo medio, toca código).

---

### SPRINT-125 — Exponer 3 keys huérfanas (Bancos/Avances/Reactivación) en el modal de Usuarios

**Estado:** COMPLETADO 2026-05-10 (sección "Operaciones" agregada al modal con `bancosGestionar`, `avancesGestionar`, `clientesReactivacionGestionar`; matriz actualizada; cazadores 7/7 PASS)
**Prioridad:** alta (gap obvio detectado por SPRINT-124; cierra la incoherencia entre lo que dice la regla de Jorge y lo que el modal permite controlar hoy)
**Origen:** Jorge 2026-05-10 vía Cowork. Aprobó "Opción A" de la matriz `docs/MATRIZ_PERMISOS_VS_MODULOS.md` tras leer el output de SPRINT-124.
**Riesgo:** bajo (toca 1 archivo, ~5 líneas adicionales en una sección de checkboxes que ya existe; no cambia rules ni services).
**Touch-list previsto:** `src/pages/GestionUsuarios.tsx` (o el archivo equivalente que renderice el modal "Editar Usuario" — el builder lo confirma al inicio leyendo Sidebar.tsx para encontrar la ruta).

#### Objetivo

Exponer en el modal "Editar Usuario" los 3 permisos granulares que existen como keys en TypeScript pero NO aparecen como checkbox en el modal: **Bancos**, **Avances**, **Reactivación de clientes**. Después de este sprint, Jorge puede activar/desactivar esos 3 módulos persona-por-persona desde el módulo de Usuarios — igual que ya puede hacer con Órdenes, Facturas, Clientes, etc.

#### Por qué

SPRINT-124 detectó que hay 3 módulos en "limbo": el código define las llaves de permiso (`bancosVer`, `avancesVer`, `reactivacionVer` o nombres equivalentes — el builder confirma los identificadores exactos leyendo `src/utils/permisos.ts` o donde se definan) pero el modal de GestionUsuarios no las renderiza como checkbox. Resultado: aunque la regla declarada de Jorge es "todo se controla desde Usuarios y Permisos", esos 3 módulos hoy son rol-only en la práctica. Este sprint cierra ese gap específico (Opción A en la matriz) sin abrir el debate más grande de los 18 módulos rol-only puros (esos son sprints futuros si Jorge decide).

#### Criterios de aceptación

- [ ] Builder identifica los nombres exactos de las 3 keys leyendo `src/utils/permisos.ts` / `src/utils/index.ts` / donde estén definidas (la matriz dice que existen pero NO confirma los identificadores literales — verificar).
- [ ] Si las 3 keys NO existen aún en TypeScript (la matriz puede estar usando nombres descriptivos, no literales), agregarlas siguiendo el patrón de las keys existentes (`ordenesVer`, `facturasVer`, etc.).
- [ ] Agregar los 3 checkboxes al modal "Editar Usuario" en la sección apropiada (probablemente "Otros" o crear una sub-sección "Operaciones" si encaja mejor — builder decide siguiendo el patrón visual existente).
- [ ] Verificar que el toggle persiste correctamente en Firestore al `usuarios/{uid}.permisos.<key>` y que el sidebar respeta el flag al re-render.
- [ ] Verificar manualmente (typecheck + lint + build) que no rompe el modal existente — usar `npm run build` antes del commit.
- [ ] regression_guardian obligatorio (toca archivo de página crítica que renderiza modal de permisos).
- [ ] Cazadores 8/8 PASS.
- [ ] Commit + push.
- [ ] Actualizar `docs/MATRIZ_PERMISOS_VS_MODULOS.md`: bajar el conteo de "keys huérfanas" de 3 a 0 y mover Bancos/Avances/Reactivación a la columna "granular" en la tabla principal.

#### Restricciones / guardarrails

- archivist PRE-CHANGE obligatorio (consulta historial de `GestionUsuarios.tsx` y `permisos.ts` — buscar si esos 3 checkboxes fueron eliminados intencionalmente en algún commit pasado, lo cual cambiaría el sprint).
- regression_guardian obligatorio.
- NO tocar `firestore.rules`. Si la rule actual ya respeta el flag genérico `puede('xxxVer')`, este sprint no la necesita. Si NO la respeta (el módulo se accede directo sin gate de rule), abrir sprint follow-up acotado — NO arreglar acá.
- NO expandir el modal con módulos que NO estén en las 3 keys de la Opción A. Si encuentras la tentación de agregar el resto (ej: Marketing, Productos), eso es un sprint futuro que requiere decisión arquitectural de Jorge.

#### Notas para el coordinator

- Hallazgo central de SPRINT-124 que origina este sprint: *"3 módulos en limbo (Bancos, Avances, Reactivación) — tienen key TS pero modal no las expone."*
- Si al leer el código aparece que las 3 keys NO existen como string literal en TypeScript (el coordinator de SPRINT-124 puede haber inferido la existencia de la entrada en la matriz por otro mecanismo), el builder debe pausar y reportar — el sprint pasaría a "agregar keys + checkbox", riesgo sigue siendo bajo pero scope crece.
- El cambio es de ~5 líneas reales (3 `<Checkbox name="..." />` + tal vez 1 sub-sección de heading). Si el diff supera 30 líneas el builder debe detenerse y reportar — probablemente esté tocando más de lo necesario.

---

### SPRINT-126 — Bugs colaterales SPRINT-124: links rotos coord + gating doble inconsistente

**Estado:** COMPLETADO 2026-05-10 (Sidebar.tsx alineado: 4 links rotos coord eliminados (Web/Empresas/Formularios/Solicitudes ahora admin-only en sidebar) + 2 gates doble alineados a `esAdminOCoord` (Comisiones, Usuarios & Permisos). Matriz actualizada. Cazadores 7/7 PASS. QA mental por rol validado.)
**Prioridad:** media (UX para coordinadora + deuda técnica que crecerá si no se limpia)
**Origen:** Jorge 2026-05-10 vía Cowork. Aprobó procesar los follow-ups colaterales que detectó SPRINT-124 en su matriz.
**Riesgo:** bajo-medio (toca Sidebar.tsx + 2 archivos de páginas con gating; cambios pequeños cada uno pero suma 3 archivos).
**Touch-list previsto:** `src/components/Sidebar.tsx`, `src/pages/Comisiones.tsx` (o equivalente), `src/pages/GestionUsuarios.tsx` (verificar gating doble). Builder confirma rutas exactas al leer la matriz.

#### Objetivo

Limpiar 2 problemas colaterales que `docs/MATRIZ_PERMISOS_VS_MODULOS.md` documentó:

1. **4 links rotos en el sidebar de la coordinadora** — ítems del menú que la coord ve y al hacer clic no llevan a ningún lado (o navegan a ruta inexistente / componente que no monta para su rol).
2. **Gating doble inconsistente en 2 módulos** (Comisiones y Usuarios & Permisos) — la página tiene un `puede(...)` interno Y el sidebar tiene un check de rol, y ambos no están alineados. Resultado: hay combinaciones de rol+permiso donde el ítem aparece en el sidebar pero la página rechaza, o viceversa.

#### Por qué

Estos son los 2 hallazgos colaterales que SPRINT-124 reportó pero NO arregló (por scope read-only). Son chicos individualmente pero crecerán: cada nuevo módulo agregado al sidebar puede heredar el mismo patrón si no limpiamos ahora. Para Wilainy (la coordinadora) los 4 links rotos son fricción diaria — hace clic y "no pasa nada", lo cual erosiona la confianza en el software.

#### Criterios de aceptación

**Parte A — 4 links rotos coord:**
- [ ] Builder lee `docs/MATRIZ_PERMISOS_VS_MODULOS.md` para identificar exactamente cuáles son los 4 ítems que aparecen en el sidebar de la coordinadora pero rompen al click. La matriz debe listarlos por nombre — si no lo hace explícitamente, el builder los detecta cruzando rutas del Sidebar.tsx contra `App.tsx` (cualquier ruta sin Route correspondiente o cuyo componente no renderiza para rol coord).
- [ ] Para cada uno de los 4: o (a) crear la Route faltante si el módulo SÍ debe existir para coord, o (b) eliminar el ítem del sidebar para rol coord si NO debe existir. Builder decide caso por caso siguiendo lo que sugiere la matriz; si dudas, abrir sub-bloqueo en `BLOQUEOS.md` pidiendo a Jorge decidir antes de cerrar.
- [ ] Verificar manualmente que la coordinadora ya no ve ítems rotos: simular sesión coord en dev y hacer clic en cada item del sidebar.

**Parte B — gating doble inconsistente (Comisiones y Usuarios & Permisos):**
- [ ] Builder identifica el sidebar check (`show: ... rol === ...`) Y el page-level check (`puede(...)` o `userProfile.rol === ...`) en cada uno de los 2 módulos.
- [ ] Decide la fuente canónica: el sidebar debe reflejar EXACTAMENTE el mismo gate que la página. Regla: si la página gatea con `puede('comisionesVer')`, el sidebar también; si la página solo gatea por rol, el sidebar también.
- [ ] Hace los cambios mínimos para alinear ambos. NO inventar nuevas keys de permiso — usar las existentes.
- [ ] Verificar manualmente en dev con un usuario por cada rol que el ítem aparece SI Y SOLO SI la página lo deja entrar.

**Global:**
- [ ] regression_guardian obligatorio (toca Sidebar.tsx, archivo cuyo bug puede romper navegación de roles enteros).
- [ ] archivist PRE-CHANGE obligatorio (consulta historial de Sidebar.tsx + las 2 páginas tocadas).
- [ ] `npm run build` + `npm run lint` PASS antes del commit.
- [ ] Cazadores 8/8 PASS.
- [ ] Commit + push con mensaje declarando "QA flujo coord + sidebar validado" (sub-regla de CLAUDE.md sobre cleanup en archivos críticos).
- [ ] Actualizar `docs/MATRIZ_PERMISOS_VS_MODULOS.md`: marcar los 2 hallazgos colaterales como RESUELTO con hash del commit.

#### Restricciones / guardarrails

- archivist PRE-CHANGE obligatorio.
- regression_guardian obligatorio.
- NO tocar `firestore.rules`. Si el bug requiere cambio de rule, abrir sprint nuevo y dejar este en BLOQUEOS.
- NO refactorizar Sidebar.tsx oportunísticamente. Solo limpiar los 4 links rotos coord + alinear los 2 dobles. Si el diff supera 60 líneas total, el builder se detiene y reporta.
- Si al verificar manualmente aparece un 5º link roto o un 3er gating doble inconsistente (que SPRINT-124 no listó), documentar en `EJECUCION_AUTONOMA.md` pero NO arreglar acá — abrir sprint follow-up acotado.

#### Notas para el coordinator

- Los 2 sub-objetivos son independientes — si Parte A está clara y Parte B requiere decisión, builder puede commitear Parte A primero y dejar Parte B en sub-bloqueo. NO mezclar en un solo commit gigante.
- La matriz documenta los 4 + 2 hallazgos en su sección "Hallazgos colaterales" / "Bugs detectados" — empezar la lectura por ahí.
- Si después de este sprint el sidebar coord queda limpio, agregar a `docs/PATRONES_REGRESION.md` (o proponer) un cazador P-009 que detecte ítems del Sidebar.tsx cuya ruta NO existe en App.tsx. Eso evitaría que el bug recurra. Si el cazador no es trivial de escribir, dejarlo para un sprint follow-up explícito — NO bloquear este sprint por eso.

---

### SPRINT-127 — Cleanup notificaciones legacy (cerrar gotcha userId vs destinatarioId)

**Estado:** COMPLETADO 2026-05-10 (coordinator autónomo `trabaja`, hash `305a9e5`, ruta B1 conservadora — auditoría confirmó 0 callers escriben `destinatarioId`, agregadas assertions runtime + JSDoc + gotcha tachado en CLAUDE.md). Cazadores 7/7 PASS. Query dual del service intacta como red de seguridad — B2 queda como sprint follow-up que requiere correr `auditoria-notis-legacy-todos.ts`.
**Prioridad:** alta (cierra gotcha activo en CLAUDE.md desde hace semanas, bloquea remover query dual del service)
**Origen:** Jorge 2026-05-10 vía Cowork tras elegir "pagar deuda técnica conocida". Gotcha en CLAUDE.md: *"el código escribe campo `destinatarioId` en `src/services/notificaciones.service.ts`, pero `firestore.rules:530,534` gatean por `userId == request.auth.uid`. Resultado: técnicos/operarias/secretarias que reciben notificaciones NO pueden marcarlas como leídas."* SPRINT-118 ya migró los **datos** de los 5 empleados afectados — falta cerrar el lado **código** para que el bug no recurra.
**Riesgo:** bajo-medio (toca service que tiene listeners activos en producción; si se rompe la query, las notis dejan de aparecer en vivo). Mitigación: cazador P-007 ya bloquea reintroducir `destinatarioId` desde fuera del service.
**Touch-list previsto:** `src/services/notificaciones.service.ts`, posiblemente 1-2 callers de `crearNotificacion` si alguno aún pasa `destinatarioId`. Builder confirma con grep al inicio.

#### Objetivo

Dejar el código en un estado donde **NUNCA** se escriba `destinatarioId` en docs nuevos, y opcionalmente limpiar la query dual `where('destinatarioId', '==', userId)` del listener ahora que los datos están migrados. El gotcha de CLAUDE.md queda RESUELTO con hash del commit.

#### Por qué

1. La rule de Firestore (`firestore.rules:528-536`) gatea read/update/delete por `userId == request.auth.uid`. Si algún caller futuro pasa `destinatarioId` en lugar de `userId`, el doc se crea pero el dueño no puede marcarlo como leído → bug silencioso.
2. Los datos viejos ya están migrados (SPRINT-118 commit `c5b4107`). La query dual en `suscribirNotificaciones` ya no es necesaria — es deuda de compatibilidad que podemos limpiar.
3. El cazador P-007 (`check-crearnotificacion-userid-shape.ts`) atrapa variantes obvias (literales `admin.id`, `p.id`, etc.) pero no garantiza que el typing del campo sea estricto. Forzar `userId: string` requerido en el typing es el cinturón + tirantes.

#### Criterios de aceptación

**Parte A — Auditoría:**
- [ ] Grep exhaustivo de `crearNotificacion(` en todo el codebase para listar los callers actuales.
- [ ] Para cada caller: verificar que pasa `userId` (no `destinatarioId`). Si alguno pasa `destinatarioId`, renombrarlo a `userId` en el mismo commit.
- [ ] Verificar el tipo `Notificacion` en `src/types/index.ts`: ¿`userId` es required? Si no lo es, hacerlo required. ¿`destinatarioId` aparece como campo opcional legacy? Decidir si removerlo o marcarlo `@deprecated`.

**Parte B — Cleanup del service (decisión interna del builder):**

Builder decide ENTRE estas dos rutas según lo que encuentre en la auditoría:

- **B1 — conservador (recomendado si hay incertidumbre):** Dejar la query dual `where('destinatarioId', '==', userId)` intacta en `suscribirNotificaciones` por ahora. Solo agregar un `console.warn` o assertion si en runtime aparece un doc con `destinatarioId` pero sin `userId` (señal de que algo lo está escribiendo). Sin cambio de UX. Sprint riesgo bajo.

- **B2 — limpieza profunda:** Eliminar la query legacy y dejar solo `where('userId', '==', userId)`. Requiere CERTEZA de que (a) ningún caller escribe `destinatarioId` y (b) los datos en prod no tienen docs huérfanos sin `userId`. Si hay duda, NO hacer B2 y reportar para sprint follow-up con script de auditoría previo.

Builder elige B1 por default si no puede garantizar B2 con grep simple. Si elige B2, debe correr antes el script `scripts/auditoria-notis-legacy-todos.ts` (ya existe del SPRINT-117 A2) y reportar 0 docs con `destinatarioId` sin `userId`. Sin esa garantía, B1.

**Global:**
- [ ] archivist PRE-CHANGE obligatorio (`src/services/notificaciones.service.ts` toca path crítico — postmortem `2026-05-08-notis-legacy-multiples-empleados.md` aplica directo).
- [ ] regression_guardian obligatorio.
- [ ] Build OK, typecheck clean, 8/8 cazadores PASS (incluido P-007).
- [ ] Si la rule `firestore.rules` NO se toca (no debería), confirmar que el lock está al día con `npm run check:regression`.
- [ ] Commit + push con mensaje declarando la ruta elegida (B1 o B2) y por qué.
- [ ] Actualizar gotcha en `CLAUDE.md` tachando `~~Gotcha — bug pre-existente en notificaciones~~` con `[RESUELTO en <hash> el 2026-05-XX — ruta elegida B1/B2]`.
- [ ] NO tocar `firestore.rules`. Si el builder cree que hace falta, abrir sub-sprint y dejar este en bloqueo.

#### Restricciones / guardarrails

- archivist PRE-CHANGE obligatorio.
- regression_guardian obligatorio.
- NO tocar la rule de notificaciones. La rule ya está alineada con `userId` — el problema es el código.
- NO migrar más datos. SPRINT-118 ya lo hizo. Si encontramos docs sucios remanentes, abrir sprint separado con DRY-RUN/--apply pattern.
- Si el diff de la Parte A supera 30 líneas (callers múltiples para renombrar), pausar y reportar — quizá hay un patrón más profundo (helpers que pasan campos por referencia, etc.) que requiere refactor distinto.

#### Notas para el coordinator

- Gotcha en `CLAUDE.md` está en la sección de "Convenciones & gotchas". Buscarlo con grep `bug pre-existente en \`notificaciones\``.
- P-007 cazador relacionado: `scripts/invariantes/check-crearnotificacion-userid-shape.ts`. Si el builder elige B2 (cleanup profundo), considerar si P-007 sigue siendo necesario o si se puede simplificar/retirar. NO retirarlo en este sprint — eso es decisión separada.
- Si el grep encuentra callers con `destinatarioId`, builder debe usar `Edit` con context suficiente para que el cambio sea trivialmente verificable. NO hacer `replace_all` ciego.
- Si todos los callers ya pasan `userId` y nada escribe `destinatarioId` desde hace tiempo (commit blame muestra fechas viejas), eso fortalece la elección de B2 — pero la guía sigue siendo: en caso de duda, B1.

---

### SPRINT-128 — Inconsistencia #14: alinear rule `ordenes_servicio.delete` al granular `ordenesEliminar` — COMPLETADO

**Estado:** COMPLETADO 2026-05-10 (ruta R2). Rule `firestore.rules:378` ahora gateada por `userData().permisos.ordenesEliminar == true` (antes `esAdminOCoord()`). `npm run deploy:rules` ejecutado (lock `29247a9...`). Matriz `docs/MATRIZ_PERMISOS.md` actualizada — #14 marcado como RESUELTO. Bloque movido a "Histórico de desbloqueos" en `BLOQUEOS.md`.

Conservado acá para histórico. El spec completo (R1 vs R2, criterios de aceptación, restricciones) está preservado en la entrada de `BLOQUEOS.md` que se movió al histórico. El comando exacto del fix está en `EJECUCION_AUTONOMA.md` sección 2026-05-10 pasada 7.

---

### SPRINT-129 — Auditoría sistémica de asignaciones técnico↔operaria + huérfanos

**Estado:** COMPLETADO 2026-05-10 (script + placeholder commiteados. Jorge lo corre en su Mac con `npx tsx scripts/auditoria/asignaciones-tecnico-operaria.ts` para que se reescriba `docs/sprints/AUDITORIA_ASIGNACIONES_2026-05-10.md` con datos reales. Read-only enforced — verificado por grep negativo, sin `.set/.update/.delete` sobre Firestore. Cazadores 7/7 PASS + P-008 activo via `npm run audit:notis-legacy`.)
**Prioridad:** alta (origen bug en producción reportado por Jorge 2026-05-10; vector más amplio probable)
**Origen:** Jorge 2026-05-10 vía Cowork. Reportó orden con técnico Aury Mon mostrada sin operaria, pero el modal de Editar Personal SÍ tiene a Wilainy asignada como "Operaria a cargo". Causa raíz diagnosticada por Cowork con Explore: el sistema deriva la operaria al CREAR/EDITAR la orden (`useOrdenCreateForm.ts:588-590` y `OrdenEditForm.tsx:72-77`), leyendo `personal[tecnicoId].operariaNombre`. Si la orden se creó cuando el técnico aún no tenía operaria asignada, queda permanentemente con `operariaNombre: undefined`. Posteriormente asignar la operaria al técnico no actualiza órdenes viejas. Jorge pidió "revisar fallas de asignación y operaria reglas y roles de todo el sistema" — este sprint cubre la parte detectable por script read-only (asignaciones + huérfanos). Reglas/roles ya cubiertos por SPRINT-112 + SPRINT-124 + SPRINT-128 (último resuelto hoy).
**Riesgo:** bajo (read-only, sin --apply, sin mutaciones a Firestore — solo lectura + reporte).
**Touch-list previsto:** `scripts/auditoria/asignaciones-tecnico-operaria.ts` (NUEVO), `docs/sprints/AUDITORIA_ASIGNACIONES_2026-05-10.md` (NUEVO). NO toca código de la app.

#### Objetivo

Generar reporte sistémico que liste todas las inconsistencias detectables por script en producción relacionadas con asignaciones técnico↔operaria. Output legible por Jorge en md. NO arregla datos — solo los lista. Los fixes salen como sprints follow-up por Jorge si quiere arreglar masivamente.

#### Por qué

El bug puntual de Aury Mon (1 orden) es la punta del iceberg. Probablemente hay:
- Otros técnicos cuyas órdenes viejas quedaron sin operaria por el mismo timing.
- Técnicos sin operaria asignada en `personal/` (caso huérfano del lado opuesto al de Aury).
- `operariaId` en perfil de técnico apuntando a un uid que ya no existe o cuyo rol no es `operaria` (mismatch tras cambios de empleados).
- Operarias que ningún técnico tiene apuntada (operaria suelta).
- Posibles inconsistencias en el modelo de `responsableId` también (revisar como bonus).

Sin esta auditoría no se sabe el alcance real. Una vez con el reporte, Jorge decide caso por caso.

#### Criterios de aceptación

**Parte A — Script de auditoría:**
- [ ] `scripts/auditoria/asignaciones-tecnico-operaria.ts` creado, Admin SDK con `service-account.json`. Read-only puro (sin `.set`, `.update`, `.delete`).
- [ ] Para cada técnico (`personal where rol == 'tecnico'`):
  - Reportar si tiene `operariaId` poblado.
  - Si lo tiene, verificar que el doc apuntado existe en `personal/` Y que su rol es `operaria` Y que está activo. Si no, marcar como **inconsistencia tipo HUERFANO_TECNICO** (técnico apunta a una operaria que no existe o no es operaria).
  - Si NO tiene `operariaId`, marcar como **inconsistencia tipo TECNICO_SIN_OPERARIA**.
- [ ] Para cada operaria (`personal where rol == 'operaria'`):
  - Contar cuántos técnicos la apuntan vía `operariaId`.
  - Si ninguno, marcar como **inconsistencia tipo OPERARIA_HUERFANA** (operaria suelta, ningún técnico asignado).
- [ ] Para órdenes activas (`ordenes_servicio where fase != 'cerrado' and fase != 'cancelado'`, sample N=500 más recientes):
  - Si la orden tiene `tecnicoId` set Y el técnico actualmente tiene `operariaId` en perfil Y la orden NO tiene `operariaNombre` set → marcar como **inconsistencia tipo ORDEN_SIN_OPERARIA_DESINCRONIZADA**. Listar `ordenNumero`, `clienteNombre`, `tecnicoNombre`, operaria-actual-del-tecnico, fecha de creación de la orden.
- [ ] Bonus: para órdenes activas con `operariaNombre` SÍ set pero el techo actualmente tiene una operaria DISTINTA en su perfil → marcar como **inconsistencia tipo ORDEN_OPERARIA_DESACTUALIZADA** (orden quedó con operaria histórica, el técnico cambió de pareja). Esto NO necesariamente es bug — puede ser correcto histórico. Reportar para visibilidad.
- [ ] Bonus: revisar campo `responsableId` en órdenes — si está set pero el uid no existe en personal o no es admin/coord, marcar como **inconsistencia tipo RESPONSABLE_HUERFANO**.

**Parte B — Reporte md:**
- [ ] `docs/sprints/AUDITORIA_ASIGNACIONES_2026-05-10.md` (placeholder si no se corre el script en la pasada del coordinator, o llenado si se corre).
- [ ] Estructura:
  - Resumen ejecutivo: conteos por tipo de inconsistencia.
  - Sección por tipo con tabla detallada (uid/id, nombre, descripción del problema, sugerencia de fix manual).
  - Sección "Cómo arreglar manualmente" con pasos UI: ej. para TECNICO_SIN_OPERARIA → abrir modal Editar Personal, asignar operaria, guardar; para ORDEN_SIN_OPERARIA_DESINCRONIZADA → abrir orden, cambiar técnico a otro y volver al original, guardar.
  - Sección "Si querés fix masivo" → propone sprint follow-up (SPRINT-130 hipotético) que escribiría un script `--apply` por uid/ordenId acotado, con OK explícito de Jorge en BLOQUEOS.md. NO crear ese sprint en esta pasada.
- [ ] NO mostrar datos sensibles (emails completos, teléfonos) en el reporte. Usar primer nombre + ID parcial (`Aury (HGkVoY...)`).

**Global:**
- [ ] archivist PRE-CHANGE obligatorio (script toca Admin SDK + lee personal — categorías "datos en prod").
- [ ] regression_guardian opcional (no toca código de la app, solo script standalone).
- [ ] Read-only confirmado por grep: el único método de mutación que puede aparecer es `Map.set` en memoria. Si aparece `.set(`, `.update(`, `.delete(` sobre `db.collection(...)` o `db.doc(...)`, el sprint pausa y reporta.
- [ ] `npm run build` + `npm run lint` PASS (el script no debería romper nada — está en `scripts/` no en `src/`).
- [ ] Cazadores 8/8 PASS.
- [ ] Commit + push con mensaje "feat(auditoria): SPRINT-129 script asignaciones técnico↔operaria + reporte md placeholder".
- [ ] NO correr el script contra prod desde el coordinator. Eso lo hace Jorge en su Mac con `npx tsx scripts/auditoria/asignaciones-tecnico-operaria.ts`.

#### Restricciones / guardarrails

- archivist PRE-CHANGE obligatorio.
- Read-only. Si el builder encuentra tentación de incluir `--apply` para "fix mientras estamos", PARAR y reportar. El --apply es sprint separado con OK explícito.
- NO tocar el flujo de derivación en `useOrdenCreateForm.ts` ni `OrdenEditForm.tsx`. Eso podría ser otro sprint si Jorge quiere comportamiento dinámico (display reactivo vs snapshot histórico) — decisión arquitectural que requiere su input.
- Si el script encuentra >20 órdenes con `ORDEN_SIN_OPERARIA_DESINCRONIZADA`, reportar en el resumen "esto es masivo, considerar sprint de fix por lote". Si encuentra <5, sugerir fix manual UI uno por uno.
- NO incluir verificación de rules/roles en este sprint — eso está en `docs/MATRIZ_PERMISOS.md` (SPRINT-112) y `docs/MATRIZ_PERMISOS_VS_MODULOS.md` (SPRINT-124). El alcance de este sprint es **datos**, no permisos.

#### Notas para el coordinator

- Convención de scripts: el directorio `scripts/auditoria/` ya existe (creado por SPRINT-112 con `schema-drift.ts`). Reusar la convención de inicialización del Admin SDK desde ese script.
- Comando para Jorge al cerrar: `npx tsx scripts/auditoria/asignaciones-tecnico-operaria.ts`. Output a stdout + escribe el archivo md al final.
- Si Jorge corre el script y reporta el output, el sprint follow-up potencial (`--apply` para rellenar órdenes desincronizadas) puede ir a BLOQUEOS.md con scope acotado por IDs. Patrón ya usado en SPRINT-118.
- Bug original reportado por Jorge: orden con técnico Aury Mon (uid del personal probablemente similar a otros técnicos de SPRINT-118) sin operaria asignada. La operaria correcta según modal de Personal es Wilainy. Este caso DEBE aparecer en el output como ORDEN_SIN_OPERARIA_DESINCRONIZADA.
- Cross-check post-script: si aparece TECNICO_SIN_OPERARIA para alguien que Jorge cree que SÍ tiene operaria, hay bug en el modal de Editar Personal (no persiste el campo). Eso sería otro sprint.

---

### SPRINT-130 — Botón "Re-derivar operaria" en órdenes individuales

**Estado:** COMPLETADO 2026-05-11 (coordinator autónomo `trabaja`; archivos `src/services/ordenes.service.ts` + `src/components/ordenes/BotonRederivarOperaria.tsx` NUEVO + `src/components/ordenes/OrdenEditForm.tsx` + `src/pages/Ordenes.tsx` + `src/pages/MapaRutas.tsx`). Cazadores 7/7 PASS, typecheck PASS, build PASS, lint staged PASS. QA visual humana del caso Aury Mon registrada en `BLOQUEOS.md` (no bloqueante).
**Prioridad:** media (calidad de vida + previene reincidencia del caso Aury)
**Origen:** Jorge 2026-05-11 vía Cowork. Después de confirmar que el flujo derivativo de `personal[uid].operariaId` está correcto (UI viva en Personal + snapshot en orden al crear/editar), eligió esta opción para cerrar el caso de raíz. Hoy si se asigna operaria a un técnico DESPUÉS de que ya tenga órdenes abiertas (timing exacto del bug original de Aury Mon + Wilainy), las órdenes viejas quedan permanentemente con `operariaNombre: undefined` hasta que alguien las edite manualmente. El workaround actual (Fix A: editar orden → cambiar técnico → guardar → volver al original → guardar) funciona pero es tedioso y nadie del equipo lo sabe.
**Riesgo:** bajo (solo lectura de `personal/{tecnicoId}` + update local del doc `ordenes_servicio` ya autorizado por rules existentes — no toca rules, no toca otras colecciones).
**Touch-list previsto:**
- `src/components/ordenes/OrdenEditForm.tsx` (agregar botón visible cuando `tecnicoId` está set Y `personal[tecnicoId].operariaId` existe pero `orden.operariaNombre` está vacío o difiere).
- O alternativamente nuevo helper en `src/utils/ordenes.ts` + componente nuevo `src/components/ordenes/BotonRederivarOperaria.tsx` si OrdenEditForm.tsx queda muy cargado.
- `src/services/ordenes.service.ts` si hace falta un helper `rederivarOperariaEnOrden(ordenId)` reutilizable.

#### Objetivo

Agregar UI mínima (un botón) en el detalle/edit de una orden que, cuando se hace click, re-lea `personal[orden.tecnicoId].operariaId` y `operariaNombre`, y actualice el doc de la orden con esos valores. Si el técnico no tiene operaria asignada, el botón muestra estado deshabilitado con tooltip explicativo. Si la orden ya tiene la operaria correcta, el botón no aparece (o aparece deshabilitado con "ya está sincronizada").

#### Por qué

- Caso Aury Mon (reportado el 2026-05-10) demostró que el snapshot al crear/editar es bueno para forensia histórica pero malo cuando hay timing de asignación tardía.
- El workaround actual (editar técnico → guardar → volver → guardar) funciona pero es invisible al usuario operativo (Mariela, Wilainy, Yohana) que no sabe del patrón snapshot.
- Cambiar a derivación reactiva en cada render sería arquitectural y rompe historial (si la operaria cambia, las órdenes viejas perderían el contexto de quién supervisó originalmente). Botón explícito = lo mejor de ambos mundos.

#### Criterios de aceptación

- [ ] Botón "Re-sincronizar operaria" visible en `OrdenEditForm` cuando:
  - `orden.tecnicoId` está set Y
  - `personal[tecnicoId]?.operariaId` existe Y
  - (`orden.operariaNombre` está vacío) O (`personal[tecnicoId].operariaNombre` !== `orden.operariaNombre`).
- [ ] Click del botón hace `updateDoc(doc(db, 'ordenes_servicio', ordenId), { operariaId, operariaNombre, auditoria: [...prev, registroDeReSync] })` con `crearRegistroAuditoria()` del `utils/index.ts` describiendo "re-derivó operaria de {anterior} → {nueva}".
- [ ] Si `personal[tecnicoId]?.operariaId` NO existe, mostrar tooltip "Este técnico todavía no tiene operaria asignada. Asignala en Personal primero." y dejar el botón deshabilitado.
- [ ] Caso de uso primario probable: hot-fix manual del caso Aury Mon. Ese caso DEBE quedar arreglado tras un click del botón.
- [ ] Sin loop infinito: el botón NO se auto-clickea (es UI explícita).
- [ ] Sin escritura cuando ya está sincronizada: si los valores en orden y personal coinciden, el botón muestra "Sincronizada" estado readonly (gris).
- [ ] Sin tocar `useOrdenCreateForm.ts` (la derivación al crear sigue como está — snapshot OK).
- [ ] Sin tocar `firestore.rules` (los writes son a `ordenes_servicio` por usuarios con permiso de edición, ya cubierto por rules existentes).
- [ ] `npm run build` PASS.
- [ ] `npm run lint` PASS (max-warnings 0).
- [ ] Cazadores 8/8 PASS.
- [ ] Commit + push.

#### Restricciones / guardarrails

- archivist PRE-CHANGE obligatorio (toca `OrdenEditForm.tsx` — archivo crítico de wizard según gotcha "Cleanup en componentes de wizard requiere QA manual").
- regression_guardian obligatorio (toca componente de wizard que escribe a `ordenes_servicio`).
- NO cambiar el comportamiento de derivación al crear/editar técnico. SOLO agregar el botón explícito.
- NO hacer batch sobre todas las órdenes (sería sprint --apply separado con OK explícito de Jorge). Este sprint es "1 click = 1 orden".
- NO mover el botón a `OrdenDetalle.tsx` (vista readonly) — solo en EditForm o en un modal dedicado. Aclarar con archivist si hay duda.
- Si el reviewer detecta que el botón puede dispararse accidentalmente o que no hay confirmación visual del cambio, agregar `confirm()` antes del write.

#### Notas para el coordinator

- El patrón ya existe en `useOrdenCreateForm.ts:588-590` y `OrdenEditForm.tsx:72-77`:
  ```
  const tecnicoElegido = personal.find(p => p.id === form.tecnicoId);
  const operariaIdDerivada = tecnicoElegido?.operariaId;
  const operariaNombreDerivada = tecnicoElegido?.operariaNombre;
  ```
  El botón nuevo reutiliza esa lógica + `updateDoc`.
- Considerar mostrar el banner "Esta orden tiene operaria desactualizada" arriba del form cuando se detecta el mismatch, con el botón debajo. UX más explícita que un botón suelto.
- QA manual obligatorio (CLAUDE.md sub-regla cleanup wizard): commit message debe declarar "QA flujo X validado" o agregar a BLOQUEOS.md para validación humana. Caso a validar: abrir orden de Aury Mon (la del bug original), confirmar que aparece el botón, click, confirmar que aparece Wilainy en el doc.
- Si el flujo crece (botón "Re-sincronizar todo" en /admin/ordenes que lo aplica a las N órdenes detectadas por SPRINT-129), eso es sprint separado SPRINT-132+ con OK explícito.

---

### SPRINT-131 — Fix responsive: cards de orden cortadas en iPad portrait

**Estado:** COMPLETADO 2026-05-11 — ver `## Sprints completados (histórico)` más abajo. QA visual queda como SPRINT-131-QA en `BLOQUEOS.md`.

---

### SPRINT-132 — Bug sistémico: `find(p.id === tecnicoId)` post-c4be345 (14 sitios) + cazador P-006 extendido

**Estado:** COMPLETADO 2026-05-11 (commit `43a2087`, deploy verificado en producción 16:12 UTC). QA humano declarado como SPRINT-132-QA en BLOQUEOS.md. Hallazgos adicionales: 4 sitios de WRITE upstream con el mismo vector P-006 (MapaRutas drag&drop + PersonalPage transferencias) también corregidos.
**Prioridad:** crítica (rompe derivación de operaria en CREATE + edit + mapa + facturas + comisiones + avances + cierre día; afecta a TODOS los técnicos con operariaId asignada; explica el caso original Aury Mon más allá del timing)
**Origen:** Coordinator 2026-05-11 durante el cierre de SPRINT-130. Reportó como hallazgo colateral: `OrdenEditForm.tsx:77` (`tecnicos.find(t => t.id === editForm.tecnicoId)`) no se dispara correctamente porque `editForm.tecnicoId` post-`c4be345` (SPRINT-108) es `auth.uid`, mientras `t.id` sigue siendo `personal/{docId}`. Cowork verificó con grep `find\(.*\.id === .*tecnicoId|find\(.*p\.id === form|find\(.*t\.id === editForm` y encontró **14 sitios con el mismo patrón**, incluido el CREATE flow.
**Riesgo:** bajo-medio. El fix por sitio es 1 línea (`p.id === X` → `(p.uid || p.id) === X`). El cazador P-006 actualmente solo detecta dropdowns `<option>` — extenderlo a `.find()` requiere refinamiento de regex. No toca rules, no toca migraciones, no toca data.
**Touch-list previsto:**
- `src/hooks/useOrdenCreateForm.ts:588` — CREATE de orden (CRÍTICO).
- `src/pages/Ordenes.tsx:468` — Edit dentro de la página.
- `src/pages/MapaRutas.tsx:610` — Edit de orden en mapa.
- `src/pages/MapaRutas.tsx:917,1026` — color de pin de mapa.
- `src/components/ordenes/OrdenEditForm.tsx:77` — Edit form principal (origen del hallazgo).
- `src/components/ordenes/ModalEditarOrdenAdmin.tsx:247` — Modal admin de orden.
- `src/pages/Configuracion.tsx:444` — config vehículo-técnico.
- `src/pages/Comisiones.tsx:384` — display de comisiones.
- `src/pages/Avances.tsx:109` — display de avances (`personalId`, no `tecnicoId` — verificar caso).
- `src/pages/CierreDia.tsx:315` — display cierre día.
- `src/components/facturas/FacturaItemsEditor.tsx:176` — display tecnico en factura item.
- `src/components/facturas/FacturaItemDetallesModal.tsx:167` — detalle item factura.
- `scripts/invariantes/check-tecnicoid-personal-id-misuse.ts` — extender cazador P-006.
- `docs/PATRONES_REGRESION.md` — actualizar entrada P-006 con variante `.find()`.

#### Objetivo

Que cualquier `.find()` sobre `personal[]` o `tecnicos[]` que use un valor de `tecnicoId`/`form.tecnicoId`/`editForm.tecnicoId`/etc. compare contra `(item.uid || item.id)` en vez de solo `item.id`, para soportar tanto órdenes pre-c4be345 (donde `tecnicoId === doc id`) como post-c4be345 (donde `tecnicoId === auth.uid`). Pattern de fix uniforme. Cazador determinístico que cace cualquier reintroducción del patrón antiguo.

#### Por qué

- **Bug masivo en producción no detectado por SPRINT-129.** Toda orden creada post-c4be345 con técnico que tiene operaria asignada NO deriva la operaria correctamente porque `personal.find(p => p.id === form.tecnicoId)` retorna `undefined` cuando `form.tecnicoId === auth.uid` y `p.id === personal/{docId}`.
- **SPRINT-129 reportó 0 inconsistencias** porque su definición de inconsistencia es "orden tiene tecnicoId Y técnico tiene operariaId Y orden NO tiene operariaNombre". Cuando la orden NUNCA pobló `operariaNombre` desde el inicio (porque el `find` falla en CREATE), la auditoría no la flaggea — el bug se manifiesta como "campo siempre vacío", no como "desincronizado".
- **Caso Aury Mon explicado de raíz**: el coordinator de SPRINT-129 lo diagnosticó como timing, pero el bug es más profundo — el CREATE flow nunca derivó la operaria porque el `find` no matcheaba.
- **Otros sitios (mapa, facturas, comisiones)** muestran nombre/color incorrecto o vacío en órdenes post-c4be345, dependiendo de qué docs queden con qué versión de `tecnicoId`.

#### Criterios de aceptación

**Fase A — Fix de los 14 sitios:**
- [ ] Para cada uno de los sitios listados, cambiar `find(X => X.id === <campo>)` por `find(X => (X.uid || X.id) === <campo>)`.
- [ ] El fix preserva compatibilidad con órdenes pre-c4be345 (`X.uid` undefined cae al `X.id` viejo).
- [ ] En `useOrdenCreateForm.ts:588`, después del fix, verificar manualmente con un técnico que tenga operariaId asignada que la orden creada SÍ poblada `operariaId` + `operariaNombre`. Esto es el QA core.
- [ ] En `OrdenEditForm.tsx:77`, el banner amber "Esta orden pasará al grupo de {operaria}" se dispara cuando corresponde.
- [ ] Verificar caso Avances `personalId` — puede ser otro patrón (no técnico). Si aplica el mismo fix, hacerlo; si no, documentar.

**Fase B — Cazador P-006 extendido:**
- [ ] Modificar `scripts/invariantes/check-tecnicoid-personal-id-misuse.ts` para detectar también el patrón `find(\w+ => \w+\.id === \w*tecnicoId\w*)` (regex extendido). El cazador actual solo cubre dropdowns `<option value="t.id">`; agregar lógica para `.find()` calls.
- [ ] Actualizar `docs/PATRONES_REGRESION.md` entrada P-006 con la variante.
- [ ] Allowlist vacía o con justificación si hay falso positivo (debería ser 0 después del fix).
- [ ] El cazador retorna 0 hits tras el fix.

**Fase C — Verificación + cleanup:**
- [ ] `npm run build` PASS.
- [ ] `npm run lint` PASS (max-warnings 0).
- [ ] Cazadores 8/8 PASS, 0 hits.
- [ ] Buscar con regex final si hay más sitios olvidados: `\.find\(.*\.id === .*Id\)` en src.
- [ ] Commit + push con mensaje descriptivo + listado de los 14 sitios fixed.

**Global:**
- [ ] archivist PRE-CHANGE obligatorio (toca múltiples archivos críticos incluyendo `useOrdenCreateForm.ts`, `Ordenes.tsx`, `MapaRutas.tsx` — gotcha "cleanup wizard").
- [ ] regression_guardian obligatorio (cambio cross-cutting que toca CREATE + edit + display).
- [ ] reviewer obligatorio (bug sistémico, fix por lote, alto riesgo de fix incompleto).
- [ ] QA manual obligatorio: builder o tester debe crear una orden de prueba con un técnico que tenga operariaId asignada en su perfil, y verificar que la orden creada poblada `operariaId/Nombre`. Esto NO se cubre con typecheck/lint — requiere ejecutar.

#### Restricciones / guardarrails

- NO migrar datos existentes en este sprint. El fix es solo lectura del campo `personal[].uid || personal[].id`. Las órdenes viejas con `operariaNombre` vacío se arreglan via SPRINT-130 (botón "Re-sincronizar operaria") o el `--apply` opcional propuesto en SPRINT-129.
- NO cambiar el campo persistido en `ordenes_servicio.tecnicoId` — sigue siendo `auth.uid` post-c4be345. El fix es del lado de la LECTURA del array `personal[]`, no del campo de la orden.
- NO romper compatibilidad con órdenes pre-c4be345. El patrón `(uid || id)` garantiza fallback.
- Si algún sitio tiene comentario `// @safe-tecnicoid-id: ...` arriba del `.find()`, verificar si el comentario sigue siendo válido tras el fix. Algunos pueden ser UI filters legítimos.
- Reviewer debe poner foco especial en `useOrdenCreateForm.ts:588` — es CREATE, lo más crítico.

#### Notas para el coordinator

- Pattern de fix uniforme:
  ```typescript
  // Antes:
  const tecnicoElegido = personal.find(p => p.id === form.tecnicoId);
  // Después:
  const tecnicoElegido = personal.find(p => (p.uid || p.id) === form.tecnicoId);
  ```
- El cazador P-006 actual está en `scripts/invariantes/check-tecnicoid-personal-id-misuse.ts`. Detecta `<option value={t.id}>` en dropdowns. Extender para que ALSO detecte:
  ```typescript
  \.find\(\s*(\w+)\s*=>\s*\1\.id\s*===?\s*\w*(?:tecnico|personal)Id\w*\)
  ```
  Allowlistar con comentario `// @safe-tecnicoid-find: <razón>` los sitios donde el fix no aplica (si los hay).
- Si el builder descubre durante el fix que algún caller pasa `tecnicoId` que NUNCA es `auth.uid` (siempre doc id), documentarlo y dejar ese sitio sin tocar. Pero debería ser raro porque c4be345 migró todo.
- Después del fix, verificar SPRINT-129 audit script — el script puede empezar a reportar `ORDEN_SIN_OPERARIA_DESINCRONIZADA` para órdenes que tenían el bug latente. Eso ES la señal de que el fix funcionó. Las órdenes viejas se arreglan con SPRINT-130 botón o sprint masivo --apply futuro.
- Postmortem obligatorio post-sprint (sub-regla "bug masivo en producción"): documentar el aprendizaje "cazadores deben cubrir variantes sintácticas del patrón, no solo el patrón canónico" + "auditorías de datos no detectan bugs que se manifiestan como ausencia en lugar de mismatch".

---

### SPRINT-133 — `handleConfirmarEliminar` cross-collection sin tx + extender cazador P-003

**Estado:** COMPLETADO 2026-05-11 (pasada 4 del día, commit pendiente de hash en EJECUCION_AUTONOMA.md). `handleConfirmarEliminar` envuelto en `writeBatch` con chunking. Cazador P-003 ampliado a `src/services/` + `src/pages/` + `src/hooks/` + `api/`. 7 hallazgos colaterales en otras funciones cross-collection allowlist-eadas con `@safe-non-tx: SPRINT-134 follow-up`. SPRINT-134 agendado abajo. Cazadores 7/7 PASS.
**Prioridad:** alta (bug latente real: si la eliminación de un técnico/operaria falla a mitad, deja `ordenes_servicio` parcialmente actualizadas + el doc `personal/` sin borrar — estado inconsistente que requiere intervención manual). Mismo patrón meta que P-006 acaba de fixear: cazador con scope insuficiente.
**Origen:** Coordinator 2026-05-11 durante el cierre de SPRINT-132. Reportó como hallazgo colateral: `PersonalPage.tsx:682 handleConfirmarEliminar` hace mutaciones cross-collection (`ordenes_servicio` updateDoc × N + `personal` deleteDoc) **sin envolver en `runTransaction`** ni `writeBatch`. El cazador P-003 (`check-cross-collection-tx.ts`) NO lo cazó porque su `ROOT_DIR` solo escanea `src/services/` y `api/` — no `src/pages/` ni `src/hooks/`. Bug + falla del cazador (mismo meta-problema que SPRINT-132 acaba de resolver para P-006).
**Riesgo:** medio. El fix toca `PersonalPage.tsx` (archivo crítico de operación — pasa el filtro de gotcha "cleanup wizard"). Hay 3 branches con cross-collection: técnico, operaria, admin (este último no es cross — solo deleteDoc). `runTransaction` permite máximo 500 ops, pero `writeBatch` es la mejor herramienta acá porque NO necesitamos reads dentro de la mutación (los datos vienen de la UI).
**Touch-list previsto:**
- `src/pages/PersonalPage.tsx:682-790` (`handleConfirmarEliminar`) — envolver branches "técnico" + "operaria" en `writeBatch` con chunking si N>500.
- `scripts/invariantes/check-cross-collection-tx.ts` — extender `ROOT_DIR` a `src/pages/` y `src/hooks/` además de `src/services/` y `api/`.
- `docs/PATRONES_REGRESION.md` — actualizar entrada P-003 con nuevo scope.

#### Objetivo

Que la eliminación de un técnico/operaria sea **atómica**: o se transfieren todas las órdenes Y se borra el `personal/`, o no se hace nada. Hoy si falla a mitad (timeout, permission-denied en alguna orden, conexión), queda inconsistente. + Que el cazador P-003 detecte futuras introducciones de este patrón en cualquier archivo del frontend, no solo en services.

#### Por qué

- **Bug latente real:** si el técnico tiene 50 órdenes activas y se cae la red después de actualizar 30, las primeras 30 ya tienen el nuevo `tecnicoId` apuntando al destino, las últimas 20 todavía apuntan al técnico viejo, y el doc `personal/` del técnico viejo sigue existiendo. Estado inconsistente que requiere intervención manual desde Firestore Console.
- **Mismo patrón meta que P-006:** el cazador P-003 fue diseñado para escanear `src/services/` (donde estaban los bugs originales) pero el código del repo evolucionó y ahora hay mutaciones cross-collection en `src/pages/` y `src/hooks/`. Necesita ampliarse igual que P-006 con `.find()`. **Aprendizaje recurrente: los cazadores que escanean directorios fijos quedan obsoletos si el código se reorganiza.**
- **Sin postmortem reciente que mencione esto**, pero es el mismo principio del postmortem SPRINT-118: "cazadores estáticos solo cazan donde miran". Aplica acá.

#### Criterios de aceptación

**Fase R1 — Fix `handleConfirmarEliminar`:**
- [ ] Branch "técnico" (líneas 687-727): las N llamadas a `updateDoc(doc(db, 'ordenes_servicio', o.id), updateData)` + el `deleteDoc(doc(db, 'personal', p.id))` quedan envueltas en un `writeBatch`. Si `deps.length > 500`, partir en chunks de 500 y hacer múltiples `batch.commit()` secuenciales (con la advertencia de que dejaría de ser 100% atómico — documentar en el código con comentario "// Si llegamos acá con 500+ órdenes, el técnico tenía un volumen muy alto. Atomicidad parcial: si falla un chunk, los anteriores ya están aplicados. Aceptable porque el flujo de UI ya bloquea con `processingAccion`."). Realista: técnicos no van a tener >500 órdenes activas, pero el guardarrail es bueno.
- [ ] Branch "operaria" (líneas 728-767): mismo tratamiento. N updates a `personal` + N updates a `ordenes_servicio` + 1 deleteDoc a `personal`. Total puede ser >500 en operarias con muchos técnicos+órdenes pero raro.
- [ ] Branch "administrador" (líneas 768-778): SOLO 1 deleteDoc — NO toca otras colecciones. NO necesita writeBatch. Dejar como está. Importante: validar con regression_guardian que el cazador P-003 extendido NO lo flagea como hit (1 colección = OK).
- [ ] Branch "secretaria" (líneas 779-783): igual, 1 deleteDoc. Dejar como está.
- [ ] Audit log: la rule actual gatea writes con `actorUid`. El batch debe escribir un doc en `auditoria` o `auditoria_admin` para registrar la eliminación. SI esto no existe hoy, dejar para sprint follow-up — pero anotar como deuda.
- [ ] El reviewer obligatorio verifica que el orden de operaciones del batch sea: 1) updates a ordenes, 2) updates a personal (si operaria), 3) deleteDoc personal. El delete del personal SIEMPRE al final.

**Fase R2 — Extender cazador P-003:**
- [ ] Modificar `scripts/invariantes/check-cross-collection-tx.ts` para que su lista de directorios a escanear sea `['src/services', 'src/pages', 'src/hooks', 'api']` en lugar de solo `['src/services', 'api']`.
- [ ] Verificar que el cazador NO genera falsos positivos sobre `handleConfirmarEliminar` después del fix R1 (porque ya tendrá `runTransaction(` o `writeBatch(`).
- [ ] Verificar que el cazador NO genera falsos positivos en otros archivos de `src/pages/` o `src/hooks/`. Si hay hits, evaluarlos: si son bugs reales, agregar al sprint o crear sprint follow-up. Si son falsos positivos, allowlistar con `// @safe-non-tx: <razón>`.
- [ ] Actualizar entrada P-003 en `docs/PATRONES_REGRESION.md` con el nuevo scope.

**Global:**
- [ ] archivist PRE-CHANGE obligatorio (toca `PersonalPage.tsx`, gotcha "cleanup wizard").
- [ ] regression_guardian obligatorio (toca un flujo crítico de eliminación de empleado + extiende un cazador, doble vector de riesgo).
- [ ] reviewer obligatorio.
- [ ] `npm run build` PASS.
- [ ] `npm run lint` PASS.
- [ ] Cazadores 7/7 PASS (incluyendo P-003 extendido).
- [ ] QA manual obligatorio: builder o tester debe ejercitar el flujo de eliminación de un técnico de prueba con 2-3 órdenes activas y verificar (a) que las órdenes quedan transferidas, (b) que el `personal/` se borra, (c) que si simula un fallo a mitad (puede usar Firestore offline o un network throttle en DevTools), el estado queda atómico (todo o nada).
- [ ] Commit + push.

#### Restricciones / guardarrails

- NO cambiar el comportamiento de UI ni los toasts. Solo cambiar el mecanismo interno.
- NO agregar lógica de retry o circuit breaker en este sprint — eso es scope de otro sprint si aparece la necesidad.
- NO meter audit log en este sprint si requiere nueva colección o nueva rule. Documentar como deuda.
- NO extender el cazador P-003 a otros directorios fuera del repo `src/` (no incluir `scripts/`, `node_modules/`, etc).
- Si el builder descubre que hay otra función en `src/pages/` o `src/hooks/` con el mismo problema, agregar a la touch-list o crear sprint follow-up — NO mergear sin reviewer.

#### Notas para el coordinator

- `writeBatch` (Firebase v9) es la elección correcta acá. NO requiere reads previos. Patrón:
  ```typescript
  import { writeBatch } from 'firebase/firestore';
  const batch = writeBatch(db);
  for (const o of deps) {
    batch.update(doc(db, 'ordenes_servicio', o.id), updateData);
  }
  batch.delete(doc(db, 'personal', p.id));
  await batch.commit();
  ```
- Si el sprint requiere chunking (>500 ops), patrón:
  ```typescript
  const chunks = [];
  for (let i = 0; i < deps.length; i += 499) {
    chunks.push(deps.slice(i, i + 499));
  }
  // El último chunk lleva el deleteDoc.
  for (let i = 0; i < chunks.length; i++) {
    const batch = writeBatch(db);
    for (const o of chunks[i]) batch.update(...);
    if (i === chunks.length - 1) batch.delete(doc(db, 'personal', p.id));
    await batch.commit();
  }
  ```
- Para extender P-003, el cambio es ínfimo — solo agregar paths al array de directorios. Smoke test antes del commit: correr `npm run check:regression` y verificar que sigue 0 hits.
- Postmortem opcional (no es bug en producción todavía, pero es deuda crítica): se puede agregar un postmortem-positivo al estilo del SPRINT-119 documentando "cómo encontramos un bug latente sin que rompa producción primero".

---

### SPRINT-134 — Refactor a `writeBatch` de los 7 cross-collection en `src/pages/` (follow-up SPRINT-133)

**Estado:** EN_PROGRESO (1/6 funciones — Opción 1 sub-sprint per función; en curso 134-mant)
**Prioridad:** media (bugs latentes reales, mismo perfil que el resuelto en SPRINT-133, pero ninguno reportado por usuarios todavía). Allowlist-eados con `@safe-non-tx` para no bloquear el commit de SPRINT-133.
**Origen:** Coordinator 2026-05-11 (pasada 4) durante SPRINT-133. Al extender el cazador P-003 a `src/pages/`, aparecieron 7 funciones cross-collection sin envolver en `runTransaction`/`writeBatch`. Cada una es bug latente: si la red corta a mitad de las mutaciones, queda estado parcial inconsistente.
**Riesgo:** medio. Toca 5 archivos críticos de operación (`Cotizaciones.tsx`, `EquiposTaller.tsx`, `Inventario.tsx`, `Mantenimiento.tsx`, `PersonalPage.tsx`). Cada función tiene su propio flujo (factura, ajuste de inventario, generar orden de mantenimiento, alta empleado, vinculación Auth). Hacerlo de a uno con QA visual humana entre cada uno.

**Touch-list previsto:**
- `src/pages/Cotizaciones.tsx` (`handleConvertirAFactura:42` + `handleSubmit:257`) — muta movimientos_inventario + cotizaciones + facturas (3 colecciones).
- `src/pages/EquiposTaller.tsx` (`handleChangeEstado:91`) — muta equipos_taller + standby_piezas.
- `src/pages/Inventario.tsx` (`handleConfirmarAjuste:271`) — muta piezas_inventario + movimientos_inventario.
- `src/pages/Mantenimiento.tsx` (`handleGenerarOrden:80`) — muta mantenimiento + ordenes_servicio.
- `src/pages/PersonalPage.tsx` (`handleSubmit:203` + `ejecutarVinculacion:428`) — muta personal + usuarios (alta empleado y vinculación Auth — overlap con SPRINT-105 / P-004).

#### Objetivo

Convertir cada una de las 7 funciones en `writeBatch` (sin reads previos) o `runTransaction` (si necesita lectura de estado pre-mutación). Remover el comentario `@safe-non-tx: SPRINT-134 follow-up` tras cada fix.

#### Por qué

- **Bug latente real en 7 sitios.** Mismo perfil que el resuelto en SPRINT-133 (eliminación de empleado). Si la red corta a mitad de un `handleConvertirAFactura` (movimientos_inventario + cotizaciones + facturas), queda factura sin items, o cotización marcada convertida sin factura, o stock descontado sin factura.
- **No bloquear el commit de SPRINT-133.** Allowlist temporal con razón explícita es la convención correcta para deuda agendada.
- **Algunos casos pueden requerir lectura previa** (ej: `handleConvertirAFactura` lee el counter de FAC antes de escribir la factura) — esos requieren `runTransaction` no `writeBatch`. Builder debe evaluar caso por caso.

#### Criterios de aceptación

**Por cada uno de los 7 sitios:**
- [ ] Envolver las mutaciones cross-collection en `writeBatch` (si no requiere reads dentro de la mutación) o `runTransaction` (si lee + escribe en la misma operación).
- [ ] Remover el comentario `// @safe-non-tx: SPRINT-134 follow-up ...` arriba de la función.
- [ ] QA manual o test del flujo afectado (cazador no puede verificar comportamiento, solo estructura).

**Global:**
- [ ] archivist PRE-CHANGE para cada archivo tocado.
- [ ] regression_guardian obligatorio (toca múltiples flujos críticos).
- [ ] reviewer obligatorio con foco en orden de operaciones de cada batch.
- [ ] `npm run build` PASS.
- [ ] `npm run lint` PASS sobre archivos tocados.
- [ ] Cazadores 7/7 PASS (P-003 debe seguir 0 hits).
- [ ] Commit + push.

#### Restricciones / guardarrails

- NO cambiar comportamiento de UI ni toasts. Solo mecanismo interno.
- NO meter audit logs nuevos en este sprint si requieren rules/colección nueva — documentar como deuda separada.
- NO tocar `firestore.rules`.
- NO refactorear opportunisticamente otras funciones del archivo (mantener scope acotado).
- Si algún sitio requiere `runTransaction` con lectura, el patrón es el de `contadores.service.ts` (verificación de idempotencia DENTRO del callback, DESPUÉS del `tx.get()`).
- Posible dividir SPRINT-134 en sub-sprints (134a, 134b, ...) si el coordinator lo prefiere — uno por archivo, con QA humano visual entre cada deploy. Recomendable porque el flujo de cada uno es distinto (factura ≠ inventario ≠ alta de empleado).

#### Notas para el coordinator

- **Orden sugerido (priorizar por impacto / riesgo):**
  1. `Cotizaciones.tsx handleConvertirAFactura` (3 colecciones — el más riesgoso) — sub-sprint 134a.
  2. `PersonalPage.tsx handleSubmit` + `ejecutarVinculacion` (alta empleado — bug puede dejar Auth user sin perfil o personal sin usuarios espejo) — sub-sprint 134b. **Verificar overlap con P-004**: el cazador P-004 caza "creas Auth user sin doc espejo", pero NO "creas ambos docs sin atomicidad". Son complementarios.
  3. `Inventario.tsx handleConfirmarAjuste` (stock + log de movimientos) — sub-sprint 134c.
  4. `Mantenimiento.tsx handleGenerarOrden` (item de mantenimiento + orden de servicio derivada) — sub-sprint 134d.
  5. `EquiposTaller.tsx handleChangeEstado` (equipo + standby) — sub-sprint 134e.
  6. `Cotizaciones.tsx handleSubmit` (cotización + lead orden) — sub-sprint 134f.
- Después de cada fix individual, correr `npx tsx scripts/invariantes/check-cross-collection-tx.ts` y verificar que la cuenta de hits baja en 1. Cuando llega a 0, el sprint queda cerrado.
- Cada sub-sprint debe registrar QA humano en BLOQUEOS.md (flujo afectado tiene impacto en datos de operación).

---

### SPRINT-135a — Refactor garantía (fase 1): modelo de datos + countdown público + período configurable

**Estado:** PARCIAL 2026-05-11 (fase backend COMPLETADA; fase UI movida a `BLOQUEOS.md` como SPRINT-135a-UI por restricciones de endpoint público y wizard de cierre — ambos requieren OK Jorge según protocolo + sub-regla CLAUDE.md).
**Prioridad:** alta (es la base de los sub-sprints 135b-e; sin esto el refactor no puede arrancar). Riesgo bajo porque solo prepara estructura sin tocar comportamiento productivo.
**Origen:** Discovery con Jorge 2026-05-11 (~60min back-and-forth via Cowork). Confirmó que el comportamiento actual de "garantía = orden nueva con flag `esGarantia`" NO es lo que quiere — quiere reactivación de la misma orden con array de visitas para preservar técnico responsable, trazabilidad histórica, conduce/ITBIS/comisión originales intactos, y soporte para múltiples reclamos dentro del período sin reiniciarlo.
**Riesgo:** bajo. Solo agrega tipos + campos opcionales en `OrdenServicio` + UI countdown pública. NO toca rules, NO toca lógica de cierre, NO toca facturación. Las órdenes existentes con `esGarantia=true` quedan como están (migración es deuda futura, NO scope de este sprint).
**Touch-list previsto:**
- `src/types/index.ts`:
  - Agregar `'garantia_reclamada'` al enum `FaseOrden`.
  - Nuevo tipo `VisitaGarantia`:
    ```typescript
    export interface VisitaGarantia {
      id: string;                    // crypto.randomUUID()
      fecha: Timestamp;              // fecha del reclamo
      motivoCliente: string;         // texto que el cliente escribió en /garantia/:token
      tecnicoUid?: string;           // se completa cuando operaria asigna
      tecnicoNombre?: string;
      fechaVisita?: Timestamp;       // cuando técnico va a la casa
      piezas?: PiezaUsada[];         // piezas instaladas en esta visita (reutilizar tipo si existe)
      costoPiezas?: number;          // suma de costos de piezas (RD$)
      cubrioNegocio?: boolean;       // true=garantía gratis, false=mal uso cobrable
      malUso?: boolean;              // marcado por técnico en wizard cierre
      cobroExtra?: number;           // si malUso=true, monto cobrado al cliente
      descuentoComisionAplicado?: number; // costoPiezas × % técnico (se llena en 135d)
      quincenaAplicaDescuento?: string;    // ID de quincena donde se aplicó (135d)
      notas?: string;
      fechaCierre?: Timestamp;       // cuando técnico marca cerrada esta visita
      estado: 'reclamada' | 'asignada' | 'en_visita' | 'cerrada_defecto' | 'cerrada_mal_uso';
    }
    ```
  - Campos nuevos en `OrdenServicio` (todos opcionales para retrocompatibilidad):
    - `visitasGarantia?: VisitaGarantia[]`
    - `periodoGarantiaDias?: number` (default 60)
    - `garantiaVencimiento?: Timestamp` (computed al cerrar orden)
- `src/utils/garantia.ts` (NUEVO archivo):
  - `calcularVencimiento(fechaCierre: Date, dias: number): Date`
  - `diasRestantes(orden: OrdenServicio): number` — retorna 0 o negativo si expirada.
  - `estaDentroDePeriodo(orden: OrdenServicio): boolean`
- `src/pages/public/GarantiaCliente.tsx`:
  - Mostrar countdown: "Tu garantía vence en X días" (rojo si <7 días, verde si >7).
  - Mostrar fecha cierre original + fecha vencimiento.
  - Botón "Reclamar garantía" deshabilitado si `estaDentroDePeriodo()` retorna false.
  - El botón existente NO cambia comportamiento todavía (el reclamo real es scope de 135b). En este sprint solo es UI placeholder con `disabled` real basado en período.
- `src/components/cierre/CierreServicioWizard.tsx` (o el componente donde se cierra la orden — verificar primero):
  - Agregar input "Período de garantía (días)" con default 60.
  - Al guardar cierre, calcular y persistir `garantiaVencimiento`.
- `firestore.rules`: **NO se toca**. La rule actual ya permite update de campos opcionales si admin/coord/permiso aplica. Si el cazador P-002 grita por algún caso, allowlistar con `// @safe-required:` o `.get(field, null)`.

#### Objetivo

Preparar el modelo de datos + UI base sin cambiar el comportamiento operativo. Al cerrar este sprint, una orden nueva cerrada tendrá `garantiaVencimiento` poblada y el cliente verá el countdown en `/garantia/:token`. El botón "Reclamar" estará allí pero solo visible/habilitado dentro del período — el reclamo en sí (cambio de fase + notif a operaria) viene en 135b.

#### Por qué

- Es el primer paso del refactor de garantía. Sin esto los siguientes 4 sub-sprints no tienen modelo donde escribir.
- Approach incremental (igual que lote 117c): preparar estructura → QA visual → seguir.
- Riesgo bajo porque NO toca lógica productiva ni rules.
- Bonus visible: aunque el botón no haga nada todavía, el cliente ya verá el countdown — pequeña mejora de UX que mucha gente valora.

#### Criterios de aceptación

- [ ] Tipo `VisitaGarantia` exportado desde `src/types/index.ts` con todos los campos del touch-list.
- [ ] Enum `FaseOrden` incluye `'garantia_reclamada'`. Verificar que `faseLabel()` y `faseColor()` en `utils/index.ts` lo mapean (label = "Garantía reclamada", color = naranja).
- [ ] `OrdenServicio` tiene los 3 campos opcionales nuevos.
- [ ] `src/utils/garantia.ts` exporta los 3 helpers, con tests inline en comentarios JSDoc (no test runner — el repo no tiene tests). Cazadores deben pasar.
- [ ] `GarantiaCliente.tsx` muestra countdown legible + botón Reclamar con estado `disabled` correcto. Si `garantiaVencimiento` es `undefined` (orden vieja), muestra mensaje neutro tipo "Período de garantía no especificado, contacta a Mister Service".
- [ ] Wizard de cierre tiene el input "Período de garantía". Default 60 días. Solo aparece si fase cierre es exitosa (no en cancelaciones).
- [ ] `npm run build` PASS.
- [ ] `npm run lint` PASS (max-warnings 0).
- [ ] Cazadores 7/7 PASS, 0 hits.
- [ ] Commit + push.

#### Restricciones / guardarrails

- archivist PRE-CHANGE obligatorio (toca `src/types/index.ts` archivo crítico + `GarantiaCliente.tsx` página pública).
- regression_guardian recomendado (toca el tipo central `OrdenServicio`).
- NO crear todavía la lógica de reclamo (eso es 135b).
- NO calcular descuento comisión todavía (eso es 135d).
- NO tocar `firestore.rules` (eso es 135e con OK explícito de Jorge).
- NO hacer migración de órdenes viejas con `esGarantia=true` — quedan como están. Las órdenes nuevas que se cierren tras este sprint tendrán `garantiaVencimiento`, las viejas no. La UI de `GarantiaCliente.tsx` debe manejar ambos casos.
- Si Cowork detecta durante el sprint que el botón existente de `/garantia/:token` ya hace algo (crear orden nueva con `esGarantia`), DEJARLO como está hasta 135b. No se rompe nada porque el botón solo dispara si está dentro del período.
- QA manual sugerido al cerrar: abrir una orden de prueba, cerrarla con período 1 día, abrir `/garantia/:token` y validar que muestra "Vence en 1 día". Esperar 1 día (o setear `garantiaVencimiento` manualmente a ayer en Firestore Console) y validar que el botón queda deshabilitado.

#### Notas para el coordinator

- El componente del wizard de cierre necesita identificarse. Búsqueda sugerida: `grep -rn "CierreServicio" src/components/` o buscar dónde se setea `fase: 'cerrado'`. Probablemente en `CierreServicioWizard.tsx` o `IniciarChequeoButton.tsx` (este último puede compartir flujo).
- Si el wizard de cierre tiene 2 versiones (legacy con `piezasRetiradas/checklist` y nueva con `equipoFunciona/clienteSatisfecho`), el input nuevo se agrega solo en la versión nueva. La legacy queda como está.
- Default 60 días es asunción razonable. Si querés default diferente para tipos específicos (ej: 30 días para chequeos, 90 días para reparaciones grandes), eso es scope de 135c o sprint independiente.
- El countdown puede usar `date-fns/locale/es` que ya está en el repo: `formatDistanceToNow(vencimiento, { locale: es, addSuffix: true })`.

---

### SPRINT-135a-UI — Refactor garantía fase 1, parte UI (countdown público desde modelo nuevo + input período en wizard cierre)

**Estado:** COMPLETADO 2026-05-11 — ver `## Sprints completados (histórico)` más abajo.
**Prioridad:** alta (cierra fase 1 del refactor de garantía iniciado en `75f6c7b`; base para SPRINT-135b/c/d/e + SPRINT-140)
**Origen:** Discovery con Jorge 2026-05-11 + fase backend cerrada en `75f6c7b` (modelo `OrdenServicio.{visitasGarantia, periodoGarantiaDias, garantiaVencimiento}` + helpers `src/utils/garantia.ts` + enum `garantia_reclamada`). Esta es la parte UI que estaba bloqueada por restricciones de protocolo (endpoint público + wizard de cierre).
**Riesgo:** medio. Toca un endpoint `api/` público + un componente wizard crítico. Mitigaciones: (a) cambios aditivos retrocompatibles, (b) endpoint sigue retornando `garantia.tiempoDias/inicioFecha/finFecha` actuales (no rompe consumers), (c) wizard solo agrega un input opcional sin cambiar el flujo de pasos.
**Touch-list previsto:**
- `api/garantia/[token].ts` — el endpoint hoy lee `facturas.garantia.{tiempoDias, inicioFecha, finFecha, estado, reclamadaEn}` (modelo viejo). Agregar fallback: si la factura tiene `ordenId`, buscar la orden en `ordenes_servicio` y, si tiene `periodoGarantiaDias` y/o `garantiaVencimiento` poblados (modelo SPRINT-135a backend), preferirlos sobre los de la factura. El response sigue siendo el mismo shape (NO breaking change para `GarantiaCliente.tsx`).
- `src/components/CierreServicioWizard.tsx` — agregar input "Período de garantía (días)" con default 60 ANTES del botón "Cerrar Servicio". Al cerrar, persistir `periodoGarantiaDias` + `garantiaVencimiento` (computado con `calcularVencimiento(fechaCierre, periodo)`) en el `updateDoc` de `ordenes_servicio/{ordenId}`.
- `src/pages/public/GarantiaCliente.tsx` — ajuste menor opcional: si `info.garantia.diasRestantes < 7` (último tramo), pintar el card con tinte rojo (hoy todos los vigentes son amber). Si el shape del response no cambia, este archivo puede no necesitar tocarse — depende de criterio de Jorge.

#### Objetivo

Cerrar la fase 1 del refactor de garantía: el wizard de cierre captura el período (default 60) y persiste `periodoGarantiaDias`/`garantiaVencimiento` en la orden, el endpoint público los prefiere si están poblados, y `GarantiaCliente.tsx` muestra el countdown coherente sin importar si la orden tiene modelo nuevo o viejo.

#### Por qué

- La fase backend (`75f6c7b`) dejó las puertas abiertas en types y helpers, pero ningún flujo escribe los campos nuevos y ningún flujo los lee. Sin esta fase UI, los campos quedan latentes y los sprints 135b/c/d/e (reclamo + descuento técnico + mal uso) no tienen modelo donde escribir.
- `GarantiaCliente.tsx` ya funciona con el modelo viejo (`facturas.garantia.*`) — es el approach incremental: cuando el endpoint encuentra modelo nuevo en la orden lo prefiere; cuando no, sigue leyendo el viejo. Cero breaking changes.
- Jorge dio OK explícito 2026-05-11 18:25 con scope: ambos (endpoint público + wizard cierre).

#### Criterios de aceptación

- [ ] `api/garantia/[token].ts` GET handler: tras buscar la factura, si `data.ordenId` existe, leer la orden de `ordenes_servicio` y SI tiene `periodoGarantiaDias` (number) y `garantiaVencimiento` (Timestamp), usarlos para computar el response (`tiempoDias`, `finFecha`, `diasRestantes`). Si la orden no tiene los campos nuevos, comportamiento idéntico al actual. NO romper el response shape.
- [ ] `api/garantia/[token].ts` POST handler: comportamiento intacto (sigue creando `cita_por_confirmar` con `tipo: 'garantia'`). El cambio a "reactivar la misma orden" es scope de SPRINT-135b, NO de este sprint.
- [ ] `CierreServicioWizard.tsx`: nuevo input "Período de garantía (días)" entre la sección de Piezas y el botón final. Tipo `number`, default 60, min 1, max 365. Validación visual: si < 1 o > 365, mostrar texto amber bajo el input. Label en español: "🛡️ Período de garantía (días)".
- [ ] `CierreServicioWizard.tsx`: al cerrar exitosamente, `cierrePayload` o `ordenUpdate` incluyen `periodoGarantiaDias: <input>` y `garantiaVencimiento: Timestamp.fromDate(calcularVencimiento(<fechaCierreDate>, periodo))`. Reutilizar el helper `calcularVencimiento` de `src/utils/garantia.ts`.
- [ ] `npm run build` PASS (typecheck).
- [ ] `npm run lint` PASS (max-warnings 0).
- [ ] Cazadores 7/7 PASS.
- [ ] regression_guardian PASS (toca wizard de cierre + endpoint público — sensible).
- [ ] reviewer APPROVED (foco: retrocompatibilidad del endpoint + UX wizard).
- [ ] Commit message declara explícitamente: "QA flujo cierre técnico PENDIENTE — Jorge ejercitará según plan de QA post-deploy del spec SPRINT-135a-UI" (sub-regla CLAUDE.md de componentes wizard).

#### Restricciones / guardarrails

- archivist PRE-CHANGE obligatorio (toca `CierreServicioWizard.tsx` archivo crítico + endpoint público).
- regression_guardian obligatorio.
- reviewer obligatorio (toca endpoint público + wizard).
- NO modificar el shape del response del endpoint (es contrato público).
- NO cambiar comportamiento del POST handler (eso es SPRINT-135b).
- NO tocar `firestore.rules` (no es necesario — los campos nuevos son escritos por el técnico cerrando su propia orden, ya cubierto por rules existentes).
- NO calcular descuento comisión todavía (es SPRINT-135d).
- NO hacer migración de órdenes viejas — quedan como están (endpoint hace fallback transparente).

#### Plan de QA post-deploy (Jorge ejercita)

1. Cerrar una orden de prueba con período `1 día`.
2. Abrir `/garantia/:token` (o vía `tokenPortalCliente`) → el card debe decir "1 día restante" (o equivalente).
3. Setear `garantiaVencimiento` a ayer en Firestore Console → recargar → estado debe pasar a "expirada".
4. Crear otra orden de prueba dejando período en default 60 → cerrar → confirmar que `ordenes_servicio/{id}.garantiaVencimiento` quedó como `fechaCierre + 60d`.
5. Para órdenes legacy (sin `garantiaVencimiento` en la orden), confirmar que el endpoint sigue leyendo de `facturas.garantia` y el countdown muestra valor coherente.

#### Notas para el coordinator

- El endpoint actual lee de `facturas`, no de `ordenes_servicio`. El cambio es agregar un fallback que si `data.ordenId` está poblado en la factura, ir a buscar la orden y preferir sus campos nuevos. Esto preserva la URL/contrato y agrega progresivamente el modelo nuevo.
- El componente del wizard es `src/components/CierreServicioWizard.tsx` (596 líneas, ya identificado). El `cierrePayload` se construye en `handleCerrarServicio` (línea ~213) y el `updateDoc` está en línea ~274.
- Por la sub-regla CLAUDE.md, el commit message DEBE declarar "QA flujo cierre técnico PENDIENTE" o equivalente. Jorge lo valida post-deploy según el plan arriba.
- El input puede usar el patrón visual existente del wizard (cards con border-2, texto bold). Default 60 como `useState<number>(60)`.

---

### SPRINT-136 — Quitar fallback hardcodeado de Firebase config (fail-fast)

**Estado:** COMPLETADO 2026-05-11 (commit `d09bdbb` — fail-fast en `src/firebase/config.ts:7-15` aplicado; `.env.example` documenta las 6 keys; CLAUDE.md actualizado).
**Prioridad:** alta (audit forense 2026-05-11 — hallazgo CRÍTICO #3)
**Origen:** Cowork 2026-05-11. Audit forense detectó `src/firebase/config.ts:7-15` con credenciales reales del proyecto `mister-service-app-cloude` como fallback `||` de cada `import.meta.env.VITE_*`. Si alguien clona el repo sin `.env`, la app arranca pegada al proyecto productivo. Las API keys de Firebase web son públicas por diseño (Vite las inyecta al bundle), pero el fallback hardcodeado igual es mala práctica: facilita forks accidentales que escriben a producción real.
**Riesgo:** bajo (cambio simple, blast radius limitado a entornos sin `.env`).
**Touch-list previsto:** `src/firebase/config.ts`, `.env.example` (verificar que tenga todas las keys documentadas), `README.md` (sección setup), `CLAUDE.md` (línea ~36 que dice "src/firebase/config.ts includes hardcoded fallback credentials...").

#### Objetivo

Que `src/firebase/config.ts` falle al arrancar (`throw new Error('Missing VITE_FIREBASE_* env vars...')`) si falta cualquier env var requerida, en vez de pegarse silenciosamente al proyecto `mister-service-app-cloude`. Documentar en `.env.example` y `README.md` cuáles son las 6 variables obligatorias.

#### Por qué

- Defense in depth. Si Jorge clona el repo en una máquina nueva y se olvida de `.env`, hoy la app arranca contra producción real y puede escribir data accidentalmente. Con fail-fast, se entera al instante.
- Higiene del bundle. El bundle de producción seguirá teniendo las keys (Vite las inyecta), pero al menos el repo deja de contenerlas como string literal. Cualquier auditor externo que mire el código deja de ver "credenciales hardcodeadas".
- Actualiza la documentación viva (`CLAUDE.md` describe el comportamiento actual: hay que invertir esa línea).

#### Criterios de aceptación

- [ ] `src/firebase/config.ts:7-15` reescrito: cada campo de `firebaseConfig` lee `import.meta.env.VITE_FIREBASE_*` SIN fallback `||`. Si alguno es `undefined` o vacío, el módulo throw-ea con mensaje explícito listando qué env vars faltan.
- [ ] `.env.example` tiene las 6 variables documentadas: `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_STORAGE_BUCKET`, `VITE_FIREBASE_MESSAGING_SENDER_ID`, `VITE_FIREBASE_APP_ID`. Cada una con un comentario corto del propósito.
- [ ] `README.md` sección "Setup" explica que hay que copiar `.env.example` a `.env` y rellenar antes de `npm run dev`.
- [ ] `CLAUDE.md` línea ~36 invertida: ahora dice "config falla al arrancar si faltan env vars (audit fix SPRINT-136 2026-05-XX)".
- [ ] `npm run dev` con `.env` válido sigue funcionando idéntico.
- [ ] `npm run build` con `.env` válido sigue funcionando idéntico.
- [ ] Smoke local: renombrar `.env` temporalmente a `.env.bak` y correr `npm run dev` → confirmar que falla con mensaje claro. Devolver `.env` después.
- [ ] Cazadores 7/7 PASS.

#### Restricciones / guardarrails

- NO tocar `appCheckInstance` ni `initializeAppCheck` (eso es SPRINT-141).
- NO cambiar el nombre del proyecto Firebase. Sigue siendo `mister-service-app-cloude`.
- NO mover credenciales a otro lugar — la solución es eliminarlas del código, no esconderlas en otro archivo del repo.
- Vercel ya tiene las env vars configuradas en su panel — confirmar antes de pushear (revisar `.env.example` contra lo que Vercel inyecta).

#### Notas para el coordinator

- Patrón sugerido para el throw:
  ```ts
  const required = ['VITE_FIREBASE_API_KEY', 'VITE_FIREBASE_AUTH_DOMAIN', ...];
  const missing = required.filter(k => !import.meta.env[k]);
  if (missing.length > 0) {
    throw new Error(`Firebase config: faltan env vars: ${missing.join(', ')}. Copiá .env.example a .env y rellenalas.`);
  }
  ```
- archivist PRE-CHANGE recomendado (toca `src/firebase/config.ts`, archivo crítico que importa todo el resto del app).
- Reviewer obligatorio (toca arranque del app — si falla, NO arranca nada).
- Coordinar con devops antes de pushear: si Vercel no tiene alguna de las 6 env vars seteadas, el deploy va a romper. Validar en panel Vercel primero.

---

### SPRINT-137 — Validación de archivos en uploads públicos (size + MIME + cantidad)

**Estado:** COMPLETADO 2026-05-11 (commit `d09bdbb` — `src/utils/uploads.ts` NUEVO con helpers + validaciones aplicadas en `solicitudes.service.ts` y `storage.service.ts`).
**Prioridad:** alta (audit forense 2026-05-11 — hallazgo CRÍTICO #4)
**Origen:** Cowork 2026-05-11. Audit forense detectó que `src/services/solicitudes.service.ts:122-133 subirArchivoSolicitud` y `src/services/storage.service.ts:1-23 subirFotoCierre/subirFirma` aceptan cualquier `File`/`Blob` sin validar tamaño, MIME real, ni cantidad de archivos por solicitud. Vector de abuso: atacante sube un .exe disfrazado de .jpg de 500MB y entra al bucket. También: cliente legítimo desde móvil sube foto sin comprimir de 30MB y satura Storage.
**Riesgo:** bajo (agrega checks defensivos, no cambia el happy path).
**Touch-list previsto:** `src/utils/uploads.ts` (NUEVO — helpers `validarArchivoPublico`, `validarFoto`, `validarFirma`), `src/services/solicitudes.service.ts`, `src/services/storage.service.ts`, `src/components/public/CampoFormulario.tsx` (mensaje de error al usuario), `src/components/cierre/CierreServicioWizard.tsx` (mensaje en flujo técnico si aplica).

#### Objetivo

Bloquear server-side todo upload de archivos que supere los límites del negocio: 10 MB max, MIME real en whitelist (no por extensión), cantidad razonable por solicitud. Cliente recibe mensaje claro en español si el archivo se rechaza.

#### Por qué

- Storage rules pueden mitigar (SPRINT-138) pero la validación client-side en el service da defense in depth y mensaje específico al usuario antes de gastar ancho de banda subiendo 30MB que la rule va a rechazar.
- Whitelist por MIME real (sniffing del primer chunk del archivo) en vez de por extensión: protege contra `.exe` renombrado a `.jpg`.
- Decisión Jorge 2026-05-11: max 10 MB por archivo.

#### Criterios de aceptación

- [ ] `src/utils/uploads.ts` NUEVO exporta:
  - `MAX_FILE_BYTES = 10 * 1024 * 1024` (10 MB).
  - `MIME_WHITELIST_FOTO = ['image/jpeg', 'image/png', 'image/webp', 'image/heic']`.
  - `MIME_WHITELIST_FIRMA = ['image/png', 'image/svg+xml']` (las firmas suelen ser PNGs del canvas).
  - `MIME_WHITELIST_DOC = ['application/pdf', ...MIME_WHITELIST_FOTO]` para campos de formulario público que aceptan PDF + imagen.
  - `MAX_ARCHIVOS_POR_SOLICITUD = 10` (suficiente para casos legítimos, bloquea spam).
  - Función pura `validarArchivoPublico(file: File, opts: { whitelist: string[]; maxBytes?: number }): { ok: true } | { ok: false; error: string }` que devuelve mensaje en español listo para mostrar al usuario.
- [ ] `subirArchivoSolicitud` valida antes de `uploadBytes`. Si falla, throw con mensaje específico. Caller atrapa y muestra.
- [ ] `subirFotoCierre`, `subirFotoInicio`, `subirFirma` (todos los exports de `storage.service.ts`) usan helpers correspondientes.
- [ ] `CampoFormulario.tsx` muestra el error en rojo bajo el input cuando la validación rechaza. No envía el archivo al backend si falla cliente-side (early return).
- [ ] Cantidad max: si el campo es de tipo `archivo_multiple`, validar `files.length <= MAX_ARCHIVOS_POR_SOLICITUD`.
- [ ] Sniffing MIME real: leer primeros 12 bytes del archivo y comparar magic numbers conocidos (JPEG `FF D8 FF`, PNG `89 50 4E 47`, PDF `25 50 44 46`, WebP `52 49 46 46 ... 57 45 42 50`). Si MIME declarado no coincide con magic number, rechazar como "Archivo corrupto o tipo no permitido".
- [ ] Tests manuales: subir un .jpg de 12 MB → rechazo claro. Subir un .exe renombrado a .jpg → rechazo. Subir un .pdf legítimo → OK.
- [ ] Cazadores 7/7 PASS.

#### Restricciones / guardarrails

- NO bloquear `.heic` (iPhones default). Convertir o aceptar tal cual — verificar comportamiento en `OrdenAuditoria` y en cierre del técnico.
- NO romper el flujo del wizard de cierre: técnicos suben fotos desde celular y NO pueden tener fricción. Mensaje debe ser amable: "Tu foto pesa 14 MB. Necesitamos máximo 10 MB. Bajala desde la cámara con calidad media."
- NO confundir con SPRINT-138: el service hace la primera línea. Las rules de Storage hacen la segunda (defense in depth).
- Sniffing MIME real es opcional. Si complica, dejar solo whitelist por `file.type` declarado (no es perfecto pero ya es 10x mejor que nada).

#### Notas para el coordinator

- Para sniffing: `const buf = await file.slice(0, 12).arrayBuffer()` + comparar bytes.
- archivist PRE-CHANGE: tocar `src/services/solicitudes.service.ts` y `storage.service.ts` son críticos (uso por público).
- regression_guardian: tocar storage.service afecta cierre de órdenes en producción. Revisar.

---

### SPRINT-138 — Crear `storage.rules` versionado + `npm run deploy:storage-rules`

**Estado:** BLOQUEADO — esperando OK Jorge (toca reglas de Storage = config de seguridad productiva)
**Prioridad:** alta (audit forense 2026-05-11 — hallazgo CRÍTICO #5)
**Origen:** Cowork 2026-05-11. Audit forense detectó que `firestore.rules` está versionado en la raíz del repo pero `storage.rules` NO existe. Las reglas de Storage actuales viven solo en Firebase Console — no auditables desde el repo, no diffeables en PR, no protegidas por el flujo `npm run deploy:rules` + lock file.
**Riesgo:** medio (introducir rules nuevas puede bloquear flujos legítimos si están mal escritas). Mitigación: empezar con rules permisivas equivalentes a lo que ya existe en consola, después restringir en sprints separados.
**Touch-list previsto:** `storage.rules` (NUEVO), `storage.rules.deployed.lock` (NUEVO — espejo de `firestore.rules.deployed.lock`), `package.json` (script `deploy:storage-rules`), `scripts/invariantes/marcar-storage-rules-deployadas.ts` (NUEVO), `scripts/invariantes/check-storage-rules-pendientes-deploy.ts` (NUEVO — P-009), `docs/PATRONES_REGRESION.md` (entrada P-009), `scripts/invariantes/run-all.ts` (registrar P-009), `CLAUDE.md` (mencionar el nuevo flujo).

#### Objetivo

Tener `storage.rules` en la raíz del repo como fuente de verdad, con flujo `npm run deploy:storage-rules` que deploya + actualiza lock, y cazador P-009 que bloquea pre-commit si hay diff entre repo y lock. Patrón espejo del que ya existe para `firestore.rules` (sub-regla CLAUDE.md, P-005).

#### Por qué

- Hoy las rules de Storage son una caja negra. Si alguien las cambia en consola, no queda registro en git. Si se pierden, no hay forma de restaurarlas.
- Audit logs y compliance: cualquier auditor pide "muéstreme sus rules de Storage" — sin archivo versionado, la respuesta es "están en la consola, créanos". Eso no escala.
- SPRINT-137 hace validación client-side. Las rules son el cinturón defense in depth — sin storage.rules versionado, no podemos auditar que esa capa existe.
- Patrón meta: si firestore.rules tiene este flujo, storage.rules debe tenerlo. Consistencia operacional.

#### Criterios de aceptación

- [ ] Jorge revisa las rules actuales de Storage en Firebase Console (https://console.firebase.google.com/project/mister-service-app-cloude/storage/rules) y las pega en `BLOQUEOS.md` o las dicta al coordinator. El sprint NO puede empezar sin baseline.
- [ ] `storage.rules` creado en raíz del repo con el contenido baseline + comentarios explicando cada bloque. Estructura sugerida: regla por carpeta (`solicitudes/`, `fotos-servicio/`, `firmas/`, `equipos-taller/`, etc.).
- [ ] Rules siguen el patrón de `firestore.rules`: helper `isSignedIn()`, `request.resource.size < 10 * 1024 * 1024`, `request.resource.contentType.matches('image/.*')`, etc.
- [ ] Carpeta `solicitudes/{solicitudId}/{...}`: write permitido a no autenticados (formulario público) pero con límite de size y contentType.
- [ ] Carpeta `fotos-servicio/{ordenId}/{...}`: write solo si `isSignedIn()` y tiene rol técnico/operaria/admin/coord.
- [ ] Carpeta `firmas/{...}`: write permitido a no autenticados (cliente firma en wizard de cierre) pero solo PNG/SVG y <2 MB.
- [ ] Read público para `fotos-servicio/` y `firmas/` (caller usa `getDownloadURL` que requiere URL pública — verificar el patrón actual).
- [ ] `package.json` agrega script `deploy:storage-rules`: `"deploy:storage-rules": "npx firebase deploy --only storage:rules && tsx scripts/invariantes/marcar-storage-rules-deployadas.ts"`.
- [ ] `scripts/invariantes/marcar-storage-rules-deployadas.ts` NUEVO — hashea `storage.rules` y escribe `storage.rules.deployed.lock` con el hash + timestamp.
- [ ] `scripts/invariantes/check-storage-rules-pendientes-deploy.ts` NUEVO — P-009, espejo de P-005. Compara hash del repo vs lock, bloquea pre-commit si hay diff.
- [ ] `docs/PATRONES_REGRESION.md` entrada P-009 nueva.
- [ ] `scripts/invariantes/run-all.ts` registra P-009.
- [ ] `CLAUDE.md` agrega sub-regla "sprints que tocan `storage.rules` deben deployar antes de cerrar COMPLETADO" — espejo de la sub-regla P-005.
- [ ] Jorge ejecuta `npm run deploy:storage-rules` localmente para inicializar el lock. Coordinator NO ejecuta autónomo (es deploy productivo).
- [ ] Cazadores 8/8 PASS post-deploy.

#### Restricciones / guardarrails

- **REQUIERE OK Jorge en BLOQUEOS.md.** Cowork escribe el sprint con `BLOQUEADO` hasta tener OK explícito.
- Antes de pushear, Jorge debe pegar las rules actuales en `BLOQUEOS.md` para que el baseline coincida con producción y no rompa nada.
- Si Jorge no recuerda qué tiene en consola, el sprint queda esperando hasta que las saque y las pegue.
- archivist PRE-CHANGE obligatorio.
- reviewer obligatorio (sub-regla CLAUDE.md: rules → reviewer con foco en inmutabilidad y defense in depth).
- regression_guardian obligatorio (cualquier cambio de rules es de alto riesgo).
- Después de deploy, smoke test manual: técnico sube foto de cierre, operaria sube foto, cliente firma. Si algo se rompe, revertir.

#### Notas para el coordinator

- El comando `npx firebase deploy --only storage:rules` puede fallar si el proyecto no tiene Storage habilitado (poco probable porque ya se usa) o si no hay default bucket. Verificar `firebase.json` antes.
- Si `firebase.json` no tiene la sección `storage`, hay que agregarla:
  ```json
  { "storage": { "rules": "storage.rules" } }
  ```
- Patrón meta: este sprint reproduce exactamente lo que SPRINT-106 hizo para firestore.rules (P-005). Leer ese sprint como template antes de empezar.

---

### SPRINT-139 — Expiración de `tokenPortalCliente` (mientras orden activa + 30 días)

**Estado:** COMPLETADO 2026-05-11 (commit `d09bdbb` — `tokenPortalClienteExpiraEn` agregado a `OrdenServicio`, helper `tokenPortalClienteValido` en `utils/index.ts`, expiración aplicada al cerrar/cancelar/reprogramar en 4 sitios).
**Prioridad:** media (audit forense 2026-05-11 — hallazgo ALTO #6, mejora higiene de tokens)
**Origen:** Cowork 2026-05-11. Audit forense detectó que `OrdenServicio.tokenPortalCliente` se genera con `crypto.randomUUID()` en `src/utils/index.ts:319` y NO tiene campo de expiración. Si el token se filtra (screenshot de WhatsApp, leak, mail forward), el acceso queda abierto para siempre.
**Riesgo:** bajo (agrega campo opcional + check de validez, no rompe órdenes existentes).
**Touch-list previsto:** `src/types/index.ts` (agregar `tokenPortalClienteExpiraEn?: Timestamp`), `src/utils/index.ts` (helper `calcularExpiracionTokenPortal`), `src/services/ordenes.service.ts` (setear al crear/cerrar), `src/hooks/useOrdenCreateForm.ts` (al crear orden), `src/pages/Mantenimiento.tsx` (al regenerar token), `src/pages/Reprogramaciones.tsx` (idem), `src/pages/public/PortalCliente.tsx` (check de validez antes de mostrar contenido), `src/utils/whatsapp.ts` (link incluye query string con scope si hace falta).

#### Objetivo

Que el `tokenPortalCliente` tenga fecha de expiración explícita: mientras la orden está activa (cualquier fase distinta de `cerrado` y `cancelado`), el token funciona. Una vez la orden pasa a `cerrado` o `cancelado`, el token sigue válido por 30 días más, después se invalida.

#### Por qué

- Decisión Jorge 2026-05-11: "Mientras orden activa + 30 días". Cubre el caso de garantías tempranas y reclamos.
- Higiene de tokens: si un cliente recibe el link por WhatsApp y screenshotea, después de 30 días de cerrada la orden el link queda muerto. Reduce superficie de abuso por links leaked.
- No requiere migración de órdenes existentes: las que no tengan `tokenPortalClienteExpiraEn` se tratan como "expira nunca" (compatible hacia atrás) o "expira al cierre + 30 días" si la orden ya está cerrada (computado dinámicamente).

#### Criterios de aceptación

- [ ] `src/types/index.ts` `OrdenServicio` agrega `tokenPortalClienteExpiraEn?: Timestamp | Date`. Documentar JSDoc: "Caduca 30 días después de cerrar/cancelar la orden. Mientras está abierta, el token funciona sin fecha límite. Si está ausente, se asume comportamiento legacy (sin expiración)."
- [ ] Helper `src/utils/index.ts` `tokenPortalClienteValido(orden: OrdenServicio): boolean`:
  - Si `orden.fase` ∈ {`cerrado`, `cancelado`} y `orden.tokenPortalClienteExpiraEn` existe y `Date.now() > expiracion.toMillis()`, retorna false.
  - Si `orden.fase` ∈ {`cerrado`, `cancelado`} y NO hay `tokenPortalClienteExpiraEn` (legacy), calcular desde `orden.fechaCierre` o `orden.fechaCancelacion` + 30 días.
  - Si `orden.fase` NO está cerrada/cancelada, retornar true siempre.
- [ ] Al setear `fase: cerrado` o `fase: cancelado`, escribir `tokenPortalClienteExpiraEn = Timestamp.fromDate(addDays(new Date(), 30))`. Esto ocurre en:
  - `CierreServicioWizard.tsx` (cierre normal).
  - Cualquier otro punto que setee `fase: cancelado` — buscar con `grep -rn "fase: 'cancelado'" src/`.
- [ ] `src/pages/public/PortalCliente.tsx` al cargar la orden: si `tokenPortalClienteValido(orden) === false`, mostrar pantalla "Este enlace ha caducado. Contactá con nosotros por WhatsApp" + link `wa.me` a la operaria asignada.
- [ ] Cazadores 7/7 PASS.
- [ ] Smoke test manual: cerrar una orden de prueba → abrir el portal con su token → debe funcionar. Setear `tokenPortalClienteExpiraEn` manualmente a ayer en Firestore Console → recargar → debe mostrar "caducado".

#### Restricciones / guardarrails

- NO migrar órdenes existentes. Las legacy se computan dinámicamente desde `fechaCierre`.
- NO romper el flujo de creación: las órdenes nuevas siguen sin expiración hasta que se cierran.
- NO mostrar la fecha de expiración al cliente — solo el cartel "caducado" cuando corresponde.
- Tener en cuenta que `tokenPortalCliente` puede regenerarse (Mantenimiento, Reprogramaciones) — si se regenera, también se debe resetear `tokenPortalClienteExpiraEn` a null.

#### Notas para el coordinator

- archivist PRE-CHANGE recomendado (toca el tipo central `OrdenServicio`).
- regression_guardian recomendado.
- Coordinar con SPRINT-140 (garantía tiene su propio token con su propia expiración).

---

### SPRINT-140 — Expiración de `garantia.token` (alineado a `finFecha` + buffer 7 días)

**Estado:** BLOQUEADO — depende de SPRINT-135a (refactor garantía) cerrado. Si 135a cambia el shape de `garantia`, este sprint se ajusta.
**Prioridad:** media (audit forense 2026-05-11 — hallazgo ALTO #6, mejora higiene de tokens)
**Origen:** Cowork 2026-05-11. Audit forense detectó que `GarantiaInfo.token` (en `src/types/index.ts:288`) es un UUID sin expiración. La garantía sí tiene `finFecha`, pero el token mismo no caduca con ella — si alguien retiene el link después de vencida la garantía, sigue viendo el contenido público y puede confundir flujos.
**Riesgo:** bajo (agrega campo opcional + check, no rompe garantías existentes).
**Touch-list previsto:** `src/types/index.ts` (agregar `tokenExpiraEn?: Timestamp` a `GarantiaInfo`), `src/pages/public/GarantiaCliente.tsx` (check de validez), `src/utils/index.ts` (helper `garantiaTokenValido`), `src/components/cierre/CierreServicioWizard.tsx` (setear al emitir conduce de garantía).

#### Objetivo

Que `garantia.token` tenga fecha de expiración alineada con `garantia.finFecha` + 7 días de buffer (para que un reclamo en el último día tenga ventana razonable). Después de eso, el link queda muerto.

#### Por qué

- Hoy un cliente con link viejo puede entrar a `/garantia/:token` y ver el botón de reclamo, aunque la garantía haya vencido. El botón está deshabilitado por la lógica de `finFecha`, pero la pantalla expone info de la orden + del técnico, que no debería seguir pública para siempre.
- El buffer de 7 días post-`finFecha` cubre el caso "cliente reclama el día 60 a las 11pm" — la lógica de aceptación del reclamo es responsabilidad de 135b/c/d/e, pero el token debe seguir abriendo la pantalla unos días después por si hay disputas o si Jorge necesita revisar.

#### Criterios de aceptación

- [ ] `GarantiaInfo` agrega `tokenExpiraEn?: Timestamp | Date`. JSDoc: "= `finFecha` + 7 días. Si está ausente (legacy), se computa dinámicamente."
- [ ] Helper `garantiaTokenValido(garantia: GarantiaInfo): boolean` análogo al de SPRINT-139.
- [ ] Al emitir conduce de garantía (en `CierreServicioWizard.tsx` u homólogo), setear `tokenExpiraEn = Timestamp.fromDate(addDays(finFecha.toDate(), 7))`.
- [ ] `src/pages/public/GarantiaCliente.tsx` al cargar: si token no válido, mostrar "Esta garantía ha expirado. Contactá con nosotros por WhatsApp."
- [ ] Migración legacy: si `garantia.token` existe pero `tokenExpiraEn` no, computar desde `finFecha + 7 días` al vuelo.
- [ ] Cazadores 7/7 PASS.

#### Restricciones / guardarrails

- **Esperar SPRINT-135a cerrado.** Si 135a renombra o cambia el shape de `GarantiaInfo`, este sprint se reescribe.
- NO sobrescribir tokens de garantías ya emitidas (legacy). Solo aplica para emisiones nuevas.
- NO afectar el flujo de reclamo público (esa es responsabilidad de 135b).

#### Notas para el coordinator

- archivist PRE-CHANGE obligatorio.
- Coordinar con SPRINT-135b/c/d/e en cuanto al UI del reclamo.
- Buffer de 7 días es asunción razonable. Jorge puede pedir más/menos.

---

### SPRINT-141 — App Check enforce (con ventana monitoreo 48h previo)

**Estado:** BLOQUEADO — requiere OK Jorge después de ventana de monitoreo de 48h
**Prioridad:** alta (audit forense 2026-05-11 — hallazgo ALTO #4)
**Origen:** Cowork 2026-05-11. Audit forense detectó que App Check está inicializado en `src/firebase/config.ts:22-42` con reCAPTCHA v3, pero el comentario línea 19 dice *"enforcement se activa manualmente en Firebase Console tras validar"*. Está en modo soft — los requests sin token de attestation no se bloquean. Producción es vulnerable a abuso/scraping desde scripts externos con las API keys públicas.
**Riesgo:** medio. Activar enforce mal calibrado puede bloquear usuarios legítimos si algún flujo no inicializa App Check correctamente (ej: SSR, navegadores muy viejos, modo incognito sin reCAPTCHA). Mitigación: ventana de monitoreo 48h en Firebase Console mirando "App Check verified requests vs unverified" antes de activar enforce.
**Touch-list previsto:** Ninguno en código de la app. Solo:
- `docs/sprints/BLOQUEOS.md` (registro de la ventana de monitoreo).
- `CLAUDE.md` (línea que dice "App Check (currently soft enforcement, not blocking)" → invertir post-deploy).
- `docs/sprints/DIARIO_YYYY-MM-DD.md` (registro del flip).

#### Objetivo

Activar enforce en Firebase Console para Firestore y Storage después de validar 48h que el % de requests "unverified" es <1%.

#### Por qué

- App Check soft no protege nada. Es como tener una cerradura sin trabar.
- Con enforce activo, scripts externos que usen las API keys públicas (que están en el bundle) no pueden escribir a Firestore ni a Storage sin tener un token reCAPTCHA válido emitido por nuestro dominio.
- La ventana de 48h evita el escenario "activé enforce y la app dejó de funcionar para usuarios reales que usan navegadores donde reCAPTCHA falla".

#### Criterios de aceptación

- [ ] Día 0: Jorge confirma OK explícito en BLOQUEOS.md (`OK: jorge 2026-MM-DD HH:MM`).
- [ ] Día 0: coordinator (o Jorge) entra a Firebase Console → App Check → mira la sección "Requests" para Firestore y Storage. Anota baseline: % de requests verified vs unverified durante última semana. Documentar en BLOQUEOS.md.
- [ ] Día 0: NO se activa enforce aún. Se documenta el baseline.
- [ ] Día 0+48h: revisar de nuevo. Si verified >99%, OK para enforce. Si verified <99%, investigar qué flujo no envía token (probablemente algún hook o ruta que no importa `firebase/config.ts` antes de hacer requests).
- [ ] Día 0+48h: Jorge entra a Firebase Console → App Check → Firestore → "Enforce" → ON. Lo mismo para Storage.
- [ ] Día 0+48h: smoke test manual end-to-end con admin, coord, operaria, técnico, secretaria. Crear orden, mover fases, cerrar, abrir portal cliente.
- [ ] Día 0+48h+1h: si todo OK, actualizar `CLAUDE.md` línea relevante: "App Check enforce activo desde YYYY-MM-DD". Si hay regresiones, revertir enforce y abrir sprint diagnóstico.
- [ ] Postmortem-positivo si todo va bien (sub-regla de continuous improvement loop, opcional).

#### Restricciones / guardarrails

- **REQUIERE OK Jorge.** Esto es un cambio operacional, no código.
- NO ejecutar autónomo. Coordinator solo escribe los pasos en BLOQUEOS.md y espera.
- Si en cualquier momento de las 48h aparecen reportes de usuarios "no me deja entrar", abortar.
- Tener listo el rollback: 1 click en Firebase Console para volver a soft mode.
- Considerar activar primero solo Firestore, esperar 24h, después Storage. Reduce blast radius.

#### Notas para el coordinator

- Este sprint no requiere builder/tester/reviewer porque no toca código. Sí requiere devops para monitorear.
- archivist en modo POSTMORTEM si hay incidente.

---

### SPRINT-142 — Refactor `PersonalPage.tsx` (1713 líneas → 3-4 componentes)

**Estado:** COMPLETADO 2026-05-11 (4/4 sub-sprints). PersonalPage 1713→1122 líneas (-591). 4 componentes extraídos a `src/components/personal/`: FormAltaEditarEmpleado (142a `723d0ea`), GruposOperariaTecnico (142c `b45a6ba`), ModalConfirmarEliminar (142b `6a0d10c`), TablaPersonalActivo (142d `1425911`). `src/utils/personal.ts` NUEVO con constantes compartidas.
**Prioridad:** media (audit forense 2026-05-11 — hallazgo ALTO #5, monolito más grande del repo)
**Origen:** Cowork 2026-05-11. Audit forense identificó 4 monolitos (PersonalPage 1713, MapaRutas 1267, Configuracion 1102, Ordenes 1001). Decisión Jorge: solo refactorizar PersonalPage como prueba; los otros 3 quedan como deuda hasta que un sprint los toque.
**Riesgo:** medio. Refactor de archivo crítico (gestión de empleados, alta de usuarios, transferencia de órdenes al eliminar). Mitigación: dividir en 4 sub-sprints (142a..d) con QA visual entre cada uno, igual que SPRINT-117c.
**Touch-list previsto:** `src/pages/PersonalPage.tsx` (rewire), `src/components/personal/` (componentes extraídos).

#### Objetivo

Dividir `PersonalPage.tsx` (1713 líneas) en `PersonalPage.tsx` (~300 líneas, solo orquesta) + 3-4 componentes hijos extraídos a `src/components/personal/`:
- `FormAltaEditarEmpleado.tsx` (form alta/edición) ✅ COMPLETADO 142a.
- `ModalConfirmarEliminar.tsx` (eliminación + transferencia de órdenes) → SPRINT-142b.
- `GruposOperariaTecnico.tsx` (matriz 7+7 de asignaciones) → SPRINT-142c.
- `TablaPersonalActivo.tsx` (tabla agrupada por rol con acciones) → SPRINT-142d + cleanup constantes.

#### Por qué

- Archivos monolíticos son trampa de regresiones. Cada touch sobre PersonalPage tiene riesgo alto porque toca lógica de Auth + permisos + transferencia cross-collection. Recientemente SPRINT-132 + SPRINT-133 tocaron este archivo y casi rompen producción dos veces.
- Componentes chicos permiten unit-testing futuro y revisión más fácil en PR.
- El refactor NO cambia comportamiento — solo mueve código a archivos separados.

#### Criterios de aceptación

- [X] **Sub-sprint 142a — `FormAltaEditarEmpleado`** ✅ COMPLETADO 2026-05-11 (commits implementados directo desde Cowork; PersonalPage 1713→1430 líneas, -284).
- [ ] **Sub-sprint 142b — `ModalConfirmarEliminar`** (riesgo medio, contiene transferencia cross-collection con writeBatch del SPRINT-133).
- [ ] **Sub-sprint 142c — `GruposOperariaTecnico`** (riesgo bajo, bloque solo de render sin handlers locales).
- [ ] **Sub-sprint 142d — `TablaPersonalActivo` + cleanup constantes a `utils/personal.ts`** (riesgo medio, dejar `PersonalPage.tsx` como orquestador delgado ~1067 líneas).

#### Restricciones / guardarrails

- NO mezclar refactor con cambios de comportamiento. Si durante el refactor se encuentra un bug, abrir sprint separado.
- NO romper imports en otros archivos. Verificar con `grep -rn "from.*PersonalPage" src/` antes de cada extracción.
- NO refactorizar `MapaRutas.tsx`, `Configuracion.tsx`, `Ordenes.tsx` — están fuera de scope.
- Sub-sprints procesables uno por uno con `trabaja`. NO procesar todos en una pasada.

#### Notas para el coordinator

- Patrón de referencia: SPRINT-117c (sidebar) usó el mismo approach "1 sub-sprint, QA visual humana, después siguiente". Postmortem-positivo en `docs/postmortems/2026-05-10-rediseno-ia-aprendizajes.md`.
- Bundle de regresión: medir bundle size antes (con `npm run build`) y después de cada sub-sprint. Documentar en cada commit.

---

### SPRINT-142b — Extraer `ModalConfirmarEliminar` de PersonalPage

**Estado:** COMPLETADO 2026-05-11 (commit `6a0d10c`, coordinator autónomo `trabaja`). PersonalPage 1377→1233 líneas (-144). Cazadores 7/7 PASS, build OK. writeBatch + chunking del SPRINT-133 preservados intactos en `handleConfirmarEliminar`. Comentarios `@safe-non-tx` SPRINT-134 follow-up sin tocar.
**Prioridad:** media (sub-sprint de SPRINT-142)
**Origen:** Cowork 2026-05-11. Sub-sprint del refactor PersonalPage. SPRINT-142a ya completado (FormAltaEditarEmpleado extraído).
**Riesgo:** medio. El modal de eliminar contiene la transferencia cross-collection con `writeBatch` que se fixeó en SPRINT-133 (eliminación atómica de técnico/operaria con órdenes activas). Cualquier rewire mal hecho puede dejar el patrón allowlist `@safe-non-tx` colgando o romper la atomicidad. archivist PRE-CHANGE obligatorio.
**Touch-list previsto:** `src/pages/PersonalPage.tsx`, `src/components/personal/ModalConfirmarEliminar.tsx` (NUEVO).

#### Objetivo

Extraer del archivo `PersonalPage.tsx` (líneas ~1197-1359 del JSX + handler `handleConfirmarEliminar` líneas ~688-743) a un componente nuevo `src/components/personal/ModalConfirmarEliminar.tsx`. El componente nuevo encapsula el JSX del modal de confirmación de eliminación. El handler `handleConfirmarEliminar` se queda en PersonalPage por su complejidad (writeBatch + chunking + branches por rol del empleado) y se pasa como callback `onConfirmar`.

#### Por qué

- El modal de eliminar tiene UI específica (input de transferencia, lista de órdenes afectadas, confirmación) que no se reutiliza en otro lado.
- Aislar el JSX permite que el handler complejo (que sí queda en PersonalPage) quede más fácil de leer.
- Reduce ~163 líneas de PersonalPage.

#### Criterios de aceptación

- [ ] Archivo `src/components/personal/ModalConfirmarEliminar.tsx` NUEVO con props:
  - `isOpen: boolean`
  - `onClose: () => void`
  - `personalAccion: Personal | null` (la persona que se va a eliminar)
  - `personal: Personal[]` (lista completa para resolver lista de destinos de transferencia)
  - `ordenes: OrdenServicio[]` (para mostrar cuántas órdenes se transfieren)
  - `transferDestinoId: string` + `setTransferDestinoId: (v: string) => void`
  - `processingAccion: boolean`
  - `onConfirmar: () => Promise<void>`
- [ ] El componente NUEVO solo renderiza JSX (Modal + form de transferencia + botones). NO contiene lógica de DB ni handler de submit.
- [ ] PersonalPage.tsx reemplaza el bloque `<Modal isOpen={showDeleteModal}...>...</Modal>` (líneas ~1197-1359) por `<ModalConfirmarEliminar {...props} />`.
- [ ] `handleConfirmarEliminar` (con `writeBatch` + chunking + branches admin/técnico/operaria/secretaria) SE QUEDA en PersonalPage — solo se renombra a callback que se pasa como prop.
- [ ] El comentario `@safe-non-tx: SPRINT-134 follow-up` y el comentario allowlist de P-003 PERMANECEN exactamente donde están — son críticos para el cazador.
- [ ] PersonalPage reduce de 1430 a ~1267 líneas (-163).
- [ ] Cazadores 7/7 PASS al cerrar. Especialmente P-003 NO debe regresionar (la rule del cazador busca el comentario `@safe-non-tx` o el patrón `writeBatch` — verificar que sigue presente).
- [ ] Typecheck verde. Lint --max-warnings 0 verde.
- [ ] Build OK. Bundle puede subir 1-2kB por overhead de componente.
- [ ] Reviewer obligatorio (toca `handleConfirmarEliminar` que es crítico).

#### Restricciones / guardarrails

- NO refactorizar `handleConfirmarEliminar` para "limpiarlo" — solo se mueve el JSX, NO la lógica. Si el handler se ve feo, queda para otro sprint.
- NO mover el comentario `@safe-non-tx` ni el JSDoc de la mutación cross-collection. Esos comentarios son indicadores para los cazadores.
- NO cambiar el shape de la transferencia (`transferDestinoId` sigue siendo el id del destino — el flujo del SPRINT-133 NO se toca).
- QA manual obligatorio post-deploy: eliminar un técnico de prueba con 2-3 órdenes activas. Verificar que las órdenes se transfieren atómicamente al destino. Si el browser pierde red a mitad, NINGUNA orden debe quedar transferida.

#### Notas para el coordinator

- archivist PRE-CHANGE obligatorio (toca `handleConfirmarEliminar` listado como crítico en CLAUDE.md + sub-regla cleanup).
- regression_guardian obligatorio (toca services flow indirectamente via PersonalPage).
- Patrón: el componente recibe `personal: Personal[]` para listar destinos, NO una función helper. Mantener cohesión local.

---

### SPRINT-142c — Extraer `GruposOperariaTecnico` de PersonalPage

**Estado:** COMPLETADO 2026-05-11 (commit `b45a6ba`, coordinator autónomo `trabaja`). PersonalPage 1450→1377 líneas (-73). Cazadores 7/7 PASS, build OK.
**Prioridad:** baja (sub-sprint de SPRINT-142, bloque solo de render)
**Origen:** Cowork 2026-05-11. Sub-sprint del refactor PersonalPage.
**Riesgo:** bajo. El bloque solo renderiza la matriz operaria→técnicos. Toda la edición vive en `FormAltaEditarEmpleado.tsx` (selectora). No tiene handlers locales ni listeners.
**Touch-list previsto:** `src/pages/PersonalPage.tsx`, `src/components/personal/GruposOperariaTecnico.tsx` (NUEVO).

#### Objetivo

Extraer las líneas ~865-941 de PersonalPage (sección "Grupos operaria-técnico" + tarjeta "Sin asignar") a un componente nuevo `GruposOperariaTecnico.tsx` que solo recibe `personal: Personal[]`.

#### Por qué

- Bloque self-contained de visualización pura.
- Reduce ~77 líneas de PersonalPage.
- Mejora legibilidad — la sección tiene su propio scope semántico.

#### Criterios de aceptación

- [ ] Archivo `src/components/personal/GruposOperariaTecnico.tsx` NUEVO con prop única:
  - `personal: Personal[]`
- [ ] El componente importa `agruparPorRol` desde `utils/roles.ts` (ya existe) y `getTecnicosDeOperaria` (probablemente también, verificar).
- [ ] Renderea heading + grid de tarjetas operaria→técnicos + tarjeta "Sin asignar" para técnicos sin operaria.
- [ ] PersonalPage reemplaza el bloque por `<GruposOperariaTecnico personal={personal} />`.
- [ ] Cazadores 7/7 PASS. Typecheck verde. Lint verde.
- [ ] PersonalPage baja de ~1267 a ~1190 líneas (-77).
- [ ] reviewer recomendado pero NO obligatorio (riesgo bajo, solo JSX).

#### Restricciones / guardarrails

- NO cambiar el algoritmo de agrupación. Mismo `agruparPorRol` que ya se usa.
- NO mover lógica de asignar/quitar operaria (vive en `FormAltaEditarEmpleado` y se queda allí).
- Si la sección usa hooks (`useMemo` para listas filtradas), mantener equivalencia.

#### Notas para el coordinator

- Es el sub-sprint más simple del lote. Procesar rápido para mantener momentum.
- QA manual: abrir `/admin/personal`, verificar que la sección "Grupos operaria-técnico" aparece igual que antes con la matriz 7+7 correcta.

---

### SPRINT-142d — Extraer `TablaPersonalActivo` + consolidar constantes a `utils/personal.ts`

**Estado:** COMPLETADO 2026-05-11 (commit `1425911`, coordinator autónomo `trabaja`). PersonalPage 1233→1122 líneas (-111). Total acumulado lote 142: 1713→1122 = -591 líneas en 4 sub-sprints. `utils/personal.ts` NUEVO single source of truth para ROL_LABELS/ROL_COLORS/ROLES_CON_COMISION/ROL_SELECT_ORDEN/comisionDefaultPorNivel; 4 archivos migrados al import central. Cazadores 7/7 PASS, build OK. **SPRINT-142 padre cerrado como COMPLETADO** (tabla de personal INACTIVO sigue inline — extraerla queda como deuda si Jorge lo prioriza).
**Prioridad:** media (sub-sprint final de SPRINT-142, incluye cleanup de duplicación)
**Origen:** Cowork 2026-05-11. Sub-sprint final del refactor PersonalPage. Cierra la deuda de constantes duplicadas que dejé en SPRINT-142a (`ROL_LABELS`, `ROLES_CON_COMISION`, etc. están en PersonalPage Y en FormAltaEditarEmpleado).
**Riesgo:** medio. Toca varios archivos (PersonalPage + FormAltaEditarEmpleado + módulo nuevo). El módulo `utils/personal.ts` nuevo importa tipos de `types/index.ts`. Sin esto el refactor queda incompleto.
**Touch-list previsto:** `src/pages/PersonalPage.tsx`, `src/components/personal/FormAltaEditarEmpleado.tsx`, `src/components/personal/TablaPersonalActivo.tsx` (NUEVO), `src/utils/personal.ts` (NUEVO).

#### Objetivo

1. **Crear `src/utils/personal.ts`** con las constantes y helpers que hoy están duplicados:
   - `ROL_LABELS: Record<Rol, string>`
   - `ROL_COLORS: Record<Rol, string>`
   - `ROLES_CON_COMISION: Rol[]`
   - `ROL_SELECT_ORDEN: Rol[]` (hoy solo en FormAltaEditarEmpleado)
   - `comisionDefaultPorNivel(nivel: 'junior' | 'senior'): number`
2. **Modificar `FormAltaEditarEmpleado.tsx`** para importar de `utils/personal.ts` en vez de declarar las constantes localmente.
3. **Modificar `PersonalPage.tsx`** para idem.
4. **Crear `src/components/personal/TablaPersonalActivo.tsx`** y mover líneas ~943-1040 del JSX (tabla agrupada por rol con acciones Edit/Link/Desactivar/Eliminar).
5. PersonalPage reduce a ~1067 líneas.

#### Por qué

- Cerrar el refactor: PersonalPage queda como orquestador delgado.
- Eliminar la duplicación de constantes (un solo source of truth).
- Bundle queda más limpio: las constantes se cargan una sola vez.

#### Criterios de aceptación

- [ ] `src/utils/personal.ts` NUEVO con los 5 exports listados.
- [ ] `FormAltaEditarEmpleado.tsx` importa de `utils/personal.ts`. Las declaraciones locales se borran. El comentario "Constantes duplicadas..." se actualiza para reflejar que ya viven en utils.
- [ ] `PersonalPage.tsx` idem.
- [ ] `src/components/personal/TablaPersonalActivo.tsx` NUEVO recibe props:
  - `personal: Personal[]`
  - `onEdit: (p: Personal) => void`
  - `onDesactivar: (p: Personal) => void`
  - `onEliminar: (p: Personal) => void`
  - `onAbrirVincular: (p: Personal) => void`
  - `currentUserId?: string` (para resaltar fila propia si aplica)
- [ ] El componente solo renderiza la tabla agrupada por rol (usa `agruparPorRol` de `utils/roles.ts`).
- [ ] Los handlers `handleEdit`, `abrirModalDesactivar`, `abrirModalEliminar`, `abrirVincularExistente` SE QUEDAN en PersonalPage y se pasan como callbacks.
- [ ] PersonalPage reemplaza el bloque líneas ~943-1040 por `<TablaPersonalActivo {...props} />`.
- [ ] Cazadores 7/7 PASS. Typecheck verde. Lint --max-warnings 0 verde.
- [ ] PersonalPage baja a ~1067 líneas (objetivo del padre SPRINT-142).
- [ ] Bundle build OK. Levantar `npm run build` y confirmar que no aparecen warnings nuevos.
- [ ] Reviewer obligatorio (es el cierre del refactor).
- [ ] archivist PRE-CHANGE obligatorio.
- [ ] Marcar SPRINT-142 padre como COMPLETADO al cerrar.

#### Restricciones / guardarrails

- NO mover handlers (`handleEdit`, etc.) al componente nuevo. Solo el JSX se mueve. Los handlers se quedan en PersonalPage y se pasan como callbacks.
- NO eliminar los comentarios sobre patrones cazadores (`@safe-tecnicoid-id`, `@safe-non-tx`).
- NO romper el orden visual de columnas/filtros de la tabla. Equivalencia 1:1.
- Si hay otros archivos que importen `ROL_LABELS` de PersonalPage o de FormAltaEditarEmpleado, actualizar también esos imports. `grep -rn "ROL_LABELS\|ROL_COLORS\|ROLES_CON_COMISION\|ROL_SELECT_ORDEN\|comisionDefaultPorNivel" src/` antes de empezar.
- QA manual post-deploy: abrir `/admin/personal`, confirmar que la tabla sigue mostrando todos los activos con sus colores de badge correctos, click en cada acción funciona.

#### Notas para el coordinator

- Este es el sprint con más archivos tocados del lote. Hacer en pasada única con cuidado.
- Antes de pushear: build size diff vs antes. Documentar en el commit.
- Postmortem-positivo opcional al cerrar el SPRINT-142 padre (sub-regla de postmortems de éxito, similar al de SPRINT-117c).

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

### SPRINT-135a-UI — Refactor garantía fase 1, parte UI (countdown público desde modelo nuevo + input período en wizard cierre)
- **Completado:** 2026-05-11 por coordinator autónomo (`procesa bloqueos`, pasada 7). OK humano: jorge 2026-05-11 18:25 con scope: ambos (endpoint público + wizard cierre).
- **Hash:** `d0f11d4`.
- **Resultado:** cerrada la fase UI del refactor de garantía iniciado en `75f6c7b`. (a) `CierreServicioWizard.tsx`: nueva sección 4 "🛡️ Período de garantía (días)" con input number (default 60, min 1, max 365), validación visual amber si fuera de rango, deshabilitación del botón "Cerrar Servicio" si `periodoValido === false`. Al cerrar exitosamente, persiste `periodoGarantiaDias` + `garantiaVencimiento` (computado con `calcularVencimiento` del helper SPRINT-135a backend) en `ordenes_servicio/{id}` a nivel orden. (b) `api/garantia/[token].ts` GET handler: agregado fallback no-breaking — si la factura tiene `ordenId`, lee la orden y prefiere `periodoGarantiaDias` / `garantiaVencimiento` / `cierreServicio.fechaCierre` (modelo nuevo) sobre los heredados de `facturas.garantia.*` (modelo viejo). El shape del response NO cambia — `GarantiaCliente.tsx` consume los mismos campos. Try/catch interno garantiza fallback silencioso si la orden no se puede leer. POST handler intacto (cambio a "reactivar la misma orden" es scope de SPRINT-135b).
- **Validación:** `npx tsc --noEmit` PASS · `npm run build` PASS · lint del archivo wizard limpio · cazadores 7/7 PASS · regression_guardian PASS (sin P-XXX aplicables) · reviewer APPROVED (retrocompat endpoint público + UX wizard).
- **Archivist PRE-CHANGE:** historial git revisado: `api/garantia/[token].ts` 3 commits (`51c9ab4` fundación, `6c358af` portal, `1146536` App Check soft) sin hotfixes; `CierreServicioWizard.tsx` 15+ commits con varios fixes históricos de GPS/foto/historialFases pero ninguna recurrencia reciente; `src/utils/garantia.ts` 1 commit (`75f6c7b`). Sin postmortems mencionando estos archivos. Sin P-XXX que apliquen a este touch-list (no toca rules, no toca cross-collection, no toca dropdowns).
- **Plan de QA post-deploy (Jorge ejercita):** (1) cerrar orden con período 1 día → countdown `/garantia/:token` muestra "1 día restante"; (2) setear `garantiaVencimiento` a ayer en Console → estado pasa a "expirada"; (3) cerrar con default 60 → confirmar que `ordenes_servicio/{id}.garantiaVencimiento == fechaCierre + 60d`; (4) órdenes legacy sin `garantiaVencimiento` → endpoint sigue leyendo de `facturas.garantia.*` (fallback).
- **Plan de rollback:** revertir el commit. El cambio es aditivo y retrocompatible — órdenes ya cerradas no se ven afectadas, órdenes legacy siguen funcionando con el modelo viejo.
- **OK humano:** jorge 2026-05-11 18:25 vía `BLOQUEOS.md` (`scope: ambos`).
- **Nota commit:** el commit message declara "QA flujo cierre técnico PENDIENTE — Jorge ejercitará según plan post-deploy" como exige la sub-regla CLAUDE.md de componentes wizard. Sin postmortem (no es bug, es feature completion).

---

### SPRINT-131 — Fix responsive: cards de orden cortadas en iPad portrait
- **Completado:** 2026-05-11 por coordinator autónomo (pasada 2 del día). OK humano: Jorge `trabaja` 2026-05-11.
- **Hash:** `316009e`.
- **Resultado:** `src/components/ordenes/OrdenCard.tsx:68` — breakpoint horizontal del card empujado de `md:` (≥768px) a `lg:` (≥1024px). En iPad portrait (~810px) el card ahora cae a layout column (foto arriba, info al medio, stepper+botones abajo con `flex-wrap`). En desktop ≥1024px el layout horizontal queda idéntico al actual. Mobile sigue column sin regresión. `OrdenCard` solo se usa en `Ordenes.tsx` (admin); el técnico tiene su propia vista.
- **Validación:** `npm run build` OK (tsc + vite) · cazadores 7/7 PASS · lint del archivo modificado limpio · diff de 1 línea de CSS. **QA visual** declarada como SPRINT-131-QA en `BLOQUEOS.md` (coordinator no puede ejecutar DevTools real).
- **Archivist PRE-CHANGE:** sin postmortems previos sobre `OrdenCard.tsx` ni patrón problemático en git log. Riesgo bajo.
- **regression_guardian:** no invocado (cambio CSS aislado, no toca rules/services/context — política del propio sprint).
- **Plan de rollback:** revertir el commit (1 línea).
- **OK humano:** jorge 2026-05-11 (`trabaja` implícito).

---

### SPRINT-117c1 — Renombrar etiquetas sidebar + redirect `/admin/configuracion/usuarios`
- **Completado:** 2026-05-09 por coordinator autónomo. OK humano: Jorge confirmó con `trabaja` el 2026-05-09 (OK implícito de cierre, alineado con cómo se cerró SPRINT-113a).
- **Hash:** `759a76b`.
- **Resultado:** 3 cambios de etiqueta en `Sidebar.tsx` aplicados — (a) `Calendarios` → `Calendarios públicos (Calendly)`, (b) label dinámico Rendimiento (operaria/secretaria ven `Mi rendimiento`, admin/coord ven `Rendimiento`), (c) ítem Catálogo (`/admin/productos`) ocultado con `show: false` (ruta sigue activa por URL). Redirect `/admin/configuracion/usuarios` → `/admin/usuarios` ya existía en `App.tsx` — N/A (sin cambios).
- **Validación:** typecheck + cazadores 7/7 PASS + lint Sidebar.tsx limpio.
- **Plan de rollback:** revertir `759a76b`.
- **OK humano:** jorge 2026-05-09 (`trabaja` implícito).

---

### SPRINT-117c2 — Sección "Bandeja de entrada" en sidebar
- **Completado:** 2026-05-09 por coordinator autónomo. OK humano: Jorge confirmó con `trabaja` el 2026-05-09 (OK implícito de cierre del EN_REVISION_HUMANA + arrancar 117c3).
- **Hash:** `9f71883`.
- **Resultado:** sección nueva `Bandeja de entrada` (id `bandeja_entrada`, icon `Inbox`, defaultExpanded `true`) agrupa los 3 inboxes (Citas por Confirmar, Reprogramaciones, Sugerencias chequeo) extraídos de Operaciones. Props originales preservadas (`to`, `icon`, `show`, `badge`). Sección filtra por `visibleItems.length === 0` (lógica preexistente del render) — si un usuario no tiene permiso a ninguno, la sección no aparece.
- **Validación:** typecheck + cazadores 7/7 PASS + lint Sidebar.tsx limpio + build OK.
- **Plan de rollback:** revertir `9f71883`.
- **OK humano:** jorge 2026-05-09 (`trabaja` implícito).

---

### SPRINT-117c3 — Sección "Cobranza y facturación" en sidebar
- **Estado:** COMPLETADO 2026-05-09 (Jorge probó visualmente y disparó `trabaja` para arrancar 117c4 — OK humano "Jorge confirmó con `trabaja` el 2026-05-09").
- **Hash:** `9c262c9`.
- **Resultado:** sección "Documentos" renombrada in-place a "Cobranza y facturación" (id `cobranza_facturacion`, icon `Receipt`, defaultExpanded `true`). Los 3 ítems del pipeline factura reordenados al orden de pasos consecutivos: **Cotizaciones → Conduces Pendientes (badge `facturacionPendienteCount`) → Conduces de Garantía**. Como los 3 ítems eran toda la sección Documentos, el renombrado in-place absorbe la sección original (no quedan ítems huérfanos). Antes el orden era Cotizaciones / Conduces de Garantía / Conduces Pendientes — ahora Conduces Pendientes va segundo, donde corresponde por flujo. Gates de permisos preservados al 100% (`p('cotizacionesVer')`, `isAdmin || rol==='coordinadora'`, `p('facturasVer')`).
- **Validación:** typecheck clean + cazadores 7/7 PASS 0 hits + lint Sidebar.tsx limpio + build OK (4.14s, bundle 2,652 kB).
- **Plan de rollback:** revertir el commit de cierre. La sección vuelve a llamarse "Documentos" con id `documentos`, icon `FileText`, y orden Cotizaciones / Conduces de Garantía / Conduces Pendientes. Los 3 ítems siguen idénticos en gates, badges y rutas — la reversión es 100% segura.
- **archivist PRE-CHANGE:** último commit en Sidebar.tsx fue `9f71883` (117c2). Patrones a respetar: `SidebarNode`/`SidebarSection` con `items[]`, gates inline con `show:`, badge propagado al renderItem, sección oculta automática si `visibleItems.length === 0`. `comisionTecnicoMonto` denormalización N/A (sólo aplica a FacturacionPendiente.tsx/FacturaCrearModal.tsx, fuera de scope).
- **regression_guardian:** PASS — rutas `/admin/cotizaciones` (App.tsx:229), `/admin/facturacion-pendiente` (App.tsx:254), `/admin/facturas` (App.tsx:230) intactas. Permisos por rol idénticos (diff sólo cambia orden + label/id de sección + icon de sección). Listeners (`facturacionPendienteCount`) sin cambios. Cazadores P-001..P-007 inaplicables al diff (no toca writes Firestore, rules, alta empleado, dropdowns técnico, ni `crearNotificacion`).
- **OK humano:** jorge 2026-05-09 (`trabaja` implícito — Jorge probó visualmente y disparó la cola para arrancar 117c4).

---

### SPRINT-117c4 — Sección "Equipo" + mover Mantenimiento a Operaciones
- **Completado:** 2026-05-09 por coordinator autónomo. OK humano implícito: Jorge confirmó con "si" el 2026-05-09 al iniciar pasada de 117c6 (interpretado como confirmación visual del QA esperado en 117c4); reconfirmado implícitamente con `trabaja` el 2026-05-10 (cierre de lote 117c).
- **Hash:** `480532f`.
- **Resultado:** sección nueva "Equipo" con Personal + Usuarios y Permisos + Reporte de Ponches (extraídos de "Sistema"). Sección "Sistema" queda con Configuración + Plantillas Marketing. "Mantenimientos" movido del top-level al interior de "Operaciones". Gates de permisos preservados al 100%.
- **Validación:** typecheck + cazadores 7/7 PASS + lint Sidebar.tsx limpio + build OK.
- **Plan de rollback:** revertir `480532f`. Personal/Usuarios/Ponches vuelven a Sistema, Mantenimientos vuelve a top-level.
- **OK humano:** jorge 2026-05-09 ("si" implícito) + jorge 2026-05-10 (`trabaja` implícito en cierre lote 117c).

---

### SPRINT-117c6 — Limpiar alias `isAdmin = esAdminOCoord` en Sidebar.tsx
- **Completado:** 2026-05-10 por coordinator autónomo. OK humano implícito: Jorge confirmó con `trabaja` el 2026-05-10 (OK implícito de cierre del EN_REVISION_HUMANA — patrón consistente con 117c1..c4).
- **Hash:** `9b5aee2`.
- **Resultado:** alias `isAdmin = esAdminOCoord` eliminado de `Sidebar.tsx`. Las 16 usages funcionales migradas a `esAdminOCoord` directo: 2 redefiniciones de `isOperaria`/`isSecretaria` (líneas 165-166) + 14 call-sites en `show:` de items. En 4 casos (Conduces Pendientes, Historial Anuladas, Nómina, Estado de Resultado) la cláusula `|| userProfile?.rol === 'coordinadora'` era redundante con `isAdmin` y se eliminó (`A∨B∨B = A∨B` — conjunto resultante idéntico). NO se reemplazó ninguna usage por `'administrador'` literal — el alias siempre evaluó admin+coord. Asistente IA y Plantillas Marketing (admin-literal) NO usaban `isAdmin` — ya tenían `userProfile?.rol === 'administrador'` directo previo a este sprint.
- **Validación:** typecheck clean + cazadores 7/7 PASS 0 hits + lint Sidebar.tsx limpio + build OK (4.11s, bundle 2,651.94 kB — idéntico a baseline 117c4 que era 2,652 kB). Grep exhaustivo post-cambio: `\bisAdmin\b` retorna sólo Sidebar.tsx (comentario de forensia del propio diff, no funcional). Cero referencias en otros archivos del repo.
- **Plan de rollback:** revertir `9b5aee2`. El alias vuelve, el comentario explicativo desaparece, los 4 sitios donde se eliminó `|| 'coordinadora'` redundante recuperan la cláusula. Reversión 100% segura.
- **archivist PRE-CHANGE:** último commit en Sidebar.tsx fue `480532f` (117c4). Patrones a respetar: gates inline con `show:`, identifiers en español, sin emojis, comentario inline + plan de rollback en cada cambio. Sub-regla CLAUDE.md "no ocultar por rol" respetada.
- **regression_guardian:** PASS — semántica de permisos preservada al 100% en las 16 migraciones. Cazadores P-001..P-007 inaplicables al diff (no toca writes Firestore, rules, alta empleado, dropdowns técnico, ni `crearNotificacion`). Verificación adicional: ningún ítem cambia su conjunto de roles que lo ven.
- **reviewer:** APPROVED — cada migración revisada caso por caso. Las 4 simplificaciones lógicas (`isAdmin || 'coordinadora'` → `esAdminOCoord`) son matemáticamente equivalentes (idempotencia de OR sobre conjuntos). Asistente IA y Plantillas Marketing intactos. Comentario de forensia con plan de rollback presente; sin emojis; identifiers en español.
- **OK humano:** jorge 2026-05-10 (`trabaja` implícito).
- **Cierre del lote 117c:** este sub-sprint cierra el lote 117c al 100%. **5 de 6 sub-sprints aprobados ejecutados** (117c1, 117c2, 117c3, 117c4, 117c6); 117c5 fue rechazado por Jorge en el OK selectivo del 2026-05-09 (chocaba con sistema de permisos individuales `usuarios/{uid}.permisos.*`).

---

### SPRINT-117b — Propuesta de reorganización con mockup por rol
- **Completado:** 2026-05-08 noche por coordinator autónomo (novena pasada `trabaja`, sprint read-only).
- **Hash:** (pendiente de commit en este mismo turno).
- **Output:** `docs/sprints/PROPUESTA_IA_2026-05-08.md` (368 líneas, 7 secciones).
- **Resultado:** mockup de sidebar reorganizado por los 6 roles (admin 32 ítems, coord ~30, operaria ~10, secretaria ~8, técnico/ayudante sin cambios), 18 cambios justificados, tabla antes/después de 5 flujos comunes, 6 sub-sprints 117c1..c6 propuestos cada uno con touch-list 1-3 archivos + plan de rollback + riesgo, 4 preguntas abiertas no bloqueantes con defaults razonables.
- **Decisiones zanjadas por Jorge aplicadas sin re-preguntar:** (a) "Web y Solicitudes" admin+coord; (b) `/admin/configuracion/usuarios` redirect 301 a `/admin/usuarios`.
- **Pausa obligatoria respetada:** entrada agregada a `BLOQUEOS.md` esperando `OK: jorge YYYY-MM-DD HH:MM` (o variantes selectivo/cambios/rechazado).
- **Validación:** cazadores 7/7 PASS 0 hits idéntico al baseline (esperado, sin código tocado). Pre-commit hook OK. Sin tester/regression_guardian/reviewer porque no hay diff de código.
- **OK humano:** no requerido para 117b (sprint read-only). Sí requerido para arrancar 117c1..c6 — ver `BLOQUEOS.md`.
- **Próximo paso humano:** Jorge revisa `docs/sprints/PROPUESTA_IA_2026-05-08.md` (10 min de lectura), edita la entrada en `BLOQUEOS.md` con su decisión, pega `procesa bloqueos` al coordinator.

---

### SPRINT-117a — Auditoría focalizada de menús, rutas y módulos
- **Completado:** 2026-05-08 por coordinator autónomo (sprint read-only).
- **Hash:** `f1a89d0`.
- **Output:** `docs/sprints/AUDITORIA_IA_2026-05-08.md` (420 líneas, 6 secciones).
- **Resultado:** 52 rutas inventariadas, sidebar mapeado por rol (44 ítems admin / 17 operaria / 13 secretaria / 0 técnico-ayudante), matriz módulo × rol, top 5 redundancias (Calendario×Calendarios, Dashboard/Agenda/Ordenes/Calendario, Productos/Precios/Inventario, 3 inboxes Citas/Solicitudes/Reprogramaciones, pipeline Cotizaciones/FacturacionPendiente/Facturas), top 5 áreas confusas, apéndice de decisiones técnicas observadas.
- **Hallazgos extra para 117b:** (a) `/admin/usuarios` y `/admin/configuracion/usuarios` duplicados; (b) sección "Web y Solicitudes" gateada por `isAdmin = esAdminOCoord` cuando los items individuales también usan `isAdmin` — coordinadora SÍ los ve aunque el comment de las rutas en App.tsx parecería sugerir admin-only. Validar con Jorge.
- **Validación:** cazadores 7/7 PASS 0 hits idéntico al baseline (esperado, sin código tocado). Pre-commit hook OK.
- **OK humano:** no requerido (sprint read-only autónomo según protocolo).
- **Próximo paso:** SPRINT-117b queda PENDIENTE para próxima pasada de `trabaja` (consume este output como insumo).

---

### SPRINT-118 — Re-migración masiva notis legacy + fix email Wilainy
- **Completado:** 2026-05-08 noche por Jorge (validación humana visual). Cierre disciplina por coordinator: postmortem + cazador P-007 + fix vivo `Dashboard.tsx:216`.
- **Hashes:** `e6ccb1e` (scripts DRY-RUN entregados), `a15846e` (trail coordinator), `b781f80` (cierre Jorge — 41 notis re-migradas + 3 ya alineadas + email Wilainy fixeado), commit de cierre disciplina (este).
- **Resultado:** 41 notificaciones legacy re-migradas + 3 ya alineadas (Yohana idempotencia) = 44 docs procesados. Email Wilainy corregido en Auth + `usuarios/{uid}` de `apnbrito0318@gmail.com` a `Nwilainy@gmail.com`. Audit logs escritos en `auditoria_admin`.
- **Validación humana:** Jorge confirmó visualmente 39 notis aparecen en campanita admin (antes invisibles); reset de contraseña de Wilainy funciona desde GestionUsuarios.
- **OK humano:** jorge 2026-05-08 (`procesa bloqueos` desde `BLOQUEOS.md`).
- **Postmortem:** `docs/postmortems/2026-05-08-notis-legacy-multiples-empleados.md`.
- **Cazador agregado:** P-007 — `scripts/invariantes/check-crearnotificacion-userid-shape.ts`.
- **Fix vivo encontrado durante postmortem:** `src/pages/Dashboard.tsx:216` (`userId: admin.id` → `admin.uid` con filter por `p.uid`).

---

### SPRINT-115 — Diagnóstico + re-migración de notificaciones de Yohana
- **Completado:** 2026-05-08 absorbido por SPRINT-118. La fase write de SPRINT-115 fue ejecutada como subset del scope masivo (3 notis de Yohana entre las 44 totales). Yohana validó campanita post-migración el 2026-05-08.
- **Hashes:** `f6d1d76` (script diagnóstico), `6b4aade` (script re-migración acotada), absorbido en `b781f80` (Jorge corrió el script masivo que cubrió Yohana + 4 empleados más).
- **Resultado:** las 3 notis de Yohana (`F9BV32k4JEoEOk97K4xc`, `TVwtOtmNlzW334IUIUdF`, `VWjdYBRmKgU8rGPlbJAv`) confirmadas alineadas correctamente en campanita post-fix.
- **OK humano:** jorge 2026-05-08.
- **Postmortem:** parte de `docs/postmortems/2026-05-08-notis-legacy-multiples-empleados.md` (mismo bug, scope expandido).

---

### SPRINT-100 — Validar que Yohana ve notificaciones después de b93625d
- **Completado:** 2026-05-08 — Yohana validó campanita visualmente post-migración masiva (SPRINT-118). El sprint tenía como objetivo confirmar que las 3 notis de Yohana eran visibles después de `b93625d`. Diagnóstico SPRINT-115 confirmó que NO eran visibles porque tenían `userId == personalDocId`. Fix masivo SPRINT-118 alineó 41 docs + 3 ya correctos. Yohana confirmó el 2026-05-08 que ve sus notis.
- **Hash:** validación visual humana, sin commit propio (el sprint era QA).
- **OK humano:** jorge 2026-05-08 (relayando confirmación de Yohana).
- **Postmortem:** `docs/postmortems/2026-05-08-notis-legacy-multiples-empleados.md`.

---

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

**Estado:** COMPLETADO 2026-05-10 fase documental, hash `6aae2e5` (`docs/MATRIZ_PERMISOS.md` con 27 flujos × 6 roles + script `scripts/auditoria/schema-drift.ts` read-only + comando `npm run audit:schema-drift`. Smoke test contra prod retornó 65 drift+ y 157 drift- — herramienta funciona. Componente humano — QA manual de las 162 celdas — movido a `BLOQUEOS.md` como SPRINT-112-QA.)
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

### SPRINT-115 — Diagnóstico + re-migración de notificaciones de Yohana — [MOVIDO A HISTÓRICO]

> Sprint completado el 2026-05-08 — ver entrada condensada en sección "Sprints completados (histórico)" más abajo.

<details>
<summary>Spec original (preservado para forensia)</summary>

**Estado:** PAUSADO 2026-05-08 (Jorge decidió absorber el fix dentro del rediseño general de SPRINT-117). Fase diagnóstico COMPLETADA (Caso A confirmado, 3 docs identificados). Fase write tiene script listo (`scripts/re-migrar-notificaciones-yohana.ts` commit `6b4aade`) y dry-run validado por Jorge el 2026-05-08, pero NO se ejecuta `--apply` hasta que SPRINT-117 fase A2 termine y decidamos si re-migrar las 3 notis sueltas o esperar al fix masivo de TODOS los empleados afectados. Yohana sigue sin ver sus 3 notis viejas. **NO procesar autónomo. NO ejecutar `--apply` sin OK explícito de Jorge re-confirmado post-auditoría.**

**desbloqueadoPor:** jorge 2026-05-08
**scriptCommit:** 6b4aade
**ejecucionPendiente:** `npx tsx scripts/re-migrar-notificaciones-yohana.ts --apply`

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

</details>

---

### SPRINT-116 — Auditoría sistémica: email mismatches + notis legacy en TODOS los empleados

**Estado:** ABSORBIDO por SPRINT-117 fase A2 el 2026-05-08. El alcance original (auditoría sistémica de emails y notis legacy en todos los empleados) queda cubierto por la fase A2 de SPRINT-117 que es más amplia (incluye además filtros de queries, relaciones operaria↔técnico, variantes P-001/P-006 en lectura, etc.). NO procesar de forma independiente. Si el coordinator lee este sprint, debe redirigir el trabajo a SPRINT-117 fase A2.
**Prioridad:** ABSORBIDO (referencia histórica)
**Origen:** Tras destrabar SPRINT-115 fase write para Yohana, Jorge intentó cambiar contraseña de Wilainy y la app respondió "No existe usuario con email Nwilainy@gmail.com". El backfill del 2026-05-06 ya había detectado este mismatch (uid `KT9LaszokWNmLCEIe8YOvNKc9rF3` con `usuarios.email=apnbrito0318@gmail.com` ≠ `personal.email=nwilainy@gmail.com`). Jorge sospecha que el patrón se replica.
**Riesgo:** alto en fase B (toca datos en producción). Bajo en fase A (read-only).
**Touch-list previsto:**
- `scripts/auditoria-emails-personal-vs-usuarios.ts` (NUEVO — read-only)
- `scripts/auditoria-notis-legacy-todos.ts` (NUEVO — read-only)
- (Condicional, BLOQUEADO) `scripts/fix-emails-mismatch.ts` (caso por caso, no masivo automático)
- (Condicional, BLOQUEADO) `scripts/re-migrar-notis-legacy-todos.ts` (extensión del script de Yohana al universo completo)

#### Hipótesis

1. **Audit A — emails desalineados:** El backfill del 2026-05-06 reportó solo 1 conflicto sobre 22 empleados. Pero ese script comparaba un subset; un audit más completo puede destapar más casos donde el `personal.email` no matchea el email registrado en Firebase Auth para el mismo `uid`.

2. **Audit B — notis legacy con `userId == personalDocId`:** El bug del Caso A confirmado en Yohana puede repetirse en CUALQUIER empleado que haya recibido notificaciones antes del fix de SPRINT-105 (2026-05-06). Cuántas notis legacy tiene cada empleado, y cuántos están afectados.

#### Objetivo

Auditar el universo completo de empleados (22 docs en `personal/` con `uid` no vacío) y reportar:
1. Cuántos tienen email desalineado entre `personal/` y `usuarios/`.
2. Cuántas notis legacy tipo Caso A/B tiene cada empleado.
3. Para cada hit, IDs exactos de docs problemáticos.

Después decidir con Jorge si:
- El fix de email mismatch es caso-por-caso (UI/manual, ej: corregir desde GestionUsuarios) o script.
- El fix de notis se generaliza al universo completo (script masivo) o se hace usuario por usuario (más conservador).

#### Fase A — auditoría email mismatches (autónoma, read-only)

**Comportamiento esperado de `scripts/auditoria-emails-personal-vs-usuarios.ts`:**

1. Para cada doc en `personal/` con `uid != ''`:
   - Leer `usuarios/{uid}` con Admin SDK.
   - Comparar `personal.email` vs `usuarios.email` (case-sensitive Y case-insensitive separados).
   - Comparar también con `auth.email` real desde `admin.auth().getUser(uid)` (ese es el email canónico).
2. Tabla output:
   - `uid`, `personal.id`, `personal.email`, `usuarios.email`, `auth.email`, `match: ok|case|mismatch`.
3. Resumen final con conteos.
4. Si encuentra alguno con `match: mismatch` (no solo case), proponer en EJECUCION_AUTONOMA.md cuál es el email canónico (probablemente `auth.email`) y qué pasos seguir.

#### Fase B — auditoría notis legacy todos los empleados (autónoma, read-only)

**Comportamiento esperado de `scripts/auditoria-notis-legacy-todos.ts`:**

1. Para cada doc en `personal/` con `uid != ''`:
   - Reusar lógica del script de Yohana, pero parametrizada por uid.
   - Hacer las 4 queries: `userId == auth.uid`, `destinatarioId == auth.uid`, `userId == personalDocId`, `destinatarioId == personalDocId`.
   - Clasificar docs en OK / Caso A / Caso B / OTRO.
2. Tabla output:
   - empleado nombre, rol, conteo OK, conteo Caso A, conteo Caso B, conteo OTRO.
3. Resumen final con conteos globales.
4. Listado de empleados con Caso A o B > 0, ordenado por cantidad descendente.

#### Fase C — fix masivo (BLOQUEADO, requiere OK Jorge en BLOQUEOS.md tras ver fase B)

Si fase B reporta múltiples empleados con notis legacy:

- Generalizar `scripts/re-migrar-notificaciones-yohana.ts` a un script que tome la salida de fase B como input y procese en lote.
- Mantener idempotencia (skip docs ya alineados), dry-run, audit log per usuario.
- Scope: SOLO los uids reportados por fase B con `match: ok` o `match: case`. Si hay email mismatch real, NO migrar notis hasta resolver primero el email (escalar a Jorge).

#### Fase D — fix email mismatches (BLOQUEADO, caso-por-caso)

Si fase A reporta mismatches reales:

- NO escribir un script masivo de fix automático — los mismatches de email son ambiguos y requieren decisión humana ("cuál es el email correcto: el de personal/ o el de Auth?").
- Reportar cada caso individualmente en EJECUCION_AUTONOMA.md.
- Jorge resuelve uno por uno desde la UI de GestionUsuarios o desde el panel de Firebase Auth.
- Si la app no permite cambiar el email del personal/ desde la UI, abrir SPRINT-117 chico para agregar la funcionalidad.

#### Criterios de aceptación

- [ ] `scripts/auditoria-emails-personal-vs-usuarios.ts` corre y genera tabla en stdout.
- [ ] `scripts/auditoria-notis-legacy-todos.ts` corre y genera tabla en stdout.
- [ ] Output capturado en `docs/sprints/AUDITORIA_NOTIS_2026-05-08.md` (markdown con tablas).
- [ ] Si fase A reporta 0 mismatches: marcar fase A COMPLETADA. Si reporta >0: actualizar entrada en BLOQUEOS.md con scope acotado por uid.
- [ ] Si fase B reporta 0 empleados afectados: marcar fase B COMPLETADA y SPRINT-116 entero CERRADO. Si reporta >0: actualizar entrada en BLOQUEOS.md con tabla de uids afectados.
- [ ] Cazadores P-001..P-006 siguen en 0 hits.
- [ ] Sin tocar rules ni código de la app en fases A y B.

#### Restricciones / guardarrails

- Fases A y B son **read-only** y procesables autónomas.
- Fase C **requiere OK Jorge** en `BLOQUEOS.md` con scope listado por uids específicos (no "todos los empleados" en general).
- Fase D **NO se automatiza**. Cada email mismatch se resuelve manual desde la UI o Firebase Console.
- archivist PRE-CHANGE recomendado antes de fase C/D (toca datos sensibles).
- Si la auditoría revela un patrón cualitativamente nuevo (ej: notis con `destinatarioId == "string raro"` no esperado), abrir P-XXX nuevo en `docs/PATRONES_REGRESION.md` + cazador.

#### Notas para el coordinator

- **Reusar máximo posible** del script de Yohana (`scripts/diagnostico-notificaciones-yohana.ts` y `scripts/re-migrar-notificaciones-yohana.ts`). Extraer lógica a helpers compartidos si es necesario.
- Para **Audit A**, considerar usar `admin.auth().getUser(uid)` para obtener el email canónico de Firebase Auth — es la fuente de verdad sobre con qué email el usuario realmente puede loguear.
- Para **Audit B**, generar tabla incluso si todos los conteos son 0 — es valioso confirmar que el universo está limpio.
- Si el coordinator detecta que el problema afecta a >50% de empleados, reportar como "patrón sistémico" y escalar a Jorge antes de proponer fix masivo.
- Postmortem obligatorio si fase B reporta >5 empleados afectados (sub-regla CLAUDE.md "cada bug → cazador" + recurrencia ya documentada en P-XXX históricos).
- Sub-regla "destructive actions": coordinator NO ejecuta fase C/D autónomo aunque tenga OK Jorge previo — siempre confirmar con dry-run primero, mostrar output a Jorge, esperar su "dale al apply".

---

### SPRINT-117 — Rediseño Information Architecture (sprint padre, dividido en 117a + 117b + 117c)

**Estado:** REORGANIZADO 2026-05-08 noche por Cowork. El sprint original era demasiado grande para una sola pasada del coordinator. Se divide en 3 sub-sprints procesados secuencialmente:

- **SPRINT-117a** — Auditoría focalizada de menús, rutas y módulos. Read-only. ~1 pasada autónoma.
- **SPRINT-117b** — Propuesta de reorganización con mockup por rol. Read-only + pausa obligatoria.
- **SPRINT-117c1..N** — Ejecución por fases chicas. Sub-sprints definidos dentro de la propuesta de 117b. BLOQUEADOS hasta que Jorge apruebe.

**Lo que se DESCARTA del scope original** (ahorra tiempo y enfoca en lo que duele):
- Lectura exhaustiva de TODO `src/` archivo por archivo — overkill para reorganizar menús. 117a hace lectura focalizada (solo routing/UI/permisos/index de páginas).
- Auditoría funcional cross-cutting completa — ya cubierta por cazadores P-001..P-007 (todos en 0 hits) + scripts de auditoría sistémica + SPRINT-118 cerrado. Si aparece nuevo vector funcional, se abre sprint propio.

**Avance previo (histórico):** los 2 scripts read-only entregados (`ac54662` + `6defe8f`) cumplieron su función original — destaparon el bug que SPRINT-118 cerró con migración masiva de 5 empleados. Quedan en repo como herramienta de health-check periódico.

**Origen:** Pedido directo de Jorge tras hotfix de Aury y Yohana — sistema con muchos menús que generan fricción cognitiva. Quote: *"fusionar y converger módulos para que el sistema sea más intuitivo y fácil de entender"*.

**Próximo paso humano:** Jorge pega `trabaja` a Claude Code → coordinator arranca SPRINT-117a.

---

### SPRINT-117a — Auditoría focalizada de menús, rutas y módulos

**Estado:** COMPLETADO 2026-05-08 — coordinator autónomo. Output `docs/sprints/AUDITORIA_IA_2026-05-08.md` creado (420 líneas, 6 secciones). Cazadores 7/7 PASS, 0 hits. Trail completo en histórico abajo.

---

### SPRINT-117b — Propuesta de reorganización con mockup por rol — [MOVIDO A HISTÓRICO]

> Sprint completado el 2026-05-08 por coordinator autónomo (novena pasada `trabaja`). Ver entrada en sección "Sprints completados (histórico)" más abajo.

<details>
<summary>Spec original (preservada para forensia)</summary>

**Estado:** PENDIENTE — depende de SPRINT-117a completado.
**Prioridad:** alta (precondición de 117c)
**Riesgo:** bajo (read-only, output es un documento de propuesta)
**Touch-list previsto:** ninguno de código. Crea `docs/sprints/PROPUESTA_IA_2026-05-08.md`. Agrega 1 entrada a `docs/sprints/BLOQUEOS.md`.

#### Objetivo

Tomar la auditoría de 117a y proponer una reorganización concreta del sidebar y módulos por rol. Output legible para Jorge (no programador) que pueda decir "OK", "OK pero cambiá X", o "no me convence Y".

#### Tareas

1. **Mockup textual del nuevo sidebar por cada rol** (admin, coord, operaria, secretaria, técnico, ayudante). Formato: lista anidada con grupos.
2. **Para cada cambio respecto al actual, justificar en 2-3 líneas:** qué fricción resuelve, qué rol se beneficia más, riesgo de romper algo (bajo/medio/alto).
3. **Tabla antes/después** — para los 5 flujos más comunes (crear orden, iniciar chequeo, facturar, ver órdenes pendientes, agendar cita): cuántos clicks toma hoy vs cuántos con la propuesta.
4. **Plan de sub-sprints 117c1..N** — cada uno con touch-list de 1-3 archivos máximo, cambio concreto, plan de rollback ("qué pasa si Jorge dice no me gusta"), riesgo.
5. **Pausa obligatoria al final:**
   - Marcar SPRINT-117b como COMPLETADO.
   - Crear entrada en `BLOQUEOS.md`: *"SPRINT-117c esperando aprobación de Jorge sobre `docs/sprints/PROPUESTA_IA_2026-05-08.md`. Para desbloquear, editar la entrada con `OK: jorge YYYY-MM-DD` o `OK selectivo: 117c1, 117c3` o `Cambios: <feedback>`"*.
   - **NO arrancar 117c**. Volver a Jorge.

#### Decisiones de Jorge (zanjadas el 2026-05-08 noche)

Las 2 ambigüedades que SPRINT-117a marcó "requiere validar con Jorge" quedan resueltas así (Jorge confirmó vía Cowork). El builder NO debe parar a preguntar de nuevo:

1. **"Web y Solicitudes" — visible para admin Y coordinadora.** La coord triagea solicitudes públicas + citas por confirmar; tiene sentido que las vea. NO mostrar a operarias, secretarias, técnicos.
2. **`/admin/configuracion/usuarios` — eliminar como ítem visible del sidebar pero dejar como redirect 301 a `/admin/usuarios`.** Patrón consistente con resto del repo (CLAUDE.md regla "Keep redirects when renaming routes"). Bookmarks/links viejos siguen funcionando.

Si al ver el mockup Jorge cambia de opinión sobre cualquiera de estas dos, lo dirá en `BLOQUEOS.md` y el coordinator ajusta antes de arrancar 117c.

#### Consideraciones para el builder

- **Operaria/secretaria** son los roles con más fricción hoy (tocan muchos módulos por cada orden). Priorizar simplificar su sidebar.
- **Técnico** está en mobile, en el sitio del cliente, con poco tiempo. Su sidebar debe ser ultra simple: ver sus citas, iniciar chequeo, cerrar servicio. Nada más.
- **Admin/coord** son power users, toleran más complejidad pero igualmente prefieren menos items en sidebar.
- **NO renombrar identificadores internos** (`enStandby`, `StandbyPieza`, colección `standby_piezas`). Solo etiquetas visibles al usuario.
- **Mantener redirects** desde rutas viejas si se mueve algo — los empleados pueden tener bookmarks o links de WhatsApp viejos.

#### Criterios de aceptación

- [x] `docs/sprints/PROPUESTA_IA_2026-05-08.md` creado con las 4 secciones + plan de sub-sprints.
- [x] Entrada agregada a `BLOQUEOS.md` esperando OK de Jorge.
- [x] SPRINT-117b marcado COMPLETADO en `COLA_AUTONOMA.md`.
- [x] NO arrancar SPRINT-117c1 — esperar feedback humano.
- [x] Commit + push con mensaje descriptivo en español.

</details>

---

### SPRINT-117c1..N — Ejecución por fases chicas (DESBLOQUEADO 2026-05-09 con OK selectivo)

**Estado:** EXPANDIDO en sub-sprints 117c1, 117c2, 117c3, 117c4, 117c6 (todos PENDIENTE más abajo). 117c5 RECHAZADO por Jorge con motivo documentado en `BLOQUEOS.md`.

**desbloqueadoPor:** jorge 2026-05-09 | OK selectivo en `BLOQUEOS.md` entrada SPRINT-117c.

Cuando Jorge dispara `trabaja`, el coordinator procesa **uno por uno con QA visual humana entre cada deploy** (NO en lote). Cada sub-sprint hace commit + push + deploy independiente y el coordinator se detiene a esperar feedback humano antes del siguiente.

#### Restricciones globales para fase C (aplican a TODOS los sub-sprints 117cN)

- **archivist OBLIGATORIO en modo PRE-CHANGE** antes de cada sub-sprint — `Sidebar.tsx`, `App.tsx`, `Ordenes.tsx`, `TecnicoVista.tsx` están en la lista de archivos críticos.
- **regression_guardian OBLIGATORIO** antes de commit (toca `src/components/`).
- **Touch-list acotado** — 1-3 archivos por sub-sprint. Si necesita más, dividir.
- **Plan de rollback explícito** — el commit message dice qué revertir si Jorge dice "no me gusta".
- **QA visual obligatorio** — antes de procesar el siguiente sub-sprint, Jorge mira el cambio en producción y confirma con su equipo (Aury técnico, Wilainy/Yohana operarias). Si alguien dice "perdí X", restaurar X antes de seguir.
- **Mantener redirects** desde rutas viejas si se mueve algo.
- **Sub-regla "documentación viva"** — al cerrar cada sub-sprint, actualizar `CLAUDE.md` con el cambio de IA si aplica.
- **Recordatorio explícito de Jorge:** la reorganización SOLO agrupa y renombra etiquetas. NO agrega lógica de "este ítem se oculta si rol === X". Los permisos individuales (`usuarios/{uid}.permisos.*`) siguen siendo la fuente de verdad. Cualquier ítem visible debe seguir respetando esos permisos.
- **Postmortem-positivo al final** — cuando los 5 sub-sprints aprobados cierren OK, archivist genera `docs/postmortems/2026-05-XX-rediseno-ia-aprendizajes.md` documentando el approach. NO es bug, pero el aprendizaje vale para futuros rediseños grandes.

---

### SPRINT-117c1 — Renombrar etiquetas + verificar redirect `/admin/configuracion/usuarios` — [MOVIDO A HISTÓRICO]

> Sprint completado el 2026-05-09 — Jorge confirmó con `trabaja` (OK implícito de cierre). Ver entrada condensada en sección "Sprints completados (histórico)" más abajo.

**Estado:** COMPLETADO 2026-05-09 (hash `759a76b`)
**Prioridad:** alta (primero del lote — base de confianza)
**Origen:** OK selectivo de Jorge 2026-05-09 sobre `docs/sprints/PROPUESTA_IA_2026-05-08.md` §4 SPRINT-117c1.
**Riesgo:** bajo (cambia strings + verifica 1 redirect ya existente).
**Touch-list previsto:** `src/components/Sidebar.tsx`, `src/App.tsx` (verificar/agregar redirect 301).

#### Objetivo

Aplicar 3 cambios concretos de etiqueta + verificar redirect, sin alterar comportamiento funcional:

1. Sidebar: renombrar label visible `Calendarios` → `Calendarios públicos (Calendly)`. NO cambiar la ruta `/admin/calendarios` ni el componente. Solo el string del label.
2. Sidebar: renombrar label `Rendimiento` → `Mi rendimiento` **solo para operaria/secretaria**. Admin/coord siguen viendo `Rendimiento` (sin cambios).
3. Sidebar: ocultar el ítem "Catálogo legacy" / "Productos" (`/admin/productos`) si todavía aparece en sidebar admin. La ruta debe seguir activa (accesible por URL hasta que sprint propio futuro la elimine del routing).
4. App.tsx: verificar que `/admin/configuracion/usuarios` exista como redirect 301 a `/admin/usuarios`. Si NO existe, agregarlo. Si ya existe, no tocar.

#### Por qué

- "Calendarios" se confunde con "Calendario" (distintos: uno son calendarios públicos Calendly, el otro es la grilla interna). Aclarar con paréntesis sin renombrar identificadores.
- "Rendimiento" para operaria/secretaria es vista propia (su KPI), no panel global. Renombrar a "Mi rendimiento" señala eso.
- Catálogo legacy (`Productos`) es deuda histórica. Ocultarlo del sidebar reduce ruido sin romper imports.
- `/admin/configuracion/usuarios` ya estaba decidido eliminar como ítem visible — verificar que el redirect exista para bookmarks viejos.

#### Criterios de aceptación

- [ ] `Sidebar.tsx`: label de Calendarios cambiado a `Calendarios públicos (Calendly)`. Ruta intacta.
- [ ] `Sidebar.tsx`: label de Rendimiento dinámico — `Mi rendimiento` para operaria/secretaria, `Rendimiento` para admin/coord. Sin cambiar lógica `show:`.
- [ ] `Sidebar.tsx`: ítem que apunta a `/admin/productos` (Catálogo / Productos) tiene `show: false` o se elimina del array para admin (verificar primero si está; si NO está, no agregar nada).
- [ ] `App.tsx`: existe ruta `<Route path="configuracion/usuarios" element={<Navigate to="/admin/usuarios" replace />} />` o equivalente. Si no, agregarla.
- [ ] Tester: typecheck + lint + cazadores 7/7 PASS.
- [ ] regression_guardian: PASS (sin cambios a rules/services/context, solo etiquetas y redirect).
- [ ] reviewer: APPROVED.
- [ ] Commit con mensaje en español + plan de rollback.
- [ ] Push + deploy Vercel Ready.

#### Restricciones / guardarrails

- NO cambiar identificadores internos (`enStandby`, `productos` collection, etc.).
- NO cambiar permisos / `puede(...)` / arrays `show:` para operaria/secretaria distintos a lo descrito (ese es 117c5 RECHAZADO).
- NO crear nueva ruta — solo verificar redirect existente y agregar si falta.
- Plan de rollback: revertir el commit. Solo strings y 1 redirect — operación segura.
- Sub-regla "documentación viva": si se actualiza `CLAUDE.md`, mencionarlo en commit message.

#### Notas para el coordinator

- archivist PRE-CHANGE obligatorio para `Sidebar.tsx` (archivo crítico).
- Builder debe leer `Sidebar.tsx` completo para entender la estructura `SidebarNode` antes de tocar.
- El gating del label "Mi rendimiento" debe respetar los roles **sin agregar nueva lógica de `show:`** — solo es un string condicional. Patrón: `label: rol === 'operaria' || rol === 'secretaria' ? 'Mi rendimiento' : 'Rendimiento'`.
- Verificar primero si el ítem `/admin/productos` está actualmente en el sidebar admin — si no, ese criterio queda como N/A documentado en el commit.

---

### SPRINT-117c2 — Crear sección "Bandeja de entrada" en sidebar — [MOVIDO A HISTÓRICO]

**Estado:** COMPLETADO 2026-05-09 (cierre confirmado con `trabaja` el 2026-05-09).

Ver entrada en "Sprints completados (histórico)" más arriba (hash `9f71883`).

---

### SPRINT-117c3 — Sección "Cobranza y facturación" en sidebar — [MOVIDO A HISTÓRICO]

**Estado:** COMPLETADO 2026-05-09 (cierre confirmado con `trabaja` el 2026-05-09).

Ver entrada en "Sprints completados (histórico)" más abajo (hash `9c262c9`).

---

### SPRINT-117c4 — Crear sección "Equipo" + mover Mantenimientos a Operaciones — [MOVIDO A HISTÓRICO]

**Estado:** COMPLETADO 2026-05-10 (cierre confirmado con `trabaja` el 2026-05-10 tras QA visual implícito de Jorge en lote 117c).

Ver entrada en "Sprints completados (histórico)" más arriba (hash `480532f`).

---

### SPRINT-117c6 — Limpiar alias `isAdmin = esAdminOCoord` en Sidebar.tsx — [MOVIDO A HISTÓRICO]

**Estado:** COMPLETADO 2026-05-10 (cierre confirmado con `trabaja` el 2026-05-10 — OK implícito de Jorge tras QA visual).

Ver entrada en "Sprints completados (histórico)" más arriba (hash `9b5aee2`). **Lote 117c cerrado al 100%** (5/6 sub-sprints aprobados ejecutados; 117c5 fue rechazado por Jorge en el OK selectivo del 2026-05-09).

---

#### (Eliminado: spec original de SPRINT-117 con A1+A2+A3 exhaustivos)

> El detalle anterior se descartó por overkill. La versión nueva (117a + 117b + 117c) cumple el mismo objetivo (reorganizar el sistema para que sea más intuitivo) sin la lectura exhaustiva de TODO `src/`. Si en algún momento aparece la necesidad de auditoría funcional cross-cutting completa, se abre sprint propio (no parte de 117).

_(spec original descartada por overkill — la versión vigente de SPRINT-117 está dividida en 117a + 117b + 117c arriba)_

---

### SPRINT-118 — Re-migración masiva notis legacy (5 empleados, ~44 docs) + fix email Wilainy en Auth — [MOVIDO A HISTÓRICO]

> Sprint completado el 2026-05-08 — ver entrada condensada en sección "Sprints completados (histórico)" más abajo.

<details>
<summary>Spec original (preservado para forensia)</summary>

**Estado:** EN_REVISION_HUMANA (scripts entregados en DRY-RUN; Jorge ejecuta `--apply` manualmente)
**desbloqueadoPor:** jorge 2026-05-08 (movido desde `BLOQUEOS.md` por coordinator vía `procesa bloqueos`).
**Builder/Tester/Reviewer:** completados por coordinator 2026-05-08. Ver `docs/sprints/EJECUCION_AUTONOMA.md` para trail.
**Prioridad:** alta
**Origen:** Auditoría 2026-05-08 con `scripts/auditoria-notis-legacy-todos.ts` + `scripts/auditoria-emails-personal-vs-usuarios.ts` (entregados en SPRINT-117 fase A2 read-only `ac54662` + `6defe8f`). Output identificó 44 notificaciones Caso A en 5 empleados + email mismatch de Wilainy en Firebase Auth.
**Riesgo:** medio — toca datos productivos en `notificaciones` (~44 docs scope acotado por uid, NO masivo) + Firebase Auth de Wilainy. Mitigación: scripts con DRY-RUN por default, `--apply` manual por Jorge.
**Touch-list previsto:**
- `scripts/re-migrar-notificaciones-masivo.ts` (NUEVO — generaliza `re-migrar-notificaciones-yohana.ts` con scope hardcodeado a 5 uids)
- `scripts/fix-email-wilainy.ts` (NUEVO — Admin SDK update Auth + usuarios)
- Eventualmente `docs/postmortems/2026-05-08-notis-legacy-multiples-empleados.md` (post-aplicación de Jorge).

#### Objetivo

Entregar 2 scripts ejecutables que (a) re-migren 44 notificaciones Caso A apuntando `userId` a `auth.uid` correcto en 5 empleados específicos (Yohana, Wilainy, Jorge, misterservicerd, Maria Teresa) y (b) corrijan el email de Wilainy en Firebase Auth + `usuarios/{uid}` para que `Nwilainy@gmail.com` sea el email canónico (Wilainy tiene acceso a esa casilla; el actual `apnbrito0318@gmail.com` no le pertenece).

#### Por qué

- Yohana, Wilainy, Maria Teresa, Jorge y misterservicerd no ven sus notificaciones legacy porque `userId` apunta a `personalDocId` en lugar de `auth.uid` (Caso A confirmado en auditoría 2026-05-08).
- Wilainy no puede recibir reset de contraseña en Firebase porque el email registrado en Auth (`apnbrito0318@gmail.com`) no le pertenece. Jorge confirmó que `Nwilainy@gmail.com` (con N mayúscula) es la casilla a la que ella tiene acceso.

#### Scope autorizado (acotado por uid, NO masivo)

| Empleado | uid | personalDocId | Notis Caso A |
|---|---|---|---|
| Yohana Operaria | `HGkVoYpGKzL4JJI7FnTpHjdsM972` | `zFhokrDoPH9lD63ZxKAY` | 3 |
| Wilainy Operaria | `KT9LaszokWNmLCEIe8YOvNKc9rF3` | `j944265Su9Hyw29YQTj8` | 14 |
| Jorge (admin) | `dN2wxlTrLUMAff1gE2K4Q8IXi2m2` | `63ZMIT2LouKFLpBCQLUk` | 9 |
| misterservicerd (admin) | `kAKPMRLe8aaAJxCrvyc8YeMoxRG3` | `GqJfIoRgP4GJTAActUKy` | 9 |
| Maria Teresa (coord) | `HgakSUkclXSyxmBeLm3GkayFOK63` | `NXFORv7bqeksSg980icg` | 9 |

**IDs específicos de docs Caso A** (output exacto del script `auditoria-notis-legacy-todos.ts` ejecutado el 2026-05-08):

- **Yohana** (3): `F9BV32k4JEoEOk97K4xc`, `TVwtOtmNlzW334IUIUdF`, `VWjdYBRmKgU8rGPlbJAv`.
- **Wilainy** (14): `2tPkAmQymtZgMLRRQfTr`, `451UPKpR2vAmsCpsoFNv`, `8WdJHYbEYdZ4wUc4eQnE`, `BgAsQHZMPEfa3LL8ffyV`, `DpQh90B38dmVjSEJVxFv`, `ERtDuPDxeUXph8b8cSNv`, `FMnk6RpFQyxiYRiKZQln`, `JHa0TPJpGVH3OpzPPlV1`, `PFRnT9GuahrydO8g8Hhz`, `Q2Z0pBdjwo6vyK04koPZ`, `SV5DhnuxPwEOCwBwNt2t`, `vKdH6Q9dLRRYQZFUolNY`, `vfbmwla7698GcANVUShS`, `zWWMGk1UFV75sAjaOoVu`.
- **Jorge** (9): `5CZ6039fqvtRyGpiNseM`, `cWDqvmuXpFJptULZ3eOD`, `fjW4YYIq74MtaneORrCD`, `gzSt5SBjTJBRmDmB1rUq`, `lFOU7YDdREy6Rauyyp0q`, `xBUxbB10ocEH2kjLADIl`, `zisaxTDaX1vGmj6Cq9mu`, `3hV65FcsI4HJ3Q0nc4Dv`, `o5yco816RhNGwquDv8P1`.
- **misterservicerd** (9): `4WEMXrqqrAZyoxd7CfQs`, `RXpcWGzERPpfnhc8IwcR`, `WMansj9afOAJcFJbTvuH`, `eFKbcOHszof28K3NVL9s`, `k8dH5RIfMKeBx3QDHagB`, `uRyZuUceQPnSgPBqNgtV`, `xpZLRggHAA8goPfJ1Vhf`, `SZe4ymcOeFWDgH9WFZDj`, `T477a42VXV0oguzrZcTh`.
- **Maria Teresa** (9): `DUZFo0j9pXuKL6oRYPZn`, `DVnPHlYFH838E0xbOVWt`, `LZKL5vbYCoUY4eueQOmW`, `Oyz2NElDajHl2jDOlnD9`, `jU1r9gmKH1oDBQPSMeXG`, `pEwGvpvP0Fo8BUhf2Npc`, `zv8qZ3oq97AXsaPKOCai`, `XqrPkWoGtK65EGrf6yx0`, `rrtigrKrsHyJgNKrprTX`.

#### Fase 1 — Script `scripts/re-migrar-notificaciones-masivo.ts`

1. Generalizar `scripts/re-migrar-notificaciones-yohana.ts` → nuevo script `scripts/re-migrar-notificaciones-masivo.ts`.
2. Scope hardcodeado a los 5 uids listados arriba (NO masivo a toda la colección).
3. Para cada doc de la lista de IDs autorizados:
   - `update` que setea `userId = <uid correspondiente>`.
   - Idempotencia: si `userId` ya es ese valor, skip.
4. NO tocar `destinatarioId` (la lectura dual del service ya lo soporta).
5. NO tocar otros campos (leida, leidaEn, tipo, titulo, descripcion).
6. Logear cada doc tocado con shape antes/después en stdout.
7. DRY-RUN por default; `--apply` explícito requerido.
8. Después de ejecución real, escribir entrada en `auditoria_admin` con `accion: 'remigracion_notificaciones_masivo'`, `actorUid`, `docsAfectados: [44 ids]`, `empleadosAfectados: [5 uids]`.

#### Fase 2 — Script `scripts/fix-email-wilainy.ts`

**Email correcto confirmado por Jorge:** `Nwilainy@gmail.com` (con N mayúscula).

**Estado actual:**
- `personal/{j944265Su9Hyw29YQTj8}.email` = `Nwilainy@gmail.com` ✓ (ya correcto, no tocar).
- `usuarios/{KT9LaszokWNmLCEIe8YOvNKc9rF3}.email` = `apnbrito0318@gmail.com` (incorrecto).
- Firebase Auth `users/{KT9LaszokWNmLCEIe8YOvNKc9rF3}.email` = `apnbrito0318@gmail.com` (incorrecto).

**Acción del builder:**

1. Crear `scripts/fix-email-wilainy.ts` con Admin SDK.
2. Operaciones:
   - `admin.auth().updateUser(uid, { email: 'Nwilainy@gmail.com' })`.
   - `usuarios/{uid}.email` setear a `Nwilainy@gmail.com`.
3. NO tocar contraseña, NO crear nuevo user, NO eliminar el viejo.
4. Audit log en `auditoria_admin`.
5. **Wilainy debe tener acceso a la casilla `Nwilainy@gmail.com` para resets de contraseña futuros**. Jorge confirmó este punto.
6. DRY-RUN por default; `--apply` explícito requerido.

#### Criterios de aceptación

- [ ] `scripts/re-migrar-notificaciones-masivo.ts` creado con scope hardcodeado a los 5 uids + 44 ids enumerados.
- [ ] `scripts/fix-email-wilainy.ts` creado con `admin.auth().updateUser` + `usuarios/{uid}.email` update.
- [ ] Ambos scripts en DRY-RUN por default. `--apply` requerido para ejecución real.
- [ ] Idempotencia: re-ejecución no doble-aplica (skip si ya está en estado destino).
- [ ] Audit log en `auditoria_admin` después de `--apply`.
- [ ] Tester (typecheck + lint + cazadores 6/6) PASS.
- [ ] regression_guardian PASS (scripts server-side Admin SDK no aplican P-001..P-006, pero validar que no aparezcan en otros archivos como side effect).
- [ ] Reviewer APPROVED.
- [ ] Commit + push + deploy Vercel Ready.
- [ ] Postmortem `docs/postmortems/2026-05-08-notis-legacy-multiples-empleados.md` creado al cerrar (sub-regla CLAUDE.md "5+ empleados afectados").
- [ ] Considerar agregar P-XXX nuevo al catálogo: cazador health-check periódico (`npm run audit:notis-legacy`) que avisa si aparecen nuevos casos.

#### Restricciones / guardarrails

- **Coordinator NO ejecuta `--apply` autónomo.** Jorge corre dry-run primero, después decide si aplicar. Restricción explícita del OK de Jorge.
- Cada fase tiene script propio. Builder los entrega ambos en el mismo sprint.
- Validación humana post-`--apply` (Jorge):
  - Yohana, Wilainy, Maria Teresa hacen hard refresh y reportan que ven sus notificaciones nuevas.
  - Jorge intenta cambiar contraseña de Wilainy desde GestionUsuarios y confirma que ya no tira "no existe usuario".
- NO autorizado (requiere OK separado):
  - Migrar notificaciones de OTROS usuarios fuera de los 5 listados.
  - Tocar `firestore.rules` (si encuentra rule gap durante el fix, escalar a Jorge).
  - Borrar notis o cambiar campos no listados.
  - Hacer cambio de email para usuarios distintos a Wilainy.

#### Notas para el coordinator

- Builder debe basarse en patrón existente `scripts/re-migrar-notificaciones-yohana.ts` (entregado en sprints anteriores) — revisar shape exacto y seguir convención.
- Audit log shape: ver patrón en otros scripts del repo que escriben a `auditoria_admin`.
- Postmortem va al final del sprint **después** de que Jorge confirme `--apply` exitoso. Si Jorge solo aplica fase 1 y deja fase 2 para más tarde, el postmortem de fase 2 queda como TODO en BLOQUEOS.md.

</details>
