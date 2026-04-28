# Sprint: Pulido — smells acumulados de los sprints recientes

Usa el subagente coordinator.

## Objetivo

Limpiar todos los smells, nits y bordes no-bloqueantes que reviewer marcó durante los últimos 4 sprints (formulario `/agendar` v1/v2/v3 + mini-mapa). Ninguno es crítico individualmente, pero juntos representan deuda técnica que conviene limpiar antes de seguir agregando features.

## Pre-investigación

El builder debe LEER y reportar:

1. Qué archivos tocaron los últimos commits (desde `0b1780e` hasta el más reciente):
   ```bash
   git log --name-only --pretty=format:"=== %h %s" 0b1780e..HEAD
   ```
2. Confirmar el estado actual de cada uno de los 8 puntos abajo. Si alguno **ya quedó resuelto** en el camino (revisión cruzada de commits posteriores), reportarlo y saltarlo.

## Items a pulir

### 1. Markdown injection en mensaje WhatsApp (form `/agendar`)

**Problema:** si el cliente escribe `*` o `_` o `~` en su nombre, dirección o falla, rompe el formato del mensaje de WhatsApp prellenado (WhatsApp interpreta como negrita/cursiva/tachado).

**Fix:** en `formularioAgendar.service.ts` (función `construirMensajeWhatsApp`), sanitizar todos los valores del cliente antes de inyectarlos en el template. Crear helper:

```typescript
function escaparWhatsAppMarkdown(texto: string): string {
  if (!texto) return '';
  // Escapar caracteres que WhatsApp interpreta como markdown
  return texto.replace(/([*_~`])/g, ' '); // reemplazar por espacio (más simple que escapar)
}
```

Aplicarlo a TODOS los valores del cliente que entran al template (nombre, dirección, sector, falla, equipoMarca, etc.). NO aplicar a las labels fijas que escribimos nosotros (los `*Teléfono:*` y similares mantienen su formato).

### 2. label-as-key en camposPersonalizados

**Problema:** los campos personalizados del form usan el `label` como key del objeto guardado en Firestore. Si el admin renombra el label de "Marca preferida" a "Marca favorita", todos los datos históricos pierden la conexión.

**Fix:** usar `id` permanente como key. El editor en `ConfigFormularioAgendarSection.tsx` ya genera un `id` cuando se crea el campo — lo que falta es que `FormularioAgendarPublico.tsx` use ese `id` como key al guardar:

```typescript
// ANTES:
camposPersonalizados[campo.label] = valor;

// DESPUÉS:
camposPersonalizados[campo.id] = valor;
```

Y al renderizar en `/admin/citas` (módulo de citas por confirmar), buscar el campo en config para mostrar el label actual:

```typescript
const labelActual = config.camposPersonalizados.find(c => c.id === key)?.label || key;
```

**Migración:** los datos históricos seguirán teniendo label-as-key. No es necesario migrarlos — solo tolerar ambos formatos en el render (try id-as-key first, fall back to value-as-display).

### 3. Validación server-side de bloquesHora no vacío

**Problema:** la UI impide guardar bloquesHora vacío, pero alguien con acceso a Firestore Console podría dejarlo vacío manualmente y el form público fallaría al renderizar los botones.

**Fix:** en `FormularioAgendarPublico.tsx`, defaultear si la lista llega vacía:

```typescript
const bloquesParaMostrar = config.bloquesHora && config.bloquesHora.length > 0
  ? config.bloquesHora
  : ['9:00 AM', '11:00 AM', '1:00 PM', '3:00 PM', '5:00 PM']; // fallback hardcoded
```

Y log en consola si el fallback se activó (para que devops note la inconsistencia).

### 4. Reusar genDireccionId() existente

**Problema:** en `clientes.service.ts` (función `crearOActualizarClienteDesdeCita`) el builder generó IDs de dirección con código propio (probablemente `Date.now() + Math.random()` o similar) en vez de reusar el helper `genDireccionId()` que ya existe en el codebase.

**Fix:** importar y usar `genDireccionId()` en vez del código inline. Si la función no existe en el archivo donde se espera, buscarla con grep — debe estar en `utils/index.ts` o `utils/direccion.ts`.

### 5. Race condition tolerable en confirmar cita (dejar como está, pero documentar)

**Problema:** si dos coords confirman la misma cita simultáneamente (segundo exacto), podría crear duplicado de cliente.

**Fix:** NO introducir transaction (overhead alto, beneficio bajo). En cambio, agregar comentario explicativo en `crearOActualizarClienteDesdeCita`:

```typescript
// NOTA: aceptamos race condition tolerable aquí. Si dos confirmaciones
// simultáneas crean duplicado, se detecta visualmente en /admin/clientes
// (mismo telefonoNormalizado) y se merga manualmente. La probabilidad es
// baja porque el flujo natural impide que dos coords confirmen la misma
// cita al mismo segundo. Un fix robusto requiere setDoc(merge:true) con
// ID = telefonoNormalizado, pero eso choca con clientes preexistentes
// que tienen ID auto-generado.
```

### 6. Destinatarios de notificación hardcoded

**Problema:** en `formularioAgendar.service.ts` los roles que reciben la notificación de "nueva cita" están hardcoded (`['secretaria', 'coordinadora', 'administrador']`).

**Fix:** mover a la config del formulario para que sea editable desde admin:

```typescript
// En ConfigFormularioAgendar:
notificarA: ('administrador' | 'coordinadora' | 'secretaria' | 'operaria')[];
// default: ['secretaria', 'coordinadora', 'administrador']
```

Editor: checkbox por rol en la sección "Formulario de Agendamiento" del admin (`ConfigFormularioAgendarSection.tsx`).

Service: leer del config en vez del array hardcoded.

### 7. Sweep general de calidad

Mientras estás dentro, hacer una pasada por los archivos modificados en los últimos 4 sprints buscando:

- **`console.log` huérfanos** (los de debug que no se limpiaron). Quitar o convertir a `console.warn`/`console.error` si tienen sentido.
- **`any` explícitos en TS** que se puedan tipar mejor. Si requieren refactor grande, dejarlos pero anotar con `// TODO: typar`.
- **Imports no usados.** ESLint los detecta — correr `npm run lint` y limpiar.
- **Try/catches vacíos o que solo `console.error`.** Confirmar que al menos hagan `toast.error` para feedback al usuario.
- **`undefined` que se cuela en Firestore writes.** Confirmar que todos los `addDoc`/`setDoc`/`updateDoc` recientes pasen por strip o usen el helper compartido.

