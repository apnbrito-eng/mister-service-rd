# Sprint: Editor de tipos de electrodoméstico desde admin

Usa el subagente coordinator.

## Objetivo

Hoy los tipos de equipo (Lavadora, Nevera, Estufa, A/C, Microondas, Secadora, Otro) están sincronizados a `config_web/sitio.tiposEquipoPublicos` pero **no hay editor directo**. Cuando Jorge quiera ampliar el catálogo de servicios (ej: agregar "Calefón", "Lavavajillas", "Refrigerador comercial"), tiene que tocar código.

Este sprint agrega un editor que permite:

- **Agregar** tipos nuevos.
- **Eliminar** tipos con **confirmación** que enumera los modelos asociados que se borrarían en cascada.
- **Reordenar** con botones ↑↓.

Coexiste con el editor existente del catálogo de modelos (`PROMPT_CATALOGO_MODELOS.md`). La sección de tipos va arriba; cuando se agrega un tipo nuevo, automáticamente aparece como sección vacía en el catálogo de modelos.

## Pre-investigación

1. **Ubicación actual de los tipos**:
   - Identificar dónde se está sincronizando hoy `config_web/sitio.tiposEquipoPublicos` (probablemente desde alguna sección en `/admin/configuracion` o desde un constante).
   - Confirmar shape: `string[]` directo o `{ nombre: string, ... }[]`.

2. **Editor del catálogo de modelos** (sprint anterior):
   - Identificar componente (probablemente `CatalogoModelosSection.tsx` o similar).
   - El nuevo editor de tipos debe vivir en la misma página, idealmente arriba del catálogo.

3. **Form público y form interno**:
   - Confirmar que ambos leen de `config_web/sitio.tiposEquipoPublicos` (no hardcoded).
   - Confirmar que aceptan tipos arbitrarios (no validan contra una lista fija).

## Cambios

### 1. Schema (sin cambios mayores)

Mantener `config_web/sitio.tiposEquipoPublicos: string[]` simple. Cada elemento es el nombre del tipo (ej: `'Lavadora'`).

**Validación al agregar:**

- Nombre mínimo 2 caracteres, máximo 50.
- No duplicado (case-insensitive — comparar lowercase).
- Trim del input antes de guardar.
- Permitir caracteres acentuados (`Á`, `é`, `ñ`).

### 2. Componente nuevo `TiposEquipoSection.tsx`

Ubicación: `src/components/admin/TiposEquipoSection.tsx` (o donde estén las secciones del editor admin).

**UI esperada:**

```
🛠️ Tipos de electrodomésticos

Define qué tipos de equipo aparecen en el formulario público y en
"Crear Orden". Si agregas uno nuevo, también aparecerá como nueva
sección en el catálogo de modelos abajo.

────────────────────────────────────
┌─────────────────────────────────────┐
│ Lavadora               ↑ ↓     ❌   │
│ Nevera                 ↑ ↓     ❌   │
│ Estufa                 ↑ ↓     ❌   │
│ Aire Acondicionado     ↑ ↓     ❌   │
│ Microondas             ↑ ↓     ❌   │
│ Secadora               ↑ ↓     ❌   │
│ Otro                   ↑ ↓     ❌   │
└─────────────────────────────────────┘

Nuevo tipo (ej: Calefón, Lavavajillas)... [+ Agregar tipo]

[💾 Guardar cambios]
```

Estilo coherente con el editor del catálogo de modelos (mismas cards, mismos botones).

**Props:**

```typescript
interface Props {
  config: ConfigWeb;
  onActualizar: (configActualizado: ConfigWeb) => Promise<void>;
}
```

### 3. Lógica de eliminación con cascade + confirmación

Cuando admin toca ❌ en un tipo, antes de eliminar:

```typescript
async function handleEliminarTipo(tipo: string) {
  const modelosAsociados = config.modelosPorTipoEquipo?.[tipo] || [];

  if (modelosAsociados.length === 0) {
    // Sin modelos → confirmación simple
    const ok = window.confirm(
      `¿Eliminar "${tipo}"? Las órdenes históricas con este tipo seguirán mostrándolo.`
    );
    if (!ok) return;
  } else {
    // Con modelos → warning detallado
    const lista = modelosAsociados.map((m) => `• ${m}`).join('\n');
    const ok = window.confirm(
      `Eliminar "${tipo}" también borrará ${modelosAsociados.length} modelo(s) asociado(s):\n\n${lista}\n\nLas órdenes históricas con este tipo seguirán mostrándolo. ¿Confirmas?`
    );
    if (!ok) return;
  }

  // Cascade
  const nuevoTipos = config.tiposEquipoPublicos.filter((t) => t !== tipo);
  const nuevoModelos = { ...(config.modelosPorTipoEquipo || {}) };
  delete nuevoModelos[tipo];

  await onActualizar({
    ...config,
    tiposEquipoPublicos: nuevoTipos,
    modelosPorTipoEquipo: nuevoModelos,
  });

  toast.success(`"${tipo}" eliminado`);
}
```

**Importante:** las órdenes históricas que tenían ese tipo siguen mostrándolo correctamente. `parseOrden` no valida contra el catálogo, solo lee el campo `equipoTipo` del doc.

### 4. Lógica de agregar tipo

