# Catálogo de patrones de regresión

> Cada entrada aquí corresponde a un bug real que rompió producción.
> El cazador automático se referencia por archivo. Los falsos positivos
> se manejan con allowlist en el header del cazador, NO desactivando.

---

## P-001 — `userProfile.id` usado donde se requiere `auth.uid`

**Bug original:** `afc5e4a` (Reactivación, 2026-05-05) y `b93625d` (Notificaciones, 2026-05-06).

**Síntoma:** Permission-denied silencioso para usuarios cargados vía cascada
`personal/` (operarias/secretarias/técnicos). Para administradores con doc
en `usuarios/{uid}` pasa desapercibido.

**Causa raíz:** `AppContext` carga el perfil desde `usuarios/{uid}` (donde
`id == uid`) o, fallback, desde `personal where email==` (donde `id == doc id de personal`).
Las rules de Firestore validan `request.auth.uid`, no el `userProfile.id`.

**Regla:** cualquier write/read gateado por una rule del estilo
`X == request.auth.uid` debe usar `currentUser.uid` del context, NO
`userProfile.id`.

**Cazador:** `scripts/invariantes/check-userprofile-id-misuse.ts`.

**Allowlist:** ninguna en el momento de creación. Si aparecen falsos
positivos, agregarlos al header del cazador con comentario.

---

## P-002 — Rule de inmutabilidad sobre campo opcional sin `.get()`

**Bug original:** `c7c8e34` (Reactivación rules, 2026-05-05). Variante `!=`:
`b7b6464` (modificaPrecioFinal Iniciar Chequeo Aury, 2026-05-07).

**Síntoma:** Permission-denied al hacer update normal (no overrideado) en una
campaña/orden. Sólo aparece cuando el campo opcional está ausente en el doc.

**Causa raíz:** Acceder `request.resource.data.X == resource.data.X` (o
`!=`) sólo funciona si `X` está garantizado present desde el primer create.
Para campos opcionales/condicionales, ambos lados pueden estar missing y
Firestore Rules tira evaluation error sobre el acceso directo, rechazando
con permission-denied. No resuelve `null == null` ni `null != null` desde
acceso directo.

**Regla:** rules que comparan campos opcionales (existencia condicional)
deben usar `request.resource.data.get('X', null) == resource.data.get('X', null)`
(o `!=`).

**Cazador:** `scripts/invariantes/check-rules-immutability.ts` — escanea
`firestore.rules` buscando comparaciones directas (`==` y `!=`) en campos
que no aparecen como required en las funciones de validación de la misma
rule. La cobertura de `!=` se sumó en SPRINT-108 (2026-05-07) tras el bug
de Aury Mon — la versión inicial solo cubría `==` y dejó pasar el caso
`modificaPrecioFinal != precioFinal`.

**Allowlist:** la rule debe documentar en comentario qué campos son
required (existencia garantizada) para que el cazador no grite.

---

## P-003 — Mutación cross-collection sin `runTransaction`

**Bug original:** patrón establecido en gotcha CLAUDE.md, riesgo activo en
features futuras.

**Síntoma:** Estado inconsistente cuando una mutación toca 2+ colecciones y
una falla a mitad de camino (ej: orden updateada, audit log no escrito).

**Causa raíz:** `updateDoc` + `addDoc` en la misma función no son atómicos.
Si la red corta entre ambas, queda parcial.

**Regla:** si una mutación toca 2+ colecciones (incluyendo `auditoria_admin`,
`comisiones`, etc.), envolverlas en `runTransaction`. La verificación de
idempotencia (`if (data.flag) return`) va DENTRO del callback DESPUÉS del
`tx.get()`.

**Cazador:** `scripts/invariantes/check-cross-collection-tx.ts` — busca
funciones en `src/services/`, `src/pages/`, `src/hooks/` y `api/` que hagan
≥2 llamadas de mutación (`updateDoc`, `setDoc`, `addDoc`, `deleteDoc`)
sobre `db, '...'` distintos sin estar dentro de `runTransaction(...)` ni
`writeBatch(...)`. Caza por nombre de función. Scope extendido en SPRINT-133
(2026-05-11) desde el original `['src/services', 'api']` tras detectar
`handleConfirmarEliminar` en `src/pages/PersonalPage.tsx` con el bug —
fix aplicado con `writeBatch` + chunking.

