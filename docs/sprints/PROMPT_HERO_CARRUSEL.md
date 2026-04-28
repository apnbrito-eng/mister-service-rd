# Sprint: Carrusel configurable en hero del sitio público + fix imagen no se refleja

Usa el subagente coordinator.

## Síntomas reportados

1. **Bug**: cargué imagen en `/admin/web → Imagen del Hero`, guardé, pero no se refleja en el sitio público (ni en producción ni en incógnito). Sigue apareciendo la imagen anterior o el default.

2. **Nueva feature**: en lugar de una sola imagen estática, agregar opción de **carrusel** que rote varias imágenes cada X segundos, con admin pudiendo:
   - Toggle entre modo "fija" (1 imagen) o "carrusel" (varias rotando).
   - Subir N imágenes al carrusel.
   - Reordenar y eliminar imágenes.
   - Configurar intervalo (default 3 segundos).

## Pre-investigación

1. **Componente actual del Hero**:
   - Buscar `src/components/public/Hero.tsx` (o donde esté).
   - Verificar de dónde lee la imagen actualmente (`config_web/sitio.hero.imagen`? Otro path?).
   - **Identificar el bug**: ¿la imagen se guarda en un path distinto al que el componente lee? ¿Hay caché de Firestore? ¿El componente está hardcoded?

2. **Editor admin actual**:
   - `ConfiguracionWeb.tsx` o similar — sección "Imagen del Hero".
   - Verificar exactamente qué campo guarda el upload y dónde.
   - Confirmar si el guardado va a `config_web/sitio.hero.imagen` o a otro path.

3. **Storage de imágenes**:
   - Verificar dónde se suben las imágenes del hero (probablemente Firebase Storage en `hero-images/` o similar).
   - Confirmar reglas de Storage permitan lectura pública.

## Cambios

### 1. Fix del bug "imagen no se refleja"

Según el diagnóstico, una de estas tres causas:

**A) Path mismatch**: el editor guarda en `path A` pero el componente lee de `path B`. Fix: alinear ambos al mismo path.

**B) Componente Hero ignora la config**: tiene la imagen hardcoded en JSX en lugar de leer de Firestore. Fix: refactorizar para leer de `config_web/sitio.hero.imagen` (o el path que se decida).

**C) Caché del frontend**: el listener de `config_web` no se está resuscribiendo o el componente no re-renderiza. Fix: verificar que `useConfigWeb()` (o el hook similar) actualiza el estado al cambiar Firestore.

**El builder debe diagnosticar cuál es y corregir.** Después del fix, subir una imagen desde admin debe reflejarse en producción dentro de 5-10 segundos (próximo onSnapshot trigger).

### 2. Schema extendido

`ConfigWeb.hero` queda así:

```typescript
hero?: {
  modo: 'fija' | 'carrusel';        // default 'fija' (compat)
  imagenFija?: string;                // URL — usado cuando modo='fija'
  imagenesCarrusel?: string[];        // array de URLs — usado cuando modo='carrusel'
  intervaloCarrusel?: number;         // segundos, default 3, rango 2-10
  transicion?: 'fade' | 'slide';      // default 'fade'
  pausarEnHover?: boolean;            // default true
};
```

Migración de schema actual:
- Si existe `hero.imagen` (campo viejo), preservar como `imagenFija`.
- `parseConfigWeb` (si existe) rehidrata defensivamente.

### 3. Editor admin `/admin/web → Sección Hero`

Reemplazar la subsección actual por:

```
🎨 Hero del sitio público

Modo de visualización:
[ ⦿ Imagen fija ]  [ ◯ Carrusel rotativo ]

──────────────────────────────────────

[Si modo = Fija:]

  Imagen del hero
  [Seleccionar imagen]
  [Preview de la imagen actual]
  [Quitar imagen]

[Si modo = Carrusel:]

  Imágenes del carrusel (mín 2, máx 6)
  ┌────────────────────────────────┐
  │ [thumbnail 1]   ↑ ↓     ❌    │
  │ [thumbnail 2]   ↑ ↓     ❌    │
  │ [thumbnail 3]   ↑ ↓     ❌    │
  └────────────────────────────────┘
  [+ Agregar imagen]

  Intervalo entre imágenes:
  [Slider 2s — 10s]   3 segundos

  Transición:
  [ ⦿ Fundido suave ]  [ ◯ Deslizamiento ]

  ☑ Pausar cuando el cursor está encima

[💾 Guardar Hero]
```

**Validaciones:**

- Modo carrusel requiere mínimo 2 imágenes.
- Cada imagen máximo 1MB tras compresión client-side.
- Recomendación visual: "Mejor calidad: imágenes 1920×1080 px, formato JPG."

### 4. Componente Hero refactorizado

