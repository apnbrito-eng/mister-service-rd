# Auditoría de asignaciones técnico↔operaria — 2026-05-10 (placeholder)

> **Placeholder** — este archivo se reescribe automáticamente cuando Jorge
> corre el script en su Mac:
>
> ```bash
> npx tsx scripts/auditoria/asignaciones-tecnico-operaria.ts
> ```
>
> El script (`scripts/auditoria/asignaciones-tecnico-operaria.ts`) es
> read-only puro: no muta nada en Firestore, solo lee `personal/` y
> `ordenes_servicio/` activas, y reescribe este archivo con el reporte
> real.

## Por qué existe este archivo

Origen: SPRINT-129 (2026-05-10). Bug puntual reportado por Jorge — orden
con técnico Aury Mon sin operaria en producción, pese a que el perfil
del técnico SÍ tiene operaria (Wilainy) asignada. Causa raíz: la operaria
se deriva en **snapshot** al crear/editar la orden (`useOrdenCreateForm.ts:588-590`
y `OrdenEditForm.tsx:72-77`), no dinámicamente. Órdenes creadas cuando el
técnico no tenía operaria asignada quedan permanentemente con
`operariaNombre: undefined`.

Hipótesis: el bug puntual es la punta del iceberg. Probablemente hay
otros técnicos/órdenes en la misma situación. Este script lista todo lo
detectable por lectura simple para que Jorge decida caso por caso.

## Cómo correrlo

```bash
cd /Users/jorgeluisbritogarcia/Desktop/mister-service-rd
npx tsx scripts/auditoria/asignaciones-tecnico-operaria.ts
```

Requiere `service-account.json` en la raíz del repo (igual que los otros
scripts de auditoría — `auditoria/schema-drift.ts`,
`auditoria-emails-personal-vs-usuarios.ts`).

El script:
1. Lee toda la colección `personal/`.
2. Lee las 500 órdenes activas más recientes (no cerradas/canceladas).
3. Audita 6 tipos de inconsistencia:
   - `TECNICO_SIN_OPERARIA` (técnico activo sin `operariaId`).
   - `HUERFANO_TECNICO` (técnico apunta a operariaId inválida).
   - `OPERARIA_HUERFANA` (operaria activa sin técnicos asignados).
   - `ORDEN_SIN_OPERARIA_DESINCRONIZADA` (orden sin operaria pero el técnico sí la tiene en perfil — caso Aury Mon).
   - `ORDEN_OPERARIA_DESACTUALIZADA` (orden con operaria histórica distinta).
   - `RESPONSABLE_HUERFANO` (responsable de orden no existe o rol inesperado).
4. Imprime resumen + detalle a stdout.
5. **Reescribe este archivo** (`docs/sprints/AUDITORIA_ASIGNACIONES_2026-05-10.md`) con el reporte completo en md, incluyendo:
   - Resumen ejecutivo con conteos.
   - Tabla detallada por tipo.
   - Sección "Cómo arreglar manualmente" con pasos UI.
   - Sección "Si querés fix masivo" con propuesta de sprint follow-up.

## Qué hacer después de correrlo

- **Si hay <5 ORDEN_SIN_OPERARIA_DESINCRONIZADA:** arreglar manual una por una desde la UI siguiendo los pasos del reporte.
- **Si hay >20:** pedile a Cowork que cree un SPRINT-130 hipotético con scope acotado (script `--apply` que rellena `operariaId/Nombre` para una lista de orden IDs). Ese sprint va a `BLOQUEOS.md` esperando tu OK explícito antes de correrse — no es autónomo.
- **Si Aury Mon aparece en el listado:** confirmación del bug original. Arreglar manual o esperar al sprint follow-up.

## Decisión arquitectural pendiente

El bug es por **snapshot** vs **reactivo**. Cambiar a comportamiento
reactivo (siempre derivar operaria del perfil actual del técnico) elimina
la clase entera de bug, pero implica decidir si las órdenes históricas
deben "actualizarse retroactivamente" cuando el técnico cambia de operaria.
Eso es scope de un sprint separado con tu input — no parte de SPRINT-129.

## Read-only enforced

El script no contiene `.set(`, `.update(`, `.delete(` sobre `db.collection/doc`.
Solo lectura + escritura a este archivo md local. Si en alguna pasada del
coordinator alguien intenta agregar mutaciones a Firestore desde este
script, los criterios de aceptación de SPRINT-129 obligan a PARAR y
reportar.
