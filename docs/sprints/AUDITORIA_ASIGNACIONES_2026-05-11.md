# Auditoría de asignaciones técnico↔operaria — 2026-05-11

> Generado por `scripts/auditoria/asignaciones-tecnico-operaria.ts` (SPRINT-129).
> Read-only — este reporte NO arregla nada, solo lista inconsistencias.

## Resumen ejecutivo

- Técnicos activos auditados: 14
- Operarias activas auditadas: 2
- Órdenes activas sampleadas (no cerradas/canceladas): 48

| Tipo de inconsistencia | Conteo |
|---|---|
| TECNICO_SIN_OPERARIA | 0 |
| HUERFANO_TECNICO | 0 |
| OPERARIA_HUERFANA | 0 |
| ORDEN_SIN_OPERARIA_DESINCRONIZADA | 0 |
| ORDEN_OPERARIA_DESACTUALIZADA | 0 |
| RESPONSABLE_HUERFANO | 17 |

**Total accionables (excluye histórico válido y visibilidad pura): 0**

## TECNICO_SIN_OPERARIA — técnicos activos sin operaria en perfil (0)

Sin inconsistencias detectadas en este tipo.

## HUERFANO_TECNICO — técnico apunta a operariaId inválida (0)

Sin inconsistencias detectadas en este tipo.

## OPERARIA_HUERFANA — operaria activa sin técnicos asignados (0)

Sin inconsistencias detectadas en este tipo.

## ORDEN_SIN_OPERARIA_DESINCRONIZADA — orden activa sin operaria pero el técnico sí la tiene (0)

Sin inconsistencias detectadas en este tipo.

## ORDEN_OPERARIA_DESACTUALIZADA — orden con operaria histórica distinta a la actual del técnico (0)

Sin inconsistencias detectadas en este tipo.

## RESPONSABLE_HUERFANO — responsable de orden no existe o tiene rol inesperado (17)

| Ref | Nombre/contexto | Detalle | Sugerencia |
|---|---|---|---|
| OS-0018 (id=7M1exXXXjRtg...) | responsable=kAKPMRLe8aaA... | responsableId no existe en personal/ (nombre cacheado: ?) | normal si el responsable original fue borrado. Solo accionable si Jorge quiere reasignar. |
| OS-0011 (id=YsmoMwqsSXE1...) | responsable=kAKPMRLe8aaA... | responsableId no existe en personal/ (nombre cacheado: misterservicerd) | normal si el responsable original fue borrado. Solo accionable si Jorge quiere reasignar. |
| OS-0020 (id=eMU7dzue8WQL...) | responsable=kAKPMRLe8aaA... | responsableId no existe en personal/ (nombre cacheado: ?) | normal si el responsable original fue borrado. Solo accionable si Jorge quiere reasignar. |
| OS-0013 (id=lwZZDbNUN0ne...) | responsable=kAKPMRLe8aaA... | responsableId no existe en personal/ (nombre cacheado: ?) | normal si el responsable original fue borrado. Solo accionable si Jorge quiere reasignar. |
| OS-0052 (id=mT0e6vhv5Xym...) | responsable=HGkVoYpGKzL4... | responsableId no existe en personal/ (nombre cacheado: Yohana) | normal si el responsable original fue borrado. Solo accionable si Jorge quiere reasignar. |
| OS-0014 (id=tSjXsBEHHXEX...) | responsable=kAKPMRLe8aaA... | responsableId no existe en personal/ (nombre cacheado: misterservicerd) | normal si el responsable original fue borrado. Solo accionable si Jorge quiere reasignar. |
| OS-0017 (id=vgHTdJmUWDeb...) | responsable=kAKPMRLe8aaA... | responsableId no existe en personal/ (nombre cacheado: misterservicerd) | normal si el responsable original fue borrado. Solo accionable si Jorge quiere reasignar. |
| OS-0015 (id=xp6NCgx2aWbZ...) | responsable=kAKPMRLe8aaA... | responsableId no existe en personal/ (nombre cacheado: misterservicerd) | normal si el responsable original fue borrado. Solo accionable si Jorge quiere reasignar. |
| OS-0003 (id=LV3j5b7Pno2q...) | responsable=uEh6Phb465It... | responsableId no existe en personal/ (nombre cacheado: Yohana) | normal si el responsable original fue borrado. Solo accionable si Jorge quiere reasignar. |
| OS-0004 (id=fQKC0gB3ySvP...) | responsable=LJhD8qH2pALA... | responsableId no existe en personal/ (nombre cacheado: Yelisa) | normal si el responsable original fue borrado. Solo accionable si Jorge quiere reasignar. |
| OS-0008 (id=hNxLlDxy3Neu...) | responsable=LJhD8qH2pALA... | responsableId no existe en personal/ (nombre cacheado: Yelisa) | normal si el responsable original fue borrado. Solo accionable si Jorge quiere reasignar. |
| OS-0016 (id=1tDCQrndFwjX...) | responsable=kAKPMRLe8aaA... | responsableId no existe en personal/ (nombre cacheado: misterservicerd) | normal si el responsable original fue borrado. Solo accionable si Jorge quiere reasignar. |
| OS-0012 (id=8U9RNKqJBfcS...) | responsable=kAKPMRLe8aaA... | responsableId no existe en personal/ (nombre cacheado: misterservicerd) | normal si el responsable original fue borrado. Solo accionable si Jorge quiere reasignar. |
| OS-0019 (id=UnXmWktm9RyF...) | responsable=kAKPMRLe8aaA... | responsableId no existe en personal/ (nombre cacheado: ?) | normal si el responsable original fue borrado. Solo accionable si Jorge quiere reasignar. |
| OS-0001 (id=eeOnbGndeq6F...) | responsable=uEh6Phb465It... | responsableId no existe en personal/ (nombre cacheado: Yohana) | normal si el responsable original fue borrado. Solo accionable si Jorge quiere reasignar. |
| OS-0006 (id=sAS2P72SVPJV...) | responsable=LJhD8qH2pALA... | responsableId no existe en personal/ (nombre cacheado: Yelisa) | normal si el responsable original fue borrado. Solo accionable si Jorge quiere reasignar. |
| OS-0002 (id=xCmXKC0hfYEi...) | responsable=LJhD8qH2pALA... | responsableId no existe en personal/ (nombre cacheado: Yelisa) | normal si el responsable original fue borrado. Solo accionable si Jorge quiere reasignar. |

