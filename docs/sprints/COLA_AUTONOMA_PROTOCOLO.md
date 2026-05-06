# Protocolo Cowork ↔ Coordinator — modo autónomo

> **Objetivo:** Jorge dice una vez "lo que necesito" y el sistema avanza solo.
> Vos (Cowork) y el coordinator (Claude Code) se comunican vía archivos en este
> repo, sin que Jorge sea el correo entre ambos.

---

## Roles

| Quién | Dónde corre | Qué hace |
|---|---|---|
| **Jorge** | Su Mac | Define necesidades en lenguaje natural. Da OK explícito SOLO para cambios irreversibles (rules, migraciones masivas). Lee daily summary. |
| **Cowork (yo, Claude desktop)** | Mac de Jorge, sandbox | Convierto necesidades en sprints estructurados, los pongo en cola, escribo guardarrails. |
| **Coordinator (Claude Code)** | Mac de Jorge, terminal con yolo | Lee la cola, ejecuta sprints en loop, delega a builder/tester/regression_guardian/reviewer, hace commit + push, escribe daily summary. |

---

## Archivos del protocolo

| Archivo | Quién escribe | Quién lee | Propósito |
|---|---|---|---|
| `docs/sprints/COLA_AUTONOMA.md` | Cowork | Coordinator | Cola FIFO de sprints pendientes con criterios y restricciones |
| `docs/sprints/EJECUCION_AUTONOMA.md` | Coordinator | Cowork + Jorge | Log de qué ejecutó, qué pasó, próximos pasos |
| `docs/sprints/BLOQUEOS.md` | Coordinator | Jorge | Sprints que requieren OK explícito (rules, migraciones) |
| `docs/sprints/DIARIO_YYYY-MM-DD.md` | Coordinator | Jorge | Resumen 60s al final del día |
| `docs/sprints/COLA_AUTONOMA_PROTOCOLO.md` | Cowork (este archivo) | Coordinator + Cowork | Las reglas del juego |

---

## Formato de un sprint en la cola

Cada sprint en `COLA_AUTONOMA.md` tiene este formato:

```markdown
## SPRINT-<id> — <título corto>

**Estado:** PENDIENTE | EN_EJECUCION | COMPLETADO | BLOQUEADO
**Prioridad:** alta | media | baja
**Origen:** Jorge dijo "..." el YYYY-MM-DD HH:MM | Detectado por Cowork al revisar XYZ
**Riesgo:** bajo | medio | alto
**Touch-list previsto:** archivos que se esperan modificar

### Objetivo
Una frase clara de qué tiene que pasar al final del sprint.

### Por qué
Contexto de negocio o técnico. Por qué importa.

### Criterios de aceptación
- [ ] Criterio 1 (validable)
- [ ] Criterio 2
- [ ] Criterio N

### Restricciones / guardarrails
- Si toca firestore.rules → marcar BLOQUEADO y esperar OK de Jorge
- Si requiere migrar >500 docs → marcar BLOQUEADO y esperar OK
- regression_guardian obligatorio si toca rules/services/context
- Pre-commit hook debe pasar (no bypass)

### Notas para el coordinator
Hints, gotchas conocidas, archivos a revisar antes, decisiones de diseño.
```

---

## Política de autonomía

**Va automático (sin OK previo):**
- Bugfixes claros (síntoma reproducible, fix obvio).
- Features chicas (≤5 archivos modificados).
- Refactors locales (sin cambio de comportamiento).
- Hotfixes a regresiones detectadas por cazadores.
- Documentación, retros, gotchas nuevas en CLAUDE.md.
- Commits de configuración (eslint, prettier, etc.) sin tocar lógica.

**Requiere OK explícito de Jorge (BLOQUEADO en cola):**
- Cambios a `firestore.rules` (afecta seguridad, irreversible si rompe).
- Migraciones de datos sobre >500 docs.
- Borrados masivos.
- Nuevas integraciones de pago, OAuth, terceros (afectan cuenta de Jorge).
- Cambios a `package.json` que agreguen/quiten dependencias mayores (>3 paquetes nuevos).
- Cualquier cosa que toque `api/` con endpoints públicos.

**Política para BLOQUEOS:**
1. Coordinator escribe el sprint en `BLOQUEOS.md` con resumen + comando exacto que ejecutará si Jorge dice OK.
2. Daily summary lista los bloqueos al inicio.
3. Jorge edita `BLOQUEOS.md` agregando `OK: <hash de Jorge>` al sprint, o pega `procesa bloqueos` al coordinator.
4. Coordinator vuelve a procesar.