```tsx
function Hero({ config }: { config: ConfigWeb }) {
  const heroConfig = config.hero;
  const modo = heroConfig?.modo || 'fija';
  
  if (modo === 'carrusel' && heroConfig?.imagenesCarrusel?.length >= 2) {
    return <HeroCarrusel
      imagenes={heroConfig.imagenesCarrusel}
      intervalo={heroConfig.intervaloCarrusel || 3}
      transicion={heroConfig.transicion || 'fade'}
      pausarEnHover={heroConfig.pausarEnHover ?? true}
    />;
  }
  
  return <HeroFijo imagen={heroConfig?.imagenFija} />;
}
```

### 5. Componente `HeroCarrusel`

Nuevo: `src/components/public/HeroCarrusel.tsx`.

Features:
- `useState` para imagen actual (índice).
- `useEffect` con `setInterval` para rotar cada `intervalo * 1000ms`.
- Cleanup del intervalo al desmontar.
- Preload de imágenes con `<link rel="preload">` para evitar flash al cambiar.
- Transición CSS:
  - **Fade**: ambas imágenes superpuestas con `opacity` que cambia (transition: opacity 0.5s).
  - **Slide**: contenedor flex que se desplaza con transform translate.
- Pausa en hover si `pausarEnHover === true` — escucha `onMouseEnter`/`onMouseLeave`.
- Indicadores visuales abajo (puntos pequeños): círculos que muestran qué imagen está activa, clickeables para saltar a una específica.
- Accesibilidad: `aria-label="Imagen X de Y"`, navegación por teclado opcional.

### 6. Mobile

El carrusel funciona igual en mobile. Sin diferencias. Solo asegurar:
- Las imágenes están optimizadas (cargadas perezosamente si están fuera de viewport).
- Pausa en hover NO aplica en mobile (no hay hover táctil), pero se reemplaza por: pausa cuando el usuario hace scroll.

### 7. Sin cambios en el resto del hero

El texto del hero (título, subtítulo, stats, CTA) se sigue renderizando ENCIMA del carrusel/imagen, igual que ahora. El overlay oscuro semi-transparente sigue cubriendo la imagen para contraste. NO se duplica texto.

## Verificación

- Typecheck + lint sin warnings.
- Tester:
  - **Fix del bug**: subir imagen al hero modo fija → guardar → refrescar producción → la nueva imagen aparece en 10 segundos.
  - **Modo carrusel**: cambiar a modo carrusel, subir 3 imágenes, intervalo 3s, transición fade → ir al sitio → ver las 3 imágenes rotando suavemente cada 3s.
  - Cambiar a transición slide → ver desplazamiento horizontal en lugar de fade.
  - Hover encima del hero → carrusel pausa.
  - Click en indicador (puntito abajo) → salta a esa imagen específica.
  - Mobile: rotación funciona, scroll pausa el carrusel.
  - Cambiar de modo carrusel a fija → muestra solo la imagenFija.
  - Subir solo 1 imagen al carrusel → toast "Modo carrusel necesita mínimo 2 imágenes".
- Reviewer:
  - parseConfigWeb rehidrata defensivamente.
  - Strip undefined antes de Firestore writes.
  - Cleanup del setInterval al desmontar el componente (no memory leak).
  - Compresión de imágenes funciona (max 1MB).
  - El modo `fija` se comporta igual que antes (no regresión).
  - El campo viejo `hero.imagen` se migra a `hero.imagenFija` automáticamente.

## Commit

```
feat(web): carrusel configurable en hero + fix imagen no se reflejaba

Bug: las imágenes subidas a /admin/web → Imagen del Hero no se
reflejaban en producción. [Causa identificada: <path mismatch /
componente hardcoded / cache del listener>]. Fix: el componente Hero
ahora lee correctamente de config_web/sitio.hero, con onSnapshot
suscrito al doc para actualización en tiempo real.

Feature nueva: modo carrusel configurable desde admin. Toggle entre
'imagen fija' (1 imagen) o 'carrusel rotativo' (2-6 imágenes que
rotan cada N segundos).

Configuración admin /admin/web → Hero:
- Modo: fija | carrusel
- Si fija: 1 imagen (compat con comportamiento previo)
- Si carrusel: lista de imágenes (add/remove/reorder), intervalo
  2-10s (default 3s), transición fade|slide (default fade), pausar
  en hover (default true)

Componente HeroCarrusel:
- setInterval con cleanup para rotación
- Preload de imágenes para evitar flash al cambiar
- Transición CSS suave (opacity para fade, transform para slide)
- Indicadores clickeables abajo para saltar a una imagen específica
- Pausa al hover en desktop, pausa al scroll en mobile
- Aria labels para accesibilidad

Schema migrado: hero.imagen viejo → hero.imagenFija (compat).

Resuelve workflow: el cliente potencial ve más variedad visual del
servicio (showroom, técnicos trabajando, equipos reparados) en lugar
de una sola foto estática.
```

## Ante cualquier ambigüedad

- Si el bug del hero actual no se debe a path mismatch sino a algo más complejo (ej: el componente vive en otro lugar inesperado), reportar y proponer alternativa.
- Si la implementación de transición slide se vuelve compleja, dejar solo fade en este sprint y diferir slide a sprint futuro.
- Si las reglas de Firebase Storage para `hero-images/` requieren ajustes manuales, reportar el snippet a pegar.
