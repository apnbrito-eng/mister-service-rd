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
funciones en `src/services/*.ts` que hagan ≥2 llamadas de mutación
(`updateDoc`, `setDoc`, `addDoc`, `deleteDoc`) sobre `db, '...'` distintos
sin estar dentro de `runTransaction(...)`. Caza por nombre de función
exportada.

**Allowlist:** funciones intencionalmente no-transaccionales (ej:
backfills/migraciones one-shot) marcadas con comentario
`// @safe-non-tx: <razón>` arriba de la función.

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

## P-006 — Dropdown que asigna técnico/operaria guarda `personal.id` en lugar de `auth.uid`

**Bug original:** `c4be345` (Iniciar Chequeo Aury Mon, 2026-05-07). Postmortem:
`docs/postmortems/2026-05-07-iniciar-chequeo-permission-denied.md`.

**Síntoma:** Técnico/operaria recién creado (con flujo SPRINT-105 que respeta
auto-id de Firestore en `personal/`) recibe órdenes asignadas y NO puede
ejecutar acciones gateadas por su rol — toast `permission-denied` silencioso.
Para empleados viejos cuyo `personal/{id}.id == auth.uid` por convención
manual, el bug pasa desapercibido.

**Causa raíz:** Dropdowns de "Asignar técnico" en componentes como
`OrdenCreateModal.tsx`, `OrdenEditForm.tsx`, `ModalEditarOrdenAdmin.tsx`,
`AgendaDia.tsx` y `MapaRutas.tsx` usaban `<option value={t.id}>` en lugar de
`<option value={t.uid}>`. El campo `uid` adentro del doc `personal/{id}` SÍ
es el `auth.uid` del empleado. Las rules comparan `tecnicoId == request.auth.uid`
y rechazan cuando `tecnicoId == personalDocId !== auth.uid`. Es el mismo
vector que P-001, pero la causa raíz está en el WRITE upstream (cuando el
admin asigna), no en el READ downstream (cuando el técnico ejecuta).

**Regla:** cualquier dropdown que asigna a un técnico/operaria/secretaria/
ayudante a un campo guardado en Firestore debe usar `t.uid`/`p.uid`, NO
`t.id`/`p.id`. Filtrar `tecnicos.filter(t => t.uid)` para excluir empleados
sin Auth (alta vieja sin onboarding completo). Si el dropdown es solo filtro
UI (no escribe a Firestore), agregar comentario `// @safe-tecnicoid-id: filtro UI, no escribe Firestore`.

**Cazador:** `scripts/invariantes/check-tecnicoid-personal-id-misuse.ts` —
escanea `src/**/*.tsx` por `<option value={X.id}>` donde X es identificador
corto de personal (`t`, `p`, `tec`, `op`, `sec`, etc.) y el contexto de ±20
líneas contiene tokens como `tecnicoId`, `ayudanteId`, `tecnicos.map`,
`personalActivo`. Falla si encuentra hits sin allowlist.

**Allowlist:** comentario `// @safe-tecnicoid-id: <razón>` en la misma línea
o hasta 5 líneas arriba del `<option>`. Útil cuando el select es solo filtro
visual (ej: `Comisiones.tsx`, `Mantenimiento.tsx`, `FacturaItemDetallesModal.tsx`)
y NO se persiste el valor en Firestore como `tecnicoId`.

---

## P-007 — `crearNotificacion({ userId: <X>.id })` con `personal.id` en lugar de `auth.uid`

**Bug original:** notis legacy con `userId == personalDocId` afectando a 5 empleados (Yohana, Wilainy, Jorge, misterservicerd, Maria Teresa). 44 docs invisibles en campanita. Re-migración masiva en `b781f80` (2026-05-08). Postmortem: `docs/postmortems/2026-05-08-notis-legacy-multiples-empleados.md`.

**Síntoma:** El destinatario no ve su notificación en la campanita (toast nunca llega, badge en 0). La rule de Firestore filtra `notificaciones` por `userId == request.auth.uid` y el doc tiene `userId == personal.id` (doc id auto-generado de `personal/`). Para empleados con `personal/{id}.id == auth.uid` por coincidencia (alta vieja con id manual igual al uid) pasa desapercibido — solo afecta a empleados creados con auto-id.

**Causa raíz:** Callers de `crearNotificacion({...})` enumeran personal con `personal.filter(...)` o `personal.map(...)` y pasan `<item>.id` como `userId` o `destinatarioId`. El doc id de personal NO es `auth.uid`. Lo correcto es usar `<item>.uid` y filtrar items con `uid != ''` para excluir empleados pre-SPRINT-105 sin Auth. Es vector hermano de P-001 (que sí caza `userProfile.id` literal pero no las variantes con identificadores indirectos como `admin.id`, `p.id`, `coord.id`, etc.).

**Regla:** Cuando un caller llama `crearNotificacion({ userId, destinatarioId, ... })` (o cualquier otra función que escriba a la colección `notificaciones`), el valor pasado debe ser `auth.uid` — nunca un doc id de `personal/`. Para enumerar destinatarios desde `personal.filter(...)`, filtrar primero por `p.uid` (`.filter(p => p.uid)`) y pasar `p.uid`. Para el propio user logueado, usar `currentUser.uid` del context (no `userProfile.id`).

**Cazador:** `scripts/invariantes/check-crearnotificacion-userid-shape.ts`. Detecta dentro de bloques `crearNotificacion({...})` patrones `userId: <X>.id` o `destinatarioId: <X>.id` donde `<X>` matchea identificadores típicos de personal (`admin`, `coord`, `p`, `t`, `op`, `sec`, etc.) o es `userProfile`. Bloque multi-línea soportado por balanceo de llaves.

**Allowlist:** comentario `// @safe-crearnotificacion-id: <razón>` en la misma línea o hasta 5 líneas arriba. Si crece >5 entradas, refactorear el cazador. Por archivo, allowlist vacía y se debe mantener vacía — no debería haber un caller legítimo que escriba a `notificaciones` con un doc id de personal.

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
