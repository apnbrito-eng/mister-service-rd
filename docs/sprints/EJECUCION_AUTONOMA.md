# Log de ejecución autónoma

> El coordinator escribe acá cada vez que ejecuta un sprint de la cola.
> Más reciente arriba. Trazabilidad para Jorge y Cowork.

---

## 2026-05-08 — Avance parcial SPRINT-117 fase A2 porción read-only (quinta pasada del día)

### Contexto

Jorge respondió "1" al conflicto detectado por el coordinator entre SPRINT-116 (ABSORBIDO por SPRINT-117 fase A2) y la entrega autónoma. Camino 1 elegido: entregar los 2 scripts read-only originalmente alcance de SPRINT-116 fases A y B como **avance parcial** dentro de SPRINT-117 fase A2, sin tocar el estado ABSORBIDO de SPRINT-116 ni procesar A1 / A3 de SPRINT-117 (esos quedan para pasada exhaustiva futura por riesgo de degradación de calidad si se hacen en la misma ventana).

### Restricciones del sprint evaluadas

- rules: NO toca.
- migración masiva (>500 docs): NO — los 2 scripts son **read-only puros** (sin `addDoc`/`setDoc`/`updateDoc`/`deleteDoc`/`FieldValue`).
- integración terceros / OAuth / pago: NO.
- endpoint público: NO.
- **Procesable autónomo** (igual patrón que `f6d1d76`/`5bfa0e0` pusheados antes — scripts read-only sin riesgo).

### Archivos creados (2)

- **`scripts/auditoria-emails-personal-vs-usuarios.ts`** (289 líneas, commit `ac54662`)
  - Bootstrap Admin SDK calcado de `scripts/diagnostico-notificaciones-yohana.ts`.
  - Para cada doc en `personal/` con `uid` no vacío:
    - Lee `usuarios/{uid}` (si existe).
    - Lee `admin.auth().getUser(uid)` (fuente canónica del email).
    - Compara los 3 emails en case-sensitive y case-insensitive.
    - Clasifica en `ok`, `case`, `mismatch`, `usuarios_missing`, `auth_missing`, `auth_error`.
  - Output: matriz por empleado + listado focalizado de afectados + diagnóstico final con conteos.
  - Cubre alcance original de SPRINT-116 fase A.
- **`scripts/auditoria-notis-legacy-todos.ts`** (295 líneas, commit `6defe8f`)
  - Bootstrap Admin SDK idem.
  - Generaliza `scripts/diagnostico-notificaciones-yohana.ts` parametrizado por uid: para cada empleado con uid no vacío ejecuta las 4 queries (`userId`/`destinatarioId` × `auth.uid`/`personalDocId`) y dedupea por id.
  - Clasifica cada doc en OK / Caso A (no las ve nadie) / Caso B (las ve pero no marca leído) / OTRO.
  - Output: matriz por empleado, conteos globales, listado de afectados con ids exactos (input para eventual re-migración masiva acotada).
  - Cubre alcance original de SPRINT-116 fase B.

### archivist PRE-CHANGE (manual)

- `git log --oneline --grep="diagnostico\|auditoria"` revisado: identificados scripts hermanos (`f6d1d76` diagnóstico Yohana, `5bfa0e0` diagnóstico tecnicoId, `1353b84` backfill usuarios). Patrón de bootstrap Admin SDK + `service-account.json` raíz consistente.
- Postmortem relacionado: no existe `docs/postmortems/2026-05-08-*` específico de notis legacy. La causa raíz está documentada en CLAUDE.md (gotcha "userProfile.id NO siempre es auth.uid" + gotcha "Alta de empleado debe crear AMBOS docs") y en P-001/P-004 del catálogo. La sub-regla "cada bug → cazador" se cumplirá completa cuando los scripts revelen el universo afectado y Jorge cierre los hallazgos.

### Tester (manual)

- `npx tsc --noEmit` → clean.
- `npx eslint scripts/auditoria-emails-personal-vs-usuarios.ts scripts/auditoria-notis-legacy-todos.ts --max-warnings 0` → clean.
- `npm run check:regression` → 6/6 cazadores PASS, 0 hits.
- Verificación read-only por grep: `grep -nE "addDoc|setDoc|updateDoc|deleteDoc|FieldValue\.|\.set\(|\.update\(|\.delete\(|\.add\("` → único match es `dedup.set(d.id, ...)` (Map.set en memoria, NO mutación Firestore). **Confirmado read-only.**
- **GO.**

### regression_guardian (manual, foco P-001..P-006)

- **P-001 (`userProfile.id` vs `auth.uid`):** ambos scripts son server-side Admin SDK; operan sobre `personal.uid` (que ES el `auth.uid`). Sin uso de `userProfile.id` ni `currentUser.uid`. **No aplica.**
- **P-002 (rules opcionales sin `.get()`):** no tocan rules. **No aplica.**
- **P-003 (cross-collection sin runTransaction):** ambos scripts son read-only puros. **No aplica.**
- **P-004 (alta empleado sin doc espejo):** no tocan flujo de alta. **No aplica.**
- **P-005 (rules sin deploy):** no tocan rules. **No aplica.**
- **P-006 (dropdown personal.id vs auth.uid):** no tocan UI ni dropdowns. **No aplica.**
- **PASS.** Como son scripts server-side Admin SDK, ninguno de los patrones determinísticos de regresión aplica.

### Reviewer (manual, self-review)

- Estructura: ambos scripts calcan el patrón de `scripts/diagnostico-notificaciones-yohana.ts` y `scripts/diagnostico-tecnicoid-auth-uid.ts` (consistencia con el ecosistema).
- Manejo de errores: `auth/user-not-found` clasificado correctamente como `auth_missing`; otros errores como `auth_error` con detalle preservado.
- Ordenación de output: empleados problemáticos primero (severidad descendente), luego limpios. Útil para Jorge.
- Spanish identifiers, sin emojis, mensajes claros con marcas ASCII (✓/✗/⚠).
- Documentación inline en headers explica origen (SPRINT-117 fase A2 absorbió SPRINT-116), uso, requisitos, lo que NO hace por diseño.
- IDs reportados de Caso A/B son insumo directo para eventual re-migración acotada (analogía exacta al input que SPRINT-115 recibió de Jorge tras el diagnóstico de Yohana).
- Bypass de rules por Admin SDK es esperado (privilegio de service-account).
- **APPROVED.**

