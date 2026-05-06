# Sprint: Paleta de colores configurable para el banner del hero (+ asegurar fallback al azul original)

Usa el subagente coordinator.

## Objetivo

Dos cosas combinadas:

1. **Fix garantizado**: cuando admin quita TODAS las imágenes del hero (modo fija sin imagen, o modo carrusel con array vacío), el banner debe volver al gradient azul navy original (`#0f3460` → `#1a5fa8`). Hoy hay un bug donde la imagen "vuelve" por el parser legacy — si ya se está fixeando en otro sprint, integrar acá.

2. **Nueva feature**: cuando NO hay imagen, admin puede elegir entre **6 presets de gradients** o uno **personalizado** (2 colores hex). Eso le da control visual sin necesidad de subir imágenes.

## Pre-investigación

1. **Estado del fix del botón "Quitar imagen"**:
   - Verificar si ya se aplicó el fix con `deleteField()` + parser estricto que no cae al legacy `imagenUrl`.
   - Si NO está aplicado, integrarlo en este sprint.

2. **Componente Hero actual** (`src/pages/public/HomePage.tsx`):
   - Identificar el gradient actual: `from-primary via-primary to-primary-medium`.
   - Verificar la condición que decide entre mostrar imagen vs gradient.

3. **`tailwind.config.js`**:
   - Confirmar valores de `primary` (`#0f3460`), `primary-medium` (`#1a5fa8`), `primary-light` (`#2d7dd2`).

## Schema

Extender `ConfigWeb.hero`:

```typescript
hero?: {
  modo: 'fija' | 'carrusel';
  imagenFija?: string;
  imagenesCarrusel?: string[];
  intervaloCarrusel?: number;
  transicion?: 'fade' | 'slide';
  pausarEnHover?: boolean;
  // NUEVOS:
  gradientPreset?: 
    | 'navy'              // default — el azul actual
    | 'azul-profesional'
    | 'verde-corporate'
    | 'negro-elegante'
    | 'rojo-energy'
    | 'gris-minimalista'
    | 'personalizado';
  gradientCustomFrom?: string;  // hex, solo si preset === 'personalizado'
  gradientCustomTo?: string;
};
```

Defaults:
- `gradientPreset: 'navy'` (mantiene el comportamiento original).
- `gradientCustomFrom: '#0f3460'`, `gradientCustomTo: '#1a5fa8'` (matchean los del preset navy por si admin elige personalizado).

## Cambios

### 1. Fix garantizado del fallback al gradient

Lógica del componente Hero:

```typescript
const tieneImagen =
  (modo === 'fija' && imagenFija) ||
  (modo === 'carrusel' && imagenesCarrusel?.length >= 2);

if (tieneImagen) {
  return <HeroConImagen ... />;
}

// Sin imagen → gradient según preset
return <HeroConGradient preset={gradientPreset} customFrom={...} customTo={...} />;
```

Si el campo `imagenFija` viene como string vacío `''`, contar como SIN imagen (ya cubierto por el fix del parser estricto).

### 2. Componente `HeroConGradient`

Nuevo: `src/components/public/HeroConGradient.tsx`.

Mapping de presets a colores hex:

```typescript
const PRESETS_GRADIENT = {
  'navy': { from: '#0f3460', to: '#1a5fa8', via: '#0f3460' },
  'azul-profesional': { from: '#1e40af', to: '#2563eb', via: '#1d4ed8' },
  'verde-corporate': { from: '#064e3b', to: '#10b981', via: '#047857' },
  'negro-elegante': { from: '#18181b', to: '#3f3f46', via: '#27272a' },
  'rojo-energy': { from: '#7f1d1d', to: '#dc2626', via: '#991b1b' },
  'gris-minimalista': { from: '#374151', to: '#6b7280', via: '#4b5563' },
};

function obtenerColoresGradient(preset, customFrom, customTo) {
  if (preset === 'personalizado') {
    return { from: customFrom || '#0f3460', to: customTo || '#1a5fa8', via: customFrom || '#0f3460' };
  }
  return PRESETS_GRADIENT[preset] || PRESETS_GRADIENT['navy'];
}
```

Render:

```tsx
const { from, via, to } = obtenerColoresGradient(preset, customFrom, customTo);

<section
  className="relative overflow-hidden"
  style={{
    backgroundImage: `linear-gradient(to bottom right, ${from}, ${via}, ${to})`,
  }}
>
  {/* Decorative shapes con bg-white/10 — invariante por preset */}
  {/* Contenido del hero (texto + stats card) */}
</section>
```

### 3. Editor admin `/admin/web → Hero → Paleta de colores`

Nueva subsección visible siempre (incluso cuando hay imagen — para que admin pueda cambiar el color de fallback por si después quita la imagen):

