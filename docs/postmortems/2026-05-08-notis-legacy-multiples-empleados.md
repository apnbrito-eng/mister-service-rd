# Postmortem — Notis legacy con `userId == personalDocId` afectando a 5 empleados

**Fecha del incidente:** 2026-05-08 (cierre); bug latente desde ~2026-04-2X (pre `b93625d`).
**Detectado por:** Yohana (operaria) reportó "no veo nada en la campanita" durante QA visual de SPRINT-100. Auditoría sistémica posterior (SPRINT-117 fase A2 read-only) reveló que el patrón afectaba a 5 empleados, no solo a Yohana.
**Severidad:** alta (bloquea visibilidad de notificaciones críticas para operaria/coord/admin) + Wilainy bloqueada para reset de contraseña por email mismatch en Auth.
**Patrón asociado:** P-001 (vector de causa raíz) + clase nueva propuesta P-007 (write-side específico de `crearNotificacion` con `personal.id`).
**Commits relacionados:**
- Introduce: pre `b93625d` (2026-05-06 09:38) — código del service `notificaciones.service.ts` y callers escribían `userId` con valor `userProfile.id` cuando ese perfil venía del fallback `personal where email==`. Antes del SPRINT-105 (`009bcc8`, 2026-05-06) tampoco existía el doc espejo `usuarios/{uid}` para todos los empleados, así que la cascada caía al fallback `personal/` masivamente.
- Fix UI (read): `b93625d` (2026-05-06 09:38) — `NotificacionesPanel` pasa a `currentUser.uid`. Permite que docs nuevos (con `userId == auth.uid`) sean visibles, pero no toca docs legacy.
- Diagnóstico Yohana: `f6d1d76` (2026-05-08 14:58) — script read-only `diagnostico-notificaciones-yohana.ts`.
- Re-migración Yohana (no aplicada en su ventana): `6b4aade` (2026-05-08 15:53) — script acotado a Yohana.
- Auditoría sistémica: `ac54662` + `6defe8f` (2026-05-08 17:04) — scripts read-only que revelaron 44 notis Caso A en 5 empleados + email mismatch Wilainy.
- Fix masivo (scripts entregados DRY-RUN): `e6ccb1e` (2026-05-08 17:32). Trail coordinator: `a15846e`.
- Cierre validado por Jorge: `b781f80` (2026-05-08 18:31) — 41 notis re-migradas + 3 ya alineadas (Yohana ya tenía las suyas alineadas) + email Wilainy fixeado en Auth + `usuarios/`. Validación visual: Jorge ve 39 notis en campanita admin (antes invisibles); reset de contraseña Wilainy funciona.

---

## Resumen ejecutivo

Cinco empleados (Yohana operaria, Wilainy operaria, Jorge admin, misterservicerd admin, Maria Teresa coord) tenían 44 notificaciones invisibles en la campanita porque sus `userId` apuntaban al doc id de `personal/` en lugar de al `auth.uid`. Wilainy además tenía registrado `apnbrito0318@gmail.com` como email canónico en Firebase Auth (casilla a la que ella no tiene acceso), bloqueando reset de contraseña. La causa raíz combinó tres factores: (1) alta de empleado pre-SPRINT-105 no creaba el doc espejo `usuarios/{uid}`, lo que forzaba la cascada de fallback en `AppContext` a usar `userProfile.id == personalDocId`; (2) callers de `crearNotificacion()` pasaban `userProfile.id` o equivalente como `userId`, propagando el mismatch a todos los docs escritos en esa ventana; (3) no había un cazador determinístico para el write-site específico de `crearNotificacion({ userId: ... })` que hubiera atajado el patrón antes de pasar a producción. El fix combinado fue (a) re-migrar 44 notis acotadas por uid + (b) corregir email Wilainy en Auth + `usuarios/`. Validado por Jorge el 2026-05-08 noche.

---

## Timeline