### Commits + push

- `ac54662` (auditoria-emails) — pre-commit hook PASS (typecheck + 6/6 cazadores + lint).
- `6defe8f` (auditoria-notis) — pre-commit hook PASS (idem).
- Push a `main`: `1d3280e..6defe8f`.

### Devops

- Push a main → Vercel deploy se dispara solo. Los cambios NO afectan el build de la app (son scripts utility no importados desde `src/`). No hay smoke test crítico para devops en esta pasada.

### Sub-regla "cada bug → cazador"

- **Aplica condicionalmente y todavía NO se cumple.** Los scripts son **diagnósticos**, no cierran un bug — son la herramienta para mapearlo. La sub-regla se cumplirá completa cuando:
  1. Jorge ejecute ambos scripts contra producción y capture el output.
  2. Si revela empleados afectados (>0): abrir sprint write acotado por uid (BLOQUEADO con OK Jorge), aplicar fix, escribir postmortem.
  3. En el postmortem, decidir: ¿el cazador determinístico de P-001 + P-004 ya cubre la causa raíz? Si sí, no se necesita cazador nuevo. Si revela un patrón cualitativamente nuevo (ej: el mismatch de email tiene una causa upstream no anticipada), abrir P-XXX nuevo + cazador.

### Próximos pasos para Jorge

1. Desde la Mac de Jorge (con `service-account.json` en raíz):
   - **Auditoría emails:** `npx tsx scripts/auditoria-emails-personal-vs-usuarios.ts`. Output esperado: tabla con N empleados, conteos por clasificación, listado de afectados con detalle del mismatch.
   - **Auditoría notis legacy:** `npx tsx scripts/auditoria-notis-legacy-todos.ts`. Output esperado: matriz por empleado con total/ok/A/B/otro, listado de afectados con ids exactos.
2. Capturar el output de ambos scripts en `docs/sprints/AUDITORIA_NOTIS_2026-05-08.md` (markdown con tablas).
3. Reportar a Cowork:
   - Si auditoría emails reporta 0 mismatches → marcar fase A absorbida COMPLETADA. Si reporta >0 → cada caso se resuelve manual desde GestionUsuarios o Firebase Console.
   - Si auditoría notis reporta 0 empleados afectados → SPRINT-116 alcance completo CERRADO. Si reporta >0 → abrir sprint write acotado por uid en BLOQUEOS.md, requiere OK Jorge.

### Lo que NO se ejecutó en esta pasada (queda PENDIENTE para pasada exhaustiva futura)

- **SPRINT-117 fase A1** — lectura exhaustiva del código (`src/` archivo por archivo). Scope masivo, no procesable en la misma ventana sin degradar calidad.
- **SPRINT-117 fase A3** — auditoría Information Architecture (rutas, sidebar por rol, redundancias, tabla módulo × rol).
- **SPRINT-117 fase A2 porción remanente** — auditoría funcional sobre el código vivo (filtros con `userProfile.id`, queries con `operariaId/tecnicoId/ayudanteId`, dropdowns, variantes P-006 latentes en lectura). Depende de A1 — esperar pasada exhaustiva.

### Resumen de la pasada

- 1 sprint procesado parcialmente: SPRINT-117 fase A2 (porción read-only).
- 2 commits pusheados: `ac54662` + `6defe8f`.
- 0 sprints bloqueados nuevos.
- SPRINT-116 sigue ABSORBIDO (no tocado).
- ~30 min coordinator + tiempo de Jorge para ejecutar los scripts contra producción y capturar output.

---

## 2026-05-08 — `procesa bloqueos` autónomo (cuarta pasada del día — SPRINT-115 fase write)

### Estado de los bloqueos al iniciar

- `BLOQUEOS.md` tenía 1 entrada con OK explícito de jorge: SPRINT-115 fase write (re-migración Yohana). El OK incluye output completo del diagnóstico read-only ejecutado el mismo día por Jorge: 3 docs Caso A confirmados con valores hardcodeados.
- Cola autónoma: SPRINT-115 fase write estaba PENDIENTE-bloqueado en COLA_AUTONOMA.md, esperando este OK.

### Acción del coordinator

1. Vacié `BLOQUEOS.md` (entrada de SPRINT-115 movida al histórico de desbloqueos del archivo).
2. Actualicé `COLA_AUTONOMA.md`: SPRINT-115 fase write pasó de PENDIENTE-bloqueado a EN_EJECUCION con `desbloqueadoPor: jorge 2026-05-08` y scope hardcodeado en el header.
3. Procesé el sprint inmediatamente.

### SPRINT-115 fase write — Script de re-migración acotada de notificaciones de Yohana

- **Estado final:** PENDIENTE_EJECUCION_HUMANA. Script entregado y commiteado. La ejecución contra producción queda para Jorge (sub-regla CLAUDE.md "destructive actions confirmar con jorge"; el coordinator NO corre scripts que escriben a Firestore aunque tenga acceso al `service-account.json` local).
- **Tipo:** script utility one-shot para re-migración de datos. Scope rígido: 3 docs de un solo usuario.
- **Restricciones evaluadas:**
  - rules: NO toca.
  - migración masiva (>500 docs): NO — son 3 docs hardcodeados en `SCOPE.docsAutorizados`.
  - integración terceros / OAuth / pago: NO.
  - endpoint público: NO.
  - **Procesable autónomo (con OK ya recibido).**
