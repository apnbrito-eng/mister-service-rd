# Bloqueos — sprints que requieren OK de Jorge

> El coordinator mueve sprints acá cuando detecta que afectan rules,
> migraciones masivas, integraciones de pago, o borrados.
>
> **Para desbloquear:** editá el sprint y agregá `OK: jorge YYYY-MM-DD HH:MM`
> al final, después pegá `procesa bloqueos` al coordinator.
>
> **Para rechazar:** editá el sprint y agregá `RECHAZADO: jorge YYYY-MM-DD HH:MM <motivo>`.

---

## SPRINT-115 fase write — PAUSADO (no ejecutar `--apply`)

**PAUSADO:** jorge 2026-05-08 (decisión cualitativa: el fix de las 3 notis sueltas de Yohana se absorbe dentro de la auditoría general de SPRINT-117 fase A2, que va a determinar si hay que migrar más empleados además de Yohana).

**Estado del script:** `scripts/re-migrar-notificaciones-yohana.ts` está commiteado (`6b4aade`), DRY-RUN ejecutado y validado por Jorge el 2026-05-08 (output: 3 docs actualizables, 0 ya alineados, scope hardcodeado verificado contra OK previo). Falta solo `--apply`.

**Qué hacer:** NO ejecutar `--apply` autónomo. Esperar resultado de SPRINT-117 fase A2. Si la auditoría confirma que el patrón se replica en muchos empleados, generalizar el script y migrar en lote. Si solo afecta a Yohana, ejecutar el `--apply` puntual. Cualquier camino requiere re-confirmación de Jorge.

**Original OK (pre-pausa, conservar para histórico):**
- jorge 2026-05-08 (vía conversación Cowork tras diagnóstico read-only ejecutado el mismo día)
- Scope autorizado: 3 docs Caso A confirmados (`F9BV32k4JEoEOk97K4xc`, `TVwtOtmNlzW334IUIUdF`, `VWjdYBRmKgU8rGPlbJAv`) → setear `userId = HGkVoYpGKzL4JJI7FnTpHjdsM972`. NO tocar otros campos.

---

## Histórico de desbloqueos

- **SPRINT-115 fase write (re-migración Yohana):** desbloqueado por jorge 2026-05-08, movido a `COLA_AUTONOMA.md` por coordinator 2026-05-08 (cuarta pasada). Re-pausado por jorge mismo día (ver entrada activa arriba). Conservado para histórico.
