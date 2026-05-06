# Sprint: Catálogo configurable de modelos por tipo de equipo

Usa el subagente coordinator.

## Objetivo

Hoy la condición "si tipo = Lavadora → Modelo es select Torre/Individual" está **hardcoded** en el código. Este sprint la generaliza: admin puede definir desde una nueva sección de configuración una lista de modelos por cada tipo de equipo. El form público `/agendar` y el form interno "Crear Orden de Servicio" leen ese catálogo y renderizan dinámicamente:

- Si el tipo elegido tiene modelos definidos → dropdown con esas opciones.
- Si no tiene modelos → input texto libre (comportamiento default actual).

Beneficio: ya no toca código cuando se quiera agregar opciones para Nevera, Estufa, A/C, etc.

## Pre-investigación

1. **Schema actual de tipos de equipo** en `config_web/sitio`:
   - Identificar exactamente dónde y cómo se almacenan los tipos (`tiposEquipoPublicos`, etc.).
   - Verificar editor admin existente (probablemente en `/admin/configuracion` o sección de la web).

2. **Lógica hardcoded de Torre/Individual del sprint Parte 2**:
   - Buscar en `FormularioAgendarPublico.tsx` y en el modal "Crear Orden de Servicio" (`OrdenCreateModal.tsx` + `useOrdenCreateForm.ts`) la lógica `if (equipoTipo === 'Lavadora')`.
   - Identificar el campo `equipoTipoMotor` que se agregó al schema y dónde se renderiza.

3. **`OrdenCard`, `OrdenDetailModal`, `TecnicoVista`**:
   - Verificar si ya muestran `equipoModelo` o si dependen de `equipoTipoMotor`.

## Cambios

### 1. Schema

Extender `ConfigWeb`:

```typescript
modelosPorTipoEquipo?: {
  [tipoEquipo: string]: string[]; // ej: 'Lavadora': ['Torre', 'Individual']
};
```

Ubicación: dentro de `config_web/sitio` (junto a `tiposEquipoPublicos`).

**Defaults pre-poblados** (lazy init via setDoc merge cuando se carga la config y el campo no existe):

```typescript
{
  'Lavadora': ['Torre', 'Individual'],
  'Nevera': ['Side-by-side', 'French door', 'Top freezer', 'Mini bar'],
  'Estufa': ['Eléctrica', 'Gas', 'Mixta'],
  'Aire Acondicionado': ['Split', 'Ventana', 'Portátil', 'Cassette'],
  'Microondas': [], // sin opciones, queda como input texto libre
  'Secadora': ['Torre', 'Individual'],
}
```

### 2. Migración del campo `equipoTipoMotor`

El sprint Parte 2 agregó `equipoTipoMotor: 'torre' | 'individual'` específico para Lavadora. Con el catálogo, este campo se vuelve redundante:

- **`equipoModelo`** ya existe en la orden y puede guardar la opción elegida del catálogo (ej: `'Torre'`, `'French door'`, `'Split'`, etc.).
- **`equipoTipoMotor`** queda **deprecated**:
  - Mantener el campo en el type con comentario `// @deprecated - migrated to equipoModelo via catálogo`.
  - `parseOrden` sigue rehidratándolo si existe en el doc (compat con órdenes históricas).
  - Cuando se cree una orden nueva con catálogo, NO se popula `equipoTipoMotor`. Se usa solo `equipoModelo`.

### 3. Editor admin

Nueva sección **"Catálogo de modelos por tipo"** en `/admin/configuracion` (o en la página donde estén los tipos de equipo — confirmar en pre-investigación).

**UI:**

```
📋 Catálogo de modelos por tipo de equipo

Define las opciones de modelo que aparecen al cliente cuando elige un tipo de equipo.
Si dejas la lista vacía, el campo Modelo será texto libre.

────────────────────────────────────
🔹 Lavadora
   Modelos:
   ┌───────────────────────┐
   │ Torre              ❌ │ ↑↓
   │ Individual         ❌ │ ↑↓
   └───────────────────────┘
   [+ Agregar modelo]

🔹 Nevera
   Modelos:
   ┌───────────────────────┐
   │ Side-by-side       ❌ │ ↑↓
   │ French door        ❌ │ ↑↓
   │ Top freezer        ❌ │ ↑↓
   │ Mini bar           ❌ │ ↑↓
   └───────────────────────┘
   [+ Agregar modelo]

🔹 Microondas
   Modelos:
   (Sin modelos definidos — el cliente verá input texto libre)
   [+ Agregar modelo]

[Guardar cambios]
```

- Cada tipo de equipo de `tiposEquipoPublicos` aparece automáticamente como sección.
- Lista de modelos con botones ↑↓ para reordenar (mismo patrón de bloques de hora).
- Botón ❌ por modelo para eliminar.
- Botón "+ Agregar modelo" por tipo (input + enter para agregar).
- **Permisos**: solo `administrador` puede editar. `coordinadora` y `secretaria` lo ven en read-only.

### 4. Form público `/agendar`

En `FormularioAgendarPublico.tsx`, reemplazar la lógica hardcoded de Lavadora→Torre/Individual por la genérica:

```tsx
const modelosDisponibles = config.modelosPorTipoEquipo?.[equipoTipoElegido] || [];

{modelosDisponibles.length > 0 ? (
  <select
    value={equipoModelo}
    onChange={(e) => setEquipoModelo(e.target.value)}
    className="..."
  >
    <option value="">Selecciona...</option>
    {modelosDisponibles.map((modelo) => (
      <option key={modelo} value={modelo}>{modelo}</option>
    ))}
  </select>
) : (
  <input
    type="text"
    value={equipoModelo}
    onChange={(e) => setEquipoModelo(e.target.value)}
    placeholder="Opcional"
    className="..."
  />
)}
```

