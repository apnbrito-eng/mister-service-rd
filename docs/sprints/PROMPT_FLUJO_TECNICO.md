# Sprint: Optimizar flujo de orden del técnico

Usa el subagente coordinator.

## Objetivo

3 cambios coordinados al flujo de trabajo del técnico y al cierre de órdenes:

1. **Gate de aprobación en "Trabajo Realizado"** — el botón en vista técnico queda deshabilitado hasta que admin/coord apruebe desde oficina.
2. **Cierre como "Solo Chequeo"** — nueva opción de cierre si el cliente decide NO proceder con la reparación. Costo RD$2,000 (configurable desde Configuración → Precio default del chequeo). Disponible para el técnico desde su vista Y para oficina desde Agenda del Día.
3. **Stand-by de orden** — nuevo estado para postergar la reparación (ej: esperando pieza). Orden queda congelada y reactivable después.

## Pre-investigación

Antes de codear, el builder debe LEER y reportar:
- El flujo actual de fases en `src/utils/index.ts` (función `faseLabel`, enum de fases).
- Cómo la vista técnico (`TecnicoVista.tsx` + `IniciarChequeoButton.tsx`) actualmente maneja el botón "Trabajo Realizado".
- Si existe ya un flag de "aprobado por admin" o solo la fase `aprobado` la define.
- Si existe estado stand-by en algún lado (vi que hay colección `standby_piezas` pero no sé si hay fase stand-by).
- El precio de chequeo — dónde se configura (¿`configFiscal` o `config/empresa`?).

Con eso, ajustar el plan si difiere de lo asumido abajo.

## Cambio 1: Gate de aprobación "Trabajo Realizado"

### Comportamiento deseado

**Vista técnico (`TecnicoVista.tsx`, card de orden):**
- Si orden está en fase `en_diagnostico` o `en_cotizacion`: aparece botón "💰 Sugerir precio" (o el que ya exista).
- Una vez el técnico sugiere precio → orden pasa a espera de aprobación (nuevo flag `trabajoPendienteAprobacion: true` o equivalente).
- **Botón "✅ Trabajo Realizado" aparece DESHABILITADO con tooltip "Esperando aprobación de oficina"** hasta que admin apruebe.
- Cuando admin aprueba (desde Ordenes.tsx, detalle, o Agenda del Día) → flag `aprobadoPorOficina: true` + fase pasa a `aprobado` → el botón se habilita en la vista técnico (via onSnapshot).

### Data model

En OrdenServicio agregar (si no existe):
```typescript
aprobadoPorOficina?: boolean;
aprobadoPorOficinaEn?: Timestamp | Date;
aprobadoPorOficinaPor?: string; // nombre del admin/coord que aprobó
```

Si ya existe el campo `precioAprobado` o similar que cumple la misma función, reutilizar — no duplicar.

### UI admin

En la vista de Orden (OrdenDetailModal o TecnicoVista admin):
- Cuando fase = `en_cotizacion` y hay precio sugerido: mostrar bloque "Precio sugerido por técnico: RD$XXX · [Aprobar] [Rechazar / Negociar]".
- Al aprobar: setear flags + cambiar fase a `aprobado` + notificar al técnico (crearNotificacion).
- En Agenda del Día también visible este bloque para cada orden en estado "espera de aprobación".

## Cambio 2: Cerrar como "Solo Chequeo"

### Concepto

El cliente solo pagó el chequeo (diagnóstico) y decidió no proceder con la reparación. La orden se cierra con:
- Monto cobrado = RD$2,000 (o el valor configurado en `precioChequeoDefault`)
- Nuevo campo `tipoCierre: 'solo_chequeo'` (vs 'reparacion_completa' default)
- Fase queda `cerrado` igual
- Se genera Conduce de Garantía con el monto del chequeo

### UI técnico

En vista técnico, card de orden, agregar al lado de "Cerrar servicio":
- Botón secundario: **"🔍 Cerrar como solo chequeo (RD$2,000)"**
- Al tocar → modal de confirmación: "¿El cliente decidió no proceder con la reparación? Se cerrará como solo chequeo por RD$2,000. ¿Confirmas?"
- Al confirmar → misma lógica de cierre pero con `tipoCierre: 'solo_chequeo'` + monto forzado.