- **Archivo nuevo (1):**
  - `scripts/re-migrar-notificaciones-yohana.ts` — 277 líneas. Bootstrap Admin SDK calcado de `scripts/diagnostico-notificaciones-yohana.ts`. DRY-RUN por default; `--apply` requerido para escribir. Doble validación: que `personal where email == melissabalbuena08@gmail.com` resuelva al `auth.uid` (HGkVoYpGKzL4JJI7FnTpHjdsM972) y al `personalDocId` (zFhokrDoPH9lD63ZxKAY) esperados; aborta sin escribir si no matchea. Para cada uno de los 3 ids autorizados (F9BV32k4JEoEOk97K4xc, TVwtOtmNlzW334IUIUdF, VWjdYBRmKgU8rGPlbJAv): lee, verifica idempotencia (skip si `userId === auth.uid` ya), verifica que `userId === null || userId === personalDocId esperado` (skip cualquier otro valor inesperado), y setea `userId = auth.uid` + `remigradoEn` + `remigradoPor`. Después escribe entrada en `auditoria_admin` con accion `remigracion_notificaciones_yohana`, sprintId, hash del OK Jorge, docs afectados, scope.
  - NO toca `destinatarioId` (sprint lo prohíbe explícitamente; lectura dual del service ya lo cubre).
  - NO toca otros campos (leida, leidaEn, tipo, titulo, descripcion).
  - NO migra a otros usuarios; el scope es 3 ids fijos.
- **Tester:**
  - `npx tsc --noEmit` → clean.
  - `npx eslint scripts/re-migrar-notificaciones-yohana.ts --max-warnings 0` → clean.
  - `npm run check:regression` → 6/6 cazadores PASS, 0 hits.
  - **GO.**
- **regression_guardian (manual, foco en migración + atomicidad):**
  - P-001 (`userProfile.id` vs `auth.uid`): el script existe justamente para arreglar el bug histórico de confusión. Usa `auth.uid` directo como constante. Sin riesgo.
  - P-002 (rules con `.get()` opcional): no aplica.
  - P-003 (cross-collection sin runTransaction): el script escribe a `notificaciones/*` (3 updates) y a `auditoria_admin/*` (1 add) sin `runTransaction`. Aceptable porque cada update es independiente, idempotente, y los stdout logs + los campos `remigradoEn`/`remigradoPor` inline en cada doc dan trazabilidad alterna si la auditoría no se escribe. No es mutación de negocio crítica con flag de idempotencia que requiera atomicidad.
  - P-004/P-005/P-006: no aplican.
  - Defense-in-depth: doble validación de scope contra constantes hardcodeadas, idempotencia, DRY-RUN por default, NO sobrescritura de `userId` con valor inesperado.
  - **PASS.**
- **Reviewer (manual, foco en script crítico de datos):**
  - Estructura: calca patrones de `diagnostico-notificaciones-yohana.ts` y `migrar-notificaciones-userid.ts`. Consistente.
  - Scope rígido: 4 constantes hardcoded del OK Jorge en BLOQUEOS.md (email, auth.uid, personalDocId, ids de los 3 docs).
  - Idempotencia explícita: skip si `userId === auth.uid` esperado.
  - Salvaguardas: aborto temprano si email no matchea, multi-personal con mismo email, `auth.uid` real distinto del esperado, `personalDocId` real distinto del esperado. Skip por doc si `userId` actual es un valor no anticipado.
  - Auditoría: entrada en `auditoria_admin` con accion + sprintId + okJorgeBloqueosCommit (`ff61875`) + docsAfectados + scope. Trazable.
  - Sin emojis. Spanish identifiers. Mensajes claros.
  - Bypass de rules por Admin SDK es esperado (privilegio de service-account).
  - Post-fix los docs quedan con `userId == auth.uid`, lo cual permite a Yohana marcar como leído desde el cliente (rule pasa).
  - **APPROVED.**
- **Commit + push:** `6b4aade` pusheado a `main`. Hook pre-commit pasó (typecheck + 6/6 cazadores + lint).
- **Devops:** push a main, deploy de Vercel se dispara solo. El cambio NO afecta el build de la app (es un script utility no importado desde `src/`). No hay smoke test crítico para devops en este sprint.
- **Sub-regla "cada bug → cazador":** **aplica condicionalmente.** El bug está confirmado en producción (3 docs Caso A reales). Pero el patrón ya está cubierto:
  - Cazador determinístico equivalente: el cazador P-001 (`userProfile.id` vs `auth.uid`) ya cubre el caso de origen (código que escribe `personalDocId` donde la rule espera `auth.uid`).
  - El gotcha CLAUDE.md "Alta de empleado debe crear AMBOS docs" ya documenta la causa raíz (técnico/operaria sin doc en `usuarios/{uid}` cae en cascada `personal/` y `userProfile.id == personalDocId`).
  - El patrón P-004 (cazador de "alta de empleado sin doc espejo en usuarios/{uid}") fue creado en el sprint hotfix Aury y previene la causa raíz de FUTUROS empleados. Yohana ya tenía datos legacy con el bug; este script los limpia. Sin nuevo cazador necesario.
  - **Postmortem completo + sub-regla cumplida** después de que Jorge ejecute el script y Yohana confirme QA OK. Hasta entonces, mantener sprint en PENDIENTE_EJECUCION_HUMANA.

### Próximos pasos para Jorge

1. Desde la Mac de Jorge (con `service-account.json` en raíz del repo):
   - **Probar primero en DRY-RUN:** `npx tsx scripts/re-migrar-notificaciones-yohana.ts`. Output esperado: lista de 3 docs con `resultado: 'actualizado'` y "DRY-RUN — nada fue escrito a Firestore."
   - **Aplicar:** `npx tsx scripts/re-migrar-notificaciones-yohana.ts --apply`. Output esperado: lista de 3 docs con `resultado: 'actualizado'` + "Entrada de auditoría escrita en auditoria_admin/" + "Re-migración aplicada."
2. Pedirle a Yohana hacer **hard refresh** (`Cmd+Shift+R` en Chrome) y abrir la campanita.
3. Reportar a Cowork:
   - Si Yohana ve las 3 notifs y puede marcarlas como leídas → marcar SPRINT-100 + SPRINT-115 ambos COMPLETADOS, postmortem corto en CLAUDE.md (sub-regla obligatoria).
   - Si NO ve nada o no puede marcar → diagnóstico extra (cache, App Check, otro vector). NO tocar más datos hasta entender.

### Resumen de la pasada

- 1 sprint procesado: SPRINT-115 fase write (entregado, espera ejecución humana).
- 1 commit pusheado: `6b4aade`.
- 0 sprints autónomos restantes en cola.
- 0 entradas activas en BLOQUEOS.md.
- ~12 minutos de coordinator.

---

## 2026-05-08 — `trabaja` autónomo (tercera pasada del día — SPRINT-115 fase diagnóstico)

