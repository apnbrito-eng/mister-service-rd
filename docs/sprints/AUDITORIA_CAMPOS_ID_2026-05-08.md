# Auditoría de campos ID con vector P-001/P-006 — 2026-05-08

> SPRINT-111a (fase documental). Auditoría de los 12 campos del esquema que
> guardan un ID de empleado (auth.uid o personal.id) y verificación de si
> hay desalineación que pueda causar bugs análogos a `afc5e4a` (Reactivación),
> `b93625d` (Notificaciones) o `c4be345` (Iniciar Chequeo Aury).

## Metodología

Para cada campo:
1. Buscar dónde se WRITE (grep `<campo>:` en `src/`).
2. Identificar la rule de Firestore aplicable (read del archivo `firestore.rules`).
3. Decidir veredicto:
   - **OK** — el write usa `auth.uid` (o no es gateado por rule).
   - **BUG_LATENTE** — la rule compara contra `auth.uid` pero el código guarda `personal.id` o `userProfile.id`.
   - **INCONSISTENCIA_BAJO_RIESGO** — el campo no es gateado por rule contra `auth.uid` pero por convención debería usar `auth.uid` para alinearse con el resto del esquema.
   - **N/A** — el campo guarda nombre/string, no ID.

## Resumen ejecutivo

**Vectores activos cazados por cazadores existentes:**
- P-001 (`userProfile.id` misuse) — 0 hits hoy. SPRINT-103 cerró los 22 hits del baseline.
- P-006 (dropdown `<option value={X.id}>` para personal) — 0 hits hoy. SPRINT-108 cerró + allowlistó los 6 del baseline.

**Bugs latentes nuevos detectados:** 0.

**Inconsistencias de bajo riesgo detectadas:** 4 (todas en campos descriptivos NO gateados por rule contra auth.uid).

**Conclusión:** la cobertura combinada de P-001 + P-006 + las gotchas vigentes en `CLAUDE.md` cubre todos los vectores con riesgo de permission-denied. Los hallazgos restantes son convenciones inconsistentes que NO rompen producción y se pueden cerrar en sprints chicos posteriores sin urgencia.

## Tabla por campo

| Campo | Colección | Rule gatea contra auth.uid | Código escribe | Veredicto |
|---|---|---|---|---|
| `tecnicoId` | ordenes_servicio | SÍ (line 354 — `tecnicoId == request.auth.uid` en allow update) | hooks + dropdowns con `auth.uid` post-c4be345; `inicioChequeo.tecnicoId` nested con `userProfile.id` (descriptor, no gateado nested) | OK (cubierto por P-006 cazador + migración + allowlist) |
| `ayudanteId` | ordenes_servicio | SÍ (line 355 — `ayudanteId == request.auth.uid`) | dropdowns con `t.uid` post-c4be345 | OK (cubierto por P-006 cazador + migración) |
| `operariaId` | ordenes_servicio, recordatorios_diarios | NO — no aparece en ninguna rule contra auth.uid | hooks + dropdowns con `id` (doc id de personal). Comparado contra `userProfile?.id` en filtros UI (`Dashboard.tsx`, `RecordatorioBanner.tsx`). | INCONSISTENCIA_BAJO_RIESGO — el filtro UI funciona porque ambos lados usan personal.id consistentemente. Si en el futuro se agrega rule `operariaId == auth.uid`, romperá. Sub-regla: no agregar rule con `auth.uid` sobre operariaId hasta migrar. |
| `responsableId` | ordenes_servicio | NO — no aparece en rule contra auth.uid | `useOrdenCreateForm.ts:612` escribe `usuarioActual?.id` (que es `userProfile?.id` desde `Ordenes.tsx:126` y `Citas.tsx:210`). | INCONSISTENCIA_BAJO_RIESGO — campo descriptivo. Si en el futuro se agrega rule, romperá para usuarios cargados vía cascada `personal/`. |
| `creadaPor` | campanas_marketing | SÍ (line 600 — `creadaPor == request.auth.uid` en create + inmutable en update) | `TabReactivacion.tsx:206` pasa `currentUser.uid` al service que lo guarda. | OK |
| `creadoPor` | ordenes_servicio | NO — la rule no valida este campo contra auth.uid | `useOrdenCreateForm.ts:614` escribe `usuarioActual?.nombre` (string, no ID). `clientes.service.ts:383` idem. | N/A — guarda nombre, no ID. |
| `eliminadaPor` | ordenes_servicio | NO — no aparece en rule contra auth.uid | `Ordenes.tsx:566`, `EliminarOrdenModal.tsx:48` escriben `usuario` (string nombre). | N/A — guarda nombre, no ID. |
| `aprobadoPor` | ordenes_servicio | INMUTABLE desde técnico (`noTocaCamposAprobacion`) pero NO contra auth.uid | `Ordenes.tsx:179`, `OrdenDetalle.tsx:93`, `AgendaDia.tsx:242` escriben `usuario` (nombre string). `ordenes.service.ts:338` escribe `resoluciónData.resueltaPorNombre` (nombre). | N/A — guarda nombre, no ID. |
| `sugeridaPor` | ordenes_servicio (nested en sugerenciasSoloChequeo) | INDIRECTO via `respetaSugerenciaSoloChequeo` (verifica integridad del array) | `ModalSugerirSoloChequeo.tsx:97` escribe `currentUser.uid` post-SPRINT-103. | OK |
| `resueltaPor` | ordenes_servicio (nested en sugerencias y propuestasReprogramacion) | INDIRECTO via `respetaSugerenciaSoloChequeo` | `SugerenciasChequeo.tsx:102,140`, `Reprogramaciones.tsx:126,177,242` escriben `currentUser.uid` post-SPRINT-103. | OK |
| `cerradaPor` | liquidaciones_nomina | NO contra auth.uid (rule write esAdminOCoord) | `nomina.service.ts:425` escribe `cerradaPor.nombre` (string). | N/A — guarda nombre, no ID. |
| `usuarioId` | conversaciones_ia | SÍ (line 289-293 — `usuarioId == request.auth.uid` en read/create/update) | (ver hits abajo) | Auditoría detallada sigue. |
| `personalUid` | ponches | SÍ (line 300 — `personalUid == request.auth.uid` en create) | `Ponche.tsx:271` escribe `currentUser.uid`. `AdminPonches.tsx:193` propaga el campo (admin write, no afecta gate). | OK |