```typescript
async function handleAgregarTipo() {
  const nombreLimpio = nombreNuevo.trim();
  
  if (nombreLimpio.length < 2) {
    toast.error('El nombre debe tener al menos 2 caracteres');
    return;
  }
  if (nombreLimpio.length > 50) {
    toast.error('El nombre no puede exceder 50 caracteres');
    return;
  }
  
  const yaExiste = config.tiposEquipoPublicos.some(
    (t) => t.toLowerCase() === nombreLimpio.toLowerCase()
  );
  if (yaExiste) {
    toast.error(`"${nombreLimpio}" ya existe`);
    return;
  }

  const nuevoTipos = [...config.tiposEquipoPublicos, nombreLimpio];
  const nuevoModelos = {
    ...(config.modelosPorTipoEquipo || {}),
    [nombreLimpio]: [], // sección vacía nueva en el catálogo
  };

  await onActualizar({
    ...config,
    tiposEquipoPublicos: nuevoTipos,
    modelosPorTipoEquipo: nuevoModelos,
  });

  setNombreNuevo('');
  toast.success(`"${nombreLimpio}" agregado`);
}
```

### 5. Reordenar con ↑↓

Mismo patrón que el editor del catálogo de modelos. Botón ↑ deshabilitado en el primero, ↓ en el último.

### 6. Permisos

- **Administrador**: edición completa.
- **Coordinadora / Secretaria**: read-only (ven el editor pero no pueden modificar). Si no se puede gateaar la UI, al menos validar en el handler de guardar.
- **Operaria / Técnico**: no ven la sección.

### 7. Sin cambios al form público ni al form interno

Ambos ya leen dinámicamente de `config_web/sitio.tiposEquipoPublicos` y `modelosPorTipoEquipo`. Los nuevos tipos aparecen automáticamente.

### 8. Mapa mental: actualizar (post-deploy)

En `docs/mapa-mental.md`, sección 2.4 Web pública, agregar bajo `/agendar`:
```
Tipos de equipo
  Configurables desde admin
  Catálogo de modelos por tipo
```

Lo hace Cowork al cierre del sprint, no el builder.

## Verificación

- Typecheck + lint sin warnings.
- Tester:
  - `/admin/configuracion` (o donde esté): nueva sección "Tipos de electrodomésticos" arriba del catálogo de modelos.
  - Agregar "Calefón" → guardar → refrescar `/agendar` → "Calefón" aparece en el dropdown de tipo de equipo.
  - El catálogo de modelos también muestra "Calefón" como nueva sección vacía.
  - Eliminar "Microondas" (que NO tiene modelos) → confirmación simple → eliminado.
  - Eliminar "Nevera" (que tiene 4 modelos) → confirmación detallada listando los 4 → al confirmar, ambos (tipo + sus modelos) se eliminan.
  - Agregar duplicado "lavadora" (lowercase) → toast de error.
  - Agregar nombre vacío o de 1 caracter → toast de error.
  - Reordenar con ↑↓ → orden refleja en `/agendar`.
  - Ir a `/admin/ordenes` → órdenes históricas con tipos eliminados siguen mostrándose correctamente.
- Reviewer:
  - Strip undefined antes de Firestore writes.
  - Sin race condition al actualizar simultáneamente con el catálogo de modelos (ambos editores tocan el mismo doc).
  - El editor degrada limpio si `tiposEquipoPublicos` está vacío (mensaje "Sin tipos definidos. Agrega el primero abajo.").
  - Coordinadora/secretaria no pueden modificar (validación server-side via permisos del usuario).

## Commit

```
feat(config): editor de tipos de electrodoméstico desde admin

Hoy los tipos (Lavadora, Nevera, Estufa, A/C, etc.) estaban
sincronizados a config_web/sitio.tiposEquipoPublicos pero sin editor
directo. Para ampliar el catálogo de servicios había que tocar código.

Cambio: nueva sección 'Tipos de electrodomésticos' en /admin/configuracion
arriba del catálogo de modelos. Permite:
- Agregar tipos nuevos (ej: Calefón, Lavavajillas, Refrigerador comercial)
  con validación de duplicados case-insensitive y longitud (2-50 chars).
- Eliminar tipos con confirmación. Si el tipo tiene modelos asociados en
  el catálogo, el warning enumera la lista exacta antes de eliminar en
  cascada (ambos: tipo + sus modelos).
- Reordenar con botones ↑↓.

Al agregar un tipo nuevo, aparece automáticamente como sección vacía en
el catálogo de modelos. Al eliminar, sus modelos asociados también se
borran (cascade explícita).

Las órdenes históricas con tipos eliminados siguen mostrándose
correctamente — parseOrden no valida contra el catálogo, solo lee el
campo del doc.

Permisos: edición solo administrador. Coordinadora/secretaria leen.

Resuelve workflow real: Jorge ahora amplía catálogo de servicios sin
necesidad de redeploy ni desarrollador.
```

## Ante cualquier ambigüedad

- Si la sección de tipos ya existía pero estaba en otra página (no donde está el catálogo de modelos), moverla a la misma para coherencia UX. NO duplicar.
- Si el shape actual es objeto en lugar de string array, mantener compat al leer y guardar como string array para simplificar.
- Si hay ya algún editor parcial (botón "Agregar tipo" sin lógica completa), reusar el componente y completarlo.
