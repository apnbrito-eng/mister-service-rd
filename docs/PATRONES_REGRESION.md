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
funciones en `src/services/`, `src/pages/`, `src/hooks/`, `src/components/`
y `api/` que hagan ≥2 llamadas de mutación (`updateDoc`, `setDoc`, `addDoc`,
`deleteDoc`) sobre `db, '...'` distintos sin estar dentro de `runTransaction(...)`
ni `writeBatch(...)`. Caza por nombre de función. Scope extendido en SPRINT-133
(2026-05-11) desde el original `['src/services', 'api']` tras detectar
`handleConfirmarEliminar` en `src/pages/PersonalPage.tsx` con el bug —
fix aplicado con `writeBatch` + chunking. Extendido nuevamente en SPRINT-156
(2026-05-12) a `src/components/` tras SPRINT-155 (refactor de `handleGenerar`
en `ProcesarFacturacionModal.tsx` con `runTransaction`, que quedó fuera del
scope del cazador — un día después se detectó el handler hermano en
`FacturaCrearModal.handleSubmit`). En SPRINT-156 también se amplió la
ventana de detección de allowlist `@safe-non-tx:` de 5 a 10 líneas previas
para permitir justificaciones multilínea.

**Allowlist:** funciones intencionalmente no-transaccionales (ej:
backfills/migraciones one-shot, deuda agendada con sprint follow-up
explícito) marcadas con comentario `// @safe-non-tx: <razón>` arriba de la
función (hasta 10 líneas previas). SPRINT-133 dejó 7 entradas apuntando a
SPRINT-134 como follow-up (handleConvertirAFactura, handleSubmit cotizaciones,
handleChangeEstado equipos, handleConfirmarAjuste inventario,
handleGenerarOrden mantenimiento, handleSubmit personal,
ejecutarVinculacion personal). Refactor a `writeBatch` pendiente en
SPRINT-134. SPRINT-156 agregó una más:
`src/components/facturas/FacturaCrearModal.tsx::handleSubmit` apuntando a
SPRINT-157 como follow-up (paralelo a SPRINT-155). Total allowlist: 8.
Sub-regla CLAUDE.md "Política de falsos positivos" recomienda refactorear el
cazador si la allowlist crece >5 — el cazador YA es heurístico para detectar
estos shapes; el remedio cuando la allowlist crece es ejecutar los sprints
follow-up de refactor a `runTransaction`/`writeBatch` para sacar entradas,
no flexibilizar el cazador.

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

## P-006 — Dropdown que asigna técnico/operaria guarda `personal.id` en lugar de `auth.uid` (+ variantes `.find()`, `Set/Map`, comparación directa reversa)

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
escanea `src/**/*.{tsx,ts}` con cuatro pasadas:

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
4. **Variante 4 (comparación directa reversa — SPRINT-149):** `xxx.<sufijo> === yyy.id`
   donde `xxx.<sufijo>` es campo persistido de empleado e `yyy` es identificador
   corto de personal. Captura `.filter()` y condicionales fuera de `.find()`/`Set.has()`.

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

**Extensión variante 4 (comparación directa reversa — SPRINT-149):**
~~Deuda pendiente sobre `operariaId`~~ **[RESUELTO en SPRINT-149 el 2026-05-12]**
— Jorge eligió ruta (a): migrar `operariaId` a `auth.uid` para alinear con
`tecnicoId`. Cambios aplicados:
- **Write-side:** ya migrado parcialmente en SPRINT-105
  (`FormAltaEditarEmpleado.tsx` emite `op.uid || op.id`); SPRINT-149 completó
  la escritura pendiente en `PersonalPage.tsx:772-778` (reasignación al
  eliminar operaria), que ahora persiste `destino.uid || destino.id`.
- **Read-side:** 13 archivos migrados al patrón `(op.uid || op.id) === operariaId`
  (`nomina.service.ts`, `Ordenes.tsx`, `Rendimiento.tsx`, `MetricasMensuales.tsx`,
  `Dashboard.tsx`, `PersonalPage.tsx`, `AgendaDia.tsx`, `MapaRutas.tsx`,
  `RecordatorioBanner.tsx`, `ModalConfirmarEliminar.tsx`, `GruposOperariaTecnico.tsx`,
  `OrdenesTablero.tsx`, `BotonRederivarOperaria.tsx`).
- **Script de migración:** `scripts/migrar-operariaid-a-uid.ts` (DRY-RUN por
  default, `--apply` para escribir). Alinea `ordenes_servicio.operariaId` y
  `personal[tecnico].operariaId` legacy a uid. Umbral de seguridad: aborta si
  >50 docs. Jorge dispara `--apply` cuando esté listo (queda en `BLOQUEOS.md`).

