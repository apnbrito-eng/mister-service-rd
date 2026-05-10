# Postmortem-positivo — Rediseño IA del sidebar (lote 117c)

**Fecha de cierre del lote:** 2026-05-10
**Tipo:** postmortem-positivo (NO es bug; documenta un acierto)
**Sprints involucrados:** SPRINT-117a (auditoría), SPRINT-117b (propuesta + OK selectivo), SPRINT-117c1..c6 (ejecución)
**Commits del lote:**
- `759a76b` — SPRINT-117c1 (2026-05-09) renombrar etiquetas sidebar para reducir ambigüedad
- `9f71883` — SPRINT-117c2 (2026-05-09) sección "Bandeja de entrada" en sidebar
- `9c262c9` — SPRINT-117c3 (2026-05-09) sección "Cobranza y facturación" en sidebar
- `480532f` — SPRINT-117c4 (2026-05-09) sección "Equipo" + mover Mantenimiento a Operaciones
- `9b5aee2` — SPRINT-117c6 (2026-05-09) limpiar alias `isAdmin` engañoso
- SPRINT-117c5 — **RECHAZADO** por Jorge en el OK selectivo del 2026-05-09. Motivo: chocaba con el sistema de permisos individuales `usuarios/{uid}.permisos.*` (gating de permisos vive en datos, no en agrupación visual del sidebar).

---

## Resumen ejecutivo

Se ejecutó un rediseño grande de información de la barra lateral del admin (sidebar) dividido en 6 sub-sprints chicos de 1-3 archivos cada uno, con QA visual humano entre cada deploy. 5 de 6 sub-sprints aprobados se deployaron sin un solo rollback ni regresión. El sexto fue rechazado por Jorge antes de tocar código, gracias a un OK selectivo previo a la ejecución. El approach demostró que cambios de UX que afectan a 5 roles distintos se pueden ejecutar sin bloquear operación si se dividen en piezas pequeñas con validación humana entre cada paso.

---

## Contexto

### Cronología

| Fase | Sprint | Hash | Qué pasó |
|---|---|---|---|
| Auditoría | SPRINT-117a | (sin código) | Cowork generó `docs/sprints/AUDITORIA_IA_2026-05-08.md`: mapeo de los 5 roles, etiquetas ambiguas, secciones faltantes, alias engañosos. |
| Propuesta | SPRINT-117b | (sin código) | Cowork generó `docs/sprints/PROPUESTA_IA_2026-05-08.md`: 6 sub-sprints concretos con criterios, plan de rollback, scope. Jorge revisó y dio OK selectivo (5 de 6 — descartó c5). |
| Ejecución c1 | SPRINT-117c1 | `759a76b` | Renombrar 7 etiquetas del sidebar para reducir ambigüedad. Ocultó Catálogo legacy. |
| Ejecución c2 | SPRINT-117c2 | `9f71883` | Agrupar "Bandeja de entrada" (citas, leads, mensajes). |
| Ejecución c3 | SPRINT-117c3 | `9c262c9` | Agrupar "Cobranza y facturación" (facturas, comisiones, estado resultado). |
| Ejecución c4 | SPRINT-117c4 | `480532f` | Agrupar "Equipo" + mover Mantenimiento a Operaciones. |
| Ejecución c6 | SPRINT-117c6 | `9b5aee2` | Limpieza de alias `const isAdmin = esAdminOCoord` que era engañoso (semántica admin+coord disfrazada de admin literal). |
| Cierre formal | (admin) | `18a2386` | Promover los 3 sub-sprints que quedaban EN_REVISION_HUMANA a COMPLETADO + diario del 2026-05-10. |

### Decisión humana clave — rechazar 117c5

SPRINT-117c5 proponía agrupar visualmente bajo "Configuración" varios ítems del sidebar (configWeb, plantillasMarketing, gestionUsuarios, mantenimiento). Jorge rechazó el sub-sprint en el OK selectivo previo a la ejecución, argumentando que:

