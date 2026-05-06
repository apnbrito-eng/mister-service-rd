# Sprint: Páginas dedicadas por servicio (`/servicios/:slug`)

Usa el subagente coordinator.

## Objetivo

Convertir las 6 cards de "Nuestros Servicios" en la home (hoy decorativas, no clickeables) en **páginas dedicadas** por tipo de equipo:

- `/servicios/lavadoras` — Reparación de Lavadoras
- `/servicios/neveras` — Reparación de Neveras y Refrigeradores
- `/servicios/aires-acondicionados`
- `/servicios/estufas-y-hornos`
- `/servicios/secadoras`
- `/servicios/otros-equipos`
- (Y cualquier nuevo tipo agregado al catálogo automáticamente)

Cada página tiene contenido editable desde admin (problemas comunes, marcas, FAQs, imágenes, descripción) y CTA grande para agendar.

## Pre-investigación

1. **Sección actual "Nuestros Servicios"** en home:
   - Buscar componente (probablemente `src/components/public/SeccionServicios.tsx` o similar).
   - Identificar dónde están definidos los 6 servicios actuales (probablemente hardcoded en JSX).

2. **Catálogo de tipos de equipo**:
   - Confirmar shape de `config_web/sitio.tiposEquipoPublicos` (string[]).
   - Verificar que existe sincronización con catálogo de modelos (`modelosPorTipoEquipo`).

3. **Routing actual**:
   - Verificar `App.tsx` para entender estructura de rutas públicas.
   - Confirmar que `react-router-dom` está configurado para rutas dinámicas.

4. **Editor admin existente**:
   - `ConfiguracionWeb.tsx` — verificar cómo están organizadas las secciones para agregar la nueva.

## Schema

Extender `ConfigWeb`:

```typescript
servicios?: {
  [slug: string]: ServicioDetalle;
};

interface ServicioDetalle {
  slug: string;                       // ej: 'lavadoras', 'neveras'
  tipoEquipo: string;                  // matchea con tiposEquipoPublicos
  titulo: string;                      // ej: "Reparación de Lavadoras a Domicilio"
  descripcionCorta: string;            // para card en home (max 100 chars)
  descripcionLarga?: string;           // para página dedicada (markdown opcional)
  imagenCard?: string;                 // URL — foto recortada del equipo (cards home)
  imagenHero?: string;                 // URL — foto wide para hero de la página
  problemasComunes: string[];          // ej: ["No centrifuga", "Hace ruido"]
  marcasReparadas: string[];           // ej: ["LG", "Samsung", "Whirlpool"]
  faqs: Array<{ pregunta: string; respuesta: string }>;
  tiempoEstimadoReparacion?: string;   // ej: "1-3 horas"
  habilitado: boolean;                 // toggle visible en home
  orden: number;                        // orden en la grilla
}
```

Defaults pre-poblados (lazy init) con los 6 servicios actuales:

```typescript
{
  'lavadoras': {
    slug: 'lavadoras',
    tipoEquipo: 'Lavadora',
    titulo: 'Reparación de Lavadoras a Domicilio',
    descripcionCorta: 'Reparación de todo tipo de lavadoras: no centrifuga, no drena, hace ruido, no enciende.',
    problemasComunes: [
      'No centrifuga / no escurre',
      'Hace ruido fuerte al lavar',
      'No drena el agua',
      'Pierde agua / gotea',
      'No enciende / no responde',
      'Marca código de error',
    ],
    marcasReparadas: ['LG', 'Samsung', 'Whirlpool', 'Mabe', 'GE', 'Frigidaire'],
    faqs: [
      { pregunta: '¿Cuánto cuesta una reparación de lavadora?', respuesta: 'El chequeo a domicilio es RD$2,000. Si decides reparar, se descuenta del costo total. La reparación varía según la falla.' },
      { pregunta: '¿Cuánto tarda?', respuesta: 'La mayoría de reparaciones se hacen el mismo día en 1-3 horas.' },
      { pregunta: '¿Qué garantía dan?', respuesta: 'Todas las reparaciones tienen Conduce de Garantía por escrito. Cubre repuestos y mano de obra.' },
    ],
    tiempoEstimadoReparacion: '1-3 horas',
    habilitado: true,
    orden: 1,
  },
  'neveras': { /* similar */ },
  'aires-acondicionados': { /* similar */ },
  'estufas-y-hornos': { /* similar */ },
  'secadoras': { /* similar */ },
  'otros-equipos': { /* similar */ },
}
```

## Cambios

### 1. Routing

En `App.tsx`, agregar:

```tsx
<Route path="/servicios" element={<PublicLayout><ServiciosIndex /></PublicLayout>} />
<Route path="/servicios/:slug" element={<PublicLayout><ServicioDetalle /></PublicLayout>} />
```

`ServiciosIndex` puede ser un grid completo de servicios (versión expandida de la sección de la home).

`ServicioDetalle` lee `useParams<{ slug: string }>()` y muestra la página detallada.

### 2. Componente `ServicioDetalle.tsx`