**Allowlist:** funciones intencionalmente no-transaccionales (ej:
backfills/migraciones one-shot, deuda agendada con sprint follow-up
explícito) marcadas con comentario `// @safe-non-tx: <razón>` arriba de la
función. SPRINT-133 dejó 7 entradas en allowlist apuntando a SPRINT-134
como follow-up (handleConvertirAFactura, handleSubmit cotizaciones,
handleChangeEstado equipos, handleConfirmarAjuste inventario,
handleGenerarOrden mantenimiento, handleSubmit personal,
ejecutarVinculacion personal). Refactor a `writeBatch` pendiente en
SPRINT-134.

---

## P-004 — Alta de empleado sin crear doc espejo en `usuarios/{uid}`

**Bug original:** SPRINT-105 (2026-05-06) — antes del fix, `GestionUsuarios.tsx`
creaba el Auth user + el doc `personal/{auto-id}` pero NO el doc
`usuarios/{uid}`. Patrón también presente en el segundo flujo "dar acceso a
empleado existente".

**Síntoma:** El empleado nuevo loguea correctamente pero su `userProfile.id`
cae al fallback `personal where email==` → `userProfile.id == personalDocId !==
auth.uid`. Cualquier rule que valide `X == request.auth.uid` rechaza sus
writes silenciosamente. Es el mismo vector que P-001, pero la causa raíz es
upstream (en el alta misma).

**Causa raíz:** El form de alta sólo escribía `personal`. La migración masiva
(`scripts/backfill-usuarios-desde-personal.ts`, commit `1353b84`) cubrió a los
21 empleados existentes pero no a futuros. Cualquier técnico/operaria #22 lo
reintroducía.

**Regla:** cuando un flujo crea un `createUserWithEmailAndPassword`, debe
también escribir `setDoc(doc(<db>, 'usuarios', cred.user.uid), {...})` en el
mismo archivo. Patrón seguro: usar el `secondaryDb` del `secondaryApp` para
escribir bajo la sesión del propio user creado (defense-in-depth — funciona
aunque rules cambien en el futuro a "solo cada user crea su propio doc").

**Cazador:** `scripts/invariantes/check-alta-empleado-doble-doc.ts` — escanea
`src/**` y `api/**`, busca archivos con `createUserWithEmailAndPassword` y
verifica que aparezca `setDoc(doc(... , 'usuarios', ...))` en el mismo archivo.

**Allowlist:** comentario `// @safe-no-usuarios-mirror: <razón>` en el header
del archivo lo excluye (raro — sólo aplica a migraciones one-shot o endpoints
serverless que crean Auth sin necesitar espejo).

---

## P-005 — `firestore.rules` modificado pero no deployado a producción

**Bug original:** SPRINT-103 (`1568a63`, 2026-05-06) modificó `firestore.rules`
con `.get(field, null)` en `noTocaSoloChequeo`, `noTocaCamposAprobacion`,
`noTocaAsignacion`. El sprint cerró COMPLETADO + push a main, pero NUNCA se
ejecutó `npm run deploy:rules`. Detectado el 2026-05-07 cuando Jorge reportó
"botones de inicio de chequeo no funcionan" (SPRINT-106). Las rules de
producción seguían comparando campos opcionales con acceso directo y rechazaban
silenciosamente cualquier update de técnico sobre orden regular (sin
`soloChequeo`/`estadoAprobacion`/`ayudanteId` previos).

**Síntoma:** Feature compilado y pusheado funciona en local pero rompe en
producción con permission-denied silencioso. Vector típico: el `git push`
dispara deploy de Vercel automático (frontend), pero las rules requieren
`firebase deploy` ejecutado a mano. Si nadie lo ejecuta, hay desincronía
entre código nuevo y rules viejas.

**Causa raíz:** No hay enforcement automático de "rules en repo == rules
deployadas". El coordinator/Jorge debía recordar correr `npm run deploy:rules`
después de cada sprint que las tocara. SPRINT-103 lo dejó documentado en
EJECUCION_AUTONOMA.md como "acción humana pendiente" pero nadie lo ejecutó por
~24h.