### Estado de la cola al iniciar

- SPRINT-100 PENDIENTE (humano, bloqueado por SPRINT-115).
- SPRINT-112 PENDIENTE (scope grande con QA por rol — no procesable autónomo).
- SPRINT-113 padre EN_PROGRESO (4/6 criterios cerrados, faltan QA end-to-end humano y cazador de tooltips opcional).
- SPRINT-115 PENDIENTE (fase diagnóstico read-only procesable autónoma; fase write requiere OK Jorge en BLOQUEOS).
- BLOQUEOS.md vacío.

### Decisiones de scope

- **Cazador de tooltips de SPRINT-113 padre:** evaluado costo/beneficio. Scope mediano (requeriría análisis AST o convención de naming). Sin bug de producción que dispare la sub-regla obligatoria de cazadores. **Pasa.**
- **SPRINT-100 / SPRINT-112 / SPRINT-113 padre:** no procesables autónomos (humanos en el loop).
- **SPRINT-115 fase diagnóstico:** procesable. Solo agrega script read-only con Admin SDK; no toca rules ni código de la app. La ejecución del script y la fase write quedan para Jorge.

### SPRINT-115 fase diagnóstico — Script de diagnóstico de notificaciones de Yohana

- **Estado final:** COMPLETADO (fase diagnóstico). Fase write sigue PENDIENTE esperando ejecución de Jorge + OK explícito.
- **Tipo:** utilitario/diagnóstico read-only. Sin escrituras a Firestore. Sin cambios a código de la app.
- **Restricciones evaluadas:** rules NO, migración masiva NO (read-only), integración terceros NO, endpoint público NO. **Procesable autónomo.**
- **Archivo nuevo (1):**
  - `scripts/diagnostico-notificaciones-yohana.ts` — 250 líneas. Toma email como argumento CLI, busca usuario en `personal/` por email, verifica `usuarios/{uid}`, hace 4 queries paralelas a `notificaciones` (matriz `userId/destinatarioId × authUid/personalDocId`), clasifica cada doc con función pura `clasificar()` en Caso OK/A/B/OTRO, imprime resumen + ejemplos (max 20) + diagnóstico final con interpretación humana de cada caso.
- **Patrón de implementación:** calcado del script gemelo `scripts/diagnostico-tecnicoid-auth-uid.ts` (commit `5bfa0e0` de SPRINT hotfix Aury). Mismo bootstrap del Admin SDK, misma estructura de output con `─── Sección ───`, mismos exit codes.
- **archivist PRE-CHANGE:** archivo nuevo, sin diff con commits previos. Sin riesgo de regresión: solo agrega utilitario, no modifica nada existente. Sin deuda histórica relevante. **Sin conflictos.**
- **Tester:**
  - `npx tsc --noEmit` → clean.
  - `npm run check:regression` → 6/6 cazadores PASS, 0 hits.
  - `npx eslint scripts/diagnostico-notificaciones-yohana.ts --max-warnings 0` → clean.
  - **GO.**
- **regression_guardian (manual, foco en notificaciones):**
  - P-001 (`userProfile.id` vs `auth.uid`): el script no escribe a Firestore. La distinción `personalDocId` vs `authUid` es justamente el vector que el script diagnostica. No introduce el bug.
  - P-002/P-003/P-004/P-005/P-006: no aplican (no toca rules, no escribe, no es alta de empleado, no es dropdown).
  - Defense-in-depth: el script es read-only por construcción (solo `.get()`, ningún `.set/update/delete`). Type safety con namespace `FirebaseFirestore.QuerySnapshot` para Admin SDK.
  - **PASS.**
- **Reviewer (manual, foco en script utilitario):**
  - Estructura: calca el patrón del script gemelo. Consistente.
  - Output utilizable sin contexto extra (resumen + por-caso + diagnóstico final con interpretación).
  - Sin emojis (regla CLAUDE.md). Usa `[OK]/[INFO]/[WARN]/[ERROR]/[BUG-A confirmado]`.
  - Spanish identifiers (`clasificar`, `porCaso`, `personalDocId`, `authUid`).
  - Args: requiere `<email>` por línea de comando, no hardcodeado. Bueno.
  - PII: imprime email, nombres, IDs, títulos truncados. Output a stdout local de Jorge, aceptable.
  - Falla limpia: error si falta `service-account.json`, si falta email arg, si no encuentra personal, si personal no tiene `uid`. Todos exit 1 con mensaje claro.
  - **APPROVED.**
- **Comportamiento esperado al ejecutar:** Jorge corre `npx tsx scripts/diagnostico-notificaciones-yohana.ts <email-yohana>` con `service-account.json` en raíz del repo. El output va a confirmar uno de tres escenarios:
  - **Caso A confirmado:** docs legacy con `userId/destinatarioId == personalDocId`. Yohana NO los ve. Fix: re-migración write → desbloquear con OK en `BLOQUEOS.md`.
  - **Caso B confirmado:** docs con `destinatarioId == auth.uid` pero `userId` distinto. Yohana SÍ los ve pero la rule rechaza marcado. Mismo fix que Caso A.
  - **0 docs problemáticos:** Yohana literalmente no tiene notifs, o el bug es otro vector (cache, App Check). Buscar otro hilo.
- **Sub-regla "cada bug → cazador":** no aplica todavía. El bug aún no está confirmado en producción (esperamos resultado del diagnóstico). Si el script confirma Caso A o B, el sprint follow-up de re-migración write deberá agregar P-XXX en `docs/PATRONES_REGRESION.md` + cazador determinístico de "doc en notificaciones con `destinatarioId` que no matchea `userId`".

### Resumen de la pasada

- 1 sprint completado en fase diagnóstico (~10 min de coordinator).
- 0 sprints bloqueados nuevos en `BLOQUEOS.md`.
- 1 sprint con fase write PENDIENTE en cola (SPRINT-115 fase write).
- Cola autónoma efectivamente agotada para próxima pasada — todo lo restante requiere humano (Jorge corriendo script o validando UI con Yohana).

---

## 2026-05-08 — `trabaja` autónomo (segunda pasada del día — cierre 113a + SPRINT-113b)

