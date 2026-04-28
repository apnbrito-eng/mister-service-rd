# Sprint: /agendar parte 2 — Torre/Individual + foto del equipo + quitar "cómo nos conociste"

Usa el subagente coordinator.

## Contexto

El sprint anterior (`PROMPT_FIX_TIPOS_EQUIPO_PUBLICO.md`, commit `b4541cb`) ya pusheó:
- Mobile/tablet responsive en `/agendar`.
- Dropdown "Tipo de equipo" arreglado (sincronización a `config_web/sitio.tiposEquipoPublicos` con fallback).
- Botón flotante WhatsApp oculto en `/agendar`.

**Esos 3 cambios YA están en producción. NO repetirlos.**

Este sprint cubre los 3 cambios faltantes que Jorge pidió en el último turno.

## Cambios

### 1. Campo "Modelo" — select Torre/Individual condicional para Lavadora

**Comportamiento:**
- Si `equipoTipo === 'Lavadora'`: el campo "Modelo" se renderiza como **select** con opciones:
  - **Torre** (lavadora-secadora vertical)
  - **Individual** (solo lavadora)
  - Default: vacío (`""`). Opcional (no obligatorio).
- Si `equipoTipo !== 'Lavadora'`: el campo "Modelo" se renderiza como **input texto libre opcional** (comportamiento actual).
- Reactivo: si el cliente cambia el tipo de equipo después de elegir el modelo, el campo se resetea a vacío automáticamente.

**Schema:**
- Agregar nuevo campo opcional `equipoTipoMotor?: 'torre' | 'individual'` en:
  - `CitaPorConfirmar` (`src/types/index.ts` o donde esté).
  - `Orden` (mismo archivo).
- El campo `equipoModelo` (texto libre) **se mantiene** para los demás equipos.
- `parseCitaPorConfirmar` y `parseOrden` rehidratan el nuevo campo con fallback a `undefined`.

**Visualización:**
- Cuando una orden tiene `equipoTipoMotor` definido, mostrarlo en cards y detalle:
  - `OrdenCard`: "Lavadora · Mabe · **Torre**"
  - `OrdenDetailModal` sección Equipo: línea adicional "Configuración: Torre"
  - `TecnicoVista`: incluir en el resumen del equipo.

**Form interno admin "Crear Orden de Servicio"** (CrearOrdenModal o equivalente):
- Aplicar la misma lógica condicional. Si la coord/secretaria selecciona Lavadora, el campo modelo es select Torre/Individual. Para otros, input libre.
- **Importante**: este sprint del modal tiene relación con el sprint pendiente `PROMPT_MODAL_CONFIRMAR_AGENDAR.md`. Si el builder ya extrae lógica compartida del modal Crear Orden, mantenerla DRY.

### 2. Foto del equipo (1 sola, opcional)

Regla de negocio (de Jorge): la foto debe ser **visible en TODO el flujo** para que oficina, coord, técnico y cualquier rol que vea la orden tenga noción del equipo a reparar.

**UI form público** (`FormularioAgendarPublico.tsx`):
- Nueva sección al final del bloque "Equipo": **"📸 Foto del equipo (opcional)"**.
- Botón principal: "Tomar/Subir foto del equipo" → `<input type="file" accept="image/*" capture="environment">` (cámara trasera por default en mobile).
- Si el cliente ya cargó una foto:
  - Preview thumbnail 150×150 con borde redondeado.
  - Botón "❌ Quitar" para eliminarla y poder tomar otra.
  - Botón "🔄 Cambiar foto" como alternativa.
- Compresión client-side antes de upload:
  - Max 1MB de peso final.
  - Max dimensiones 1600×1600 (mantener aspect ratio).
  - Usar `<canvas>` (sin lib externa pesada).
  - Si la compresión falla en Safari iOS o algún browser exótico, fallback: subir original con warning si > 3MB.