- El gating real de quién ve qué vive en `usuarios/{uid}.permisos.*` (un sistema de permisos por bit con `configuracionVer`, `configuracionModificar`, etc.).
- Agrupar visualmente "Configuración" como sección NO es lo mismo que dar permisos para ver esa sección. Mezclar las dos cosas hace que el sidebar parezca controlar permisos cuando en realidad solo controla la presentación.
- La fuente de verdad es el bit individual de permiso en el doc del usuario. El sidebar solo refleja qué bits están en `true`. Si en el futuro Jorge quiere reagrupar visualmente, lo puede hacer en otro sprint con el contexto del módulo de permisos individuales presente.

Esta decisión salvó al lote de un commit que habría confundido permisos con agrupación visual.

---

## Approach — los 5 elementos que funcionaron

### 1. Sub-sprints de 1-3 archivos

Cada uno de los 5 sub-sprints ejecutados modificó como máximo 3 archivos (en la práctica, solo `Sidebar.tsx` en 4 de los 5). Esto significó:
- Diff mínimo por sprint (commit `9b5aee2` es 1 archivo, 12 ediciones).
- Revisión humana posible en 30-60 segundos por sprint.
- Plan de rollback trivial: `git revert <hash>` deshace el sprint sin tocar nada más.

### 2. QA visual humano entre cada deploy

Después de cada sub-sprint deployado a Vercel, Jorge probaba visualmente el sidebar con los 5 roles (admin, coordinadora, operaria, secretaria, técnico) antes de dar OK para procesar el siguiente. El feedback se daba con un simple "si" implícito al disparar la siguiente pasada de `trabaja`. Nunca se ejecutaron dos sub-sprints sin validación intermedia.

### 3. Plan de rollback granular y explícito

Cada commit del lote llevó comentario inline de forensia con plan de rollback: qué se cambió, por qué, y cómo deshacer. Ejemplo en `9b5aee2`:
```
// Comentario eliminado: const isAdmin = esAdminOCoord;
// Rollback: git revert 9b5aee2 reintroduce el alias.
```

### 4. archivist PRE-CHANGE en cada sub-sprint

Antes de tocar `Sidebar.tsx` en cada sub-sprint, el coordinator invocó `archivist` en modo PRE-CHANGE: `git log -p src/components/Sidebar.tsx` + revisión de gotchas relevantes en CLAUDE.md + verificación de que el cambio no chocaba con sprints previos del lote. Esto cazó tempranamente que el alias `isAdmin` de 117c6 NO era un sinónimo literal de "rol admin" sino de "admin+coord" — sin esa lectura, la migración hubiera sido incorrecta.

### 5. OK selectivo como gate previo a ejecución

El paso de SPRINT-117b a SPRINT-117c1..c6 incluyó un OK humano explícito sobre QUÉ sub-sprints procesar y cuáles descartar. Jorge eligió 5 de 6 y descartó c5. Sin ese paso, c5 habría entrado a la cola autónoma y el coordinator lo habría procesado sin objeción técnica (no rompía cazadores). El OK selectivo es un check de negocio que ningún agente automático puede reemplazar.

---

## Lo que funcionó

- **Diffs chicos = revisión rápida = OK humano factible**. Si los 6 sub-sprints hubieran sido 1 sólo PR de ~50 ediciones, Jorge no habría podido revisarlo con el detalle necesario para cazar a c5.
- **Tiempo total razonable**: el lote completo (5 sub-sprints + cierre) tomó ~2 jornadas (2026-05-09 y 2026-05-10) sin bloquear ninguna operación del negocio.
- **Cero regresiones detectadas**: P-001 a P-007 quedaron en 0 hits durante todo el lote. La función de `Sidebar.tsx` ahora es más legible (sin alias `isAdmin` engañoso) sin cambiar la semántica de qué ve cada rol.
- **Trazabilidad completa**: cada sub-sprint tiene entrada histórica en `COLA_AUTONOMA.md`, trail en `EJECUCION_AUTONOMA.md`, hash de commit, y cita en este postmortem.
- **El protocolo Cowork↔Coordinator funcionó como diseño**: Cowork escribió los 6 sub-sprints a la cola, Jorge dio OK selectivo en `BLOQUEOS.md`, coordinator procesó uno a la vez, daily summaries cubrieron el trabajo. Sin reuniones, sin coordinación verbal extra.

