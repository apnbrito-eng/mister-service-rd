# Sprint: Form público /agendar — mobile + ajustes de campos + foto del equipo

Usa el subagente coordinator.

## Síntomas reportados (Chrome iOS)

1. **Dropdown "Tipo de equipo" llega vacío** — solo muestra "Selecciona..." sin opciones cargadas en admin.
2. **Botón flotante de WhatsApp se superpone al contenido** del form (tapa el CTA en mobile).
3. **Layout no responsive** — diseñado desktop-first, falta paso por viewports reales.
4. **Campo "Modelo"** debe convertirse en select Torre/Individual cuando el tipo de equipo es **Lavadora**.
5. **Falta foto del equipo** (opcional, 1 sola) que viaje desde la cita hasta el técnico.
6. **Campo "¿Cómo nos conociste?"** debe quitarse del editor admin (no aporta al flujo).

## Pre-investigación

1. Reproducir `/agendar` en 4 viewports: iPhone SE (375), iPhone 14 (390), iPad (768), desktop (1024+).
2. Listar problemas visuales por viewport.
3. Verificar `FormularioAgendarPublico.tsx`:
   - ¿Tiene clases Tailwind responsive?
   - ¿Inputs con `min-h-[44px]` (Apple HIG)?
   - ¿`text-base` (16px) en inputs para evitar zoom auto de iOS?
4. Verificar el botón flotante de WhatsApp:
   - Posición, z-index, condicional de viewport.
5. Investigar el bug del dropdown:
   - Identificar `obtenerTiposEquipo` (o similar) y de dónde lee.
   - Si requiere auth → `PERMISSION_DENIED` silencioso.
6. Verificar el editor admin (`ConfigFormularioAgendarSection.tsx`) para entender cómo está definido el campo "comoNosConocio" en los defaults.
7. Verificar reglas de Firebase Storage para entender cómo agregar upload público con App Check.

## Cambios

### 1. Fix dropdown vacío (Tipos de equipo)

- Sincronizar la lista a `config_web/sitio.tiposEquipoPublicos: string[]` cuando admin edita los tipos en `/admin/configuracion` (lectura pública ya permitida en reglas).
- Form público lee de `config_web/sitio.tiposEquipoPublicos`.
- Fallback hardcoded a `['Lavadora', 'Nevera', 'Estufa', 'Aire Acondicionado', 'Microondas', 'Secadora', 'Otro']` si el doc no existe.
- Loading state explícito: dropdown deshabilitado con texto "Cargando tipos de equipo..." mientras carga.
- Aplicar el mismo patrón a **Marcas** si tiene el mismo bug (verificar).

### 2. Optimización mobile/tablet

En `FormularioAgendarPublico.tsx` y componentes hijos:

- Container: `max-w-2xl mx-auto px-4 py-6 sm:px-6 lg:px-8`.
- Inputs y selects: `min-h-[44px] text-base` (no `text-sm`).
- Bloques de hora: `grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2`. Cada botón mínimo 48px alto.
- Submit: `w-full sm:w-auto`, `py-4 px-6`, `text-lg`.
- `CampoDireccionConPlaces`: mini-mapa con `aspect-ratio` adaptativo (no altura fija).
- Tipografía: `text-base` (16px) en inputs para evitar zoom de iOS.
- Espaciado: `space-y-4 sm:space-y-6` entre secciones.

### 3. Botón flotante de WhatsApp

- **Ocultarlo en `/agendar`** — el form ya tiene su CTA de WhatsApp en pantalla de éxito post-submit.
- Mantenerlo visible en landing y otras páginas públicas.
- Si es config-driven, agregar flag `mostrarEnAgendar: false` por default.

### 4. Modelo: select Torre/Individual condicional para Lavadora

**Comportamiento:**
- Si `equipoTipo === 'Lavadora'`: el campo "Modelo" se convierte en select con 2 opciones:
  - **Torre** (lavadora-secadora vertical)
  - **Individual** (solo lavadora)
  - Default: vacío. Opcional.