El cazador ahora detecta la **variante 4** = comparación directa reversa
`xxx.<sufijo> === yyy.id` donde `xxx.<sufijo>` es campo persistido de empleado
(`tecnicoId`, `operariaId`, etc.) e `yyy` es identificador corto de personal
(`p`, `t`, `op`, etc.). Esto captura los patrones de filter/condicional que
el findRe de variante 2 no cazaba porque están en `.filter()`/`if` directos,
no en `.find()`. SPRINT-149 fixeó también ~6 hits residuales de `tecnicoId`
(no operariaId) que estaban en este shape (ej: `c.tecnicoId === p.id` en
nomina.service.ts, `o.tecnicoId === t.id` en Dashboard.tsx).

**Sitios fixed en SPRINT-149 (13 archivos + 1 script):** ver lista arriba.

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

## P-009 — Campo persistido en Firestore pero omitido por el parser correspondiente

**Bug original:** SPRINT-153-FIX (2026-05-13). Fix en `src/utils/index.ts` (parser `parseFactura`). Hash del fix: `02bfded`.

**Síntoma:** una feature nueva escribe un campo a Firestore (verificado en docs reales) y los componentes tienen el render correcto del campo, pero el bloque jamás aparece en la UI. NO hay error, NO hay warning — el componente recibe `undefined` y el guard `{factura?.notaConduce && ...}` evalúa false. QA E2E busca el texto en DOM y obtiene 0 hits.

**Causa raíz:** los parsers defensivos `parseFactura` / `parseOrden` / `parseServicioPrecio` / `parsePiezaInventario` en `src/utils/index.ts` listan campos explícitamente en el `return {...}` (no usan `...raw`). Cuando un sprint agrega un campo al tipo (`src/types/index.ts`) y a la persistencia (modal/handler), es fácil olvidar actualizar el parser intermedio. El `onSnapshot` carga los docs vía `parseFactura(d.id, d.data())` → cualquier campo no listado en el parser se filtra silenciosamente.

**Caso concreto #1 (recurrencia original):** SPRINT-151 (`863e804`, 2026-05-12) persistió `notaConduce` en `facturas/{id}` desde `ProcesarFacturacionModal.tsx:534`. SPRINT-153 (`79c7fcc`, 2026-05-12) agregó el render en `OrdenResumenLectura.tsx:259`. Type `Factura.notaConduce?: string` añadido en `types/index.ts:1178`. Pero ningún sprint actualizó `parseFactura` en `utils/index.ts:1124-1170`. Resultado: 24h de feature visible en código pero inerte en producción. QA E2E del 2026-05-13 sobre CG-00018 (texto "Cliente solicita pasar factura legal aparte", 47/500 chars) confirmó 0 hits del texto en DOM. Hash del fix: `02bfded`.

**Caso concreto #2 (recurrencia, SPRINT-177-HOTFIX, 2026-05-16):** `CierreServicio.firmaClienteUrl` + `firmaClienteAt` persistidos desde SPRINT-159, 3 consumidores UI los leían, pero la IIFE `cierreServicio` dentro de `parseOrden` los descartaba. 14 días en producción con "Sin firma" mostrado aunque las firmas estaban en Storage. Hash del fix: `ad4decc`. El cazador NO cazó porque solo cubría `Factura`. Este sprint amplió cobertura a `CierreServicio ↔ parseOrden.cierreServicio`.

**Caso concreto #3 (recurrencia, SPRINT-187-FIX2-HOTFIX, 2026-05-18):** `parseCliente` olvidó los 4 campos soft-delete (`eliminado`, `eliminadoEn`, `eliminadoPor`, `mergedaCon`) introducidos por SPRINT-185 (`a3b56bf`) — `Clientes.tsx:160` filtra `c.eliminado !== true` que evaluaba `undefined !== true === true` → soft-deleted seguían visibles en `/admin/clientes`. QA visual sidepanel del 2026-05-18 noche cazó las 3 entradas "QA Test" (1 canónica + 1 soft-deleted + 1 cliente distinto). Postmortem: `docs/postmortems/2026-05-18-parser-cliente-eliminado-olvido.md`. **Tercera vez del mismo patrón en 5 días = bandera roja estructural** sobre el manejo de deuda follow-up de cazadores.