**Upload a Firebase Storage:**
- Generar `citaIdProvisional = crypto.randomUUID()` al montar el componente.
- Path: `fotos-equipos-publico/{citaIdProvisional}/{nombreOriginalLimpio}.jpg`.
- Al hacer submit, la URL pública se incluye en el doc de `citas_por_confirmar.fotoEquipoUrl`.
- El `citaIdProvisional` también se incluye en `citas_por_confirmar.citaIdProvisional` para trazabilidad y auditoría de la foto.

**Reglas de Firebase Storage** que hay que ajustar (manualmente desde Firebase Console — las reglas no están versionadas en el repo):

```
match /b/{bucket}/o {
  // ... otras reglas existentes (fotos-ponche, etc.) ...

  match /fotos-equipos-publico/{citaId}/{fileName} {
    allow write: if request.resource.contentType.matches('image/.*')
                 && request.resource.size < 5 * 1024 * 1024;
    allow read: if request.auth != null;
    allow delete: if false;
  }
}
```

**Schema:**
- `CitaPorConfirmar.fotoEquipoUrl?: string`
- `CitaPorConfirmar.citaIdProvisional?: string`
- `Orden.fotoEquipoUrl?: string` (al confirmar la cita y crear la orden, la URL se transfiere — esto se conecta con el sprint pendiente del modal Confirmar y Agendar; si ese sprint aún no se ejecutó, dejar el handler actual de `handleConfirmarYAgendar` cargando el campo a la orden).
- Parsers actualizados.

**Visualización en TODO el flujo:**

Crear `src/components/shared/FotoEquipoDisplay.tsx`:

```typescript
interface Props {
  url?: string;
  className?: string;
  size?: 'sm' | 'md' | 'lg'; // sm=64px, md=120px, lg=200px
}
```

- Si hay URL → muestra thumbnail clickeable que abre lightbox/modal con la foto a tamaño completo.
- Si no hay URL → no renderiza nada (no ocupa espacio ni muestra placeholder).
- Click fuera del lightbox o tecla ESC cierra.

**Reusar en:**
- `/admin/citas` (card de cita por confirmar) — `size="sm"`.
- `OrdenCard` — `size="sm"` en sección equipo.
- `OrdenDetailModal` — `size="md"` en sección Equipo.
- `TecnicoVista` (card de orden asignada) — `size="sm"` para que el técnico vea antes de llegar.
- `AgendaDia` (card por slot) — `size="sm"` junto al cliente.
- Modal "Confirmar y Agendar" actual (si aún no se reemplaza por sprint del modal preset) — `size="md"`.

### 3. Quitar "¿Cómo nos conociste?" del editor admin y form público

- Editor admin (`ConfigFormularioAgendarSection.tsx`):
  - Quitar el campo predefinido `comoNosConocio` de la lista de campos disponibles.
  - Si el editor renderiza una sección "Opciones de '¿cómo nos conociste?'" (input para editar las opciones del select), también quitarla.
- Defaults (`configFormularioAgendarDefault()` en `src/types/configFormularioAgendar.ts`):
  - Eliminar la entrada `'comoNosConocio'` del array `campos`.
  - Eliminar el array `opcionesComoNosConocio` si existe en el shape.
- Form público (`FormularioAgendarPublico.tsx`):
  - Quitar el render del campo + cualquier estado relacionado (`useState<string>('')` para `comoNosConocio`, etc.).
- Schema:
  - `CitaPorConfirmar.comoNosConocio?: string` se mantiene en el type con comentario `// @deprecated - removed from public form, kept for historical data`.
  - `parseCitaPorConfirmar` sigue rehidratando el campo si existe en el doc (compat).
  - `metadatosCita.comoNosConocio` deja de poblarse en órdenes nuevas.
- Mensaje WhatsApp prellenado (`construirMensajeWhatsApp`):
  - Quitar la línea `*¿Cómo nos conoció?* ${datos.comoNosConocio}` ya que el campo no se va a llenar.

## Verificación