## Cómo arreglar manualmente

### TECNICO_SIN_OPERARIA
1. Ir a `Personal` en el sidebar admin.
2. Editar el técnico.
3. En "Operaria a cargo", seleccionar una operaria activa.
4. Guardar.

### HUERFANO_TECNICO
1. Mismo flujo que arriba — la operaria actual del perfil no existe o cambió de rol.
2. Reasignar a una operaria activa real.

### OPERARIA_HUERFANA
1. Visibilidad solo. Si es esperado (operaria sin técnicos por ahora), ignorar.
2. Si no es esperado, asignar técnicos vía sus perfiles individuales.

### ORDEN_SIN_OPERARIA_DESINCRONIZADA
Caso típico: el técnico no tenía operaria cuando se creó la orden; después se le asignó pero la orden quedó vieja.

1. Abrir la orden.
2. En el campo "Técnico", cambiar a otro técnico cualquiera.
3. Volver a seleccionar el técnico original.
4. Guardar. Esto re-dispara la derivación `operariaId/Nombre` desde el perfil actual.

Alternativa (no recomendada por riesgo de errores manuales): editar el campo `operariaNombre` directo desde Firestore Console.

### ORDEN_OPERARIA_DESACTUALIZADA
NO necesariamente es bug. La orden guarda la operaria que estaba asignada cuando se creó/editó (snapshot histórico válido). Solo cambiar si Jorge quiere realinear con la operaria actual del técnico, mismo flujo que el punto anterior.

### RESPONSABLE_HUERFANO
Visibilidad solo. Si la persona fue borrada del sistema o cambió de rol, lo correcto es dejar el `responsableNombre` cacheado como historial — no hay write-side fix simple.

## Si querés fix masivo

Si la lista de ORDEN_SIN_OPERARIA_DESINCRONIZADA es larga (>20) y querés arreglarlas todas:

1. Pedile a Cowork que cree un **SPRINT-130 hipotético** con scope acotado: script `--apply` que recibe lista de orden IDs específicos y rellena `operariaId/Nombre` desde el perfil actual del técnico.
2. Ese sprint va a `docs/sprints/BLOQUEOS.md` esperando OK explícito de Jorge (no autónomo, mutación masiva).
3. Patrón ya usado en SPRINT-118 (migración `tecnicoId → uid`).

**NO crear ese sprint en esta pasada.** Solo si Jorge lo pide explícitamente después de leer este reporte.

## Decisión arquitectural pendiente

La causa raíz del bug puntual de Aury Mon es que `useOrdenCreateForm.ts:588-590` y `OrdenEditForm.tsx:72-77` derivan la operaria en **snapshot** al crear/editar la orden. Cambiar a comportamiento **reactivo** (siempre mostrar la operaria actual del técnico desde el perfil) elimina la clase entera de bug. Esa decisión es scope de un sprint propio con input de Jorge — no es parte de SPRINT-129.

## Limitaciones del script

- Solo audita las 500 órdenes activas más recientes (no cerradas/canceladas). Órdenes cerradas con operaria desincronizada no aparecen — pero ya no se editan, así que no es accionable.
- Asume convención `tecnicoId == personal.id` para órdenes. Post-SPRINT-118 algunos campos podrían guardar `auth.uid`; en ese caso el script no puede resolver el técnico y omite silencioso. Cazador P-006 verifica que no se reintroduzcan dropdowns mal escritos.
- No verifica `ayudanteId` ni otros campos análogos (scope SPRINT-111 pendiente).
- No verifica permisos/rules — eso está cubierto en `docs/MATRIZ_PERMISOS.md` y `docs/MATRIZ_PERMISOS_VS_MODULOS.md`.

---

_Generado: 2026-05-11T13:34:34.505Z_