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

**Caso concreto:** SPRINT-151 (`863e804`, 2026-05-12) persistió `notaConduce` en `facturas/{id}` desde `ProcesarFacturacionModal.tsx:534`. SPRINT-153 (`79c7fcc`, 2026-05-12) agregó el render en `OrdenResumenLectura.tsx:259`. Type `Factura.notaConduce?: string` añadido en `types/index.ts:1178`. Pero ningún sprint actualizó `parseFactura` en `utils/index.ts:1124-1170`. Resultado: 24h de feature visible en código pero inerte en producción. QA E2E del 2026-05-13 sobre CG-00018 (texto "Cliente solicita pasar factura legal aparte", 47/500 chars) confirmó 0 hits del texto en DOM.

**Regla:** cada campo del tipo `Factura` declarado en `src/types/index.ts` debe tener una asignación correspondiente en `parseFactura` (asignación explícita `clave: ...` o property shorthand `clave,`). Excepciones válidas: campos derivados o computados — deben agregarse a `SKIP_FACTURA_FIELDS` en el cazador con justificación.

**Cazador:** `scripts/invariantes/check-parser-campos-faltantes.ts`. Limita scope a `Factura ↔ parseFactura` por ahora. Extensión natural a `OrdenServicio`, `ServicioPrecio`, `PiezaInventario` queda como sprint follow-up si el bug se reproduce sobre esos tipos.

**Allowlist:** `SKIP_FACTURA_FIELDS = []`. Sumar campos solo con justificación documentada en comentario inline (campo derivado, alias legacy, etc.).

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
