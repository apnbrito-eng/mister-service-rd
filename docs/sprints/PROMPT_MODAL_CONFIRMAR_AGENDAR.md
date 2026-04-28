# Sprint: Modal "Confirmar y Agendar" reusa modal "Crear Orden" con citaPreset

Usa el subagente coordinator.

## Objetivo

Cuando coord/secretaria toca "Confirmar y Agendar" en `/admin/citas`, en lugar de abrir el modal actual mini (7 campos), abrir el modal completo **"Crear Orden de Servicio"** con TODOS los campos pre-cargados desde la cita por confirmar. La coordinadora puede editar cualquier campo (dirección, falla, fecha, técnico, etc.) antes de confirmar.

## Pre-investigación

1. Identificar el modal "Crear Orden de Servicio" actual y sus props (probablemente `CrearOrdenModal.tsx` en `src/components/ordenes/`).
2. Identificar el modal "Confirmar y Agendar" actual (probablemente inline en `Citas.tsx` o componente cercano).
3. Verificar shape completo de `CitaPorConfirmar` — todos los campos que el form público captura:
   - `clienteNombre`, `clienteTelefono`, `clienteEmail`
   - `clienteDireccion`, `clienteSector`, `clienteReferenciaDireccion`
   - `clienteLat`, `clienteLng`
   - `equipoTipo`, `equipoMarca`, `equipoModelo`, `fallaReportada`
   - `fechaPreferida`, `horaSolicitada`
   - `comoNosConocio`, `camposPersonalizados`
   - `whatsappAsignado`, `whatsappAsignadoNombre`
4. Confirmar el handler actual `handleConfirmarYAgendar` — qué hace al guardar (probablemente: `crearOActualizarClienteDesdeCita` → `addDoc` orden → `deleteDoc` cita).

## Cambios

### 1. Modal Crear Orden acepta nueva prop opcional `citaPreset?: CitaPorConfirmar`

- Si viene, todos los campos del modal se inicializan con los datos de la cita.
- Sección Cliente: salta el flujo de "buscar cliente existente" y va directo a "Datos del nuevo cliente" con campos pre-llenados (la coord puede editarlos si el cliente cometió error).
- Componente `CampoDireccionConPlaces` recibe valor inicial con coords y `googleMapsUrl` si la cita los tiene → mini-mapa aparece de una con pin en la ubicación capturada.
- Sección Servicio: equipo (tipo/marca/modelo) y falla pre-llenados.
- Sección Programación: fecha pre-llenada con `cita.fechaPreferida` si existe; hora pre-seleccionada si la `cita.horaSolicitada` matchea uno de los bloques disponibles. Técnico queda Sin asignar (la coord decide).

### 2. NUEVA sección expandible al final del modal

Solo visible cuando viene `citaPreset`:

**"📋 Información adicional del formulario"**

- Lista `cita.comoNosConocio` si existe.
- Lista `cita.camposPersonalizados` (key → value) si existe.
- Si la cita no tiene ninguno, la sección no se muestra.
- Read-only (la coord la lee, no edita).
- Estos datos se persisten en la orden creada bajo:

```typescript
orden.metadatosCita: {
  comoNosConocio,
  camposPersonalizados,
  whatsappAsignado,
  whatsappAsignadoNombre,
  citaOrigenId: cita.id,
}
```

### 3. Reemplazar el modal "Confirmar y Agendar" actual

- El botón "Confirmar y Agendar" en `/admin/citas` ahora abre el modal Crear Orden con `citaPreset={cita}`.
- Al guardar la orden:
  - Llamar `crearOActualizarClienteDesdeCita()` (helper existente, no romper).
  - `addDoc` orden con `clienteId` real + `clienteLat`/`clienteLng` heredados de la cita + `metadatosCita`.
  - `deleteDoc` cita_por_confirmar.
  - Toast "Cliente y orden creados desde cita pública" (o "Orden creada — cliente ya existía" según el caso).
- Si la coord cancela el modal, la cita por confirmar **NO** se borra (debe poder reintentar).

### 4. Extender Orden type con `metadatosCita` opcional

- `parseOrden` rehidrata el objeto.
- Strip undefined antes de `addDoc`.

### 5. (Bonus) Mostrar `metadatosCita` en `OrdenDetailModal`

- Si una orden tiene `metadatosCita`, mostrar en `OrdenDetailModal` una sección expandible "Origen: formulario público" con los datos para trazabilidad.
- Si requiere mucho cambio, dejarlo para después.

## Verificación

### Tester
- Cliente envía form público con TODOS los campos + 1 personalizado.
- Coord va a `/admin/citas` → "Confirmar y Agendar" → modal Crear Orden abre con todos los datos cargados, mini-mapa con pin visible.
- Sección "Información adicional" muestra el campo personalizado.
- Coord cambia falla a algo más detallado, asigna técnico, confirma.
- Orden creada con `clienteLat`/`clienteLng` correctos, `clienteId` real, `metadatosCita` persistido.
- `/admin/clientes` muestra el cliente nuevo con dirección georreferenciada (regla R2 ya existente).
- `/admin/citas` ya no muestra esa cita (borrada).
- El modal Crear Orden manual (sin `citaPreset`) sigue funcionando igual que antes.

### Reviewer
- `parseOrden` rehidrata `metadatosCita`.
- No race condition en `deleteDoc` + `addDoc` (idealmente `runTransaction` o batched write).
- Si Firestore falla en uno de los pasos (`crearCliente` OK pero `addDoc` orden falla), no quedar inconsistencias huérfanas.
- El modal Crear Orden sin `citaPreset` NO rompe (regression check).

## Commit

```
feat(citas): modal Confirmar y Agendar reusa Crear Orden con preset desde cita

- /admin/citas ahora abre el modal completo Crear Orden de Servicio
  cuando coord/secretaria confirma una cita pública. Todos los campos
  del form público (dirección con coords, equipo, falla, fecha
  preferida, etc.) llegan pre-cargados y son editables.
- Componente CampoDireccionConPlaces recibe coords iniciales → el
  mini-mapa con pin aparece de inmediato.
- Nueva sección expandible 'Información adicional del formulario'
  muestra cómo nos conoció + campos personalizados (read-only) para
  que la coord no pierda contexto.
- Datos del form público se persisten en orden.metadatosCita
  (comoNosConocio, camposPersonalizados, whatsappAsignado, citaOrigenId)
  para trazabilidad. parseOrden rehidrata el objeto.
- Al guardar: lookup/create cliente (helper existente) → addDoc orden
  con clienteId + coords heredados → deleteDoc cita. Si coord cancela
  el modal, la cita queda intacta para reintentar.
- El modal Crear Orden manual (sin citaPreset) sigue funcionando igual
  — no se rompe el flujo de creación manual.

Resuelve UX clave: la coordinadora ya no pierde información que el
cliente dio en el form público, y ya no tiene que copiar/pegar
manualmente los datos de la cita al modal de orden.
```

## Ante cualquier ambigüedad

Pregunta con `AskUserQuestion` antes de tocar código. Especialmente:

- Si el modal Crear Orden no acepta props fácilmente (depende de muchos hooks o estado del padre), reportar y proponer alternativa.
- Si el flujo de "buscar cliente existente" está muy acoplado al modal y no se puede saltar fácil, evaluar opción de mostrar el bloque "buscar" pero pre-rellenar con el teléfono de la cita y dejar que el flujo natural detecte si el cliente existe o no.
