# Propuesta visual · Portada Mister Service — 2026-09-30

Vista previa aislada del rediseño de la portada, para revisión conjunta con
Codex y decisión de Jorge antes de cualquier integración. **No toca fuente
de producción, CMS, reglas, deploy ni APIs.** Los CTA están interceptados y
abren un panel de resumen local — no envían ni navegan.

## Cómo verlo

```bash
npx vite --config portada-redesign.vite.config.ts
```

Abrir `http://127.0.0.1:5298/tests/manual/portada-redesign.html`.
Título esperado en la pestaña: `Propuesta visual · Mister Service`.

## Archivos exclusivos de esta propuesta

- `portada-redesign.vite.config.ts` (raíz del repo, minimal react, puerto 5298, host 127.0.0.1)
- `tests/manual/portada-redesign.html`
- `tests/manual/portada-redesign.tsx` (componente + init en el mismo archivo)
- `tests/manual/portada-redesign.css`
- `docs/diseno/2026-09-30-propuesta-portada.md` (este documento)

No se importa nada de `src/`. Assets consumidos: `/public/portada/equipos-servicio.webp`
(escena panorámica) y `/public/portada/equipos-individuales.webp` (sprite 2×2 ya
existente); ninguno se genera nuevo.

## Superficies incluidas

1. Cabecera con wordmark `MisterService` y teléfono/WhatsApp (interceptado).
2. Hero editorial: título corto, subtítulo funcional, selector de servicio,
   selector de equipo y CTAs Agendar / WhatsApp.
3. Escena panorámica como protagonista visual; al elegir un equipo cruza a su
   sprite individual dentro del mismo marco (misma caja, misma posición).
4. Sección breve `Cómo solicitar` — tres pasos sin promesas ni cifras.
5. Pie con teléfono/WhatsApp confirmados.
6. Diálogo de resumen local que resume acción / servicio / equipo / destino /
   mensaje simulado. No envía, no marca, no navega.

## Diferencias visuales — Antes / Después / Por qué

| Antes | Después | Por qué |
| --- | --- | --- |
| Cuatro tarjetas grandes de equipo con imagen + rótulo, ocupando el ancho del panel | Chips inline de una línea + escena panorámica única como protagonista | La escena queda en primer plano; los chips no compiten con la imagen (Apple: jerarquía; Emil: simplicidad ≠ minimalismo) |
| Título largo "Reparación y mantenimiento de electrodomésticos" a `text-4xl md:text-5xl` | Editorial corto "Reparación y mantenimiento, en casa." con `letter-spacing: -0.033em` y `line-height: 1.02` | Tracking negativo y leading tight en display, según *Details of UI Typography* — grande necesita menos espacio entre letras y líneas |
| Segmentado servicio con `bg-primary` genérico blanco/azul saturado | Segmented control frío estilo iOS: superficie gris `#f6f7f8` con thumb blanco elevado por sombra `0 1px 2px rgba(0,0,0,0.06)` | Estado activo se lee por elevación y contraste tipográfico, no por saturación; menos ruido cromático |
| Botones `bg-primary` con radios generosos, `min-h-[48px]`, sin `:active` uniforme | Botones 48px altura, azul acción único `#0f3460` (primary) y ghost derivado del mismo tono, `transform: scale(0.97)` en `:active` | Emil: feedback físico en pulsación; Apple: paleta reducida con un único acento cromático |
| Cross-fade con `motion.div` por celda y `x: 16` de entrada por equipo | `AnimatePresence mode="sync"` entre escena y sprite, spring `stiffness 320 · damping 34 · mass 0.9` (sin bounce) | Un solo objeto anima → se percibe una transformación, no dos objetos superpuestos; damping alto sin bounce para UI general (Apple: damping 1.0 salvo momentum) |
| `transition-all` implícito de Tailwind en botones y hovers | `transition` explícito por propiedad (`background-color`, `color`, `transform`) con `cubic-bezier(0.23, 1, 0.32, 1)` | Emil: nunca `all`; ease-out reforzado da la sensación de respuesta inmediata |
| `whileTap={{ scale: 0.97 }}` con Motion (JS, sujeto a bloqueos de main thread) | `transform: scale(0.97)` en `:active` con CSS transition 120ms | CSS off main-thread → no cae frames si el navegador está ocupado (Emil: CSS beats JS under load) |
| Grid 2×2 de equipos "encendidos" que se apagan cuando hay selección | Escena panorámica siempre presente hasta que el usuario decide | La imagen no cambia sin decisión del usuario; menos parpadeo en el primer viewport |
| Sin resumen; CTA abre WhatsApp / Agenda reales | CTA interceptado abre panel local con acción / servicio / equipo / destino / mensaje | Vista previa segura para revisión antes de integrar (regla explícita de Jorge) |
| Título dependía del CMS; podía incluir subtítulo con promesas | Copy fijado en la propuesta, sin cifras ni testimonios | Se respeta la regla de no inventar contenido comercial |
| Estadísticas ("XX años de experiencia", "XX servicios") | Se retiran de la propuesta | El texto del sprint anterior dejó abiertas cifras a llenar; hoy no hay número confirmado — mejor no rellenar |
| Chips con icono lucide colorido | Chips en texto puro, tono neutro; el equipo se ilustra en la escena | Un único punto donde la imagen "habla"; los chips son control, no ilustración |
| Diálogo con `scale(0)` implícito | Escena y diálogo entran desde `scale(0.98)` + `opacity 0` | Emil: "nada en el mundo real aparece de la nada"; escala mínima 0.95–0.98 |

## Reglas de motion aplicadas

- Sólo `transform` y `opacity` en cualquier transición (compositor-friendly).
- Spring damping alto sin bounce; **sin** rebote decorativo. Bounce reservado
  para gestos con momentum (aquí no hay drag).