Ubicación: `src/pages/public/ServicioDetalle.tsx`

Estructura visual:

```
┌────────────────────────────────────────────────┐
│ HERO con imagen del equipo (full width)         │
│ Título grande + subtítulo + CTA "Agendar"       │
└────────────────────────────────────────────────┘

┌─ Problemas Comunes ────────────────────────────┐
│ ✅ No centrifuga                                │
│ ✅ Hace ruido fuerte                            │
│ ✅ No drena el agua                             │
│ ...                                             │
└────────────────────────────────────────────────┘

┌─ Marcas que Reparamos ─────────────────────────┐
│ [LG] [Samsung] [Whirlpool] [Mabe] [GE] ...      │
└────────────────────────────────────────────────┘

┌─ Cómo Trabajamos ──────────────────────────────┐
│ 1. Agendas online o por WhatsApp                │
│ 2. Técnico va a tu casa                         │
│ 3. Diagnóstico honesto: RD$2,000                │
│ 4. Reparación + Garantía por escrito            │
└────────────────────────────────────────────────┘

┌─ Garantía Visible ─────────────────────────────┐
│ Conduce de Garantía CG-#### con cada servicio   │
│ Cubre piezas y mano de obra                     │
└────────────────────────────────────────────────┘

┌─ CTA grande ────────────────────────────────────┐
│   [📅 Agendar reparación de [equipo]]           │
│   o [📱 Hablar por WhatsApp]                    │
└────────────────────────────────────────────────┘

┌─ FAQs ─────────────────────────────────────────┐
│ ▼ ¿Cuánto cuesta una reparación?                │
│ ▼ ¿Cuánto tarda?                                │
│ ▼ ¿Qué garantía dan?                            │
└────────────────────────────────────────────────┘
```

**Estado:**
- Si `slug` no matchea ningún servicio configurado → mostrar 404 con CTA volver a home.
- Si servicio existe pero `habilitado === false` → 404.

**Mobile responsive**: hero más compacto, secciones apiladas verticalmente.

**SEO básico:**
- `<title>{titulo} | Mister Service RD</title>`
- `<meta name="description" content={descripcionCorta}>`
- Schema.org JSON-LD para `Service` + `LocalBusiness`.

### 3. Componente `SeccionServicios.tsx` actualizado

Reemplazar las 6 cards hardcoded por iteración sobre `config.servicios`:

```tsx
{Object.values(config.servicios || {})
  .filter(s => s.habilitado)
  .sort((a, b) => a.orden - b.orden)
  .map((servicio) => (
    <Link
      key={servicio.slug}
      to={`/servicios/${servicio.slug}`}
      className="card-servicio hover:shadow-lg transition cursor-pointer"
    >
      {servicio.imagenCard ? (
        <img src={servicio.imagenCard} alt={servicio.titulo} className="w-full h-40 object-cover" />
      ) : (
        <IconoFallback tipo={servicio.tipoEquipo} />
      )}
      <h3>{servicio.tipoEquipo}</h3>
      <p>{servicio.descripcionCorta}</p>
    </Link>
  ))
}
```

Si `imagenCard` no está configurada → fallback al icono Lucide actual (lo que ya hay).

### 4. Editor admin `/admin/web → sección Servicios`

Nueva sección con CRUD de servicios:

```
🔧 Servicios

[Lista de servicios actuales:]

┌────────────────────────────────────────────────┐
│ Lavadoras  [✓ habilitado]  ↑↓  [✏️ Editar]  ❌  │
│ Reparación de Lavadoras a Domicilio              │
│ "Reparación de todo tipo de lavadoras..."        │
│ [Imagen de card] [Imagen de hero]                │
└────────────────────────────────────────────────┘

[+ Agregar servicio]    (auto-pobla desde tiposEquipoPublicos
                         que aún no tengan página)
```

**Modal de edición de servicio:**

```
[Imagen Card]  [Subir imagen]
[Imagen Hero]  [Subir imagen]

Título *
[Reparación de Lavadoras a Domicilio]

Descripción corta * (max 100 chars, para card en home)
[Reparación de todo tipo de lavadoras: no centrifuga...]

Descripción larga (para página)
[Textarea grande con soporte markdown]

Tiempo estimado de reparación
[1-3 horas]

────────────────────────────────────────
Problemas Comunes
[+ Agregar problema]
- No centrifuga / no escurre  ↑↓ ❌
- Hace ruido fuerte           ↑↓ ❌
...

────────────────────────────────────────
Marcas que Reparamos
[+ Agregar marca]
- LG  ↑↓ ❌
- Samsung  ↑↓ ❌
...

────────────────────────────────────────
FAQs
[+ Agregar FAQ]
┌─ ¿Cuánto cuesta...? ─────────────┐
│ Pregunta: [...]                  │
│ Respuesta: [...]                 │
│            ↑↓ ❌                  │
└──────────────────────────────────┘

────────────────────────────────────────
[✓ Habilitado]  Orden: [1]

[💾 Guardar Servicio]  [Cancelar]
```

### 5. Sincronización con catálogo de tipos de equipo