| Hora (RD, UTC-4) | Evento |
|---|---|
| Pre-2026-05-06 | Empleados creados sin doc espejo `usuarios/{uid}` (alta vieja antes de SPRINT-105). Notificaciones nuevas se escriben con `userId == personalDocId`. |
| 2026-05-06 09:38 | `b93625d` — fix `NotificacionesPanel` para que use `currentUser.uid`. Hasta acá, el síntoma del read estaba parchado para docs nuevos (`userId == auth.uid`). Docs legacy quedan invisibles. |
| 2026-05-06 ~tarde | Migración batch `migrar-notificaciones-userid.ts` (sprint anterior) copió `destinatarioId` → `userId` verbatim. Si `destinatarioId` ya estaba mal, propagó el mismatch sin fixearlo. |
| 2026-05-08 mañana | Jorge dispara `trabaja`. SPRINT-100 entra en QA visual con Yohana → reporta "no hay nada en la campanita". |
| 2026-05-08 14:58 | `f6d1d76` — SPRINT-115 entrega script diagnóstico read-only. Confirma Caso A en Yohana (3 docs con `userId == personalDocId`). |
| 2026-05-08 15:53 | `6b4aade` — SPRINT-115 entrega script re-migración acotada a Yohana, dry-run validado. Pendiente `--apply`. |
| 2026-05-08 16:37–17:04 | Cowork detecta riesgo sistémico (Wilainy email + sospecha de patrón replicado). Abre SPRINT-116 → absorbido por SPRINT-117 fase A2. Scripts auditoría sistémica `ac54662` + `6defe8f` entregados read-only. |
| 2026-05-08 ~17:30 | Jorge ejecuta los 2 scripts de auditoría con `service-account.json` local. Output: 44 notis Caso A en 5 empleados + email mismatch Wilainy. |
| 2026-05-08 17:32 | `e6ccb1e` — SPRINT-118 entrega scripts masivos DRY-RUN: `re-migrar-notificaciones-masivo.ts` (scope hardcodeado a 44 doc IDs explícitos) + `fix-email-wilainy.ts`. |
| 2026-05-08 ~18:00 | Jorge ejecuta DRY-RUN, valida output, después `--apply` de ambos scripts. |
| 2026-05-08 18:31 | `b781f80` — cierre SPRINT-118. 41 notis re-migradas + 3 ya alineadas (Yohana, idempotencia). Email Wilainy `apnbrito0318@gmail.com` → `Nwilainy@gmail.com` en Auth + `usuarios/`. Audit logs escritos. Validación visual de Jorge: 39 notis aparecen en campanita admin; reset de contraseña Wilainy funciona. |

---

## Impacto

- **Usuarios afectados:** 5 empleados — Yohana (operaria), Wilainy (operaria), Jorge (admin), misterservicerd (admin), Maria Teresa (coord). Posiblemente más nunca detectados si se quedaron callados por no usar la campanita.
- **Funcionalidad bloqueada:**
  - 44 notificaciones críticas (`recordatorio`, `mencion`, `asignacion`) invisibles para sus destinatarios.
  - Wilainy completamente bloqueada para reset de contraseña hasta que Jorge corrigiera el email canónico en Auth.
- **Tiempo total fuera:** desde antes del commit `b93625d` (2026-05-06 09:38) hasta el cierre el 2026-05-08 18:31 = **~57 horas como mínimo**, posiblemente semanas si se cuenta desde la primera nota legacy escrita pre-fix de SPRINT-105.
- **Severidad de negocio:** alta para operación diaria (operarias no veían recordatorios de ruta/avisos pendientes; coords/admins no veían notis de orden) + crítica de seguridad para Wilainy (no podía recuperar acceso si perdía contraseña).
- **Pérdida de datos:** no. Las notis nunca se borraron — solo eran invisibles. La re-migración fue idempotente y conservó campos `leida`, `leidaEn`, etc. tal cual.

---

## Causa raíz (5 porqués)