- Duraciones: pulsación 120ms · hover 160ms · swap de escena spring ≈240ms
  perceptibles · diálogo spring ≈220ms.
- `AnimatePresence mode="sync"` para el swap escena↔sprite (interruptible en
  su forma natural: el `key` cambia, la salida no bloquea la entrada de
  siguiente selección).
- `prefers-reduced-motion`: todas las transiciones colapsan a 1ms; se anulan
  los `scale(0.97)` de pulsación. Se conservan cambios de color/opacidad para
  no romper comprensión.
- Sin `blur()`, sin gradientes decorativos, sin sombras que roben foco. La
  única sombra es la del thumb activo del segmented control (1px, 6% alpha).

## Reglas de Apple aplicadas

- Feedback inmediato al presionar (CSS `:active` transform).
- Targets ≥ 48px; segmented tab ≥ 48px con área táctil ampliada por padding.
- Simplicidad no-minimalista: cada elemento tiene función, no adorno.
- Familiaridad: segmented control y chips leen igual que iOS.
- Espacialidad: el sprite del equipo aparece dentro del mismo marco donde
  estaba la escena — misma caja, misma posición del centro óptico.
- Jerarquía por peso/tamaño, no por color: acento cromático único.

## Contenido confirmado (no inventado)

- Teléfono/WhatsApp: `+1 (849) 564-6767` (mismo del sitio actual, según
  `tests/manual/portada-stubs.ts`).
- Equipos: Lavadora, Nevera, Aire Acondicionado, Estufa (catálogo público
  actual).
- Tipo de servicio: Reparación / Mantenimiento.
- Mensaje simulado se construye igual que hoy: `Hola, necesito <servicio> de
  <equipo>.`
- **Sin** cifras de años, órdenes atendidas, calificaciones, testimonios,
  logos de clientes, ni "sobre nosotros".

## Fuera de alcance en esta pasada

- Integración a producción, publicación o cambios en CMS.
- Formulario de agendar (aquí sólo mostramos el CTA interceptado).
- Ajuste fino de tipografía en Windows/Android (verificar en hardware real).
- Iconografía SVG propia; el rediseño se sostiene sin íconos decorativos.
- Enlace `tel:` real desde el header (queda interceptado).

## Verificaciones que hice

- Estructura del componente y CSS revisados a 375px (iPhone SE), 390px
  (iPhone 12) y 1440px (desktop) por lectura de reglas responsivas.
- `prefers-reduced-motion` cubierto con override global de duración +
  anulación de `transform` en `:active`.
- Contraste `#0f3460` sobre `#ffffff`: ~9.5:1 (AAA para texto normal y
  grande). Texto blanco sobre `#0f3460` en botón primary: ~9.5:1 inverso.
- No se importa ningún módulo de `src/`. La vista previa no toca Firebase,
  react-router ni tokens de motion internos.
- Se agregó `type="button"` en cada `<button>` para evitar submit accidental.

## Verificaciones que aún NO afirmo

- QA visual real en dispositivo físico (Codex).
- Lectura por VoiceOver / TalkBack de los estados `aria-pressed` y del
  diálogo (`role="dialog" aria-modal="true"` está declarado, pero no probado
  con lector de pantalla).
- Comportamiento con foco visible al cerrar el diálogo (se usa `autoFocus`
  en el botón Cerrar; falta verificar que devuelva foco al CTA disparador).
- Prueba de `typecheck` del proyecto: `tsc` root sólo incluye `src/`, y
  `tsconfig.api.json` sólo incluye `api/` y `scripts/`. La vista previa vive
  fuera de ambos por diseño — evita tocar el pipeline. Si se decide
  integrar, extender un `include` puntual para ese archivo.
- Lint global (`eslint`) no se corrió sobre este archivo; el pre-commit del
  repo tampoco lo alcanza. Codex puede correr `eslint tests/manual/portada-redesign.tsx`
  si lo desea.

## Notas para una posible integración futura (NO ejecutar ahora)

- El componente puede convivir con `PortadaElectrodomesticos` como variante
  detrás de flag antes de reemplazar la fuente.
- Para el CMS: los textos aquí son marcadores para revisar la composición.
  Si se aprueba, decidir dónde vive el copy definitivo (config web vs.
  hardcode intencional en el layout marketing).
- El resumen local es sólo QA — al integrar, restaurar `Link to={enlaceAgendar(...)}`
  y `obtenerWhatsAppPublico(config, mensaje)` reales.
- Si se agrega header translúcido en el futuro, exigirá revisar el patrón
  con Jorge — hoy la instrucción explícita fue "sin blur/gradientes
  decorativos".

## Revisión de Codex tras la entrega de Claude Code

- Vista real de escritorio y móvil de 390px revisada en Chrome. Escena sin borde ni tarjeta; tipografía Plus Jakarta Sans coherente con el proyecto.
- En móvil, título, escena compacta y controles en ese orden; acciones visibles antes que en la primera propuesta.
- Probado Mantenimiento + Nevera → Agendar: resumen conserva selección. Escape devuelve foco al botón de origen; diálogo desaparece tras su transición.
- Lint dirigido al TSX aprobado el 30/09/2026. No equivale a typecheck de producción ni a pruebas con lector de pantalla.
- Selector y teléfono con altura mínima de 48px. Transiciones simultáneas para cambios rápidos.
- Panel de revisión: http://127.0.0.1:5298/tests/manual/revision-diseno.html con modos Escritorio y Móvil.
- Sigue siendo una propuesta local sin publicación ni conexión de sus botones a operaciones reales. El rediseño administrativo sigue pendiente.