Cuando admin agrega un nuevo tipo de equipo (ej: "Calefón") en `/admin/configuracion → Catálogo`:

- Sistema **NO** crea servicio automático (porque el contenido viene vacío y no aporta).
- En `/admin/web → Servicios` aparece un botón **"+ Agregar servicio para tipos sin página"** que muestra los tipos del catálogo que aún no tienen servicio configurado.
- Admin click ahí → crea servicio nuevo con título y slug pre-llenados, deja el resto vacío para que admin lo llene.

### 6. Sitemap dinámico (SEO)

Generar `public/sitemap.xml` o ruta `/sitemap.xml` que lista todas las páginas públicas, incluyendo cada servicio habilitado.

Si el sitemap actual no existe, agregarlo con:
- `/`
- `/servicios`
- `/servicios/:slug` (uno por servicio habilitado)
- `/agendar`

### 7. Schema.org structured data

En `ServicioDetalle.tsx`:

```tsx
<script type="application/ld+json">
  {JSON.stringify({
    "@context": "https://schema.org",
    "@type": "Service",
    "serviceType": servicio.titulo,
    "provider": {
      "@type": "LocalBusiness",
      "name": "Mister Service RD",
      "telephone": config.contacto?.whatsapps?.[0]?.numero,
      "address": config.contacto?.direccion,
    },
    "areaServed": "Santo Domingo, República Dominicana",
    "description": servicio.descripcionLarga || servicio.descripcionCorta,
  })}
</script>
```

## Verificación

- Typecheck + lint sin warnings.
- Tester:
  - Click en card "Lavadoras" en home → navega a `/servicios/lavadoras` con todo el contenido visible.
  - URL inválida `/servicios/calefon-inexistente` → 404 amigable con botón "Volver al inicio".
  - Editor admin: cambiar el título de "Lavadoras" → guardar → refrescar `/servicios/lavadoras` → título nuevo se refleja.
  - Agregar nuevo servicio para tipo recién creado en catálogo → llenar contenido mínimo → habilitar → aparece en home.
  - Mobile responsive: 4 viewports (iPhone SE, iPhone 14, iPad, desktop).
  - Meta tags: ver "View source" en navegador → `<title>` y `<meta description>` correctos.
  - Schema.org: pegar URL en https://search.google.com/test/rich-results → debe validar como `Service`.
- Reviewer:
  - parseConfigWeb rehidrata `servicios` defensivamente.
  - Strip undefined antes de Firestore writes.
  - Slugs sanitizados (lowercase, sin tildes, guiones en lugar de espacios).
  - Editor admin no rompe el flujo cuando un servicio tiene contenido vacío parcial (algunas FAQs sin respuesta, etc.).
  - Card de fallback (sin imagen) no rompe layout.

## Commit

```
feat(web): páginas dedicadas por servicio + cards clickeables en home

Las 6 cards de 'Nuestros Servicios' en la home eran decorativas
(no hacían nada al click). Ahora cada card lleva a una página
detallada del servicio.

Nuevas páginas /servicios/:slug con:
- Hero con imagen del equipo + título + CTA grande
- Lista de problemas comunes que reparamos
- Marcas que reparamos
- Cómo trabajamos (4 pasos)
- Información de garantía (Conduce CG)
- FAQs específicas del equipo
- CTA para agendar o WhatsApp

Schema: nuevo campo ConfigWeb.servicios con CRUD completo desde
/admin/web → sección Servicios. Cada servicio editable: título,
descripciones, imágenes (card + hero), problemas comunes, marcas,
FAQs, tiempo estimado, habilitado, orden.

Migración: lazy init pre-pobla 6 servicios actuales (Lavadoras,
Neveras, A/C, Estufas, Secadoras, Otros) con contenido base.

Cards de home ahora:
- Iteran sobre config.servicios habilitados
- Muestran imagen de card si está configurada (fallback a icono Lucide)
- Cada card es <Link> a /servicios/:slug

SEO básico:
- title y meta description únicos por página
- Schema.org Service + LocalBusiness JSON-LD
- Sitemap.xml dinámico que lista todos los servicios habilitados

Sincronización con catálogo: cuando se agrega un tipo de equipo
nuevo, el editor admin sugiere crear página de servicio para ese
tipo (no se auto-crea con contenido vacío para no contaminar).

Resuelve: cards decorativas no aportaban; ahora son páginas que
rankean en Google + dan info detallada al cliente + reducen
preguntas repetitivas por WhatsApp.
```

## Ante cualquier ambigüedad

- Si el componente actual de "Nuestros Servicios" tiene structure muy distinta a la asumida, adaptar sin re-escribir todo.
- Si `react-router-dom` actual no soporta rutas dinámicas con el wrapping de PublicLayout, ajustar el routing setup.
- Si el sitemap.xml requiere generación en build time (no runtime), agregar script de prebuild que genera el archivo desde la config (puede requerir Firebase Admin SDK en build).
- Si las imágenes de card requieren tamaños específicos (ej: 400×300 cuadradas), validar dimensiones al subir en el editor admin.