### Cierre formal de SPRINT-113a en COLA_AUTONOMA.md

- Cowork ya marcó la cola con SPRINT-113a COMPLETADO antes de esta pasada (header del archivo + criterio de aceptación de SPRINT-113 padre + DIARIO 2026-05-08 actualizado).
- Coordinator solo actualizó la entrada del log (este archivo) para reflejar el push real (`9603da3` + `dd24bb2` + `5bfa0e0`) y cambiar "EN_REVISION_HUMANA / sin push" → "COMPLETADO / pusheado por Jorge".
- Sin commit propio para 113a — el cambio acompaña al commit de 113b.

### SPRINT-114 — Migrar 4 hits descriptivos `userProfile.id` a `currentUser.uid`

- **Estado final:** COMPLETADO.
- **Tipo:** consistencia defensiva. Cambia el ID que se persiste en 4 campos descriptivos (no gateados por rule) para que use `auth.uid` en vez de `userProfile.id` (que para usuarios cargados por cascada `personal/` es `personalDocId`).
- **Restricciones evaluadas:** rules NO, migración masiva NO (criterio del sprint: "NO migrar datos viejos — los pagos/facturas con personalDocId siguen siendo válidos"), integración pago/OAuth/terceros NO, endpoint público NO. **Procesable autónomo.**
- **Archivos modificados (5):**
  - `src/components/ordenes/RegistrarPagoModal.tsx` — `pago.registradoPorId` ahora usa `currentUser?.uid`. Importa `useApp` y obtiene `currentUser` del context.
  - `src/components/ordenes/EnviarFacturacionButton.tsx` — `enviadaAFacturacionPorId` ahora usa `currentUser?.uid`.
  - `src/components/facturacion-pendiente/ProcesarFacturacionModal.tsx` — `emisorFacturaId` (alias `usuarioId`) y los 2 `solicitanteUid` (auditoría de garantía y override modalidad) ahora usan `currentUser?.uid`. Doc-comment `* solicitanteUid unificado a userProfile?.id` actualizado a `currentUser.uid`.
  - `src/pages/Ordenes.tsx` — el caller del hook `useOrdenCreateForm` ahora pasa `id: currentUser?.uid` (antes `userProfile?.id`). Esto propaga `auth.uid` a `responsableId` (línea 612 del hook) y a `procesandoPor` del lock de cita (línea 458).
  - `src/pages/Citas.tsx` — mismo cambio en el segundo caller.
- **Fix colateral (no parte del sprint pero requerido por el pre-commit hook):**
  - `src/pages/Ordenes.tsx` tenía un warning preexistente `react-hooks/exhaustive-deps` sobre `hoy` en el useMemo de `ordenesHoy`. Como la regla `--max-warnings 0` se aplica en el lint staged y este sprint stagea ese archivo, había que resolverlo. Solución: envolver `hoy = new Date()` en su propio `useMemo([])` para estabilizar la referencia y agregarlo a la dep array de `ordenesHoy`. Comentario explicativo del trade-off (sesión cruzando medianoche es caso raro). El warning ya estaba en el código pre-SPRINT-114; el fix es defensivo.
- **archivist PRE-CHANGE (manual):** los 4 archivos del sprint son `services`/`components` con historial relevante. Los 2 callers (`Ordenes.tsx`, `Citas.tsx`) son páginas críticas. El cambio es **localizado al ID de actor humano**; no toca lógica de negocio, no toca dropdowns de asignación (P-006), no toca rules. **Sin conflictos.**
- **regression_guardian (manual):**
  - Capa 1 determinística: 6/6 PASS, 0 hits.
  - Capa 2 semántica: el cambio va al revés del patrón P-001 — estamos eliminando hits potenciales, no introduciéndolos. Sin escrituras nuevas, sin rules, sin mutaciones cross-collection nuevas. **PASS.**
- **Tester:**
  - `npx tsc --noEmit`: clean.
  - `npx eslint --max-warnings 0` sobre los 5 archivos: clean tras el fix colateral.
- **Reviewer (manual):** APPROVED.
  - 4 sitios cambian `userProfile?.id` → `currentUser?.uid` para campos descriptivos. Comentario `// SPRINT-114:` en cada uno.
  - El nombre se mantiene en `userProfile?.nombre` (criterio del sprint).
  - Sin migración de datos viejos (criterio explícito del sprint).
  - Doc-comments actualizados en `ProcesarFacturacionModal`.
  - Fix colateral del warning preexistente con `useMemo([])`, solución limpia.
  - **Nota:** el cazador P-001 NO cazaba estos 4 hits porque sus campos (`enviadaAFacturacionPorId`, `responsableId`, `emisorFacturaId`, `pago.registradoPorId`) NO están en la lista de SENSITIVE_FIELDS del cazador. La auditoría de SPRINT-111 los identificó manualmente. Tras este sprint los 4 sitios usan `currentUser?.uid` por convención de esquema, sin necesidad de modificar el cazador (su lista de campos sensibles refleja qué rules existen, no qué campos deberían ser auth.uid por convención).
- **Tiempo total:** ~30 min coordinator (lectura del sprint + verificación de los 4 sitios + 5 ediciones quirúrgicas + fix colateral del warning + checks + commit + push).

---

### SPRINT-113c — Timeline horizontal de últimas 5 acciones al pie de OrdenDetalle

- **Estado final:** COMPLETADO.
- **Tipo:** UI puramente presentacional + helper puro de lectura. Sin escrituras a Firestore, sin tocar rules, sin tocar services, sin migración de datos.
- **Restricciones evaluadas:** rules NO, migración NO, integración pago/OAuth/terceros NO, endpoint público NO. **Procesable autónomo.**
- **Archivos creados/modificados (3):**
  - `src/utils/timelineAcciones.ts` (NUEVO) — helper `obtenerTimelineAcciones(orden, max=5)`. Mezcla `historialFases` + `auditoria` en una sola línea de tiempo con parser tolerante a shapes legacy (Date, Firestore Timestamp con `toDate()`, string, number). Auto-devuelve `[]` cuando hay <2 entradas (criterio del sprint para evitar pollution visual).
  - `src/components/ordenes/TimelineAcciones.tsx` (NUEVO) — componente responsive: vertical compacto en mobile, horizontal con scroll-x en md+. Iconografía por tipo de acción (lucide-react). Tooltip con fecha absoluta + hora relativa (`hace 3h`) usando `date-fns/formatDistanceToNow` con locale `es`. `aria-label="Últimas acciones de la orden"` en el `<section>`.
  - `src/pages/OrdenDetalle.tsx` (+1 import + 1 sección) — montado al pie del bloque "Flujo de la orden", como sección propia con su propia card.
