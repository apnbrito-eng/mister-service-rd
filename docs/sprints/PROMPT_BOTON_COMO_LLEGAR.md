# Sprint: separar dirección escrita + coordenadas + botón "Cómo llegar"

Usa el subagente coordinator.

## Objetivo

Hoy en el sistema cada cliente tiene dos campos relacionados pero distintos:

- **`cliente.direccion`** (string libre): dirección textual escrita por humano. Ej: "Calle Helios No. 95, Edificio Claudine, Bella Vista, Apto 4A".
- **`cliente.ubicacion`** (lat/lng): coordenadas GPS exactas para mapa. Ej: `{ lat: 18.4506, lng: -69.9342 }`.

Ambos son útiles para distintas cosas:

- Texto: para guías humanas, descripción del lugar, edificio, apartamento.
- Coordenadas: para mapas, navegación GPS, cálculo de ruta.

**Problema:** la UI actual mezcla las dos cosas o muestra solo una. El técnico necesita las dos por separado: ver la descripción textual + tener un botón rápido que le abra Google Maps con direcciones de cómo llegar al punto exacto.

## Decisiones del usuario

- Mostrar **dirección escrita** y **coordenadas** como dos campos visibles distintos en la ficha del cliente.
- Agregar **botón "Cómo llegar"** que abra Google Maps con direcciones desde la ubicación actual del usuario hacia las coordenadas del cliente.
- Aplicar a **todas las vistas** donde aparece el cliente: lista clientes, detalle cliente, modal de orden, vista técnico mobile, mapa de rutas, agenda del día.
- Si el cliente NO tiene coordenadas (~34% de los importados), el botón debe estar disabled con tooltip "Sin coordenadas — agregar dirección con GPS".

## Pre-investigación

1. **`src/utils/whatsapp.ts`** — el patrón del botón WhatsApp del sprint anterior. Reusar la misma estructura para crear `utils/maps.ts`.
2. **`src/types/index.ts`** — verificar que `Cliente.ubicacion` es `{ lat: number; lng: number }` opcional.
3. **`src/pages/Clientes.tsx`** — ya tiene botón WhatsApp post-sprint anterior. Agregar al lado un botón "Cómo llegar" verde/azul.
4. **`src/components/ordenes/OrdenDetailModal.tsx`** + **`src/pages/OrdenDetalle.tsx`** — mostrar dirección + coords del cliente vinculado.
5. **`src/pages/TecnicoVista.tsx`** — vista mobile del técnico. Botón "Cómo llegar" GRANDE y destacado en cada cita del día.
6. **`src/pages/MapaRutas.tsx`** — al hacer click en un pin, mostrar dirección textual + botón "Cómo llegar".
7. **`src/pages/AgendaDia.tsx`** — agregar botón inline en cada card de orden.

## Schema (sin cambios)

No requiere cambios de schema. Usa los campos existentes:

```typescript
interface Cliente {
  // ...
  direccion?: string;                          // Texto libre
  ubicacion?: { lat: number; lng: number };    // Coordenadas GPS
}

interface OrdenServicio {
  // ...
  // El cliente vinculado tiene direccion + ubicacion arriba.
  // Si la orden tiene su propia dirección de servicio (distinta del cliente),
  // ya existe el campo direccionServicio + coordsServicio o similar.
}
```

## Cambios

### 1. Helper nuevo `src/utils/maps.ts`

```typescript
/**
 * Construye URL de Google Maps con direcciones desde la ubicación actual
 * del usuario hacia las coordenadas destino.
 *
 * En desktop abre Google Maps web. En iOS/Android intercepta el sistema
 * y abre la app nativa de Maps si está instalada.
 *
 * @example
 *   googleMapsDirectionsUrl({ lat: 18.45, lng: -69.93 })
 *   // → "https://www.google.com/maps/dir/?api=1&destination=18.45,-69.93"
 */
export function googleMapsDirectionsUrl(
  coords: { lat: number; lng: number } | null | undefined,
): string | null {
  if (!coords || typeof coords.lat !== 'number' || typeof coords.lng !== 'number') {
    return null;
  }
  return `https://www.google.com/maps/dir/?api=1&destination=${coords.lat},${coords.lng}`;
}

/**
 * URL para "Ver en mapa" (sin direcciones, solo el pin).
 * Útil cuando solo querés que el usuario vea el lugar sin navegación activa.
 */