**Reactividad**: si el cliente cambia el tipo de equipo después de elegir un modelo, el campo se resetea a vacío (igual que ya hace el sprint Parte 2 con Torre/Individual).

### 5. Form interno admin "Crear Orden de Servicio"

Misma lógica en `OrdenCreateModal.tsx` y `useOrdenCreateForm.ts`:

- Reemplazar el switch hardcoded de Lavadora por la lectura del catálogo.
- **Si el modelo elegido del catálogo es "Torre" o "Individual" para Lavadora**, también populamos `equipoTipoMotor` por compat (durante la transición). Después de 2-3 meses con el sprint en producción, se puede limpiar este compat.

**Helper compartido:** crear `src/utils/modelosEquipo.ts`:

```typescript
export function obtenerModelosDeTipo(
  tipoEquipo: string,
  catalogoConfig?: { [tipo: string]: string[] }
): string[] {
  if (!catalogoConfig) return [];
  return catalogoConfig[tipoEquipo] || [];
}
```

Reusar en `FormularioAgendarPublico` y en el modal admin.

### 6. Visualización (sin cambios necesarios pero validar)

`OrdenCard`, `OrdenDetailModal`, `TecnicoVista`, `AgendaDia` ya muestran `equipoModelo` cuando existe. Verificar que sigan funcionando con los nuevos valores ("Side-by-side", "French door", etc.) sin truncamiento ni overflow.

### 7. Lazy init de la config

En el primer `setDoc` del config_web/sitio (cuando un admin entra a la sección por primera vez después del deploy):

```typescript
const configActual = await getDoc(configRef);
const data = configActual.data() || {};

if (!data.modelosPorTipoEquipo) {
  await updateDoc(configRef, {
    modelosPorTipoEquipo: defaults,
  });
}
```

Esto pre-puebla los defaults sensatos sin requerir que admin los configure manualmente. Admin puede modificarlos después desde la UI.

## Verificación

- Typecheck + lint sin warnings.
- Tester:
  - Abrir `/agendar` → seleccionar Lavadora → campo Modelo es dropdown con [Torre, Individual].
  - Cambiar a Nevera → campo Modelo cambia a dropdown con 4 opciones de catálogo.
  - Cambiar a Microondas (sin modelos) → campo Modelo vuelve a input texto libre.
  - Cambiar a Otro (que tampoco tiene modelos) → input texto libre.
  - Submit con cualquier modelo elegido → guarda en `equipoModelo`.
  - Modal admin "Crear Orden de Servicio": misma lógica condicional funciona.
  - `/admin/configuracion → Catálogo de modelos por tipo`: agregar nuevo modelo a Estufa ("Inducción") → guardar → refrescar `/agendar` → verificar que aparece.
  - Eliminar un modelo de Lavadora → guardar → confirmar que desaparece de las opciones.
  - Reordenar modelos con ↑↓ → orden refleja en el dropdown.
- Reviewer:
  - `parseOrden` rehidrata defensivamente. Órdenes históricas con `equipoTipoMotor` siguen funcionando.
  - Strip undefined antes de Firestore writes.
  - Helper `obtenerModelosDeTipo` reusado, no duplicado.
  - Lazy init no se dispara dos veces (idempotente).
  - Permisos correctos: coordinadora/secretaria ven catálogo read-only.

## Commit

```
feat(config): catálogo configurable de modelos por tipo de equipo

Generaliza la lógica hardcoded del sprint Parte 2 (Lavadora→Torre/
Individual). Ahora admin define desde /admin/configuracion una lista
de modelos por cada tipo de equipo. El form público /agendar y el
modal interno Crear Orden de Servicio leen el catálogo dinámicamente:

- Si el tipo elegido tiene modelos definidos → dropdown con opciones.
- Si la lista está vacía → input texto libre (comportamiento default).

Defaults pre-poblados via lazy init:
- Lavadora: [Torre, Individual]
- Nevera: [Side-by-side, French door, Top freezer, Mini bar]
- Estufa: [Eléctrica, Gas, Mixta]
- A/C: [Split, Ventana, Portátil, Cassette]
- Secadora: [Torre, Individual]
- Microondas: (vacío - texto libre)

Schema: nuevo campo config_web/sitio.modelosPorTipoEquipo. Helper
compartido obtenerModelosDeTipo en utils/modelosEquipo.ts. Editor
admin con add/remove/reorder por tipo, gateado a rol administrador.

equipoTipoMotor del sprint Parte 2 queda deprecated en el schema:
parseOrden sigue rehidratándolo para compat con órdenes históricas,
pero las nuevas órdenes guardan la elección del catálogo en
equipoModelo. Compat de doble-write durante 2-3 meses para órdenes
de Lavadora con Torre/Individual.

Resuelve workflow real: agregar opciones nuevas (ej: Nevera French
door, A/C Cassette) ya no requiere redeploy.
```

## Ante cualquier ambigüedad

- Si el editor admin de tipos de equipo está en una página específica (no en `/admin/configuracion` ni en `/admin/web`), agregar la sección de catálogo en la misma página por proximidad UX.
- Si los `tiposEquipoPublicos` actuales tienen formato distinto (objetos con metadata, no strings), adaptar el catálogo para usar el `id` del tipo en lugar del string.
- Si el lazy init choca con el flujo del editor (ej: el admin abre la sección y espera que esté vacía), reportar y proponer alternativa: defaults solo cuando el admin toca el botón "Pre-poblar con valores comunes".