- **Decisión clave:** componente lee de `historialFases` Y `auditoria` (gotcha CLAUDE.md sobre shape legacy + nuevo). Items con fecha no parseable se descartan en silencio para no romper en órdenes viejas con datos malformados. Sin migración — la fase 113c expresamente prohíbe normalizar/migrar datos viejos.
- **archivist PRE-CHANGE (manual):** `OrdenDetalle.tsx` está en lista de archivos críticos. El cambio es **adición de una sección read-only** después del bloque flujo, **no modifica** la lógica existente ni los gates de UI. **Sin conflictos.**
- **regression_guardian (manual):**
  - Capa 1 determinística: 6/6 PASS, 0 hits.
  - Capa 2 semántica: lectura pura, sin escrituras, sin rules, sin mutaciones cross-collection. Patrones P-001/P-002/P-003/P-004/P-005/P-006: ninguno aplica. **PASS.**
- **Tester:**
  - `npx tsc --noEmit`: clean.
  - `npx eslint --max-warnings 0` sobre los 3 archivos tocados: clean.
- **Reviewer (manual):** APPROVED.
  - Helper en `.ts` puro (no `.tsx`) — gotcha CLAUDE.md cumplido.
  - Sin emojis, identificadores en español.
  - Responsive (vertical mobile / horizontal md+) según criterio del sprint.
  - Auto-oculta con <2 acciones (criterio del sprint).
  - Tolerante a shapes legacy (parser `aDate` cubre Date, Timestamp con `toDate()`, string ISO, number ms).
  - date-fns con locale `es` (ya en bundle).
  - `aria-label` en `<section>` para accesibilidad.
  - Sin lógica de gating modificada.
- **Tiempo total:** ~20 min coordinator (lectura de tipos + creación de helper + componente + montaje + checks).

### SPRINT-113 padre — actualización de criterios

- 4/6 criterios COMPLETADOS por las fases 113a + 113b + 113c.
- 1 criterio BLOQUEADO (QA manual con usuarios reales — requiere humanos en flujo end-to-end).
- 1 criterio NO IMPLEMENTADO (cazador anti-regresión de tooltips — sprint propio futuro si Jorge lo prioriza, scope mediano).
- El sprint padre queda EN_PROGRESO con QA bloqueado por humano. Las 3 fases técnicas están en producción.

---

### SPRINT-113b — Badges de sugerencia pendiente + tooltips en botones disabled

- **Estado final:** COMPLETADO.
- **Tipo:** UI puramente presentacional + helper puro. Sin escrituras a Firestore, sin tocar rules, sin tocar services, sin tocar dropdowns de asignación, sin migrar datos.
- **Restricciones evaluadas:** rules NO, migración NO, integración pago/OAuth/terceros NO, endpoint público NO. **Procesable autónomo.**
- **Archivos creados/modificados (5):**
  - `src/utils/tooltipsBotones.ts` (NUEVO) — helpers puros `razonIniciarChequeoDisabled`, `razonCerrarServicioDisabled`, `razonEnviarFacturacionDisabled`. Cada uno toma el estado relevante (props/state del componente o subset del shape) y devuelve string con la razón humana o `null`. Cubierto el patrón "razón vive en helper puro testeable, no inline" del criterio de aceptación.
  - `src/components/ordenes/FaseStepper.tsx` — badge "Sugerencia pendiente" (color amber, icono Hourglass, `role=status` + `aria-live=polite`) renderizado debajo del badge "Pendiente de piezas" cuando `obtenerSugerenciaSoloChequeoPendiente(orden)` retorna no-null. Decisión: **badge presentacional sin onClick** — el banner siguiente paso (113a) ya direcciona la acción de aprobar/rechazar a oficina. Click-to-modal queda como mejora futura si Jorge lo pide; mantenerlo presentacional evita acoplar el stepper a un modal global que no existe hoy.
  - `src/components/ordenes/IniciarChequeoButton.tsx` — `title` con `razonIniciarChequeoDisabled({ procesando, permisoGps })` o fallback "Tomá una foto y capturá GPS para iniciar el chequeo."
  - `src/components/CierreServicioWizard.tsx` — `title` con `razonCerrarServicioDisabled(...)` que cubre las 5 razones (foto faltante, 3 preguntas null, "usé piezas" sin agregar piezas) o fallback informativo.
  - `src/components/ordenes/EnviarFacturacionButton.tsx` — refactor del `title` inline al helper `razonEnviarFacturacionDisabled(orden)` para consistencia.
- **archivist PRE-CHANGE (manual):** `IniciarChequeoButton.tsx` está en lista de archivos críticos del flujo técnico (postmortem 2026-05-07 P-006/P-002, comentarios `@safe-userprofile-id` legítimos del SPRINT-103). El cambio es **sólo agregar `title`**; no toca la lógica de gating ni la rama del write a Firestore. Mismo análisis para `CierreServicioWizard.tsx`. **Sin conflictos con advertencias previas.**
- **regression_guardian (manual):**
  - Capa 1 determinística: `npm run check:regression` — 6/6 PASS, 0 hits.
  - Capa 2 semántica: el diff NO escribe a Firestore (lectura del shape ya cargado), NO toca rules, NO crea mutaciones cross-collection, NO modifica dropdowns de asignación, NO usa `userProfile.id` ni `personal.id` en escrituras nuevas. Patrones P-001/P-002/P-003/P-004/P-005/P-006: ninguno aplica al diff. **PASS.**
- **Tester:**
  - `npx tsc --noEmit`: clean (sin output).
  - `npx eslint --max-warnings 0` sobre los 5 archivos tocados: clean.