export function googleMapsViewUrl(
  coords: { lat: number; lng: number } | null | undefined,
): string | null {
  if (!coords) return null;
  return `https://maps.google.com/?q=${coords.lat},${coords.lng}`;
}
```

### 2. Componente reusable `src/components/shared/BotonComoLlegar.tsx`

```tsx
import { Navigation } from 'lucide-react';
import { googleMapsDirectionsUrl } from '../../utils/maps';

interface Props {
  ubicacion?: { lat: number; lng: number } | null;
  size?: 'sm' | 'md' | 'lg';
  variant?: 'inline' | 'block';
  className?: string;
}

export default function BotonComoLlegar({ 
  ubicacion, 
  size = 'md', 
  variant = 'inline',
  className = '',
}: Props) {
  const url = googleMapsDirectionsUrl(ubicacion);
  const disabled = !url;

  const sizeClasses = {
    sm: 'px-2 py-1 text-xs gap-1',
    md: 'px-3 py-1.5 text-sm gap-1.5',
    lg: 'px-4 py-2 text-base gap-2',
  };

  const iconSize = { sm: 12, md: 14, lg: 18 }[size];

  if (disabled) {
    return (
      <button
        type="button"
        disabled
        className={`inline-flex items-center ${sizeClasses[size]} bg-gray-100 text-gray-400 font-medium rounded-lg cursor-not-allowed ${variant === 'block' ? 'w-full justify-center' : ''} ${className}`}
        title="Sin coordenadas GPS — agregar dirección con ubicación"
      >
        <Navigation size={iconSize} />
        Cómo llegar
      </button>
    );
  }

  return (
    <a
      href={url!}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      className={`inline-flex items-center ${sizeClasses[size]} bg-blue-500 hover:bg-blue-600 text-white font-medium rounded-lg transition-colors ${variant === 'block' ? 'w-full justify-center' : ''} ${className}`}
      title="Abrir Google Maps con direcciones"
      aria-label="Cómo llegar a la ubicación del cliente con Google Maps"
    >
      <Navigation size={iconSize} />
      Cómo llegar
    </a>
  );
}
```

### 3. Lista de clientes `src/pages/Clientes.tsx`

En la fila de cada cliente, junto al botón WhatsApp ya existente:

```tsx
<BotonComoLlegar ubicacion={cliente.ubicacion} size="sm" />
```

Si los botones quedan apretados en mobile, agruparlos en un dropdown "Acciones" o stack vertical.

### 4. Modal/vista detalle de cliente

En la sección "Información de contacto" del cliente:

```tsx
<div className="space-y-3">
  {/* Dirección textual */}
  {cliente.direccion && (
    <div>
      <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Dirección escrita</p>
      <p className="text-sm text-gray-900">{cliente.direccion}</p>
    </div>
  )}

  {/* Coordenadas + botón */}
  <div>
    <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Ubicación GPS</p>
    {cliente.ubicacion ? (
      <div className="flex items-center gap-2 flex-wrap">
        <span className="font-mono text-xs text-gray-600 bg-gray-100 px-2 py-1 rounded">
          {cliente.ubicacion.lat.toFixed(6)}, {cliente.ubicacion.lng.toFixed(6)}
        </span>
        <BotonComoLlegar ubicacion={cliente.ubicacion} size="sm" />
        <a
          href={googleMapsViewUrl(cliente.ubicacion)!}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 px-2 py-1 text-xs text-blue-600 hover:underline"
        >
          Ver en mapa
        </a>
      </div>
    ) : (
      <p className="text-sm text-gray-400 italic">Sin coordenadas GPS</p>
    )}
  </div>
</div>
```

### 5. Modal de orden (`OrdenDetailModal.tsx` + `OrdenDetalle.tsx`)

En el bloque del cliente vinculado, mostrar:

- Nombre + teléfono (con WhatsApp)
- Dirección escrita
- Coords + botón "Cómo llegar" + "Ver en mapa"

Si la orden tiene una dirección de servicio distinta del cliente (caso técnico debe ir a otra dirección que no es la del cliente), mostrar AMBAS:

```tsx
<div>
  <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Dirección de servicio</p>
  <p className="text-sm">{orden.direccionServicio}</p>
  <BotonComoLlegar ubicacion={orden.coordsServicio ?? cliente.ubicacion} size="sm" />