```
🎨 Color de fondo (cuando no hay imagen)

Preset:
[ ⦿ Azul Navy (original) ]      [Preview gradient: barra horizontal del color]
[ ◯ Azul Profesional ]           [Preview]
[ ◯ Verde Corporate ]            [Preview]
[ ◯ Negro Elegante ]             [Preview]
[ ◯ Rojo Energy ]                [Preview]
[ ◯ Gris Minimalista ]           [Preview]
[ ◯ Personalizado ]              

[Si Personalizado:]
  Color desde:  [color picker]  #0f3460
  Color hasta:  [color picker]  #1a5fa8

Vista previa:
[Banner con el gradient elegido]

[💾 Guardar Paleta]
```

**Detalles UI:**
- Cada preset es un radio button con barra horizontal (~40px alto) del gradient como preview, así admin elige visualmente.
- El "Personalizado" muestra inputs `<input type="color">` nativos del navegador.
- Vista previa abajo: barra grande (~150px alto) que muestra cómo se va a ver el banner real con el preset elegido.

**Permisos:** solo administrador edita la paleta. Otros roles (coord, secretaria) ven en read-only.

### 4. Sin cambios al texto/contenido del hero

El texto del hero (título, subtítulo, stats) sigue funcionando igual. Solo cambia el background.

### 5. Mobile responsive

El gradient se ve igual en mobile (no requiere ajuste).

## Verificación

- Typecheck + lint sin warnings.
- Tester:
  - **Bug fix**: subir imagen al hero, guardar. Tocar "Quitar imagen", guardar. Refrescar el sitio en incógnito → debe mostrarse el gradient azul navy (no la imagen anterior).
  - **Modo carrusel vacío**: cambiar a modo carrusel, eliminar todas las imágenes del array, guardar. Refrescar el sitio → debe mostrarse el gradient.
  - **Cambiar preset**: con imagen quitada, cambiar preset a "Verde Corporate" → guardar → refrescar sitio → gradient verde aparece.
  - **Personalizado**: elegir Personalizado, color from `#000000`, color to `#ff0000` → guardar → sitio muestra gradient negro a rojo.
  - **Volver a Navy**: cambiar de Personalizado a Navy → vuelve al original.
  - Mobile: gradient se ve correctamente en iPhone SE, iPhone 14, iPad.
- Reviewer:
  - parseConfigHero rehidrata defensivamente los nuevos campos (preset, customFrom, customTo).
  - Strip undefined antes de Firestore writes.
  - Defaults seguros: si `gradientPreset` es undefined o inválido, fallback a `'navy'`.
  - Validación de color hex en customFrom/customTo (regex `^#[0-9a-fA-F]{6}$`).
  - El componente original con imagen no cambia su comportamiento (solo fallback agregado).

## Commit

```
feat(web): paleta de colores configurable para el banner del hero + fix fallback

Dos cambios coordinados:

1. Fix garantizado del fallback al gradient cuando no hay imagen.
   Cuando admin quita la imagen del hero (modo fija sin imagen, modo
   carrusel con array vacío), el banner ahora vuelve consistentemente
   al gradient configurado. Combinado con el fix previo del parser
   estricto (que ya no cae al legacy imagenUrl), el comportamiento
   es predecible.

2. Nuevo selector de paleta en /admin/web → Hero. 6 presets pre-
   definidos + opción 'personalizado' con color picker hex:
   - Azul Navy (#0f3460 → #1a5fa8) — el original, default
   - Azul Profesional (#1e40af → #2563eb)
   - Verde Corporate (#064e3b → #10b981)
   - Negro Elegante (#18181b → #3f3f46)
   - Rojo Energy (#7f1d1d → #dc2626)
   - Gris Minimalista (#374151 → #6b7280)
   - Personalizado (admin elige 2 colores hex)

Schema: nuevos campos config_web/sitio.hero.gradientPreset,
gradientCustomFrom, gradientCustomTo. parseConfigHero rehidrata
defensivamente con fallback a 'navy' si valores inválidos.

Componente HeroConGradient nuevo, separado del HeroConImagen, con
mapping interno preset → colores. Usa style={{ backgroundImage:
linear-gradient(...) }} en vez de clases Tailwind dinámicas
(Tailwind no puede generar clases en runtime).

Editor admin: subsección visible siempre con radio buttons + previews
visuales de cada preset + color pickers nativos para personalizado.
Permiso: solo administrador edita.

Sin cambios al texto/contenido del hero (título, subtítulo, stats
card siguen igual).

Resuelve UX: admin puede experimentar con paletas sin tener que
diseñar imágenes en Canva. Cuando vuelve a 'navy', el banner es
exactamente como el original — útil para temporadas (ej: rojo en
Black Friday, verde en Navidad).
```

## Ante cualquier ambigüedad

- Si el componente HeroCarrusel ya existe (sprint hero-carrusel), reusar la lógica de "tiene imagen" para no duplicar.
- Si el fix del parser legacy ya está pusheado, NO repetir el cambio (verificar y skipear esa parte del sprint).
- Si Tailwind safelist es necesario para clases dinámicas (no debería ser, usamos style inline), agregarlo.
- Si hay otro lugar del sitio que use el mismo gradient (ej: footer, /servicios), considerar si también debe leerse del config — sino, dejarlo hardcoded por ahora.