**Regla:** todo cambio a `firestore.rules` debe deployarse en el mismo sprint
que lo modifica. El pre-commit hook bloquea cualquier commit que tenga diff
entre `firestore.rules` y `firestore.rules.deployed.lock`. Para sincronizar:
`npm run deploy:rules` (script compuesto que deploya + actualiza el lock).

**Cazador:** `scripts/invariantes/check-rules-pendientes-deploy.ts` — calcula
SHA-256 de `firestore.rules`, lo compara contra el hash registrado en
`firestore.rules.deployed.lock` (escrito por
`scripts/invariantes/marcar-rules-deployadas.ts` post-deploy). Hashes distintos
→ FAIL. Lock missing → WARN.

**Allowlist:** ninguna. Si grita y el commit no toca rules, es porque alguien
deployó fuera de banda — ejecutar
`npx tsx scripts/invariantes/marcar-rules-deployadas.ts` para sincronizar.

---

## P-006 — Dropdown que asigna técnico/operaria guarda `personal.id` en lugar de `auth.uid` (+ variantes `.find()` y `Set/Map`)

**Bug original:** `c4be345` (Iniciar Chequeo Aury Mon, 2026-05-07). Postmortem:
`docs/postmortems/2026-05-07-iniciar-chequeo-permission-denied.md`.

**Extensión variante 2 (`.find()`):** SPRINT-132 (2026-05-11) — 14 sitios en el
repo con el patrón `find(X => X.id === <campo>Id)` que falla post-c4be345
(SPRINT-108). Cuando el campo persiste `auth.uid` y `X.id` sigue siendo el doc
id de `personal/`, el `.find()` retorna `undefined`. El bug se manifiesta como
"orden creada NUNCA pobló `operariaNombre`" en lugar de "desincronizado", por
lo que SPRINT-129 reportó 0 inconsistencias (su definición no cubre
"campo siempre vacío"). El caso Aury Mon fue solo la punta del iceberg.

**Extensión variante 3 (`Set/Map`):** SPRINT-145/146 (2026-05-12). Bug en
`src/pages/AgendaDia.tsx` reportado por Jorge: la página "Agenda del Día"
mostraba "Sin citas hoy" + KPIs en 0 pese a haber órdenes con `fechaCita = hoy`.
5 instancias del patrón en 1 archivo:
- `new Set(ordenesDelDia.map(o => o.tecnicoId)).has(t.id)` — Set construido
  con uids (post-c4be345), lookup contra docId. Always false.
- `ordenesPorTecnico[t.id]` — map keyed por `o.tecnicoId` (uid), indexado por
  `t.id` (docId). Always undefined.
El cazador `.find()` no atrapó esto porque el shape es `Set.has()` y `[X.id]`,
no `.find()`. SPRINT-145 fixeó el archivo; SPRINT-146 extendió el cazador para
detectar Variante 3.

**Síntoma variante 1 (dropdown WRITE):** Técnico/operaria recién creado (con
flujo SPRINT-105 que respeta auto-id de Firestore en `personal/`) recibe órdenes
asignadas y NO puede ejecutar acciones gateadas por su rol — toast
`permission-denied` silencioso. Para empleados viejos cuyo
`personal/{id}.id == auth.uid` por convención manual, el bug pasa desapercibido.

**Síntoma variante 2 (`.find()` READ/DERIVATION):** la derivación de operaria
desde el técnico elegido NUNCA se dispara en CREATE/edit de orden porque
`personal.find(p => p.id === form.tecnicoId)` retorna undefined cuando
`form.tecnicoId === auth.uid` post-c4be345. Resultado: la orden creada nunca
pobló `operariaId`/`operariaNombre` aunque el técnico SÍ tenga operaria
asignada. También afecta displays (pin de mapa, color, comisiones, cierre
día, facturas) que muestran `—` o color default en órdenes post-c4be345.

**Síntoma variante 3 (Set/Map READ):** filtros y render en `useMemo` que
indexan/buscan por `t.id` retornan vacío. La página muestra contenido vacío
o KPIs en 0 sin error visible — no hay `permission-denied`, no hay throw, no
hay request rojo en Network. Diagnóstico requiere inspeccionar manualmente
qué keys tiene el Set vs qué key se busca.

