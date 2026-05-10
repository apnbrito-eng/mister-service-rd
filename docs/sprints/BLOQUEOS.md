# Bloqueos — sprints que requieren OK de Jorge

> El coordinator mueve sprints acá cuando detecta que afectan rules,
> migraciones masivas, integraciones de pago, o borrados.
>
> **Para desbloquear:** editá el sprint y agregá `OK: jorge YYYY-MM-DD HH:MM`
> al final, después pegá `procesa bloqueos` al coordinator.
>
> **Para rechazar:** editá el sprint y agregá `RECHAZADO: jorge YYYY-MM-DD HH:MM <motivo>`.

---

## SPRINT-115 fase write — SUPERADO por SPRINT-118 (re-migración masiva acotada a 5 empleados)

Conservado en histórico. El alcance original (3 notis de Yohana) queda absorbido por el OK más amplio abajo.

---

## SPRINT-118 — Re-migración masiva notis legacy + fix email Wilainy en Auth — DESBLOQUEADO

**OK:** jorge 2026-05-08 (vía conversación Cowork tras auditoría con `scripts/auditoria-notis-legacy-todos.ts` + `scripts/auditoria-emails-personal-vs-usuarios.ts`).

**Movido a COLA_AUTONOMA.md como PENDIENTE el 2026-05-08 por coordinator (procesa bloqueos). desbloqueadoPor: jorge 2026-05-08.**

Conservado acá para histórico. NO procesar desde acá — la entrada activa está en `COLA_AUTONOMA.md`.

### Fase 1 — Re-migración de notis legacy (5 empleados, ~44 docs)

**Scope autorizado** (acotado por uid, NO masivo a toda la colección):

| Empleado | uid | personalDocId | Notis Caso A |
|---|---|---|---|
| Yohana Operaria | `HGkVoYpGKzL4JJI7FnTpHjdsM972` | `zFhokrDoPH9lD63ZxKAY` | 3 (de diagnóstico previo) |
| Wilainy Operaria | `KT9LaszokWNmLCEIe8YOvNKc9rF3` | `j944265Su9Hyw29YQTj8` | 14 |
| Jorge (admin) | `dN2wxlTrLUMAff1gE2K4Q8IXi2m2` | `63ZMIT2LouKFLpBCQLUk` | 9 |
| misterservicerd (admin) | `kAKPMRLe8aaAJxCrvyc8YeMoxRG3` | `GqJfIoRgP4GJTAActUKy` | 9 |
| Maria Teresa (coord) | `HgakSUkclXSyxmBeLm3GkayFOK63` | `NXFORv7bqeksSg980icg` | 9 |

**IDs específicos de docs Caso A** (output exacto del script `auditoria-notis-legacy-todos.ts` ejecutado el 2026-05-08):

- **Yohana** (3): `F9BV32k4JEoEOk97K4xc`, `TVwtOtmNlzW334IUIUdF`, `VWjdYBRmKgU8rGPlbJAv` (de diagnóstico anterior — el script general los cuenta como ok porque encuentra match con personalDocId, pero Yohana NO los ve en su campanita).
- **Wilainy** (14): `2tPkAmQymtZgMLRRQfTr`, `451UPKpR2vAmsCpsoFNv`, `8WdJHYbEYdZ4wUc4eQnE`, `BgAsQHZMPEfa3LL8ffyV`, `DpQh90B38dmVjSEJVxFv`, `ERtDuPDxeUXph8b8cSNv`, `FMnk6RpFQyxiYRiKZQln`, `JHa0TPJpGVH3OpzPPlV1`, `PFRnT9GuahrydO8g8Hhz`, `Q2Z0pBdjwo6vyK04koPZ`, `SV5DhnuxPwEOCwBwNt2t`, `vKdH6Q9dLRRYQZFUolNY`, `vfbmwla7698GcANVUShS`, `zWWMGk1UFV75sAjaOoVu`.
- **Jorge** (9): `5CZ6039fqvtRyGpiNseM`, `cWDqvmuXpFJptULZ3eOD`, `fjW4YYIq74MtaneORrCD`, `gzSt5SBjTJBRmDmB1rUq`, `lFOU7YDdREy6Rauyyp0q`, `xBUxbB10ocEH2kjLADIl`, `zisaxTDaX1vGmj6Cq9mu`, `3hV65FcsI4HJ3Q0nc4Dv`, `o5yco816RhNGwquDv8P1`.
- **misterservicerd** (9): `4WEMXrqqrAZyoxd7CfQs`, `RXpcWGzERPpfnhc8IwcR`, `WMansj9afOAJcFJbTvuH`, `eFKbcOHszof28K3NVL9s`, `k8dH5RIfMKeBx3QDHagB`, `uRyZuUceQPnSgPBqNgtV`, `xpZLRggHAA8goPfJ1Vhf`, `SZe4ymcOeFWDgH9WFZDj`, `T477a42VXV0oguzrZcTh`.
- **Maria Teresa** (9): `DUZFo0j9pXuKL6oRYPZn`, `DVnPHlYFH838E0xbOVWt`, `LZKL5vbYCoUY4eueQOmW`, `Oyz2NElDajHl2jDOlnD9`, `jU1r9gmKH1oDBQPSMeXG`, `pEwGvpvP0Fo8BUhf2Npc`, `zv8qZ3oq97AXsaPKOCai`, `XqrPkWoGtK65EGrf6yx0`, `rrtigrKrsHyJgNKrprTX`.