### UI oficina (Agenda del Día)

En Agenda del Día, cada card de orden agendada para hoy, agregar mismo botón (visible para admin/coord/operaria).

### Efectos

- Genera CG-##### como conduce normal
- Costo = precio chequeo, ITBIS calculado, comisión técnico según % configurado
- Órden pasa a fase `cerrado`

## Cambio 3: Stand-by de orden

### Concepto

A veces la orden necesita postergarse:
- Hay que conseguir una pieza externa (ya existe `standby_piezas` para piezas — aquí es la orden completa la que se postpone)
- Cliente no está disponible hoy
- Otro motivo

### Data model

Agregar a OrdenServicio:
```typescript
enStandby?: boolean;
standbyMotivo?: string;
standbyDesde?: Timestamp | Date;
standbyHasta?: Timestamp | Date; // fecha estimada de reactivación
standbyNotas?: string;
```

### UI técnico

En card de orden con fase `en_diagnostico`, `en_cotizacion` o `aprobado`:
- Botón secundario: **"⏸ Poner en stand-by"**
- Modal: motivo (dropdown: "Esperando pieza" / "Cliente no disponible" / "Otro"), fecha estimada de reactivación (datepicker), notas.
- Al guardar: `enStandby: true` + campos + NO cambiar la fase.

### UI admin

En Ordenes o Agenda del Día, las órdenes en stand-by se muestran con badge **"⏸ Stand-by hasta DD/MM"** y fondo diferenciado.
- Botón "▶ Reactivar" para volver a activa.
- Panel dedicado "Órdenes en stand-by" en el Sidebar (opcional, si hay muchas): muestra todas las stand-by activas + filtros.

## Verificación

- Typecheck + lint.
- Tester:
  - Técnico sugiere precio → botón "Trabajo Realizado" queda disabled con tooltip.
  - Admin aprueba → técnico ve botón habilitado (via onSnapshot).
  - Técnico cierra como "solo chequeo" → genera Conduce con RD$2,000 + comisión proporcional.
  - Orden en stand-by: técnico y admin ven el badge, botón "Reactivar" funciona.
- Reviewer:
  - No se rompió el flujo normal (aprobación + trabajo realizado + cierre) para órdenes existentes.
  - `parseOrden` rehidrata los nuevos campos correctamente (SIEMPRE actualizar parseOrden cuando agregas campos — documentado en CLAUDE.md).
  - Los nuevos campos tienen stripping de undefined antes de addDoc/setDoc.

## Commit

```
feat(orden): flujo técnico optimizado — aprobación oficina + solo chequeo + stand-by

- Botón "Trabajo Realizado" en vista técnico ahora disabled hasta que
  admin/coord apruebe desde oficina. Nuevo flag aprobadoPorOficina
  controla la habilitación, actualizado via onSnapshot en tiempo real.
- Nueva opción de cierre "Solo Chequeo" (RD$2,000 configurable) disponible
  para técnico (en su vista) y oficina (desde Agenda del Día). Genera
  Conduce con el monto del chequeo + comisión proporcional.
- Nuevo estado stand-by para órdenes postergadas (ej: esperando pieza
  externa, cliente no disponible). Campos enStandby, standbyMotivo,
  standbyHasta, standbyNotas. Badge visible en listados. Botón "Reactivar"
  para volver a activa.
- parseOrden actualizado para rehidratar los 3 nuevos conjuntos de campos.

Resuelve workflow real del negocio: técnicos no pueden marcar trabajo
terminado sin aprobación previa, ajustes rápidos para casos de solo
chequeo, pausa temporal cuando hay que buscar piezas.
```

## Ante cualquier ambigüedad

Pregunta con AskUserQuestion antes de tocar código. Especialmente:
- Si la fase `aprobado` ya cumple la función de "aprobación de oficina" → evaluar si un flag adicional es redundante.
- Si el `precioChequeoDefault` tiene un home claro en configFiscal o config/empresa → usar el existente.
- Si ya hay un estado de "pausado/stand-by" en algún lugar del código — no duplicar.