- Si `equipoTipo !== 'Lavadora'`: el campo "Modelo" sigue como input texto libre opcional (como ahora).
- El switch entre los 2 modos es reactivo: si el cliente cambia el tipo de equipo después de elegir el modelo, el campo se resetea a vacío.

**Schema:**
- Agregar nuevo campo opcional `equipoTipoMotor?: 'torre' | 'individual'` en `CitaPorConfirmar` y en `Orden`.
- El `equipoModelo` (texto libre) sigue existiendo para los demás equipos.
- `parseCitaPorConfirmar` y `parseOrden` rehidratan el nuevo campo.

**Visualización**: cuando una orden tiene `equipoTipoMotor`, mostrar en lugar (o además) del modelo: "Lavadora · Mabe · Torre" en cards y detalle.

### 5. Foto del equipo (1 sola, opcional)

**UI form público:**
- Nueva sección "📸 Foto del equipo (opcional)".
- Botón principal "Tomar/Subir foto del equipo" → input file con `accept="image/*"` y `capture="environment"` (cámara trasera en mobile).
- Si ya hay foto cargada → mostrar preview (thumbnail 150×150 + botón "Cambiar foto" o "❌ Quitar").
- Compresión client-side antes de upload: max 1MB, max dimensiones 1600×1600 (mantener aspect ratio). Usar `<canvas>` o lib mínima.

**Upload:**
- Subir a Firebase Storage en `fotos-equipos-publico/{citaIdProvisional}/{fileName}`. El `citaIdProvisional` es un UUID generado client-side antes del submit (para asociar la foto con la cita que aún no se ha creado en Firestore).
- Al hacer submit, la URL de la foto se incluye en `fotoEquipoUrl` del doc creado en `citas_por_confirmar`.

**Reglas Firebase Storage** (necesita ajuste):
```
match /b/{bucket}/o {
  match /fotos-equipos-publico/{citaId}/{fileName} {
    allow write: if request.resource.contentType.matches('image/.*')
                 && request.resource.size < 5 * 1024 * 1024;
    allow read: if request.auth != null;
  }
}
```

**Schema:**
- `CitaPorConfirmar.fotoEquipoUrl?: string`
- Cuando la coord confirma la cita y crea la orden (sprint próximo del modal preset), `fotoEquipoUrl` se transfiere a `Orden.fotoEquipoUrl`.

**Visualización en TODO el flujo (regla de Jorge):**
- `/admin/citas` (card de cita por confirmar): miniatura con click para ampliar.
- Modal "Confirmar y Agendar" (futuro sprint): miniatura visible.
- `OrdenCard` y `OrdenDetailModal`: miniatura en sección "Equipo".
- `TecnicoVista`: miniatura en card de orden para que el técnico sepa qué equipo va a reparar antes de llegar.
- `AgendaDia`: miniatura junto al cliente para identificación rápida.

**Componente reusable:**
- Crear `src/components/shared/FotoEquipoDisplay.tsx` con prop `url?: string` que:
  - Si hay URL → muestra thumbnail clickeable que abre lightbox.
  - Si no hay URL → no renderiza nada (no ocupa espacio).
- Reusar en todos los lugares listados arriba.

### 6. Quitar "¿Cómo nos conociste?"

- Editor admin (`ConfigFormularioAgendarSection.tsx`): quitar el campo predefinido `comoNosConocio` de la lista de campos disponibles.
- Defaults (`configFormularioAgendarDefault()`): eliminar la entrada del array `campos`.
- Form público (`FormularioAgendarPublico.tsx`): quitar el render del campo.
- Schema `CitaPorConfirmar.comoNosConocio`: marcar como deprecated en el comentario, **mantener** el campo en el type para no romper rehidratación de citas históricas.
- `parseCitaPorConfirmar` sigue rehidratando `comoNosConocio` si existe en el doc (compat con citas viejas).
- `metadatosCita.comoNosConocio` (cuando se crea orden) deja de poblarse.