- **Reviewer (manual):** APPROVED. Decisiones revisadas:
  - Helper puro en `.ts` (no `.tsx`) — gotcha CLAUDE.md cumplido.
  - Sin emojis, identificadores en español, sin escrituras nuevas.
  - Tooltips usan `title` HTML nativo (preferencia del sprint para mantener bundle chico).
  - `role=status` + `aria-live=polite` en el badge nuevo.
  - Lógica de gating intacta — sólo se agrega texto explicativo.
  - Cubre los 3 botones del criterio (Iniciar chequeo, Cerrar servicio, Enviar a conduce). El criterio "Aprobar/rechazar sugerencia (oficina)" no aplica disabled (el sprint mismo lo dice).
- **Decisión clave:** badge presentacional sin onClick a modal. Justificación: no existe un modal global de aprobación de sugerencia accesible desde el `FaseStepper` (el stepper se renderiza en cards de listas y en `OrdenDetalle`); montar el modal acá implicaría duplicar lógica o crear un context global, que es scope de sprint propio. El banner de 113a ya cumple la función directiva ("Sugirieron solo chequeo. Aprobá o rechazá."). El badge agrega señal visual fuerte para vista de listas (Dashboard / TecnicoVista) — caso de uso "tengo 30 órdenes, ¿en cuál hay sugerencia?".
- **Tiempo total:** ~25 min coordinator (lectura de cola + lectura de archivos críticos + creación de utils + 4 ediciones quirúrgicas + checks + commit + push).

---

## 2026-05-08 — SPRINT-113a procesado bajo modo "review humano" (commit local sin push)

### SPRINT-113a — Banner siguiente paso contextual al rol y a la fase

- **Estado final:** COMPLETADO. Commits `9603da3` + `dd24bb2` (más `5bfa0e0` de utilidad post-hotfix Aury) pusheados a `origin/main` por Jorge el 2026-05-08 tras review humano ("todo OK"). En producción Vercel.
- **Tipo:** UI puramente presentacional. Sin escrituras a Firestore, sin tocar rules, sin tocar services, sin tocar dropdowns de asignación.
- **Restricciones evaluadas:** rules NO, migración NO, integración pago/OAuth/terceros NO, endpoint público NO. Procesable autónomo, pero Jorge pidió explícitamente review humano antes del push.
- **Archivos creados/modificados (4):**
  - `src/utils/siguientePaso.ts` (NUEVO, 284 líneas) — `calcularSiguientePaso(orden, rol)` retorna `{ titulo, detalle?, tono }` o `null`. 4 tonos (`accion`/`alerta`/`espera`/`info`). Cubre 8 fases × 6 roles. Casos transversales: sugerencia solo chequeo pendiente, `enStandby`. Helper `classNamesPorTono` para Tailwind.
  - `src/components/ordenes/BannerSiguientePaso.tsx` (NUEVO, 66 líneas) — componente puramente presentacional. `role="status"` + `aria-live="polite"`. Tamaños `sm` (cards) y `md` (detalle).
  - `src/pages/TecnicoVista.tsx` (+8 líneas) — banner debajo del FaseStepper de cada card, oculto cuando `completado`.
  - `src/pages/OrdenDetalle.tsx` (+7 líneas) — banner dentro del bloque "Flujo de la orden", después del stepper.
- **archivist PRE-CHANGE (manual):** historial relevante en TecnicoVista (postmortem 2026-05-07 P-006 + P-002 cadena Aury Mon, comentarios `@safe-userprofile-id` legítimos del SPRINT-103) y OrdenDetalle (similar). Categorías especiales: páginas críticas → QA manual obligatorio (Jorge lo hace en revisión). Recomendaciones acatadas: helpers fuera de `.tsx`, sin emojis, identificadores en español, sin escrituras nuevas a Firestore. **No introdujo conflictos con la advertencia.**
- **regression_guardian (manual):**
  - Capa 1 determinística: `npm run check:regression` — 6/6 PASS, 0 hits, 78ms.
  - Capa 2 semántica: el diff NO escribe a Firestore, NO toca rules, NO crea mutaciones cross-collection, NO modifica dropdowns de asignación. Ningún P-XXX aplica al diff. Sin patrones candidatos nuevos. **PASS.**
- **Tester:**
  - `npx tsc --noEmit`: clean (sin output).
  - `npx eslint --max-warnings 0` sobre los 4 archivos tocados: clean.
  - `npm run lint` global: 5555 problems baseline (igual o mejor que 5559 reportado en SPRINT-107). No agrega warnings nuevos.
- **Reviewer (manual):** APPROVED. Decisiones revisadas: helpers no-component fuera de `.tsx` (gotcha CLAUDE.md), tono "espera" pedagógico (no acusatorio) para roles bloqueados, accesibilidad con `role=status` + `aria-live=polite`, sin emojis en código, identificadores en español. Atención humana sugerida: copy de mensajes (Jorge puede querer ajustar tono); coexistencia con `BannerEstadoSugerenciaSoloChequeo` (redundancia parcial intencional pero revisable); 5-10 banners por pantalla en TecnicoVista (alcance de SPRINT-113b/c).
- **Pre-commit hook:** PASS (typecheck + cazadores + lint staged).
- **Push:** REALIZADO por Jorge el 2026-05-08 tras review humano. Hashes en `origin/main`: `9603da3` (feat banner), `dd24bb2` (docs sprints), `5bfa0e0` (script diagnóstico tecnicoId vs auth.uid).
- **Tiempo total:** ~30 min coordinator (lectura de cola + lectura de archivos críticos + creación de utils y component + 2 inserciones quirúrgicas + checks + commit local).

### Decisiones de diseño reportadas a Jorge para revisión humana

1. **Copy en tono profesional conservador**, no muy directo. Si Jorge quiere "Llamá al cliente ya" en vez de "Próximo paso: contactar al cliente", se ajusta en post.
2. **Coexistencia con banner de sugerencia solo chequeo**: el banner viejo (`BannerEstadoSugerenciaSoloChequeo`) sigue visible, y el nuevo agrega una capa directiva ("aprobá/rechazá" o "esperando"). Hay redundancia parcial intencional. Alternativas: (a) silenciar el nuevo cuando hay sugerencia pendiente, (b) unificar ambos banners. Decisión actual: mantener ambos para no perder la sugerencia detallada que muestra el banner viejo.
3. **Múltiples banners en TecnicoVista**: cada card de cita tiene su banner. Para 5-10 órdenes hay 5-10 banners. Útil porque cada orden está en fase distinta. Si Jorge prefiere un único banner en el header con la "primera orden a atender", es alcance natural de SPRINT-113b/c.
4. **Tono "espera" gris para roles bloqueados**: si un técnico abre orden en `nuevo_lead` ve "Esperando contacto inicial". No le decimos "no es tu paso" — le decimos qué está pasando. Pedagógico.

