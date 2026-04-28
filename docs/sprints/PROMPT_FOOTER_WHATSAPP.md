# Sprint: Botón WhatsApp grande en el footer de todas las páginas públicas

Usa el subagente coordinator.

## Objetivo

En el footer de TODAS las páginas públicas (landing, `/servicios`, `/agendar`, `/tracking/:token`, `/garantia/:token`, etc.), agregar un botón verde grande de WhatsApp similar al que aparece en la pantalla de éxito post-submit del form `/agendar`. Al tocar abre WhatsApp directo con un mensaje pre-llenado dirigido a uno de los números configurados (round-robin si tiene sentido, o número fijo).

Hoy el footer solo muestra los 3 teléfonos como texto plano — el cliente debe copiar-pegar manualmente.

## Pre-investigación

1. Identificar el componente del footer público (probablemente `src/components/public/Footer.tsx` o dentro de `src/layouts/PublicLayout.tsx`).
2. Verificar dónde están los números de WhatsApp (`config_web/sitio.contacto` o similar).
3. Confirmar si el round-robin existente (`obtenerWhatsAppRoundRobin`) puede reusarse o si conviene número fijo.
4. Verificar si el footer ya tiene un botón de WhatsApp (puede haber uno discreto que solo hay que destacar).

## Decisiones recomendadas (confirmar si difieren)

- **Número asignado al click del footer**: usar el primer número activo configurado (no round-robin). Razón: el round-robin tiene sentido para asignar leads del form, pero un visitante casual de la web debe llegar siempre al mismo agente "principal" para no fragmentar conversaciones de venta.
- **Mensaje prellenado**: corto y genérico. Ejemplo:
  > "Hola, vi su sitio web y necesito información sobre [servicio]. ¿Pueden ayudarme?"
- **Posición**: encima de los 3 teléfonos texto, antes de la sección "Contacto". Los 3 teléfonos texto se quedan (algunos clientes prefieren llamar).

## Cambios

### 1. Botón en el footer

```tsx
<a
  href={whatsappUrl}
  target="_blank"
  rel="noopener noreferrer"
  className="inline-flex items-center justify-center gap-3 bg-green-500 hover:bg-green-600 text-white text-base sm:text-lg font-semibold px-6 py-4 rounded-xl shadow-lg transition w-full sm:w-auto"
  aria-label="Abrir WhatsApp para hablar con Mister Service RD"
>
  <svg className="w-6 h-6" /* ícono whatsapp */ />
  Hablar por WhatsApp
</a>
```

- En mobile: ancho completo (`w-full`), centrado.
- En tablet/desktop: auto-width (`sm:w-auto`).
- Color verde idéntico al de la pantalla de éxito (`bg-green-500`).

### 2. Helper compartido

Si no existe ya, crear `src/utils/whatsappFooter.ts`:

```typescript
export function obtenerUrlWhatsAppFooter(numerosActivos: string[], mensaje?: string): string {
  if (!numerosActivos.length) return '#';
  const primero = numerosActivos[0];
  const numeroNormalizado = '1' + primero.replace(/\D/g, '').slice(-10);
  const mensajePrellenado = mensaje || 'Hola, vi su sitio web y necesito información. ¿Pueden ayudarme?';
  return `https://wa.me/${numeroNormalizado}?text=${encodeURIComponent(mensajePrellenado)}`;
}
```

### 3. Configurabilidad desde admin

En `/admin/web → sección Contacto`, agregar (si no existe):
- Toggle "Mostrar botón de WhatsApp en footer" (default: true).
- Input "Mensaje prellenado del botón footer" (default: el genérico arriba).

Schema:
```typescript
ConfigWeb.contacto.botonWhatsAppFooter?: {
  habilitado: boolean;
  mensajePrellenado?: string;
};
```

### 4. Degradación graceful

Si la config no tiene números activos o el flag está desactivado, **no renderizar el botón** (no romper, simplemente desaparece).

## Verificación

- Typecheck + lint.
- Tester:
  - Abrir landing en mobile + desktop → botón visible en footer.
  - Toque/click → abre WhatsApp con mensaje prellenado y número correcto.
  - Mismo botón visible en `/servicios`, `/agendar`, `/tracking/:token`.
  - Desactivar flag desde admin → botón desaparece sin errores.
  - Si no hay números activos configurados, botón no se renderiza.
- Reviewer:
  - Componente reusable, no duplicado por página.
  - Mensaje prellenado escapa caracteres especiales (`encodeURIComponent`).
  - Sin regresiones en el resto del footer (teléfonos texto siguen visibles).

## Commit

```
feat(web): botón WhatsApp grande en footer de páginas públicas

Hoy el footer solo mostraba los 3 teléfonos como texto. El cliente
tenía que copiar-pegar manualmente para escribir.

Cambio: nuevo botón verde 'Hablar por WhatsApp' en el footer de todas
las páginas públicas (landing, /servicios, /agendar, /tracking,
/garantia). Al tocar abre WhatsApp con mensaje prellenado genérico
dirigido al primer número activo configurado en config_web/sitio.
contacto. Estilo idéntico al de la pantalla de éxito post-submit
para consistencia visual.

Configurable desde /admin/web (toggle habilitado + mensaje editable).
Degrada limpio si no hay números activos. Los 3 teléfonos texto
siguen visibles para clientes que prefieren llamar.

Resuelve fricción real: visitantes casuales del sitio que no quieren
llenar form ahora tienen 1 toque para hablar con la marca.
```

## Ante cualquier ambigüedad

- Si el footer ya tiene algún CTA de WhatsApp pequeño/discreto, destacarlo en lugar de duplicar.
- Si el round-robin se quisiera aplicar también aquí (decisión distinta a la recomendada), el helper acepta un parámetro futuro para alternar.