**Regla:** cada campo del tipo `Factura` / `CierreServicio` / `Cliente` declarado en `src/types/index.ts` debe tener una asignación correspondiente en el parser correspondiente (`parseFactura` / IIFE `cierreServicio` en `parseOrden` / `parseCliente`). Asignación explícita `clave: ...` o property shorthand `clave,`. Excepciones válidas: campos derivados o computados — deben agregarse a `SKIP_*_FIELDS` en el cazador con justificación.

**Cazador:** `scripts/invariantes/check-parser-campos-faltantes.ts`. Cubre `Factura ↔ parseFactura`, `CierreServicio ↔ parseOrden.cierreServicio` y `Cliente ↔ parseCliente`. Extensión natural a `ServicioPrecio`, `PiezaInventario` y otros sub-objetos de `OrdenServicio` (`inicioChequeo`, `trackingGPS`, `cierreChequeoHistorico`) queda como sprint follow-up — **materializado en `COLA_AUTONOMA.md` con touch-list específico, NO como anotación** (antiprecedente: las recurrencias #2 y #3 ocurrieron sobre tipos listados como "follow-up si vuelve a ocurrir" pero nunca materializados — la anotación NO previene).

**Allowlist Factura:** `SKIP_FACTURA_FIELDS = []`. **Allowlist CierreServicio:** `SKIP_CIERRESERVICIO_FIELDS = []`. **Allowlist Cliente:** `SKIP_CLIENTE_FIELDS = []`. Sumar campos solo con justificación documentada en comentario inline (campo derivado, alias legacy, etc.).

---

## P-010 — Tipo de notificación declarado en `TipoNotificacion` sin call site emisor

**Bug original:** SPRINT-169 (2026-05-15). Hash del fix: ver `EJECUCION_AUTONOMA.md` entrada de la fecha. Postmortem: `docs/postmortems/2026-05-15-orden-asignada-regresion-sprint-163-no-commit.md`.

**Síntoma:** feature de notificación parece completa en código (tipo declarado en `TipoNotificacion`, service `crearNotificacion` correcto, rule `notificaciones.create: if esStaff()` correcta) pero en producción la noti jamás llega a la campanita. NO hay error, NO hay warning, NO hay request rojo en Network — simplemente nadie llama a `crearNotificacion({ tipo: '<X>', ... })` desde el código de la app. Detección requiere que un humano se dé cuenta de la ausencia (en este caso QA E2E distribuido del 2026-05-14 con OS-0056 — 1 día después de marcar SPRINT-163 como COMPLETADO).

**Caso concreto:** el tipo `'orden_asignada'` quedó declarado en `src/types/index.ts:1750` desde algún sprint previo (probable redacción inicial de SPRINT-157 o SPRINT-158). SPRINT-163 fue marcado COMPLETADO en `docs/sprints/COLA_AUTONOMA.md` el 2026-05-13 pero **nunca produjo commit en git log** — la búsqueda `git log --grep='orden_asignada\|SPRINT-163'` retorna solo refs documentales, ningún diff de código. El handler de creación de orden en `useOrdenCreateForm.ts` línea 704 (post-`addDoc(collection(db, 'ordenes_servicio'), ordenLimpia)`) nunca tuvo el call site `crearNotificacion({ tipo: 'orden_asignada', userId: tecnico.uid, ... })`. Resultado: el tipo huérfano vivió ~2 días invisible hasta que QA real ejercitó el flujo.

**Causa raíz:** `TipoNotificacion` es una unión de strings literales en TypeScript (`'a' | 'b' | 'c'`). Cualquiera puede agregar un valor nuevo "de bandera" anticipando un feature, sin agregar el call site correspondiente. TypeScript NO obliga a que TODOS los valores de un union type sean usados — solo verifica que los usados estén en la unión. Resultado: drift silencioso entre "tipos declarados" y "tipos efectivamente emitidos". El proceso de marcar un sprint como COMPLETADO sin commit (administrative-only update a `COLA_AUTONOMA.md`) amplifica el riesgo: la cola dice "hecho" pero el repo dice "ni se intentó".

**Regla:** cada valor de la unión `TipoNotificacion` debe aparecer al menos una vez como literal `'<valor>'` en `tipo:` dentro de un bloque `crearNotificacion({...})` en `src/`, O dentro de un archivo `api/**` o cualquier archivo que escriba directo a la colección `notificaciones` con Admin SDK (`db.collection('notificaciones').add(...)`). Si no aparece, o es deuda explícita (agregar a `ALLOWLIST` del cazador con sprint owner que lo paga) o es feature huérfano que se debe limpiar del tipo.

**Cazador:** `scripts/invariantes/check-tipo-notificacion-huerfano.ts`. Lee la unión de `src/types/index.ts`, escanea `src/**/*.{ts,tsx}` + `api/**/*.ts` por dos pasadas: (a) bloques `crearNotificacion({...})` con paréntesis balanceados → extrae `tipo: '<v>'` literal; (b) archivos que referencian `collection('notificaciones')` o están dentro de `api/` → extrae cualquier `tipo: '<v>'` literal del archivo (heurística amplia, baja tasa de falsos positivos porque el scope ya está acotado). Reporta cada tipo del union que no aparezca como literal emitido.

**Allowlist:** `ALLOWLIST` map en el header del cazador. Cada entrada documenta el tipo + razón + sprint owner. Hoy:
- `otro` — catch-all genérico sin owner.
- `recordatorio` — emitido server-side desde `scripts/cron-recordatorios.ts` fuera del scope del cazador.
- `reclamo_garantia` — deuda priorizada. El SPRINT-174 (2026-05-12) cerró 4 tipos (`precio_aprobado` extendido a admins/coords, `cotizacion_lista`, `cierre_completado`, `pago_registrado`) pero NO incluyó `reclamo_garantia` (api/garantia/[token].ts crea cita + audit log, falta noti in-app — sprint dedicado pendiente).

Si la allowlist crece a >5 entradas, pagar la deuda agregando los call sites o refactorear el cazador.

**Limitación conocida:** call sites con `tipo: tipoVar` (variable resuelta en runtime) no contribuyen al match — los típicos `tipo` están como literales en el shape. Si aparecen casos legítimos transitivos, documentarlos en allowlist.

---

## P-011 — `updateDoc(ordenes_servicio, {...})` setea flag terminal sin sincronizar `fase`

**Bugs originales (clase recurrente):**
- SPRINT-161 (commit `4015fe1`, 2026-05-12) — `ProcesarFacturacionModal.tsx::handleGenerar` seteaba `facturada: true` sin avanzar fase a `cerrado`. Orden facturada quedaba stuck en `trabajo_realizado`.
- SPRINT-173 (commit `d8f376b`, 2026-05-12) — `AgendaDia.tsx::handleAprobarPrecioInline` y `OrdenDetalle.tsx::handleAprobarPrecio` seteaban `estadoAprobacion: 'aprobado'` + `precioAprobado` sin avanzar fase a `aprobado`. Tercer handler idéntico (`Ordenes.tsx::handleAprobarPrecio`, mismo SPRINT-173) capturado por el cazador durante su primera corrida sobre el repo limpio.

**Síntoma:** el pipeline visual (`/admin/ordenes`, agenda del día, tablero, portal cliente público) muestra la orden en la fase previa aunque el flag de estado terminal indica que el negocio ya avanzó. Queries que filtran por `fase` infrareportan. UX: usuarios reportan "aprobé el precio pero la orden sigue en En Diagnóstico" o "facturé el conduce pero la orden sigue en Trabajo Realizado".

**Causa raíz:** la sub-regla CLAUDE.md "registros sincronizados" (`fase` + `estadoSimple` + `estado` + `historialFases` coherentes) es una convención editorial sin enforcement automático. Cualquier handler nuevo que persiste un flag de estado terminal (`estadoAprobacion='aprobado'`, `facturada=true`, `soloChequeo=true`, `cancelada=true`, `eliminada=true`) puede olvidarse de sincronizar `fase`. La modularidad del repo amplifica el riesgo: el flujo "Aprobar precio" tiene TRES handlers idénticos (`AgendaDia`, `OrdenDetalle`, `Ordenes`) — duplicación que en otros sprints podría reducirse a un helper compartido.

**Regla:** todo `updateDoc(<ref a ordenes_servicio>, {...})` que setea un flag de estado terminal del negocio DEBE incluir en el mismo update: `fase` + `estadoSimple` + `estado` + `historialFases` reconstruido con append entry `{ fase, timestamp, usuario, nota }` (NO `arrayUnion`). Patrón canónico: SPRINT-161 (`4015fe1`, `ProcesarFacturacionModal::handleGenerar`) y SPRINT-173 (`d8f376b`, los 3 handlers de aprobar precio). Usar single `ahora = Timestamp.now()` para evitar drift de milisegundos entre los campos relacionados.

**Cazador:** `scripts/invariantes/check-fase-sin-sincronizar-en-update-orden.ts`. Estrategia: extrae todos los `updateDoc(arg1, {block})` con balanceo de paréntesis y llaves, filtra los que tienen `'ordenes_servicio'` en `arg1`, busca patrones literales de flag terminal (`estadoAprobacion: 'aprobado'`, `facturada: true`, `soloChequeo: true`, `cancelada: true`, `eliminada: true`), y reporta hit si no hay `fase:` en el mismo bloque.

**Allowlist por línea:** comentario `// @safe-fase-sin-sincronizar: <razón>` en la misma línea del `updateDoc` o hasta 5 líneas arriba. Hoy:
- `src/components/ordenes/EliminarOrdenModal.tsx::handleConfirmar` (soft delete preserva fase original para Restaurar).
- `src/pages/Ordenes.tsx::handleConfirmarEliminarOrden` (idem — soft delete duplicado).

Si la allowlist crece, evaluar si conviene unificar handlers duplicados (`EliminarOrdenModal` vs `Ordenes.tsx::handleConfirmarEliminarOrden`).

**Limitación conocida:** el cazador busca literal `'ordenes_servicio'` en el primer argumento. Si un día se introduce un alias tipo `const ORDENES_COL = 'ordenes_servicio'` y luego se usa `updateDoc(doc(db, ORDENES_COL, id), ...)`, el cazador no caza. Solución: agregar el alias al patrón del cazador.

---

## P-012 — `onSnapshot` sin `where` contra colección con rule `auth.uid == X`

**Bug original:** histórico — `TecnicoVista.tsx` suscribía a `comisiones` sin `where` filter desde "Fase 5" (pre-2026-04). La rule de `comisiones` exige `esAdminOCoord() || (esTecnico() && resource.data.tecnicoId == auth.uid)`. Para técnicos, la query SIN where era rechazada por Firestore con `permission-denied`. Detección: QA E2E sidepanel 2026-05-16. Fix: SPRINT-179 (commit `328c508`, 2026-05-18). Postmortem: `docs/postmortems/2026-05-18-tecnico-comisiones-listener-sin-where.md`.

El cazador se creó proactivamente en SPRINT-179-FIX2 (2026-05-18) — el barrido del codebase confirmó que NO hay otros listeners sin where contra colecciones realmente restrictivas (4 colecciones detectadas: `conversaciones_ia`, `ponches`, `comisiones`, `liquidaciones_nomina`; los 5 listeners encontrados están en páginas admin/coord gateadas por UI y se allowlistaron con tag `@safe-listener-sin-where`).

**Síntoma:** `permission-denied` en console cuando un usuario rol-restringido (técnico/operaria/ayudante) carga una página que suscribe a una colección con rule del tipo `auth.uid == X` sin que el caller incluya `where('X', '==', auth.uid)`. El listener nunca emite datos; la app puede SEGUIR FUNCIONANDO si tiene fallback (filter client-side espera vacío) — bug latente, features que dependan del listener no funcionan en silencio.

**Causa raíz:** Firestore Rules evalúa queries por su shape. Si la rule exige `field == auth.uid`, la query DEBE incluir `where('field', '==', auth.uid)` para que Firestore garantice estructuralmente que todos los docs devueltos satisfacen la rule. Un filter client-side post-snapshot NO sustituye el constraint server-side.

**Regla:** cualquier `onSnapshot(collection(db, '<col>'), ...)` o `onSnapshot(query(collection(db, '<col>'), ...))` sin `where(...)` donde la rule de `<col>` tiene un `auth.uid == <campo>` en `allow read` (sin short-circuit de rol global tipo `esStaff()/esStaffOficina()`) debe:
- (a) incluir `where('<campo>', '==', currentUser.uid)` en la query, O
- (b) si el caller siempre es admin/coord por gating UI, allowlistar con `// @safe-listener-sin-where: <razón>` en la misma línea o hasta 5 arriba.

**Cazador:** `scripts/invariantes/check-listener-sin-where-rol-restringido.ts`. Parsea `firestore.rules` (regex sobre bloques `match /<col>/{...}` + `allow read: if ...`), detecta colecciones con constraint `resource.data.<X> == request.auth.uid` SIN short-circuit `esStaff()`/`esStaffOficina()`, y luego escanea `src/` por `onSnapshot(...)` sin `where` matcheando esos constraints. Hereda extractor de balanceo de paréntesis del cazador P-011.

**Allowlist por línea (tag `@safe-listener-sin-where`):**
- `src/pages/Comisiones.tsx:35` — página admin/coord.
- `src/pages/Dashboard.tsx:161` — página admin/coord.
- `src/pages/MetricasMensuales.tsx:57` — página admin/coord.
- `src/pages/Nomina.tsx:55,67` — página admin/coord (2 listeners en el mismo effect).

Si la allowlist crece >10 entradas o aparece una página NO-admin con tag, refactorear el cazador para inferir gating de UI (probable AST estático sobre `useApp`/`puede(...)` en el mismo archivo).

**Limitación conocida:** el parser de rules es heurístico (regex). Si una rule envuelve la check en función helper que el parser no expande (ej: `function tecnicoLeeSuya() { return esTecnico() && ... }`), el cazador puede falso-negativizar. Mitigación: si una rule nueva se escribe así, agregar la función helper al regex de short-circuit.

---

## P-014 — `addDoc`/`setDoc` a `clientes` sin guard por `telefonoNormalizado`

**Bug original:** SPRINT-185 (commit pendiente al crear el cazador — se commitea junto). Detección: QA puntual sidepanel 2026-05-18 sobre SPRINT-178 reveló que el descuento de chequeo previo NO aplicaba para OS-0058/OS-0059 del cliente "QA Test" porque las dos órdenes apuntaban a `clienteId` distintos del mismo cliente físico (typeahead mostraba 2 entradas idénticas con mismo tel `8090000000`).

**Síntoma:** typeahead de cliente muestra 2 entradas con mismo teléfono y nombre similar. Queries cross-collection por `clienteId` (`buscarChequeoVigentePorCliente`, historial de servicios, métricas de cliente) fragmentan los datos del mismo cliente físico en dos buckets. Features que dependen de matching exacto por `clienteId` (descuento chequeo previo, reactivación, comisiones) silenciosamente fallan o sub-reportan.

**Causa raíz:** `src/pages/Clientes.tsx::handleSubmit` (pre-fix) usaba `addDoc(collection(db, 'clientes'), payload)` con auto-id, ignorando la convención del helper canónico `buscarOCrearCliente` del service (que persiste con id = `telefonoNormalizado` y bloquea duplicados). La inconsistencia entre flujos de alta (1 página directa al SDK + N flujos vía service helper) permitió que escapen duplicados sin que ningún test los detectara — no hay test suite y el QA E2E sólo cubre cuentas dedicadas pre-creadas.

**Regla:** cualquier write a `clientes` desde `src/` (alta nueva) debe pasar por uno de:
- `buscarOCrearCliente()` del service (idempotente por `telNorm`).
- `crearOActualizarClienteDesdeCita()` del service (idempotente por `telNorm`).
- `setDoc(doc(db, 'clientes', telNorm), ...)` con `telNorm` derivado de `normalizarTelefono(...)` PRECEDIDO por `buscarClientePorTelefono` que bloquee si retorna != null.

NUNCA `addDoc(collection(db, 'clientes'), ...)` — auto-id de Firestore hace estructuralmente imposible idempotencia por teléfono.

**Cazador:** `scripts/invariantes/check-cliente-create-sin-dedup.ts`. Estrategia: regex sobre `addDoc(collection(db, 'clientes'), ...)` y `setDoc(doc(db, 'clientes', <expr>), ...)`. Auto-allow heurístico para `setDoc` con `telNorm` + `buscarClientePorTelefono`/`buscarOCrearCliente` en una ventana de 20 líneas arriba (cubre el patrón legítimo de `useOrdenCreateForm.ts`). El service canónico y `seedData.ts` están en la allowlist por path.

**Allowlist por archivo:**
- `src/services/clientes.service.ts` — el helper VIVE acá.
- `src/firebase/seedData.ts` — seed dev escribe con telNorm explícito.

**Tag por línea:** `// @safe-cliente-create: <razón>` en la misma línea o hasta 5 arriba.

**Limitación conocida:** la heurística de auto-allow detecta `normalizarTelefono`/`telNorm` y `buscarClientePorTelefono`/`buscarOCrearCliente` en ventana de 20 líneas. Si el guard está más arriba (función separada, helper externo), el cazador puede falsificar positivo — agregar tag explícito.

---

## P-015 — `orderBy('<campo>')` sobre colección con shape no garantizado (campo opcional/anidado/missing en algún write path)

**Bug original:** SPRINT-178 (commit `bd2b2a8`, 2026-05-18). Hash del fix: `4890dfa` (SPRINT-187). Postmortem: `docs/postmortems/2026-05-18-banner-descuento-query-orderby-mal-escrita.md`.

**Síntoma:** `snap.empty === true` después de la query Firestore aunque inspección manual del doc en Firestore Console muestra datos razonables. El feature que depende de la query (banner descuento, listado filtrado, etc.) silenciosamente no funciona — NO hay error en console, NO hay request rojo en Network, NO hay warning. El caller recibe array vacío y trata como "no hay datos" cuando en realidad la query filtró el doc por shape.

**Caso concreto:** `buscarChequeoVigentePorCliente` en `src/services/ordenes.service.ts` usaba `orderBy('fechaCierre', 'desc')` sobre `ordenes_servicio`. La fecha se persistía DENTRO de `cierreServicio.fechaCierre` (objeto anidado, NO raíz) por el wizard de cierre, y `AgendaDia.tsx::handleCerrarChequeo` no escribía el campo en absoluto. Firestore excluye silenciosamente del orderBy los docs sin el campo del orden → la query retornaba vacío → `null` del helper → banner descuento jamás aparecía para clientes con chequeo previo legítimo (todo el feature de SPRINT-178). 12 horas en producción con el feature inerte.

**Causa raíz:** las queries Firestore con `orderBy` tienen una asunción implícita sobre el shape de los docs que NO está reflejada en el tipo TS ni en el código de los writes. El typecheck NO captura "el orderBy referencia un campo opcional/anidado que no todos los writes escriben a nivel raíz". Si el campo es opcional o se persiste en sub-objeto, la query excluye los docs sin el campo a nivel raíz — y el caller no lo nota porque `snap.empty === true` parece "no hay datos" en lugar de "filtrados por shape implícito".

**Regla:** cada `orderBy('<campo>', ...)` debe satisfacer al menos una de:
- (a) El par (colección, campo) está en el allowlist `GUARANTEED_PAIRS` del cazador (campo garantizado a nivel raíz por contadores transaccionales, convención del repo verificada con grep, o helper centralizado que lo enforza en todos los paths).
- (b) La línea tiene tag `// @safe-orderby: <razón>` en la misma línea o hasta 5 arriba (verificación humana documentada — usado para casos donde la colección está detrás de variable `const COL`).

**Cazador:** `scripts/invariantes/check-firestore-orderby-campo-no-persistido.ts`. Estrategia pragmática (NO full AST): regex sobre `orderBy('<campo>'` en `src/**/*.{ts,tsx}` + `api/**/*.ts`, asocia con `collection(db, '<col>')` literal más cercano (<400 chars hacia atrás), valida contra `GUARANTEED_PAIRS` o tag. Aprendizaje del postmortem: "Pesado de implementar full AST → variante pragmática: lista hardcoded de pares (colección, campo) garantizados + comentario explicando cómo extender" (línea 82 del postmortem).

**Allowlist `GUARANTEED_PAIRS`:** 21 pares verificados al crear el cazador. Cada entry documenta la verificación (e.g., "Convención del repo + addDoc en X.tsx incluye createdAt"). Para agregar par nuevo, el sprint owner debe correr `grep -rn "addDoc.*<col>\|setDoc.*<col>\|updateDoc.*<col>"` y confirmar que TODOS los paths escriben el campo a nivel raíz.

**Tag por línea:** `// @safe-orderby: <sprint + razón>` en la misma línea o hasta 5 arriba. Aplicado a 4 ubicaciones en SPRINT-188 donde la colección está detrás de variable `const COL`/`CAMPANAS_COL` (avances, bancos, campanasMarketing, ponches).

**Limitación conocida:**
- Cobertura por par literal `(col, campo)`. Si la colección está detrás de variable sin literal cercano, el cazador reporta hit; el tag `@safe-orderby` lo silencia con verificación humana.
- NO valida cross-paths automáticamente: es una whitelist humana, NO un linter dinámico. Los writes a la colección NO se verifican en runtime — la garantía depende de que el sprint owner haya hecho el grep al agregar la entry.
- Si dos `query(...)` consecutivos con colecciones distintas aparecen muy cerca (<400 chars), `findCollectionBefore` puede asociar mal. Mitigación: el match toma el último literal, lo que dentro del mismo `query(...)` siempre es correcto. Si aparece bug por este edge case, usar tag explícito.

---

## P-016 — Webhook WhatsApp sin HMAC SHA-256 + raw body + timingSafeEqual

**Bug original (anticipado):** SPRINT-WA-1 (2026-05-19). Cazador preventivo, no histórico — implementado JUNTO al endpoint para que cualquier regresión futura sobre `api/whatsapp/webhook.ts` sea bloqueada antes del merge.

**Síntoma de una regresión:** un atacante con la URL del webhook (semi-pública — Meta la pinea en su dashboard de Developers) POSTea payload sin firma o con firma forjada, el endpoint lo procesa como si fuera de Meta, y aparecen docs falsos en `whatsapp_mensajes_inbox/{wamid}` con `wa_id` arbitrario + conversaciones envenenadas. Si la lógica de bot ya está activa (SPRINT-WA-6), también dispara respuestas automáticas al teléfono spoofeado.

**Causa raíz prevenida:** el archivo `api/whatsapp/webhook.ts` debe SIEMPRE mantener 4 invariantes:
1. `export const config = { api: { bodyParser: false } }` — sin esto, Vercel parsea el body como JSON y el HMAC se calcula sobre re-serialización (espacios, orden de keys distintos a lo que firmó Meta). Resultado: HMAC siempre falla en prod.
2. Lectura del body como `Buffer` raw (acumulación de chunks vía `req.on('data')`).
3. `crypto.createHmac('sha256', META_APP_SECRET).update(rawBody).digest('hex')`.
4. Comparación con `crypto.timingSafeEqual` (anti-timing attack — `===` filtra info byte-a-byte sobre el digest correcto).

**Regla:** los archivos `api/whatsapp/webhook.ts` Y `api/_lib/whatsappWebhook.ts` (escaneados en conjunto, ya que el helper puede vivir en `_lib/`) deben contener TODOS los siguientes patterns regex:
- `crypto.createHmac('sha256'` o `crypto.createHmac("sha256"`
- `x-hub-signature-256` (en cualquier caso)
- `timingSafeEqual`
- `bodyParser: false`

Si alguno falta → FAIL.

**Cazador:** `scripts/invariantes/check-whatsapp-webhook-hmac.ts`. Estrategia: regex sobre los 2 archivos (concat). Si NINGUNO existe, PASS silent (sprint aún no implementó). Si AL MENOS UNO existe, los 4 patterns son obligatorios.

**Allowlist:** vacía. No hay forma legítima de tener el endpoint sin los 4 invariantes. Si la lógica se mueve a otro archivo, agregar el path a `ARCHIVOS_A_ESCANEAR`.

---

## P-017 — Webhook/send WhatsApp sin idempotency (runTransaction + tx.get o tempId pre-Meta)

**Bug original (anticipado):** SPRINT-WA-1 (2026-05-19). Cazador preventivo. Doble cobertura: webhook entrante (idempotency vs reintentos Meta) + send saliente (idempotency vs timeouts de nuestra red al postear a Meta).

**Síntoma:**
- (A) **Entrante:** Meta reintenta cada POST que no responde 200 en <10s. Sin idempotency, un reintento causa doc duplicado en `whatsapp_mensajes_inbox` o counter `totalMensajesEntrantes` doblado en `whatsapp_conversaciones/{wa_id}`. Si bot está activo (SPRINT-WA-6), también dispara respuesta IA dos veces — costos Anthropic doblados.
- (B) **Saliente:** si POSTeamos a Meta y la respuesta timeoutea (pero Meta SÍ envió), un retry naive desde nuestro lado dispara DOBLE envío al cliente. Spam + posible ban de Meta por abuso.

**Causa raíz prevenida:** la única forma robusta de idempotency en Firestore es leer + escribir en el MISMO `runTransaction` callback. Patrones NO idempotentes:
- `addDoc(...)` con auto-id (id nuevo cada llamada).
- `setDoc(...)` sin `tx.get` previo dentro de tx (race: dos callbacks paralelos ambos ven "no existe" y crean).
- `if (snap.exists) return; await setDoc(...)` fuera de tx (TOCTOU).

**Regla por archivo:**
- `api/whatsapp/webhook.ts` (entrante): DEBE contener `runTransaction` Y (`tx.get(` o `transaction.get(`) Y referencia a `whatsapp_mensajes_inbox` o `whatsapp_conversaciones`.
- `api/whatsapp/send.ts` (saliente, todavía no implementado al cierre WA-1): DEBE contener `crypto.randomUUID(` (tempId) Y `addDoc/setDoc` sobre `whatsapp_mensajes_outbox` Y la escritura outbox DEBE preceder en offset a la llamada `graph.facebook.com` o `/messages`. NO usar `nanoid` (no instalado).

**Cazador:** `scripts/invariantes/check-whatsapp-idempotency.ts`. Estrategia: heurística por regex sobre offsets de match — si el archivo no existe, PASS silent para esa rama.

**Allowlist:** vacía. La excepción legítima es "archivo no existe" que ya cubre el flow.

**Limitación conocida:**
- El cazador no verifica que el ORDEN `tx.get` → `tx.set` adentro del callback sea correcto, sólo que ambos patterns estén presentes. La correctitud semántica la valida `reviewer` cuando el sprint toca este endpoint.
- Si la lógica se refactoriza a un helper en `_lib/`, extender `ARCHIVOS_WEBHOOK` / `ARCHIVOS_SEND`.

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
