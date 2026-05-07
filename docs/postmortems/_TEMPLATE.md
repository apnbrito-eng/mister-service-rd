# Postmortem — <título corto del incidente>

**Fecha del incidente:** YYYY-MM-DD
**Detectado por:** <Jorge | técnico | usuario | monitoreo automático | cazador X>
**Severidad:** crítica | alta | media | baja
**Patrón asociado:** P-XXX (si existe) | clase nueva (proponer P-XXX)
**Commits relacionados:**
- Introduce: `<hash>` (sprint <id> — fecha)
- Fix: `<hash>` (sprint <id> — fecha)

---

## Resumen ejecutivo

<Una frase clara de qué pasó, sin jerga. Apta para que Jorge lo entienda en 10
segundos. Si no podés explicarlo en una frase, no entendiste el bug todavía.>

---

## Timeline

| Hora | Evento |
|---|---|
| YYYY-MM-DD HH:MM | Se introduce el bug en commit `<hash>` (sprint <id>) |
| YYYY-MM-DD HH:MM | Primera detección / reporte |
| YYYY-MM-DD HH:MM | Diagnóstico confirmado |
| YYYY-MM-DD HH:MM | Fix deployado (commit `<hash>`) |
| YYYY-MM-DD HH:MM | Validación en producción |

---

## Impacto

- **Usuarios afectados:** <X técnicos / X operarias / todos los admins / etc.>
- **Funcionalidad bloqueada:** <descripción concreta de qué no podían hacer>
- **Tiempo total fuera:** <horas / días desde introducción hasta fix>
- **Severidad de negocio:** <descripción cualitativa: bloqueó operación diaria / cosmético / pérdida de datos / etc.>
- **Pérdida de datos:** <sí / no / parcial — describir>

---

## Causa raíz (5 porqués)

1. **¿Por qué pasó X?** — Porque Y.
2. **¿Por qué Y?** — Porque Z.
3. **¿Por qué Z?** — Porque W.
4. **¿Por qué W?** — Porque V.
5. **¿Por qué V?** — **Causa raíz:** <conclusión sin más "por qué" debajo>.

> **Importante:** si parás antes del 5° porqué, justificá por qué la profundidad
> es suficiente. Lo común es parar en el 2° por comodidad y perder la causa
> estructural.

---

## Lo que funcionó bien

<Qué del sistema actual ayudó a detectar / resolver rápido. Sé específico:
"el cazador P-005 ya predijo este síntoma exacto" / "el reporte de Jorge fue
inmediato porque el botón rompía un flujo crítico que él prueba a diario" / etc.>

---

## Lo que falló

<Qué del sistema NO detectó esto a tiempo. Honesto, no diplomático.>

---

## Acciones tomadas (fix inmediato)

- <Acción 1 — comando exacto si aplica>
- <Acción 2>

---

## Acciones preventivas (para que no vuelva)

- [ ] **Cazador determinístico:** `scripts/invariantes/check-<algo>.ts` (P-XXX)
- [ ] **Sub-regla en CLAUDE.md:** "<regla nueva>"
- [ ] **Update a agente regression_guardian / archivist / builder:** <qué cambia>
- [ ] **Otra:** <describir>

> Si esta sección está vacía, el postmortem está incompleto. Cada bug debe
> dejar al menos una acción preventiva concreta.

---

## Métricas

- **Tiempo desde introducción hasta detección:** <X horas / días>
- **MTTR (detección hasta fix):** <X minutos / horas>
- **Es recurrencia de clase ya catalogada:** sí (P-XXX) / no
  - Si sí → **fallo del cazador X**: <explicación de por qué no cazó> + <sugerencia de refinamiento>
  - Si no → **clase nueva**: proponer P-XXX al coordinator

---

## Lecciones aprendidas

<Reflexión final, no cosmética. Preguntas guía:
- ¿Qué patrón de pensamiento llevó al error?
- ¿Qué hábito hay que cambiar en el equipo?
- ¿Qué presunción implícita resultó falsa?
- Si tuvieras que escribirle un email de 3 frases al equipo del futuro, ¿qué
  dirías?>

---

## Referencias

- Sprint: `docs/sprints/COLA_AUTONOMA.md` SPRINT-XXX
- Log de ejecución: `docs/sprints/EJECUCION_AUTONOMA.md` (sección de fecha)
- Patrón: `docs/PATRONES_REGRESION.md` P-XXX
- Cazador: `scripts/invariantes/check-XXX.ts`