**Acción autorizada al builder:**

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

### Fase 2 — Fix email Wilainy en Firebase Auth

**Email correcto confirmado por Jorge:** `Nwilainy@gmail.com` (con N mayúscula).

**Estado actual:**
- `personal/{j944265Su9Hyw29YQTj8}.email` = `Nwilainy@gmail.com` ✓ (ya correcto, no tocar).
- `usuarios/{KT9LaszokWNmLCEIe8YOvNKc9rF3}.email` = `apnbrito0318@gmail.com` (incorrecto).
- Firebase Auth `users/{KT9LaszokWNmLCEIe8YOvNKc9rF3}.email` = `apnbrito0318@gmail.com` (incorrecto).

**Acción autorizada al builder:**

1. Crear `scripts/fix-email-wilainy.ts` con Admin SDK.
2. Operaciones:
   - `admin.auth().updateUser(uid, { email: 'Nwilainy@gmail.com' })`.
   - `usuarios/{uid}.email` setear a `Nwilainy@gmail.com`.
3. NO tocar contraseña, NO crear nuevo user, NO eliminar el viejo.
4. Audit log en `auditoria_admin`.
5. **Wilainy debe tener acceso a la casilla `Nwilainy@gmail.com` para resets de contraseña futuros**. Jorge confirmó este punto.
6. DRY-RUN por default; `--apply` explícito requerido.

### Restricciones globales

- Cada fase tiene script propio. Builder los entrega ambos en el mismo sprint.
- Coordinator NO ejecuta `--apply` autónomo. Jorge corre dry-run primero, después decide si aplicar.
- Después de ejecución real, validación humana:
  - Yohana, Wilainy, Maria Teresa hacen hard refresh y reportan que ven sus notificaciones nuevas.
  - Jorge intenta cambiar contraseña de Wilainy desde GestionUsuarios y confirma que ya no tira "no existe usuario".
- Postmortem obligatorio (sub-regla CLAUDE.md "cada bug → cazador" + "5+ empleados afectados"). Builder genera `docs/postmortems/2026-05-08-notis-legacy-multiples-empleados.md`.
- Considerar agregar P-XXX nuevo al catálogo: "notificaciones legacy con userId/destinatarioId apuntando a personalDocId en lugar de auth.uid". Cazador difícil porque es bug de datos, no de código — pero el cazador puede ser un script de health-check periódico (ej: `npm run audit:notis-legacy` que corre la auditoría general y avisa si aparecen nuevos casos).

### NO autorizado (requiere OK separado)

- Migrar notificaciones de OTROS usuarios fuera de los 5 listados.
- Tocar `firestore.rules` (si encuentra rule gap durante el fix, escalar a Jorge).
- Borrar notis o cambiar campos no listados.
- Hacer cambio de email para usuarios distintos a Wilainy.

---

## SPRINT-128 — Inconsistencia #14: alinear rule `ordenes_servicio.delete` al granular `ordenesEliminar`

**Bloqueado por:** coordinator 2026-05-10 (autónomo `trabaja`). Builder evaluó R1 vs R2 y concluyó que R1 es no-op (default ya es `false` heredado de `TODO_FALSE`, ver `src/types/index.ts:1267` `PERMISOS_DEFAULT_OPERARIA` sin override) y el verdadero fix es R2.

**Hallazgo colateral durante auditoría:** la matriz `docs/MATRIZ_PERMISOS.md` línea 61 + 92 decía erróneamente "default operaria `ordenesEliminar=true`". Corregido en commit del bloqueo. Información correcta: default es `false`; la inconsistencia solo se manifiesta si admin activa el granular persona-por-persona en el modal.

**Por qué R2 (no R1):**