---

## Loop del coordinator (`procesa cola`)

Cuando Jorge pega `trabaja` o `procesa cola` al coordinator, este ejecuta:

```
1. Lee CLAUDE.md, CONTEXTO_COMPLETO.md (si existe), COLA_AUTONOMA_PROTOCOLO.md.
2. Lee COLA_AUTONOMA.md.
3. Para cada SPRINT-<id> con estado PENDIENTE, en orden:
   a. Mover estado a EN_EJECUCION en COLA_AUTONOMA.md.
   b. Verificar restricciones (rules, migraciones masivas) → si aplica, mover a BLOQUEOS.md, escribir resumen en EJECUCION_AUTONOMA.md, continuar al siguiente.
   c. Delegar al builder con descripción del sprint.
   d. Tester (typecheck + lint) → si falla, builder de nuevo (max 3 intentos).
   e. regression_guardian (si toca rules/services/context) → CHANGES_NEEDED → builder.
   f. Reviewer → APPROVED o CHANGES_NEEDED → loop.
   g. Pre-commit hook (`git commit` corre husky automáticamente).
   h. `git push`.
   i. Devops para verificar deploy en Vercel.
   j. Mover estado a COMPLETADO en COLA_AUTONOMA.md.
   k. Escribir resultado en EJECUCION_AUTONOMA.md (commit hash, archivos, tiempo).
4. Cuando la cola está vacía, generar/actualizar DIARIO_YYYY-MM-DD.md.
5. Reportar a Jorge resumen breve: "N sprints completados, M bloqueados esperando OK, X minutos elapsed."
```

**Si un sprint falla 3 veces:** marcar como BLOQUEADO con motivo, mover al final de la cola, continuar con el siguiente. Jorge revisa BLOQUEOS.md.

---

## Daily summary (`docs/sprints/DIARIO_YYYY-MM-DD.md`)

El coordinator lo escribe al final de cada sesión de procesamiento. Formato:

```markdown
# Diario — YYYY-MM-DD

## Resumen
- N sprints completados
- M sprints bloqueados (esperan OK)
- K commits pusheados
- X minutos de trabajo del coordinator

## Sprints completados
| ID | Título | Hash | Archivos | Notas |
|---|---|---|---|---|

## Sprints bloqueados (REQUIEREN TU OK)
| ID | Por qué | Cómo desbloquear |
|---|---|---|

## Cazadores anti-regresión
- P-001: 0 hits / 1 hit / ...
- P-002: ...
- P-003: ...

## Alertas
- Cualquier deploy fallido, regresión detectada en producción, gotcha nueva.

## Próximos pasos sugeridos
Lo que Cowork va a poner en cola si no le decís otra cosa.
```

---

## Cómo Cowork agrega sprints a la cola

Yo (Cowork) edito `COLA_AUTONOMA.md` directamente cuando:
- Jorge me dice "necesito X" en la conversación.
- Detecto un patrón problemático en el repo (ej: hit de cazador que no estaba arreglado).
- Un daily summary muestra una alerta que requiere acción.

**Formato:** uso el formato de "Sprint en la cola" arriba. Pongo SPRINT-<id> incremental.

---

## Cómo Jorge usa esto día a día

**Mañana:**
- Abrí Claude Code en tu Mac.
- Pegá: `trabaja` (o el alias que configures).
- El coordinator procesa la cola, te muestra resumen al final.

**Cuando algo necesita tu OK:**
- Leé `docs/sprints/BLOQUEOS.md`.
- Si querés aprobar: editá el archivo, agregá `OK: jorge YYYY-MM-DD` al sprint.
- Pegá `procesa bloqueos` al coordinator.

**Cuando querés agregar algo a hacer:**
- Decímelo a mí (Cowork) en lenguaje natural.
- Yo lo agrego a la cola con criterios claros.
- Próxima vez que ejecutes `trabaja`, se procesa.

---

## Trazabilidad

Cada sprint completado tiene en `EJECUCION_AUTONOMA.md`:
- Hash del commit.
- Hash de Jorge si fue OK humano.
- Archivos modificados.
- Output del regression_guardian.
- Tiempo total.

Si algo se rompe en producción, podés rastrear exactamente qué sprint lo causó.

---

## Política de pausa

Si Jorge en cualquier momento dice "para todo" o "pausa autónomo" al coordinator,
este:
1. Termina el sprint actual (no lo deja a medias).
2. Pone todo lo demás en estado PENDIENTE.
3. No procesa más hasta que Jorge diga `trabaja` de nuevo.