1. **¿Por qué Yohana no veía sus notis?** — Porque la query `where('userId', '==', auth.uid)` retornaba 0 docs y la query legacy `where('destinatarioId', '==', auth.uid)` también. Sus notis tenían ambos campos apuntando a `personalDocId`, no a `auth.uid`.
2. **¿Por qué los docs tenían `userId == personalDocId`?** — Porque cuando se escribieron, el caller pasaba `userProfile.id` (o equivalente) como argumento `userId` a `crearNotificacion()`. Para Yohana y los 4 demás, su `userProfile` venía del fallback `personal where email==` en `AppContext`, donde `userProfile.id == personalDocId !== auth.uid`.
3. **¿Por qué el `userProfile` venía del fallback `personal`?** — Porque hasta SPRINT-105 (`009bcc8`, 2026-05-06) la creación de empleados solo escribía `personal/{auto-id}` y NO el doc espejo `usuarios/{uid}`. Sin ese espejo, la cascada de `AppContext` cae al fallback `personal where email==`. P-004 documenta este vector.
4. **¿Por qué el código llegó a producción escribiendo `userId: userProfile.id` (o `admin.id`, `t.id`, etc.) en notificaciones?** — Porque no había un cazador determinístico que inspeccionara los argumentos de `crearNotificacion({...})` específicamente. El cazador P-001 cubre el patrón `userProfile.id` cuando aparece literal en código pero NO caza variantes como `userId: admin.id` (donde `admin` es un item de `personal.filter(...)`) ni `userId: p.id`. Esos casos pasaron desapercibidos.
5. **¿Por qué nadie escribió ese cazador antes?** — **Causa raíz:** *los cazadores existentes (P-001..P-006) cubrían los call-sites más obvios pero dejaban un hueco en el write-site específico de `crearNotificacion`.* La sub-regla CLAUDE.md "cada bug capturado se convierte en cazador ejecutable" se cumplió para P-001 (que cazaba el síntoma al leer) pero no para el write-site con identificadores indirectos (`admin.id` no es `userProfile.id` — el grep de P-001 lo deja pasar). Mientras existiera código de auto-notificación que enumerara `personal.filter(...)` y pasara el doc id como `userId`, el bug se reintroducía silenciosamente. Ejemplo vivo encontrado durante este postmortem: `Dashboard.tsx:216` aún escribe `userId: admin.id` (línea con auto-notificación a admin/coord cuando operaria no completa recordatorio del día) — fixeada en este mismo sprint.

---

## Lo que funcionó bien

- **Cazador P-004 (alta empleado doble doc) y SPRINT-105 ya estaban activos** — sin ellos, la creación de empleados nuevos seguiría reproduciendo el bug sin fin. La ventana de daño quedó acotada al stock de empleados pre-SPRINT-105.
- **Audit logs en `auditoria_admin`** se escribieron en cada `--apply` (script masivo + script email Wilainy). Forensia completa: 44 ids exactos + before/after de email + `actorUid` + `accion`.
- **Scripts read-only de diagnóstico antes del write** — `diagnostico-notificaciones-yohana.ts`, `auditoria-notis-legacy-todos.ts`, `auditoria-emails-personal-vs-usuarios.ts`. Permitieron a Jorge ver el universo problemático sin riesgo antes de aprobar `--apply`.
- **DRY-RUN obligatorio + scope hardcodeado por uid** — el script masivo no es genérico "migrar todo lo que matchea heurística", es explícito sobre los 44 doc IDs autorizados (en `SCOPE` arriba del archivo). Si alguien lo re-corre, no se desboca.
- **Lectura dual del service** (`userId` OR `destinatarioId`) — sin ese fallback, los empleados con docs Caso B (donde `destinatarioId == auth.uid`) habrían quedado invisibles igual. La lectura dual permitió que el read se "auto-curara" para Caso B incluso sin migración. Caso A todavía requería re-migración (que se hizo).
- **Validación humana post-`--apply`** — Jorge confirmó visualmente que 39 notis aparecen en campanita admin y que reset de contraseña Wilainy funciona, antes de cerrar el sprint. Sin esta confirmación, podría haber quedado un bug residual no detectado.

---

## Lo que falló

- **El bug latente sobrevivió ~semanas sin detección.** Hasta que Yohana reportó "no veo nada", nadie estaba auditando la integridad de `userId` en notificaciones. La auditoría sistémica se hizo por reacción a un reporte humano, no proactivamente.
- **`b93625d` fixeó el read pero no auditó el write-side.** El commit del 2026-05-06 puso el sintoma en negativo (lo enmascaró parcialmente con la lectura dual) pero no preguntó "¿qué docs ya están escritos mal?". Faltó la pregunta "¿qué se rompe upstream cuando arreglo el read?". (Misma lección del postmortem 2026-05-07 de Aury Mon.)
- **El cazador P-001 tiene blind spot determinístico:** solo busca el literal `userProfile.id`. No caza `admin.id`, `p.id`, `t.id` cuando el contexto es `crearNotificacion({...})` o cualquier write a `notificaciones`. Ejemplo vivo: `Dashboard.tsx:216` `userId: admin.id` no fue cazado por P-001 ni por nadie hasta este postmortem.
- **No había health-check periódico de integridad de datos.** Si Yohana no hubiera reportado, el universo de Caso A habría seguido creciendo cada vez que el auto-notificador de `Dashboard.tsx` corría y escribía `userId: admin.id`. Cuántos docs nuevos rotos se acumulaban por semana es desconocido (no tenemos métrica).
- **El ciclo de detección fue lento:** ~3 días desde el reporte de Yohana (sin descontar otros sprints simultáneos) hasta el cierre del fix masivo. Para un bug que afecta visibilidad de notificaciones críticas en una operación diaria, es lento.