- R1 (cambiar default a `false`) es no-op — ya es `false`.
- R2 (ampliar la rule a `puede('ordenesEliminar')`) alinea con la regla declarada de Jorge: "los permisos se controlan desde Usuarios y Permisos". Sin R2 el checkbox `ordenesEliminar` del modal es engañoso para roles operaria/secretaria: si Jorge lo activa, la operaria ve el botón pero la rule rechaza.

**Acción autorizada si Jorge da OK:**

1. Editar `firestore.rules` línea 369:
   - Reemplazar `allow delete: if esAdminOCoord();`
   - Por: `allow delete: if isAuth() && get(/databases/$(database)/documents/usuarios/$(request.auth.uid)).data.permisos.ordenesEliminar == true;`
   - (Sintaxis exacta a confirmar contra otros `get()` en la misma rules — usar la convención existente del archivo.)
2. Ejecutar `npm run deploy:rules` ANTES de commitear (sub-regla P-005 lock).
3. Validación humana: Jorge crea una orden de prueba (NO real), le da `ordenesEliminar=true` a una operaria de prueba desde el modal, esa operaria intenta borrar la orden de prueba → debe funcionar sin `permission-denied`.
4. Reviewer obligatorio con foco en rules (sub-regla "reviewer obligatorio cuando sprint toca firestore.rules").
5. Update `firestore.rules.deployed.lock` automáticamente vía `deploy:rules`.
6. Actualizar `docs/MATRIZ_PERMISOS.md` sección "Inconsistencias detectadas" marcando #14 como RESUELTO con hash + ruta R2.
7. Cazadores 7/7 PASS al cerrar.

**Riesgo de R2:**

- La rule pasa de validación por rol (estática, conocida) a validación por permiso granular (lookup de `usuarios/{uid}`). Es +1 `get()` por delete request, costo aceptable.
- Si un admin se equivoca y le da `ordenesEliminar=true` a una operaria que no debería, esa operaria podrá borrar órdenes. Mitigación: el delete es **soft-delete via `eliminada=true`** según la nota del rule en línea 367-368 — recuperable.
- Postmortem relevante para no repetir: `docs/postmortems/2026-05-07-iniciar-chequeo-rules-sin-deploy.md` (sub-regla P-005). Leer ANTES de hacer `deploy:rules`.

**Comando de aprobación:**

Editá este sprint y agregá `OK: jorge YYYY-MM-DD HH:MM` al final. Después pegá `procesa bloqueos` al coordinator.

**Comando de rechazo (si preferís R1 conceptual o esperar):**

`RECHAZADO: jorge YYYY-MM-DD <motivo>`. Si rechazás, Cowork puede proponer una variante (ej: quitar el checkbox `ordenesEliminar` del modal para operaria/secretaria, así Jorge no lo puede activar por error — pero eso introduce gating por rol en GestionUsuarios.tsx que requiere su propio análisis).

---

## SPRINT-117c — DESBLOQUEADO 2026-05-09 (OK selectivo: 5 de 6 sub-sprints)

**Movido a `COLA_AUTONOMA.md` como PENDIENTE el 2026-05-09 por coordinator (procesa bloqueos). desbloqueadoPor: jorge 2026-05-09.**

Conservado acá para histórico. NO procesar desde acá — las entradas activas (117c1, 117c2, 117c3, 117c4, 117c6) están en `COLA_AUTONOMA.md`. SPRINT-117c5 marcado RECHAZADO con motivo abajo.

<details>
<summary>Spec original + decisión humana (preservada para forensia)</summary>

**Bloqueado originalmente:** coordinator 2026-05-08 (cierre de SPRINT-117b). Espera revisión de la propuesta documentada en `docs/sprints/PROPUESTA_IA_2026-05-08.md`.

**Resumen 60 segundos:**
- 6 sub-sprints 117c1..c6, cada uno con touch-list de 1-3 archivos máximo, plan de rollback y riesgo bajo.
- Reduce sidebar admin de 44 a ~32 ítems, operaria de 17 a ~10, secretaria de 13 a ~8.
- Sin tocar identificadores internos. Sin tocar `TecnicoVista`. Sin tocar `firestore.rules`.
- 4 preguntas abiertas en §6 de la propuesta — opcionales (hay defaults razonables).

**OK selectivo: jorge 2026-05-09 | sub-sprints aprobados: 117c1, 117c2, 117c3, 117c4, 117c6**
**RECHAZADO: jorge 2026-05-09 | sub-sprint: 117c5**