### 8. Verificar `parseCitaPorConfirmar` rehidrata todos los nuevos campos

**Problema:** se agregaron varios campos a `CitaPorConfirmar` en los últimos sprints (`whatsappAsignado`, `whatsappAsignadoNombre`, `clienteSector`, `comoNosConocio`, `camposPersonalizados`, `telefonoNormalizado`, `clienteLat`, `clienteLng`). El parser puede no estar rehidratándolos todos correctamente.

**Fix:** abrir `parseCitaPorConfirmar` (donde sea que esté) y confirmar que cada uno de los nuevos campos:
- Se lee del raw doc.
- Se devuelve en el objeto parseado.
- Tiene fallback razonable (string vacío para strings, undefined para opcionales, etc.).

Si el parser está inline en `Citas.tsx` y no es función separada, refactorizar a `utils/index.ts` o `utils/parsers.ts` para reuso.

## Verificación

- Typecheck + lint sin warnings.
- Tester:
  - Submit form `/agendar` con `*` en el nombre del cliente → verificar mensaje WhatsApp se ve limpio (los asteriscos no rompen el formato).
  - Renombrar label de campo personalizado en admin → datos previamente guardados con ese campo siguen mostrándose correctamente en `/admin/citas`.
  - Vaciar `bloquesHora` directo en Firestore Console (simulación) → form sigue funcionando con los 5 defaults.
  - Confirmar cita y verificar en `/admin/clientes` que la dirección agregada tiene `id` generado por el helper compartido.
  - Editar checkboxes de "notificar a" en admin → desmarcar "operaria" → submit nueva cita → operaria NO recibe notificación. Marcar "operaria" → submit otra → operaria SÍ recibe.
- Reviewer:
  - Strip de undefined respetado en todos los writes.
  - No hay `console.log` huérfanos en archivos del último mes.
  - Parser de citas tiene fallback para todos los campos nuevos.
  - Comentario de race condition presente y claro.

## Commit

```
chore: sprint de pulido post-mejoras formulario /agendar

Limpieza de smells acumulados durante los sprints v1/v2/v3 del form
público y el sprint del mini-mapa.

- Sanitización de markdown WhatsApp: caracteres *, _, ~, ` del cliente
  ya no rompen el formato del mensaje prellenado.
- Campos personalizados ahora usan id permanente como key (no label).
  El render en /admin/citas tolera ambos formatos para no perder datos
  históricos.
- bloquesHora vacío en Firestore degrada al default hardcoded en lugar
  de romper el render del form público.
- Reuso del helper genDireccionId() en clientes.service en vez de
  generación inline.
- Comentario explícito sobre race condition tolerable en
  crearOActualizarClienteDesdeCita (decisión consciente de no usar
  transacción).
- Destinatarios de notificación 'nueva cita' ahora editables desde
  /admin/web (checkbox por rol). Default mantiene comportamiento previo.
- Pasada de calidad sobre archivos modificados últimas 4 semanas:
  console.log huérfanos eliminados, imports no usados limpiados,
  try/catches con feedback al usuario.
- parseCitaPorConfirmar rehidrata explícitamente whatsappAsignado,
  whatsappAsignadoNombre, clienteSector, comoNosConocio,
  camposPersonalizados, telefonoNormalizado, clienteLat, clienteLng.

Sin cambios funcionales visibles para el usuario. Reduce deuda técnica
acumulada durante la última semana de iteración rápida.
```

## Ante cualquier ambigüedad

Pregunta con AskUserQuestion antes de tocar código. Especialmente:

- Si algún item ya quedó resuelto en commits posteriores (verificar antes de duplicar trabajo).
- Si la migración de label-as-key a id-as-key tiene un caso edge no contemplado.
- Si el sweep de calidad encuentra un problema mayor (ej: una vulnerabilidad real, no un nit), reportar antes de fixear y seguir.
