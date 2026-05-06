# Cola autónoma de sprints

> Cowork escribe acá. Coordinator lee y procesa cuando Jorge pega `trabaja`.
> Formato y reglas en `docs/sprints/COLA_AUTONOMA_PROTOCOLO.md`.

**Última actualización:** 2026-05-06 por coordinator (tercera pasada — SPRINT-105 cerrado)

**Próximo ID disponible:** SPRINT-106

---

## Sprints

### SPRINT-100 — Validar que Yohana ve notificaciones después de b93625d

**Estado:** PENDIENTE (requiere validación visual de Jorge/Yohana — no procesable por coordinator)
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

### SPRINT-105 — GestionUsuarios alta crea AMBOS docs (personal + usuarios)

**Estado:** COMPLETADO 2026-05-06 (Opción 3 — secondaryDb con sesión del propio user; abort sin estado parcial si falla espejo; cazador determinístico P-004 agregado; gotcha CLAUDE.md tachada como RESUELTA. Hash: pendiente push)
**Prioridad:** alta (preventivo — sin esto el próximo empleado nuevo reintroduce P-001)
**Origen:** Coordinator detectó la deuda al cerrar SPRINT-103 (DIARIO_2026-05-06.md "Próximos pasos sugeridos #2"). Jorge eligió Opción A en chat con Cowork el 2026-05-06.
**Riesgo:** medio (toca alta de empleados — si rompe, no se pueden crear usuarios nuevos hasta que se arregle)
**Touch-list previsto:**
- `src/pages/GestionUsuarios.tsx` (2 puntos: líneas ~271 y ~460-466)
- Posiblemente `src/services/usuarios.service.ts` (NUEVO si no existe — extraer la lógica para reutilizar)
- `firestore.rules` — auditar primero si la rule de `usuarios/{uid}.create` requiere ajuste para que admin pueda escribir doc espejo (probablemente ya está OK pero validar)
- `CLAUDE.md` — al cerrar, marcar como RESUELTO la gotcha "Asunción frágil técnico personal/{id}.id == auth.uid" si este sprint también la cierra (probablemente no — esa es separada)

#### Objetivo
Asegurar que cuando un admin crea un empleado nuevo desde `GestionUsuarios.tsx` (o le da acceso a un empleado existente), se creen **ambos** docs en Firestore atómicamente:

1. `personal/{auto-id}` con todos los datos del empleado + `uid: auth.uid`
2. `usuarios/{auth.uid}` con `{nombre, email, rol, activo: true, createdAt: serverTimestamp()}`

Sin esto, el `userProfile` cargado por la cascada de `AppContext` cae al fallback `personal where email==` → `userProfile.id == personalDocId !== auth.uid` → cualquier rule que valide `userId == auth.uid` rechaza con `permission-denied` (clase de bug P-001).

#### Por qué
Hoy el backfill (`scripts/backfill-usuarios-desde-personal.ts`, commit `1353b84`) migró los 21 empleados activos existentes. Pero el formulario de alta nueva NO crea el doc espejo. Apenas contrates al técnico/operaria #22, esa persona reintroducirá el problema P-001 que cazamos hoy en 6 lugares (Reactivación + Notificaciones + ModalSugerirSoloChequeo + Reprogramaciones + SugerenciasChequeo). Es deuda que se va a pagar tarde o temprano — mejor ahora que cuando aparezca un cliente perdido o una operaria frustrada.

#### Detalles técnicos del bug actual

**Punto 1 — alta nueva (líneas ~250-273 de `GestionUsuarios.tsx`):**

```ts
// Crea Auth en app secundaria para no kickear al admin
const cred = await createUserWithEmailAndPassword(secondaryAuth, form.email.trim(), form.password);
createdUid = cred.user.uid;
// ...
if (createdUid) data.uid = createdUid;
data.createdAt = Timestamp.now();
await addDoc(collection(db, 'personal'), data);  // ← solo personal
// ❌ FALTA: await setDoc(doc(db, 'usuarios', createdUid), { nombre, email, rol, activo: true, createdAt: serverTimestamp() });
```

**Punto 2 — dar acceso a empleado existente (líneas ~456-466):**

```ts
const cred = await createUserWithEmailAndPassword(secondaryAuth, accessUser.email, accessPassword);
// ...
await updateDoc(doc(db, 'personal', accessUser.id), {
  uid: cred.user.uid,
});  // ← solo update de personal
// ❌ FALTA: await setDoc(doc(db, 'usuarios', cred.user.uid), { ...accessUser, activo: true, createdAt: serverTimestamp() });
```

**Edge case — línea 473 (`uid: 'existing'`):** cuando el email ya está en Auth pero no se sabe el uid real. Hoy escribe `uid: 'existing'` como flag. Acá NO se puede crear `usuarios/{uid}` porque no tenemos el uid. Decisión: dejar como está y documentar que esa persona, al loguearse la primera vez, va a caer en cascada `personal/`. Sprint follow-up futuro podría agregar un Cloud Function que, al primer login, autocree el doc espejo. **Por ahora NO scope.**

#### Criterios de aceptación

