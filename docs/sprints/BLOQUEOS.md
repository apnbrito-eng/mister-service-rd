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

## SPRINT-117c — Esperando aprobación de propuesta de reorganización IA

**Bloqueado:** coordinator 2026-05-08 (cierre de SPRINT-117b). Espera revisión de la propuesta documentada en `docs/sprints/PROPUESTA_IA_2026-05-08.md`.

**Resumen 60 segundos:**
- 6 sub-sprints 117c1..c6, cada uno con touch-list de 1-3 archivos máximo, plan de rollback y riesgo bajo.
- Reduce sidebar admin de 44 a ~32 ítems, operaria de 17 a ~10, secretaria de 13 a ~8.
- Sin tocar identificadores internos. Sin tocar `TecnicoVista`. Sin tocar `firestore.rules`.
- 4 preguntas abiertas en §6 de la propuesta — opcionales (hay defaults razonables).

**Para desbloquear, agregá UNA línea al final de esta entrada:**

- `OK: jorge YYYY-MM-DD HH:MM` → procesar 117c1..c6 en orden, con QA visual humana entre cada uno.
- `OK selectivo: jorge YYYY-MM-DD HH:MM | sub-sprints: 117c1, 117c3, 117c4` → procesar sólo los listados.
- `Cambios: jorge YYYY-MM-DD HH:MM | <feedback en lenguaje natural>` → revisar la propuesta antes de procesar (genero v2 del documento).
- `RECHAZADO: jorge YYYY-MM-DD HH:MM | <motivo>` → descartar reorganización entera.

Después pegás `procesa bloqueos` al coordinator.

**Restricciones reiteradas:** archivist obligatorio PRE-CHANGE en cada sub-sprint, regression_guardian antes de commit, QA visual con Aury/Wilainy/Yohana después de cada deploy.

---

## Histórico de desbloqueos

- **SPRINT-115 fase write (re-migración Yohana):** desbloqueado por jorge 2026-05-08, movido a `COLA_AUTONOMA.md` por coordinator 2026-05-08 (cuarta pasada). Re-pausado por jorge mismo día (ver entrada activa arriba). Conservado para histórico.
- **SPRINT-118 (re-migración masiva 5 empleados + fix email Wilainy):** desbloqueado por jorge 2026-05-08, movido a `COLA_AUTONOMA.md` por coordinator 2026-05-08 (`procesa bloqueos`). Restricción del sprint conservada: el coordinator entrega scripts en DRY-RUN; Jorge ejecuta dry-run y `--apply` manualmente.