**Causa raíz (común):** El doc `personal/{auto-id}` tiene un campo `uid` adentro
que SÍ es el `auth.uid` del empleado. La migración c4be345 cambió WRITES en
dropdowns (`<option value={t.uid}>`) pero NO READS via `.find()` ni
`Set.has()` / `map[t.id]`. Las rules comparan
`tecnicoId == request.auth.uid`; los lookups deben comparar/indexar contra
`(t.uid || t.id) === <campo>` para soportar tanto pre como post c4be345.

**Regla:**
- **WRITE (dropdowns):** `<option value={t.uid}>`, filtrar `tecnicos.filter(t => t.uid)`.
- **READ (`.find()`):** `personal.find(p => (p.uid || p.id) === <campo>)` cuando
  el `<campo>` puede ser `auth.uid` post-c4be345 (`tecnicoId`, `operariaId`,
  `ayudanteId`, `responsableId`, `secretariaId`, `tecnicoDestinoId`).
- **READ (`Set/Map`):** `new Set(personal.map(t => t.uid || t.id))` y
  `map[t.uid || t.id]` cuando el Set/Map se compara o keyea con un campo de
  orden post-c4be345.
- Para lookups internamente simétricos con un dropdown UI local (no se gatea
  por rules, ej: `Avances.tsx`), agregar comentario `// @safe-tecnicoid-id:`.

**Cazador:** `scripts/invariantes/check-tecnicoid-personal-id-misuse.ts` —
escanea `src/**/*.{tsx,ts}` con tres pasadas:

1. **Variante 1 (dropdown):** `<option value={X.id}>` en `.tsx` donde X es
   identificador corto de personal (`t`, `p`, `tec`, `op`, `sec`, etc.) y el
   contexto ±20 líneas contiene tokens como `tecnicoId`, `ayudanteId`,
   `tecnicos.map`, `personalActivo`.
2. **Variante 2 (`.find()` — SPRINT-132):** `.find(X => X.id === Y)` donde X
   es identificador corto de personal y Y termina con sufijo de campo de
   empleado (`tecnicoId`, `operariaId`, `ayudanteId`, `responsableId`,
   `secretariaId`, `tecnicoDestinoId`).
3. **Variante 3 (`Set/Map` — SPRINT-146):** `.has(X.id)` o `[X.id]` donde X
   es identificador corto de personal y el contexto ±20 líneas contiene un
   sufijo de campo persistido (`tecnicoId`, `operariaId`, etc.). Esto detecta
   tanto `set.has(t.id)` como `map[t.id]` indexing.

Falla si encuentra hits sin allowlist.

**Allowlist:** comentario `// @safe-tecnicoid-id: <razón>` en la misma línea
o hasta 5 líneas arriba. Útil cuando el lookup es intencionalmente simétrico
con un dropdown UI local (ej: `Avances.tsx:113`, donde `form.personalId` viene
del dropdown propio y `/avances` no se gatea por `auth.uid` en rules). Si la
allowlist crece a >5 entradas, refactorear el cazador.

**Sitios fixed en SPRINT-132 (14):** `useOrdenCreateForm.ts:588`, `Ordenes.tsx:468`,
`MapaRutas.tsx:539,610,917,1026,1179` (+ write upstream `data-tecnico-id={t.uid || t.id}`
en línea 1079 y `tecnicoId: destino.uid || destino.id` en línea 558),
`OrdenEditForm.tsx:77`, `ModalEditarOrdenAdmin.tsx:247`, `Configuracion.tsx:444`,
`Comisiones.tsx:384`, `CierreDia.tsx:315`, `FacturaItemsEditor.tsx:176`,
`FacturaItemDetallesModal.tsx:167`, `PersonalPage.tsx:690,725` (lookup +
dropdowns + writes a `tecnicoId/responsableId`).

**Sitios fixed en SPRINT-145 (5 + 1 import en 1 archivo):**
`src/pages/AgendaDia.tsx` líneas 31 (import `currentUser`), 288, 295, 310,
315, 335-336, 432. Variante 3 (Set/Map) — el cazador ahora detecta este shape.

