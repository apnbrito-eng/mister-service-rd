# Log de ejecución autónoma

> El coordinator escribe acá cada vez que ejecuta un sprint de la cola.
> Más reciente arriba. Trazabilidad para Jorge y Cowork.

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