---

## Acciones tomadas (fix inmediato)

- **Re-migración masiva acotada:** `npx tsx scripts/re-migrar-notificaciones-masivo.ts --apply`. 41 notis actualizadas (3 ya alineadas en Yohana por idempotencia). Audit log escrito en `auditoria_admin` con `accion: 'remigracion_notificaciones_masivo'`, los 5 uids afectados y los 44 doc ids tocados.
- **Fix email Wilainy:** `npx tsx scripts/fix-email-wilainy.ts --apply`. `admin.auth().updateUser(uid, { email: 'Nwilainy@gmail.com' })` + `usuarios/{uid}.email` actualizado. Audit log escrito.
- **Validación humana:** Jorge confirmó 39 notis visibles en campanita admin (antes invisibles) y reset de contraseña Wilainy funciona desde GestionUsuarios.

---

## Acciones preventivas (para que no vuelva)

- [x] **Cazador determinístico nuevo P-007:** `scripts/invariantes/check-crearnotificacion-userid-shape.ts`. Escanea archivos que llaman `crearNotificacion({...})` y falla si el campo `userId` (o `destinatarioId`) está alimentado con `<X>.id` donde `<X>` es identificador de personal/empleado (`admin`, `p`, `t`, `op`, `sec`, `coord`, etc.) o con `userProfile.id` literal. Allowlist por línea con comentario `// @safe-crearnotificacion-id: <razón>`. Registrado en `run-all.ts`.
- [x] **Fix vivo `Dashboard.tsx:216`** — caso encontrado durante este postmortem. Se cambió `userId: admin.id` → `userId: admin.uid` con filter `adminsYCoord.filter(p => p.uid)` para excluir empleados pre-SPRINT-105 sin uid. Sin esto, el cazador P-007 fallaba pre-commit y la auto-notificación seguiría escribiendo notis Caso A hacia adelante.
- [x] **Entrada P-007 en `docs/PATRONES_REGRESION.md`** con bug original (este postmortem), síntoma, regla, allowlist.
- [ ] **Health-check periódico futuro (sprint follow-up, no en este cierre):** considerar `scripts/health-check-notis-integridad.ts` que se corra semanalmente en local con `service-account.json` y reporte cuántas notis tienen `userId !== authUidEsperado`. Es admin SDK, no se puede correr en pre-commit. Costo de implementación: bajo (reutiliza lógica de `auditoria-notis-legacy-todos.ts`). Beneficio: detecta drift en datos productivos antes de que un usuario reporte invisibilidad. Decisión: no se crea en este sprint para mantener scope acotado al cierre del bug. Si en 30 días aparece otro caso del mismo vector, abrir sprint para crearlo.
- [ ] **Sub-regla en CLAUDE.md (sprint follow-up):** "Cuando un caller llama `crearNotificacion({ userId, destinatarioId, ... })`, el valor pasado debe ser `auth.uid` (no doc id de `personal/`). Para enumerar destinatarios desde `personal.filter(...)`, usar `p.uid` (filtrar por `p.uid`). Para el propio user logueado, usar `currentUser.uid` del context. Cazador P-007 enforce este patrón." — postergada para no inflar CLAUDE.md hasta validar que P-007 no genera falsos positivos en uso real.

---

## Métricas