**Deuda pendiente sobre `operariaId` (SPRINT-147 follow-up, requiere OK Jorge):**
El campo `operariaId` en `ordenes_servicio` actualmente guarda `personal.id`
(docId), NO `auth.uid` — verificado en `PersonalPage.tsx:772-778` (escritura
durante reasignación al eliminar operaria) y `MapaRutas.tsx:716` (copia
`tecnicoElegido.operariaId` del doc Personal). Esto es **inconsistente** con
`tecnicoId` que post-c4be345 guarda `auth.uid`. Casos potencialmente afectados
(no fixeados en SPRINT-146 por scope creep + riesgo a cálculo de comisión):
- `src/services/nomina.service.ts:172` — `o.operariaId === p.id` (lookup en
  nómina; ambos lados son docId, consistente HOY).
- `src/pages/Ordenes.tsx:635` — `o.operariaId === userProfile?.id` (filtro
  "mis órdenes"; **roto** para operarias cargadas vía `usuarios/{uid}` donde
  `userProfile.id = uid`).
- `src/pages/Rendimiento.tsx:297` — `o.operariaId === op.id` (lookup
  métricas; ambos lados son docId, consistente HOY).
El cazador NO marca estos hits porque el patrón es `=== p.id` con `op.` o
`p.` como identificador y compareTo es campo de orden — fuera del alcance de
las 3 variantes. SPRINT-147 debe decidir: (a) migrar `operariaId` a `uid`
(consistente con tecnicoId, requiere script de migración + rules updates), o
(b) declarar `operariaId` como docId intencional y fixear los lookups que
asumen otro dominio (cambiar `Ordenes.tsx:635` a comparar con
`personalDocIdPropio || currentUser?.uid`). Decisión requiere OK Jorge.

---

## P-007 — `crearNotificacion({ userId: <X>.id })` con `personal.id` en lugar de `auth.uid`

**Bug original:** notis legacy con `userId == personalDocId` afectando a 5 empleados (Yohana, Wilainy, Jorge, misterservicerd, Maria Teresa). 44 docs invisibles en campanita. Re-migración masiva en `b781f80` (2026-05-08). Postmortem: `docs/postmortems/2026-05-08-notis-legacy-multiples-empleados.md`.

**Síntoma:** El destinatario no ve su notificación en la campanita (toast nunca llega, badge en 0). La rule de Firestore filtra `notificaciones` por `userId == request.auth.uid` y el doc tiene `userId == personal.id` (doc id auto-generado de `personal/`). Para empleados con `personal/{id}.id == auth.uid` por coincidencia (alta vieja con id manual igual al uid) pasa desapercibido — solo afecta a empleados creados con auto-id.

**Causa raíz:** Callers de `crearNotificacion({...})` enumeran personal con `personal.filter(...)` o `personal.map(...)` y pasan `<item>.id` como `userId` o `destinatarioId`. El doc id de personal NO es `auth.uid`. Lo correcto es usar `<item>.uid` y filtrar items con `uid != ''` para excluir empleados pre-SPRINT-105 sin Auth. Es vector hermano de P-001 (que sí caza `userProfile.id` literal pero no las variantes con identificadores indirectos como `admin.id`, `p.id`, `coord.id`, etc.).

**Regla:** Cuando un caller llama `crearNotificacion({ userId, destinatarioId, ... })` (o cualquier otra función que escriba a la colección `notificaciones`), el valor pasado debe ser `auth.uid` — nunca un doc id de `personal/`. Para enumerar destinatarios desde `personal.filter(...)`, filtrar primero por `p.uid` (`.filter(p => p.uid)`) y pasar `p.uid`. Para el propio user logueado, usar `currentUser.uid` del context (no `userProfile.id`).

**Cazador:** `scripts/invariantes/check-crearnotificacion-userid-shape.ts`. Detecta dentro de bloques `crearNotificacion({...})` patrones `userId: <X>.id` o `destinatarioId: <X>.id` donde `<X>` matchea identificadores típicos de personal (`admin`, `coord`, `p`, `t`, `op`, `sec`, etc.) o es `userProfile`. Bloque multi-línea soportado por balanceo de llaves.

**Allowlist:** comentario `// @safe-crearnotificacion-id: <razón>` en la misma línea o hasta 5 líneas arriba. Si crece >5 entradas, refactorear el cazador. Por archivo, allowlist vacía y se debe mantener vacía — no debería haber un caller legítimo que escriba a `notificaciones` con un doc id de personal.

---

## P-008 — Notificaciones en producción con `userId`/`destinatarioId` apuntando a `personal.id` en lugar de `auth.uid` (HEALTH-CHECK DE DATOS)