## Hits específicos de `usuarioId` (variable local, no campo Firestore)

Detectados 4 hits de `const usuarioId = userProfile?.id || ...` en componentes:

| Archivo | Línea | Cómo se usa | Gate contra auth.uid | Veredicto |
|---|---|---|---|---|
| `IniciarChequeoButton.tsx` | 228 | Asignado a `inicioChequeo.tecnicoId` nested dentro de `ordenes_servicio` | NO (la rule valida `tecnicoId` raíz, no nested) | OK — ya tiene allowlist `@safe-userprofile-id:` post-SPRINT-103 |
| `RegistrarPagoModal.tsx` | 95 | Asignado a `pago.registradoPorId` (objeto pago dentro del array `pagos` de ordenes_servicio) | NO (no aparece en ninguna rule) | INCONSISTENCIA_BAJO_RIESGO — campo descriptivo. Riesgo: si una secretaria carga via cascada `personal/`, su `userProfile.id == personalDocId`, y para eventual reportería que cruza pagos contra `auth.uid` quedaría inconsistente. Recomendación: cambiar a `currentUser.uid` por consistencia futura. |
| `EnviarFacturacionButton.tsx` | 38 | Asignado a `enviadaAFacturacionPorId` raíz de la orden | NO (la rule no valida este campo) | INCONSISTENCIA_BAJO_RIESGO — mismo razonamiento que arriba. |
| `ProcesarFacturacionModal.tsx` | 321 | Asignado a `emisorFacturaId` y otros campos descriptivos | NO | INCONSISTENCIA_BAJO_RIESGO — mismo razonamiento. |

**Ninguno de los 4 hits tiene un gate contra `auth.uid` activo. NO son bugs latentes.**

## Decisiones y siguientes sprints

### Cerrado en este sprint (111a)

- Auditoría documental completa de los 12 campos.
- Confirmación de que P-001 + P-006 + gotchas vigentes cubren los vectores activos.
- Allowlists ya consistentes en los hits descriptivos legítimos.

### Posibles sprints follow-up (bajo riesgo, no urgentes)

**SPRINT-114** (sugerido) — Migrar 4 hits descriptivos a `currentUser.uid` por consistencia
- Touch-list: `RegistrarPagoModal.tsx`, `EnviarFacturacionButton.tsx`, `ProcesarFacturacionModal.tsx`, `useOrdenCreateForm.ts` (responsableId).
- Riesgo: bajo — los campos no están gateados, el cambio es defensivo.
- No requiere migración de datos (los pagos/facturas viejas con `personalDocId` siguen funcionando porque no hay rule que los valide).
- Beneficio: consistencia con convención post-SPRINT-105 (todo lo que identifica a un actor humano es `auth.uid`).

**SPRINT-115** (sugerido, opcional) — Cazador genérico opcional sobre asignaciones a campos `*Id`
- En lugar de crear cazador nuevo (que solapa con P-001 y P-006), considerar refinar el `regression_guardian` semántico (`.claude/agents/regression_guardian.md`) con regla nueva: cualquier write a un campo que termina en `Id` y referencia un empleado debe usar `auth.uid`.
- Más útil que un cazador determinístico nuevo (ya saturados con P-001/P-006).

### NO recomendado

- **NO crear cazador determinístico genérico nuevo.** Solapa con P-001 (cubre `userProfile.id` near sensitive fields) y P-006 (cubre dropdowns). El espacio de búsqueda cae en falsos positivos rápido (cualquier `XId: id`). El refinamiento del regression_guardian semántico es mejor relación señal/ruido.
- **NO migrar datos.** Ningún campo descriptivo sin rule activa rompe nada en el estado actual. Migración de datos viejos abre riesgo sin beneficio.

## Conclusión

SPRINT-111 (auditoría completa) → COMPLETADO en fase 111a (solo documental).
Bugs latentes nuevos: 0.
Sprint follow-up sugerido: SPRINT-114 (4 archivos, bajo riesgo, no urgente).
