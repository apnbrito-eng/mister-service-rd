# Bloqueos — sprints que requieren OK de Jorge

> El coordinator mueve sprints acá cuando detecta que afectan rules,
> migraciones masivas, integraciones de pago, o borrados.
>
> **Para desbloquear:** editá el sprint y agregá `OK: jorge YYYY-MM-DD HH:MM`
> al final, después pegá `procesa bloqueos` al coordinator.
>
> **Para rechazar:** editá el sprint y agregá `RECHAZADO: jorge YYYY-MM-DD HH:MM <motivo>`.

---

## SPRINT-115 fase re-migración — OK Jorge para fix de Yohana

**OK:** jorge 2026-05-08 (vía conversación Cowork tras diagnóstico read-only ejecutado el mismo día)

**Scope autorizado:** re-migrar exclusivamente las 3 notificaciones de Yohana Operaria (email `melissabalbuena08@gmail.com`) que el script de diagnóstico identificó.

**Datos del diagnóstico (output de `scripts/diagnostico-notificaciones-yohana.ts` el 2026-05-08):**
- Usuario: Yohana Operaria · operaria · `melissabalbuena08@gmail.com`
- `personal.id` (doc id viejo, mal guardado en notis): `zFhokrDoPH9lD63ZxKAY`
- `personal.uid` (auth.uid correcto): `HGkVoYpGKzL4JJI7FnTpHjdsM972`
- 3 docs detectados, todos tipo `chequeo_iniciado`, no leídos:
  - `F9BV32k4JEoEOk97K4xc` (2026-04-20T02:03:37)
  - `TVwtOtmNlzW334IUIUdF` (2026-04-24T21:19:05)
  - `VWjdYBRmKgU8rGPlbJAv` (2026-04-20T03:09:08)
- En todos: `userId == personalDocId` y `destinatarioId == personalDocId` (Caso A confirmado).

**Acción autorizada al builder:**
- Escribir `scripts/re-migrar-notificaciones-yohana.ts` (con flag `--dry-run` por default).
- El script DEBE estar acotado al `auth.uid` de Yohana (`HGkVoYpGKzL4JJI7FnTpHjdsM972`); si algún doc no matchea ese UID en `userId` o `destinatarioId == personalDocId == zFhokrDoPH9lD63ZxKAY`, abortar.
- Para cada uno de los 3 docs, hacer un `update` que setee:
  - `userId = HGkVoYpGKzL4JJI7FnTpHjdsM972` (el `auth.uid` correcto).
  - Idempotencia: si `userId` ya es ese valor, skip.
- NO tocar `destinatarioId` (la lectura dual del service ya lo soporta; cambiarlo requeriría más auditoría).
- NO tocar otros campos (leida, leidaEn, tipo, titulo, descripcion, etc.).
- Logear cada doc tocado con shape antes/después en stdout.
- Después de la ejecución real, escribir entrada en `auditoria_admin` con `accion: 'remigracion_notificaciones_yohana'`, `actorUid: <uid del operador>`, `docsAfectados: [3 ids]`.

**NO autorizado (requiere OK separado):**
- Migrar notificaciones de OTROS usuarios (otros operarios, técnicos, secretarias). Si el coordinator detecta el mismo patrón en otros, abrir SPRINT-116 con su propio OK.
- Tocar `firestore.rules` (si la rule de update bloquea el script con permission-denied porque el operador no tiene rol admin, escalar a Jorge antes de modificar la rule).
- Borrar las notis o cambiar otros campos.

**Post-fix:**
- Coordinator pide a Jorge que Yohana haga hard refresh y reporte si ahora ve las 3 notis y puede marcarlas como leídas.
- Si funciona: marcar SPRINT-100 + SPRINT-115 ambos COMPLETADOS, postmortem obligatorio (sub-regla CLAUDE.md), considerar abrir SPRINT-116 para audit de otros usuarios.
- Si NO funciona: diagnóstico extra (cache, App Check, rule gap) antes de tocar más datos.