**Bug original:** mismo set que P-007 — 44 notis legacy afectando a 5 empleados (Yohana, Wilainy, Jorge, misterservicerd, Maria Teresa). Re-migrados en `b781f80` (2026-05-08). Postmortem: `docs/postmortems/2026-05-08-notis-legacy-multiples-empleados.md`.

**Síntoma:** el destinatario NO ve sus notis en la campanita (Caso A: ni `userId` ni `destinatarioId` matchean `auth.uid`, alguno apunta a `personal.id`) o las ve pero NO puede marcarlas como leídas (Caso B: `destinatarioId == auth.uid` pero `userId != auth.uid`, rule de update rechaza).

**Causa raíz (de DATOS):** notis creadas antes del fix de SPRINT-105 + posibles regresiones de código que P-007 no detectó. P-001 + P-004 + P-006 + P-007 cubren el lado del CÓDIGO (cómo prevenir nuevas escrituras malas). P-008 cubre el lado de los DATOS (cómo detectar shape problemático que ya está en producción).

**Regla:** el campo de target de la lectura siempre debe ser `auth.uid`. Si el cazador detecta hits, hay 3 causas posibles: (a) alta de empleado pre-SPRINT-105 que el backfill no migró, (b) regresión en código que P-007 no detectó (allowlist mal usada, variante no contemplada), (c) re-migración previa incompleta. NO autorizar re-migración automática — reportar a Jorge y abrir sprint write acotado por uid (mismo patrón que SPRINT-118), con OK explícito en `BLOQUEOS.md`.

**Cazador:** `scripts/invariantes/check-notis-legacy-data-shape.ts`. Comando: `npm run audit:notis-legacy`. Naturaleza diferente al resto: este cazador escanea DATOS LIVE en Firestore via Admin SDK — requiere `service-account.json` + cuota Firebase + ~10-60s. Por eso NO está registrado en `run-all.ts` (que corre en pre-commit cada vez) y NO se ejecuta automáticamente. Es una herramienta manual de health-check, apta para integrar como scheduled task futura.

**Frecuencia recomendada:** ejecutar manualmente tras (a) cualquier alta de empleado nueva, (b) cualquier sprint que toque `notificaciones.service.ts`, (c) sospecha de regresión reportada por un empleado, (d) revisión periódica (semanal o mensual). Salida: 0 hits → exit 0; N>0 hits → lista de empleados afectados + IDs exactos + exit 1.

**Allowlist:** vacía y se debe mantener vacía. No hay caso legítimo donde una noti deba tener `userId == personalDocId`.

---

## Plantilla para agregar nuevo patrón

Cuando un sprint cierra un bug que rompió producción, agregar acá:

```
## P-XXX — <nombre corto>

**Bug original:** <hash + fecha>

**Síntoma:** <cómo se manifiesta>

**Causa raíz:** <por qué pasa>

**Regla:** <qué hacer / qué no hacer>

**Cazador:** `scripts/invariantes/check-<algo>.ts`

**Allowlist:** <archivos legítimamente excluidos, si aplica>
```

Y crear el cazador correspondiente en `scripts/invariantes/`.

---

## Relación con el agente `archivist`

El catálogo de arriba lo consume el `regression_guardian` (capa semántica al cerrar sprint) y lo amplía el `archivist` cuando un bug nuevo entra al postmortem.

Cuando el `archivist` (`.claude/agents/archivist.md`) genera un postmortem en `docs/postmortems/YYYY-MM-DD-<slug>.md`, decide:

- **Clase nueva** → propone agregar P-XXX nuevo a este catálogo + cazador en `scripts/invariantes/`. El builder lo escribe siguiendo la plantilla y registra en `run-all.ts`.
- **Recurrencia de clase ya catalogada** → reporta al coordinator que el cazador X no cazó este caso. El coordinator delega al builder el refinamiento del cazador (ampliar regex, extender allowlist, crear cazador hermano, etc.).

Ese loop cierra el ciclo: bugs en producción → postmortem → catálogo + cazador refinado → próximo bug del mismo vector cazado pre-commit. La **recurrence rate** (calculada por `npm run metricas`) mide la salud de ese ciclo: si sube, los cazadores están mal calibrados.