</div>
```

### 6. Vista técnico mobile `TecnicoVista.tsx`

En cada card de orden del día, botón **GRANDE Y DESTACADO** "Cómo llegar":

```tsx
<BotonComoLlegar ubicacion={ordenes.cliente.ubicacion} size="lg" variant="block" />
```

Es la acción más usada por el técnico — debe ser fácil de tappear con dedo.

### 7. Mapa de rutas `MapaRutas.tsx`

Al hacer click en un pin del mapa, el popup muestra:
- Cliente
- Dirección escrita
- Botón "Cómo llegar"

### 8. Agenda del día `AgendaDia.tsx`

En cada card de orden, agregar botón "Cómo llegar" al lado del WhatsApp.

## Verificación

**Tester:**

1. Cliente con `ubicacion` definida → botón "Cómo llegar" azul activo, abre Google Maps en nueva pestaña con `?api=1&destination=lat,lng`.
2. Cliente sin `ubicacion` → botón disabled gris con tooltip "Sin coordenadas GPS".
3. Cliente con dirección textual + coords → ambos visibles en detalle, lat/lng formateados a 6 decimales.
4. Vista técnico mobile → botón "Cómo llegar" GRANDE, full-width, fácil de tappear.
5. Click en botón con `e.stopPropagation()` correcto: no triggerea click del row de la lista.
6. Mobile (iPhone) → click abre app nativa Google Maps si está instalada, sino fallback a Safari.
7. Mapa de rutas → popup de pin tiene botón "Cómo llegar".
8. Si la orden tiene `direccionServicio` distinta de `cliente.direccion`, el botón usa `orden.coordsServicio` no `cliente.ubicacion`.

**Reviewer:**

- `googleMapsDirectionsUrl` valida que coords es válido (no NaN, no null).
- El componente `BotonComoLlegar` no asume que coords está presente — fallback a disabled.
- Mobile responsive: botones no se cortan en iPhone SE 320px.
- A11y: `aria-label` en el link, contraste de color suficiente.
- No hay regresión en lista de clientes: si tenía 9k clientes cargados, sigue cargando OK.
- Strip undefined no afecta este sprint (es UI puro, no toca writes).

## Commit message sugerido

```
feat(clientes): separar direccion escrita y coords + boton "Como llegar"

Cada cliente ahora muestra:
- Direccion escrita (texto libre): para guias humanas y referencias.
- Ubicacion GPS (lat,lng): formateada a 6 decimales en chip mono.
- Boton "Como llegar": abre Google Maps con direcciones desde
  ubicacion actual del usuario hasta las coordenadas del cliente.
- Boton "Ver en mapa": abre Google Maps solo con el pin (sin
  navegacion activa).

Helpers nuevos en utils/maps.ts:
- googleMapsDirectionsUrl(coords) -> /maps/dir/?api=1&destination=...
- googleMapsViewUrl(coords) -> /?q=lat,lng

Componente reusable BotonComoLlegar.tsx con 3 tamaños y 2 variantes
(inline/block). Si cliente no tiene coords, boton queda disabled
gris con tooltip explicativo.

Aplicado en:
- /admin/clientes (lista + detalle modal)
- Modal de orden (junto a info del cliente)
- /admin/ordenes (boton inline en cada fila)
- /tecnico (boton GRANDE y destacado en card de orden del dia)
- /admin/mapa-rutas (popup del pin)
- /admin/agenda-dia (boton inline en card)

Si la orden tiene direccionServicio distinta de cliente.direccion,
el boton usa orden.coordsServicio. Sino fallback a cliente.ubicacion.

Sin cambios de schema. Sin tocar rules. UI puro.
```

## Ante cualquier ambigüedad

- Si el componente queda muy similar al de WhatsApp y vale la pena abstraer ambos en un patrón común (ej: `BotonAccionExterna`), hacerlo. Sino dejar separados — son acciones conceptualmente distintas.
- Si en mobile el botón "Cómo llegar" interfiere con el botón WhatsApp, agruparlos verticalmente o usar dropdown de acciones.
- Si el técnico se queja de que "Cómo llegar" abre nueva pestaña y pierde el contexto de la orden, considerar agregar parámetro `&dir_action=navigate` a la URL para que abra directamente en modo navegación. No urgente.
- Si quiere otra variante: botón "Llamar" (`tel:8090000000`) puede agregarse al mismo set en sprint futuro.