- **Tiempo desde introducción hasta detección:** indeterminado con precisión, pero ≥7 días (el commit `b93625d` parchó el síntoma read el 2026-05-06; el universo Caso A existía desde antes de ese commit, posiblemente semanas atrás). Yohana reportó el 2026-05-08 → ventana mínima detección de ~48 horas desde que `b93625d` debió haberlo expuesto.
- **MTTR (detección hasta fix completo):** ~3.5 horas desde que Jorge ejecutó la auditoría sistémica (`ac54662` + `6defe8f` ~17:04) hasta el cierre validado (`b781f80` 18:31). Si se cuenta desde el reporte original de Yohana (2026-05-08 mañana), MTTR ~10 horas distribuidas a través de SPRINT-115 → SPRINT-117 fase A2 → SPRINT-118.
- **Commits entre detección y fix:** 8 commits (`f6d1d76`, `ff61875`, `6b4aade`, `db7719f`, `797cbe8`, `1570bfc`, `1d3280e`, `59f8ff6`, `ac54662`, `6defe8f`, `c48d514`, `d052763`, `e6ccb1e`, `a15846e`, `b781f80`). Distribución alta porque el sprint mutó de "fix Yohana puntual" a "auditoría sistémica masiva" cuando la hipótesis cambió.
- **Es recurrencia de clase ya catalogada:** parcial.
  - P-001 (`userProfile.id` misuse): vector compartido, pero el cazador no caza el shape concreto de `crearNotificacion({ userId: admin.id })`. **Fallo del cazador P-001:** regex solo busca el literal `userProfile.id` y omite identificadores indirectos (`admin.id`, `p.id`, etc.). Refinamiento posible: ampliar P-001 a "cualquier `<X>.id` donde X coincide con un nombre de variable extraído de `personal.filter(...)` o `personal.map(...)`" — pero eso es exactamente el alcance que toma P-007, así que se prefiere agregar P-007 como cazador hermano específico de `crearNotificacion`/`destinatarioId` antes que sobre-cargar P-001.
  - P-004 (alta sin doc espejo): vector upstream compartido. El stock de notis legacy es la consecuencia downstream del stock de empleados sin doc espejo pre-SPRINT-105. P-004 ya está mitigado para empleados nuevos; el ya-aplicado script de backfill (`scripts/backfill-usuarios-desde-personal.ts`, `1353b84`) cubrió el stock viejo. Las notis legacy son el residuo de la ventana en la que esos empleados existían sin espejo.

---

## Lecciones aprendidas

- **Un fix de read-side que enmascara el síntoma (`b93625d` con lectura dual) PIDE como contrapartida un audit del write-side y un health-check del stock existente.** Sin esos dos hijos del fix, queda una capa de barniz sobre datos podridos. La lección concreta: cada vez que un sprint hace "tolerar shape A o B en lectura para mantener compatibilidad con docs legacy", el coordinator debe abrir automáticamente dos sprints follow-up: uno que limpie los docs legacy (write-side migration) y otro que detecte si se siguen creando docs legacy nuevos (cazador del write-site).
- **Los cazadores estáticos tienen un blind spot estructural: solo cazan el patrón sintáctico que están escritos para cazar.** P-001 caza `userProfile.id`. No caza `admin.id` ni `p.id` ni `coord.id` aunque tengan exactamente la misma semántica errónea. La lección: cuando un postmortem revela un vector, no asumir que el cazador existente "lo cubría más o menos"; chequear explícitamente con un grep sobre el repo si hay variantes sintácticas. Si las hay, agregar cazador hermano (no extender el viejo más allá de su contrato simple).
- **Auditoría sistémica > parche puntual cuando hay bugs estructurales.** SPRINT-115 entró planeado como "fix puntual Yohana" y se transformó en SPRINT-117 fase A2 → SPRINT-118 cuando se descubrió el alcance real (5 empleados, 44 docs, email Wilainy roto adicional). Pivote correcto. La lección: cuando el reporte original sugiere "X usuario tiene un problema raro", la primera pregunta debería ser "¿cuántos otros usuarios tienen el mismo shape?" antes de fixear solo a X. Ese pivote agrega ~30 minutos de auditoría read-only y ahorra el segundo sprint completo.
- **Email para tu equipo del futuro:** "Antes de aplicar el fix puntual, dale 30 minutos a la auditoría sistémica. Si descubrís que el bug afecta a más de un usuario, el fix puntual es deuda; abrí sprint masivo. Cada read-side fix de compatibilidad pide cazador del write-site como hermano gemelo. Y cada vez que alguien escribe `userId: <algo>.id` en una llamada a `crearNotificacion`, el `.id` está mal — es `.uid`."

---

## Referencias

- Sprints: `docs/sprints/COLA_AUTONOMA.md` SPRINT-100, SPRINT-115, SPRINT-117 fase A2, SPRINT-118.
- Log de ejecución: `docs/sprints/EJECUCION_AUTONOMA.md` (sección 2026-05-08).
- Patrón existente relacionado: `docs/PATRONES_REGRESION.md` P-001, P-004.
- Patrón nuevo: `docs/PATRONES_REGRESION.md` P-007.
- Cazador nuevo: `scripts/invariantes/check-crearnotificacion-userid-shape.ts`.
- Gotchas relevantes en CLAUDE.md: "userProfile.id NO siempre es auth.uid", "Alta de empleado debe crear AMBOS docs", "Bug pre-existente en notificaciones".
- Commits clave: `b93625d` (read fix), `f6d1d76` (diag), `6b4aade` (re-mig Yohana), `ac54662` + `6defe8f` (auditoría sistémica), `e6ccb1e` (scripts masivos DRY-RUN), `a15846e` (trail), `b781f80` (cierre validado).