## Verificación

- Typecheck + lint sin warnings.
- Build local + preview con DevTools en modos móvil.
- Tester:
  - 4 viewports (iPhone SE, iPhone 14, iPad, desktop): form se ve limpio, todos los campos visibles, dropdown funciona.
  - Cliente toma foto del equipo desde mobile → preview aparece → submit ok → foto se ve en `/admin/citas`.
  - Cambiar tipo de equipo a Lavadora → campo Modelo se vuelve select Torre/Individual.
  - Cambiar tipo a Nevera → campo Modelo vuelve a input texto libre y se resetea.
  - "Cómo nos conociste" no aparece en el form ni en el editor admin.
  - Botón WhatsApp flotante NO aparece en `/agendar`, sí en otras páginas.
- Reviewer:
  - Compresión client-side de la foto funciona y reduce realmente el peso.
  - Schema cambios no rompen citas históricas (parsers tolerantes).
  - Mobile-first consistente en clases Tailwind.
  - `FotoEquipoDisplay` no rompe layout cuando `url` es undefined.
  - Strip undefined antes de Firestore writes.

## Commit

```
feat(web/agendar): mobile responsive + foto equipo + Torre/Individual + cleanup

Sprint combinado de 6 cambios al form público y flujo de equipo:

1. Layout mobile-first en /agendar. Inputs min-h-44px, text-base (sin
   zoom auto iOS), grid responsive de bloques de hora, mini-mapa con
   aspect-ratio. Validado en iPhone SE, iPhone 14, iPad y desktop.

2. Dropdown 'Tipo de equipo' llegaba vacío en form público (PERMISSION
   _DENIED silencioso). Fix: sincronización a config_web/sitio.tiposEquipo
   Publicos con lectura pública. Fallback hardcoded de 7 tipos. Loading
   state explícito.

3. Botón flotante de WhatsApp ocultado en /agendar (el form ya tiene su
   CTA post-submit). Mantiene visible en landing.

4. Campo 'Modelo' ahora es select Torre/Individual cuando el tipo de
   equipo es Lavadora. Para otros equipos sigue como texto libre. Nuevo
   campo equipoTipoMotor en CitaPorConfirmar y Orden. parseOrden y
   parseCitaPorConfirmar actualizados.

5. Foto del equipo (1, opcional) capturable desde el form público.
   Compresión client-side a 1MB/1600px. Upload a fotos-equipos-publico/
   {citaId} en Storage con reglas que validan content-type y size.
   La foto viaja desde la cita por confirmar hasta la orden creada y
   es visible en /admin/citas, OrdenCard, OrdenDetailModal, TecnicoVista
   y AgendaDia. Componente shared FotoEquipoDisplay reusable.

6. Campo '¿Cómo nos conociste?' removido del editor admin y del form
   público. Schema mantiene el campo deprecated para no romper
   rehidratación de citas históricas.

Resuelve UX crítica para clientes desde mobile y agrega contexto
visual del equipo a todo el flujo (oficina, técnico, cierre).
```

## Ante cualquier ambigüedad

- Si el shape actual de tipos de equipo en admin tiene metadata extra (icono, orden, activo), exponer al público solo `nombre` de los activos.
- Si la sincronización a `config_web/sitio.tiposEquipoPublicos` requiere refactor grande del editor admin (porque está acoplado a otro sistema), reportar y proponer alternativa.
- Si las reglas de Firebase Storage NO están en el repo (solo Firestore), reportar — Jorge tendrá que ajustarlas manualmente desde Firebase Console y le damos el snippet.
- Si la compresión client-side de la foto da problemas en Safari iOS, fallback a upload directo sin comprimir + warning si el archivo > 3MB.