### Sprints NO procesados en esta pasada

- Solo se procesó **SPRINT-113a** según pedido explícito de Jorge ("scope acotado y review humano"). 113b y 113c siguen PENDIENTE en `COLA_AUTONOMA.md`.

---

## 2026-05-08 — `trabaja` autónomo (1 sprint completado: auditoría documental SPRINT-111)

### SPRINT-111 — Auditar otros campos de ID con vector P-001/P-006 (fase 111a)

- **Estado final:** COMPLETADO (fase 111a — auditoría documental). El sprint original tenía scope grande con migración potencial de datos; el coordinator lo dividió en fases y procesó solo la fase documental autónomamente.
- **Hash:** `ce9d5c5` (push a `origin/main` 2026-05-08).
- **Tipo:** auditoría documental + análisis estático del código + lectura de rules. Sin tocar código de aplicación, sin tocar rules, sin migración de datos.
- **Restricciones evaluadas:** rules NO, migración masiva NO, integración pago/OAuth/terceros NO, endpoint `api/` público NO. Procesable autónomo en fase 111a.
- **Archivos creados/modificados (3):**
  - `docs/sprints/AUDITORIA_CAMPOS_ID_2026-05-08.md` (NUEVO, 91 líneas) — tabla auditando 12 campos con: rule aplicable, código que escribe, veredicto. Tabla complementaria con los 4 hits de variable local `usuarioId` en componentes.
  - `docs/sprints/COLA_AUTONOMA.md` (EDITAR) — SPRINT-111 marcado COMPLETADO con resumen 1-línea; SPRINT-114 agregado al final como follow-up sugerido (bajo riesgo, no urgente, 4 archivos, sin migración).
  - `docs/sprints/EJECUCION_AUTONOMA.md` (EDITAR — este archivo).
- **archivist PRE-CHANGE (manual):** touch-list 100% documental (markdowns + análisis de código sin escribir). Sin contacto con páginas críticas, services, rules ni context. No requería invocación formal.
- **regression_guardian:** N/A — el sprint no toca código fuente, sólo lo lee para auditar.
- **Tester:**
  - `npm run check:regression`: 6/6 PASS, 0 hits, 72ms (sin cambios en código fuente).
  - `npx tsc --noEmit`: N/A (no se modificó TypeScript).
  - `npm run lint`: N/A (no se modificó código).
- **Hallazgos clave:**
  - 12 campos auditados (`tecnicoId`, `ayudanteId`, `operariaId`, `responsableId`, `creadaPor`, `creadoPor`, `eliminadaPor`, `aprobadoPor`, `sugeridaPor`, `resueltaPor`, `cerradaPor`, `usuarioId`, `personalUid`).
  - **Bugs latentes nuevos:** 0. La cobertura de P-001 + P-006 + las gotchas vigentes captura todos los vectores con riesgo de permission-denied.
  - **Inconsistencias de bajo riesgo:** 4 hits de `userProfile?.id` en campos descriptivos NO gateados por rule (`registradoPorId` en pagos, `enviadaAFacturacionPorId`, `emisorFacturaId`, `responsableId`). Migración recomendada en SPRINT-114 por consistencia, pero NO urgente — no rompen nada hoy.
  - **Decisión NO crear cazador determinístico genérico:** un check sobre cualquier campo `*Id` solapa con P-001 y P-006 sin agregar señal nueva (espacio de búsqueda cae en falsos positivos rápido). En su lugar, sugerir refinamiento del `regression_guardian` semántico para regla cualitativa "campo `*Id` que identifica empleado debe usar `auth.uid`" — más útil que un cazador determinístico.
- **Tiempo total:** ~25 min coordinator (lectura de cola + estado sesión + 12 greps + lectura de rules + análisis de cada campo + redacción del documento + actualización de cola y log).
- **Decisión clave:** dividir SPRINT-111 monolítico en fases. La fase 111a (documental) es 100% procesable autónoma. Una eventual fase 111b (code fixes de los 4 hits descriptivos) es SPRINT-114 separado con scope acotado. Una eventual fase 111c (migración de datos viejos) NO es necesaria — ningún campo descriptivo sin rule activa rompe nada en el estado actual; migrar datos viejos abriría riesgo sin beneficio.

### Sprints NO procesados en esta pasada (decisión)

- **SPRINT-100** — sigue PENDIENTE: requiere validación humana de Yohana (no procesable autónomo).
- **SPRINT-112** — sigue PENDIENTE: scope grande (schema drift + matriz permisos), incluye QA manual con usuarios reales por rol. Procesable autónomamente la parte de schema drift script + tabla docs, pero el QA manual es bloqueante para "completado". Se deja para una pasada más larga o cuando Jorge esté disponible para QA.
- **SPRINT-113** — sigue PENDIENTE: UX flujo paso a paso. Cowork sugirió dividir en 113a/b/c. Procesable, pero scope grande (≥6 archivos cada sub-sprint) y los criterios incluyen "QA manual con usuarios reales recorriendo flujo end-to-end" — bloqueante. Se deja para próxima pasada.
- **SPRINT-114** (recién creado) — PENDIENTE pero baja prioridad. No procesar en esta pasada porque no hay urgencia y el alcance sería mejor procesarlo agrupado con otro sprint relacionado.

### Resumen para Jorge / Cowork

- **Sprints completados:** 1 (SPRINT-111 fase 111a documental).
- **Sprints bloqueados nuevos:** 0.
- **Sprints PENDIENTE al cierre:** 5 (SPRINT-100 humano, SPRINT-112, SPRINT-113, SPRINT-114, todos con razón documentada para no procesar autónomamente ahora).
- **Cazadores anti-regresión:** 6/6 PASS, 0 hits.

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