**Motivo del descarte de 117c5:** ese sub-sprint ocultaba ítems del sidebar basándose en el rol (operaria/secretaria). Eso pisa el sistema de permisos individuales que Jorge ya maneja desde el módulo de Usuarios — donde se da o quita acceso a cada módulo persona por persona según su función. Reorganizar el sidebar es OK porque solo cambia agrupación visual de los ítems a los que el empleado YA tiene acceso. Pero ocultar por rol introduce una segunda capa de gating que choca con la fuente de verdad existente (`usuarios/{uid}.permisos.*`).

**Defaults aceptados de las preguntas abiertas (§6 de la propuesta):**
1. Métricas del Mes como pestaña dentro de Rendimiento → sprint propio futuro (NO en 117c).
2. Etiqueta "Bandeja de entrada" → OK.
3. Mapa de Rutas para operaria → no aplica (gating sigue siendo el de Usuarios, no el del rol).
4. Catálogo legacy (`/admin/productos`) en sidebar admin → ocultar en 117c1, eliminar del routing en sprint propio futuro.

**Recordatorio explícito al builder:** TODO ítem del sidebar debe seguir respetando los permisos individuales que vienen de `usuarios/{uid}.permisos.*`. La reorganización SOLO agrupa y renombra etiquetas. NO agrega lógica de "este ítem se oculta si rol === X". Si un empleado tiene permiso para un módulo, lo ve. Si no, no lo ve. Esto ya funciona así hoy y no se cambia.

**Restricciones reiteradas:** archivist obligatorio PRE-CHANGE en cada sub-sprint, regression_guardian antes de commit, QA visual con Aury/Wilainy/Yohana después de cada deploy.

</details>

---

## SPRINT-112-QA — QA manual de la matriz de permisos (sub-sprint humano)

**Origen:** SPRINT-112 fase documental procesada autónoma 2026-05-10. La matriz `docs/MATRIZ_PERMISOS.md` declara 27 flujos × 6 roles = **162 celdas**. Cada celda ≠ ✗ requiere validación con un usuario real del rol correspondiente.

**Por qué BLOQUEADO:** requiere humano. El coordinator no puede autenticar como cada rol en producción ni operar la UI físicamente.

**Esfuerzo:** ~2 horas con accesos por rol y un setup de pruebas controlado.

**Riesgo de no hacerlo:** los gaps detectados en la sección B (eliminar orden #14 inconsistente UI vs rule, ver eliminadas #15 no testeada, secretaria + trabajo realizado #8 sin verificar) quedan latentes. Probabilidad de bug en producción si una operaria intenta eliminar: alta (sin diagnóstico la operaria intenta y "no pasa nada").

**Cómo desbloquear:**

1. Jorge agenda 2h con Yohana (operaria) + Aury (técnico) + Wilainy (operaria) + secretaria activa.
2. Para cada celda ≠ ✗ de la tabla principal: intentar la acción, anotar resultado en una columna nueva del doc `QA_RESULT` con valores: `OK` / `permission-denied` / `no-aparece-UI` / `error-otro`.
3. Si aparecen inconsistencias UI ↔ rule (UI deja, rule rechaza): abrir sprint propio por celda fallida.
4. Marcar este sub-sprint COMPLETADO en `EJECUCION_AUTONOMA.md` con timestamp + nombre del operador humano.

**Comando de desbloqueo:** N/A. Es trabajo humano puro. Cuando esté hecho, Jorge le dice a Cowork "QA matriz hecho" y Cowork mueve a histórico.

---

## Histórico de desbloqueos

- **SPRINT-115 fase write (re-migración Yohana):** desbloqueado por jorge 2026-05-08, movido a `COLA_AUTONOMA.md` por coordinator 2026-05-08 (cuarta pasada). Re-pausado por jorge mismo día (ver entrada activa arriba). Conservado para histórico.
- **SPRINT-118 (re-migración masiva 5 empleados + fix email Wilainy):** desbloqueado por jorge 2026-05-08, movido a `COLA_AUTONOMA.md` por coordinator 2026-05-08 (`procesa bloqueos`). Restricción del sprint conservada: el coordinator entrega scripts en DRY-RUN; Jorge ejecuta dry-run y `--apply` manualmente.
- **SPRINT-117c (reorganización IA del sidebar):** desbloqueado por jorge 2026-05-09 con OK selectivo (5 de 6 sub-sprints). 117c1, 117c2, 117c3, 117c4, 117c6 movidos a `COLA_AUTONOMA.md` como PENDIENTE. 117c5 marcado RECHAZADO con motivo (chocaba con sistema de permisos individuales). Coordinator procesa uno por uno con QA visual humana entre cada deploy — restricción explícita del spec original.