- [ ] Al crear empleado nuevo desde `GestionUsuarios.tsx` con password (Punto 1), se crean simultáneamente:
  - `personal/{auto-id}` con `uid: cred.user.uid` (como hoy)
  - `usuarios/{cred.user.uid}` con `{nombre, email, rol, activo: true, createdAt: serverTimestamp(), creadoDesdeGestionUsuarios: true}`
- [ ] Al "dar acceso" a empleado existente (Punto 2), se hace lo mismo: update `personal` + create `usuarios/{cred.user.uid}`.
- [ ] Si la creación de `usuarios/` falla pero `personal/` ya se creó: rollback o al menos toast de warning explícito + log a `auditoria_admin` con `accion: 'alta_parcial_usuarios_pendiente'` para que el admin sepa que hay que reintentar manualmente. NO dejar el sistema en estado parcial silencioso.
- [ ] **Idealmente** (si es trivial): envolver `addDoc(personal) + setDoc(usuarios)` en un solo `runTransaction` para atomicidad. Si no lo es porque `addDoc` con auto-id no se puede en transaction, usar `setDoc(doc(collection(db, 'personal')), ...)` con id pre-generado y entonces sí transaction. Builder decide.
- [ ] Test manual sugerido (Jorge lo hace después): crear empleado de prueba "Test Operaria 2026", login con esas credenciales, verificar que ve sus notificaciones / puede crear campañas / etc. — todo lo que falló por P-001 en sprints anteriores.
- [ ] regression_guardian PASS sobre el diff (especialmente P-001 y P-003).
- [ ] `npm run check:regression` sigue en 0 hits.
- [ ] Build OK, deploy Vercel Ready.
- [ ] Si toca `firestore.rules` (probablemente NO, pero validar) → BLOQUEADO esperando OK explícito de Jorge.
- [ ] Actualizar gotcha en `CLAUDE.md` "Alta de empleado debe crear AMBOS docs" — marcar como **RESUELTO** con commit hash, ya que este sprint cierra exactamente esa deuda.

#### Restricciones / guardarrails

- regression_guardian obligatorio antes del commit final (toca pages + posiblemente services).
- Si requiere cambio en `firestore.rules` para que admin pueda escribir `usuarios/{otro-uid}` → **BLOQUEAR** y esperar OK explícito de Jorge (rules son sensibles).
- Si la transacción atómica `addDoc(personal) + setDoc(usuarios)` no es factible técnicamente, documentar la decisión en commit message y usar try/catch + rollback compensatorio + audit log.
- NO bypass del pre-commit hook.
- Mantener compatibilidad con el doc id auto-generado en `personal` — no cambiar el shape ni romper queries existentes que filtran por `email`, `rol`, `activo`.

#### Notas para el coordinator

- Antes de tocar código, **verificar la rule actual** de `usuarios/{userId}.create` en `firestore.rules`. Probablemente requiere `request.auth.uid == userId` (regla común para que cada user solo cree su propio doc). Si es así, el admin NO puede crear el doc espejo de otro uid desde el cliente — necesitaríamos:
  - **Opción 1:** Ajustar rule para permitir create por admin/coordinadora (cambio menor pero requiere OK Jorge → BLOQUEO).
  - **Opción 2:** Mover la creación de `usuarios/{uid}` al endpoint serverless en `api/` que use Firebase Admin SDK (bypassa rules). Patrón ya usado en `api/admin/reset-password.ts`.
  - **Opción 3:** Usar la `secondaryAuth` (la que ya se crea para el `createUserWithEmailAndPassword`) — esa sesión SÍ es el uid del empleado nuevo, entonces puede escribir su propio doc bajo la rule estándar. Probablemente es la opción más limpia.
  - **Builder decide** (con architect/tech_lead si hace falta) y reporta en commit message.
- Patrón existente a reusar: `secondaryApp` ya está armado para no kickear al admin durante el `createUserWithEmailAndPassword`. Aprovecharlo para escribir el doc `usuarios/{uid}` antes de `deleteApp(secondaryApp)`.
- `serverTimestamp()` vs `Timestamp.now()`: el resto del repo usa mix. Mantener consistencia con lo que ya hay en `personal`.
- Si el code crece >40 líneas en el handler, considerar extraer a `src/services/usuarios.service.ts` con una función `crearEmpleadoConAcceso({nombre, email, password, rol, ...})` que encapsule TODO (auth + 2 docs + audit log + rollback). Reutilizable en el flujo de "dar acceso" también.
- Sub-regla obligatoria del coordinator: este sprint cierra deuda de producción → además del fix, agregar entrada P-XXX en `docs/PATRONES_REGRESION.md` con cazador correspondiente. Posible cazador determinístico: `check-alta-empleado-doble-doc.ts` que escanee `GestionUsuarios.tsx` buscando `addDoc(collection(db, 'personal'`...`)` sin un `setDoc(doc(db, 'usuarios'`...`)` cercano (ventana de 20 líneas). Si no es factible cazarlo determinísticamente, dejarlo solo como gotcha en CLAUDE.md y tarea para regression_guardian semántico.

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