- Typecheck + lint sin warnings.
- Tester:
  - Abrir `/agendar` en incógnito mobile + desktop.
  - Seleccionar tipo "Lavadora" → campo Modelo es select Torre/Individual.
  - Cambiar tipo a "Nevera" → campo Modelo vuelve a input texto libre y se resetea.
  - Tomar foto del equipo (real o simulada con DevTools) → preview aparece → quitar/cambiar funciona.
  - Submit → verificar en `/admin/citas` que aparece la miniatura de la foto y `equipoTipoMotor` (cuando aplique).
  - Confirmar la cita → orden creada incluye `fotoEquipoUrl` y `equipoTipoMotor`.
  - `OrdenCard`, `OrdenDetailModal`, `TecnicoVista`, `AgendaDia`: la foto aparece donde corresponde.
  - El campo "Cómo nos conociste" NO aparece en form público ni en editor admin.
- Reviewer:
  - Compresión client-side reduce realmente el peso (probar con foto > 5MB).
  - `FotoEquipoDisplay` no rompe layout cuando `url` es undefined.
  - `parseOrden` y `parseCitaPorConfirmar` rehidratan los nuevos campos.
  - Strip undefined antes de Firestore writes.
  - Citas históricas (que tienen `comoNosConocio`) siguen renderizándose sin warnings.

## Commit

```
feat(agendar): Torre/Individual + foto del equipo + cleanup cómo nos conociste

Continuación del sprint mobile (b4541cb) con 3 cambios pendientes:

1. Campo 'Modelo' del form público y del modal admin Crear Orden ahora
   es select Torre/Individual cuando el tipo de equipo es Lavadora. Para
   otros equipos sigue como input texto libre. Nuevo campo opcional
   equipoTipoMotor en CitaPorConfirmar y Orden. Visible en OrdenCard,
   OrdenDetailModal y TecnicoVista para que técnico sepa la
   configuración antes de llegar.

2. Foto del equipo (1, opcional) capturable desde el form público.
   Compresión client-side a 1MB/1600px. Upload a fotos-equipos-publico/
   {citaIdProvisional} en Firebase Storage con reglas que validan
   content-type y size (max 5MB). La foto viaja desde citas_por_confirmar
   hasta la orden creada y es visible en /admin/citas, OrdenCard,
   OrdenDetailModal, TecnicoVista y AgendaDia. Componente shared
   FotoEquipoDisplay reusable con tamaños sm/md/lg y lightbox al click.

3. Campo '¿Cómo nos conociste?' removido del editor admin y del form
   público. Schema mantiene el campo deprecated para no romper
   rehidratación de citas históricas. Mensaje WhatsApp prellenado
   actualizado para no incluir la línea.

Resuelve UX: contexto visual del equipo en todo el flujo (oficina ve qué
es antes de confirmar, técnico ve qué va a reparar antes de llegar) y
captura precisa de configuración en lavadoras.
```

## Heads-up para Jorge (acción manual)

Si las reglas de Firebase Storage no están versionadas en el repo (solo Firestore lo está), Claude Code te dará el snippet en su output. Tendrás que pegarlo manualmente:

1. Firebase Console → Storage → Rules.
2. Pegar el bloque de `match /fotos-equipos-publico/{citaId}/{fileName}` que el sprint te entrega.
3. Publish rules.

Sin eso, el upload de la foto desde `/agendar` va a fallar con `storage/unauthorized`. El sprint debe degradar con un toast claro: "No se pudo subir la foto, continúa sin ella" y dejar que el form siga funcional.

## Ante cualquier ambigüedad

- Si la sincronización al modal interno admin Crear Orden requiere refactor mayor, hacer SOLO el form público en este sprint y dejar el modal admin con el comportamiento actual hasta el sprint del modal Confirmar y Agendar.
- Si la compresión client-side no funciona consistente entre Chrome iOS y Safari iOS, dejar fallback simple: subir tal cual con warning si > 3MB.
- Si encuentras que `equipoModelo` y `equipoTipoMotor` están acoplados en algún lugar del código (ej: una utilidad genera labels), refactorizar a un helper compartido en lugar de duplicar lógica.