---

## Lo que cambiaríamos la próxima vez

- **Documentar el "OK selectivo" como flujo formal en el protocolo.** Hoy el OK selectivo del 2026-05-09 vivió en una entrada de `BLOQUEOS.md`. Para un próximo rediseño grande, valdría agregar al protocolo Cowork↔Coordinator una sección "Approbación selectiva de sub-sprints" que explique el formato exacto.
- **Numeración de sub-sprints**: la mezcla 117c1, 117c2, ..., 117c6 (sin c5) es legible pero un poco rara cuando se ven sólo los hashes. Para próximos lotes, considerar numeración con sufijos limpios (`117c-a`, `117c-b`, etc.) o renumerar después de descarte.
- **Postmortem-positivo más temprano**: este doc se generó al final del lote (SPRINT-119, post-cierre). Para próximos rediseños grandes, valdría incluir el postmortem-positivo como criterio de cierre del sprint padre desde el día 1, no como sprint propio retroactivo.

---

## Recordatorios para futuros rediseños grandes

Si en el futuro Cowork o el coordinator encara un rediseño grande de UX/IA/estructura (no un bugfix puntual ni una feature chica), seguir estas reglas:

1. **Dividir SIEMPRE en sub-sprints de 1-3 archivos.** Si el sub-sprint toca 4+ archivos, dividirlo más. El motivo es revisión humana factible, no preferencia estética.

2. **QA visual humano entre cada deploy.** No procesar el siguiente sub-sprint sin OK implícito o explícito de Jorge sobre el deploy previo. El `trabaja` del día siguiente funciona como OK implícito del último deploy.

3. **Plan de rollback explícito en cada commit.** Comentario inline o en el commit message. Una línea: "Rollback: git revert <hash>".

4. **archivist PRE-CHANGE obligatorio.** Antes de tocar un archivo del touch-list, leer `git log` sobre ese archivo + gotchas relevantes en CLAUDE.md. Tiempo invertido: 2 minutos. Tiempo ahorrado: horas de rollback.

5. **OK selectivo previo a ejecución del lote.** El sprint padre (en este lote, 117b) debe terminar con una lista explícita de cuáles sub-sprints están aprobados para ejecución y cuáles se descartan. Cowork no puede ejecutar lo descartado aunque "técnicamente cierre".

6. **Trazabilidad granular.** Cada sub-sprint tiene su entrada en `COLA_AUTONOMA.md` y trail en `EJECUCION_AUTONOMA.md`. Si algo se rompe semanas después, podemos rastrear cuál sub-sprint lo introdujo.

7. **Postmortem-positivo como criterio de cierre del sprint padre.** Si el rediseño es exitoso, documentarlo en `docs/postmortems/YYYY-MM-DD-<slug>-aprendizajes.md` para que futuros agentes lo encuentren cuando hagan PRE-CHANGE sobre archivos relacionados.

---

## Validación al cierre

- Cazadores anti-regresión: 7/7 PASS al cierre del lote (baseline 0 hits mantenido).
- Postmortem creado sin tocar código de la app, sin tocar rules, sin tocar datos.
- Sub-regla obligatoria del sprint padre 117c cumplida: este archivo es el postmortem-positivo previsto.

---

## Referencias

- Auditoría: `docs/sprints/AUDITORIA_IA_2026-05-08.md`
- Propuesta: `docs/sprints/PROPUESTA_IA_2026-05-08.md`
- Cola autónoma: `docs/sprints/COLA_AUTONOMA.md` SPRINT-117a, 117b, 117c1..c6
- Ejecución autónoma: `docs/sprints/EJECUCION_AUTONOMA.md` (entradas del 2026-05-09 y 2026-05-10)
- OK selectivo: `docs/sprints/BLOQUEOS.md` SPRINT-117c (entrada histórica)
- Diario: `docs/sprints/DIARIO_2026-05-09.md` y `docs/sprints/DIARIO_2026-05-10.md`
