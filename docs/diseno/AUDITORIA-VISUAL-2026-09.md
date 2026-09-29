# Auditoría visual — Mister Service RD

Fecha: 28 de septiembre de 2026. Fase 0, inspección estática del árbol de trabajo local, incluidos sus cambios pendientes. No equivale a una auditoría de la versión publicada ni a una prueba en dispositivos.

## Alcance y método

Se inspeccionaron `tailwind.config.js`, `src/index.css`, los ocho componentes Modal, Badge, EmptyState, Skeleton, LoadingSpinner, NavegacionMovil, Sidebar y Layout, y las cinco páginas Inbox, InboxConversacion, Ordenes, OrdenDetalle y TecnicoVista. Las referencias siguientes son `archivo:línea` respecto del código local en esta fecha.

Los conteos son ocurrencias textuales de utilidades, no cantidad de elementos renderizados ni superficie de color en pantalla. Incluyen variantes hover/focus y opacidad; no resuelven clases construidas dinámicamente, ramas condicionales ni la cascada. El corpus ampliado contiene 287 archivos `.ts`, `.tsx` y `.css` bajo `src`; el alcance principal contiene 13 archivos TSX. La configuración queda fuera del conteo de `src`.

Se contaron utilidades con prefijos `bg`, `text`, `border`, `ring`, `outline`, `from`, `via`, `to`, `fill`, `stroke`, `shadow`, `divide` y `decoration`. Se distinguió el token exacto `primary` de `primary-medium` y `primary-light`. Los literales hexadecimales se contaron por separado. Son indicadores para priorizar la migración, no una medición del CSS computado.

## 1. Colores: varias fuentes de acción

| Familia de utilidades | 13 archivos auditados | Todo src |
|---|---:|---:|
| primary exacto | 22 | 491 |
| primary-medium | 35 | 617 |
| primary-light | 0 | 0 |
| brand-500 | 4 | 12 |
| brand, todos sus niveles | 20 | 133 |

`brand-500` está incluido en la última fila; no sumar esas dos filas.

| Archivo bajo src | primary | primary-medium | brand-500 | brand total |
|---|---:|---:|---:|---:|
| components/Modal.tsx | 0 | 0 | 0 | 0 |
| components/Badge.tsx | 0 | 0 | 0 | 0 |
| components/EmptyState.tsx | 0 | 0 | 0 | 0 |
| components/Skeleton.tsx | 0 | 0 | 0 | 0 |
| components/LoadingSpinner.tsx | 0 | 1 | 0 | 0 |
| components/NavegacionMovil.tsx | 0 | 0 | 0 | 0 |
| components/Sidebar.tsx | 0 | 0 | 1 | 2 |
| components/Layout.tsx | 0 | 0 | 0 | 0 |
| pages/Inbox.tsx | 0 | 0 | 1 | 9 |
| pages/InboxConversacion.tsx | 0 | 1 | 2 | 7 |
| pages/Ordenes.tsx | 8 | 7 | 0 | 0 |
| pages/OrdenDetalle.tsx | 3 | 12 | 0 | 2 |
| pages/TecnicoVista.tsx | 11 | 14 | 0 | 0 |

Hallazgos:

- `tailwind.config.js:11`: primary `#0f3460`; línea 12: medium `#1a5fa8`; línea 25: brand-500 `#4A6FA5`. Son familias coexistentes, no alias del mismo token.
- `src/index.css:171` y `:227`: la acción principal usa además `#1768c5`; hover `#1256a6` en `:172`. `:287` añade `#145aa6` para pestañas de clientes.
- `src/pages/InboxConversacion.tsx:829`: enviar usa brand-600/700; `:786` usa brand-500 en foco. `src/pages/TecnicoVista.tsx:856` usa primary/primary-medium. La misma función visual no tiene una única referencia de acción.
- `src/pages/TecnicoVista.tsx:1062` y `:1143`: botones verdes de acción. `src/components/Sidebar.tsx:211` y `:218`: rojo para contadores. Ambos usos requieren migración para cumplir la dirección de Jorge: verde para éxito y rojo para destructivo.
- `src/components/Badge.tsx:13` obtiene colores mediante `faseColor`, definido en `src/utils/index.ts:135`. Esos colores dinámicos no aparecen en los conteos locales de Badge. Conservar los valores y etiquetas de las fases al cambiar su presentación.
- `src/index.css:216`: fondo blanco y texto `#202328`; `:221` y `:222` sustituyen gray-400/500 por `#69717c`/`#5f6771`. No diagnosticar contraste solo leyendo la clase de una página: hay sobrescrituras.
- Literales frecuentes en todo src: `#0f3460` 71, `#1a5fa8` 35, `#3b82f6` 19, `#f0f4f8` 14, `#f59e0b` 10. Este conteo separado también puede incluir estilos de documentos y gráficos; no se suma a las utilidades.

### Contraste de los candidatos

Cálculo sRGB de luminancia relativa, sobre blanco opaco:

| Color | Ratio | AA texto normal | AA texto grande |
|---|---:|---|---|
| #0f3460 | 12,50:1 | Sí | Sí |
| #4A6FA5 | 5,11:1 | Sí | Sí |

Se evaluó el valor sin redondear: 12,4969 y 5,1116. Ambos sirven también como fondo sólido con texto blanco. Esto no certifica hover, transparencias o mezclas. Referencia: [WCAG contraste mínimo](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html), umbral 4,5:1 para texto normal y 3:1 para texto grande.

**Decisión posterior de Jorge en esta sesión:** usar el azul oscuro en acciones principales. El azul claro queda como acento secundario, sin crear una segunda familia de botones principales. La solicitud inicial pedía dejarlo pendiente; esta confirmación resuelve esa decisión. No se ha aplicado al código.

## 2. Tipografía

- `tailwind.config.js:46` y `src/index.css:42` declaran Plus Jakarta Sans. `index.html:15` carga pesos 400–800.
- `src/components/Layout.tsx:19` incluye `service-ui`, cuya regla en `src/index.css:216` impone la fuente del sistema. La declaración global de Jakarta no garantiza que el administrador la muestre.
- Escala semántica existente en `src/index.css:15`: h1 30/36, peso 700; h2 20/28, 600; body 16/24, 400; caption 14/20 y micro 12/16 con peso heredado. Ninguno define letter-spacing explícito.
- No hay usos directos de las cinco clases semánticas en los 13 TSX inspeccionados. Usar `text-sm` o `text-xs` coincide en tamaño con caption/micro, pero evita la abstracción semántica. No confundir esto con estar fuera de la escala.
- `src/index.css:220` impone h1 de 28px/1,2 y tracking -0,6px en determinadas páginas; `:293` los reduce a 23px/1,25. Son dos escalas adicionales.

| Fuente | Tamaños fuera de la escala nombrada |
|---|---|
| Modal.tsx:42 | text-lg, 18px |
| Inbox.tsx:172, :300, :306 | 24px; dos usos de 10px |
| InboxConversacion.tsx:647 | 10px en contador |
| Ordenes.tsx:903, :975, :1187 | 24px, 18px y 11px |
| OrdenDetalle.tsx:600, :778 | 24px y 18px; además 15 usos de 11px y dos de 10px |
| TecnicoVista.tsx | Un text-2xl; 72 text-xs, relevantes para legibilidad de campo aunque 12px sí pertenece a la escala |
| index.css:158, :229 | 11px en aviso de entorno y etiquetas de navegación inferior |

Ejemplos de texto pequeño significativo en OrdenDetalle: `:1244` etiqueta de formulario, `:1341` acción, `:1386`–`:1399` resumen financiero, `:1483` historial de auditoría, `:1905` ayuda. Priorizar estos antes que notas meramente secundarias. No ocultar contenido para resolver su tamaño.

## 3. Botones, radios, sombras y espacio

| Evidencia | Inconsistencia observada |
|---|---|
| index.css:171 | Botón propio con radio 14px, fuente 14px, sombra exterior e interior y acción azul distinta |
| Sidebar.tsx:239 | Botón circular de 24px con shadow-lg |
| Modal.tsx:40, :47 | Contenedor rounded-2xl/shadow-2xl, cierre rounded-lg |
| OrdenDetalle.tsx | 40 ocurrencias rounded-lg, 25 rounded-2xl, 10 rounded-full, seis rounded-xl y 20 shadow-sm |
| TecnicoVista.tsx | 53 rounded-lg, siete rounded-full, cinco rounded-2xl, tres rounded-xl; shadow-sm, shadow y shadow-md |
| index.css:179, :228, :229 | Radios adicionales de 11px, 28px y 22px |
| Modal.tsx:41, :52 | Padding 24px para cabecera y contenido incluso en móvil |
| InboxConversacion.tsx:697, :714, :749 | Cabecera px-2/py-1, mensajes px-3/py-3 y compositor p-2; no hay un margen lateral común |
| index.css:184, :189, :298 | Espaciados de 6px, 10px y 18px además de la cuadrícula de 4/8 |

Los conteos de radios reflejan ocurrencias, no necesariamente errores individuales. Avatar circular y tarjeta rectangular pueden tener radios distintos por su función. El problema es la ausencia de una selección breve y explícita de tokens.

`src/index.css:105`–`:120` mantiene degradados y vidrio; `:228` mantiene blur en la barra inferior. Layout los consume en `:46` y `:55`. El cambio de dirección exige retirar esos tratamientos en una fase posterior; hoy permanecen intactos.

## 4. Objetivos táctiles

Mediciones deducidas del código con escala Tailwind predeterminada y raíz de 16px; requieren verificar `getBoundingClientRect` y estilo computado al implementar. El tamaño del icono no es el tamaño del objetivo. Una dimensión explícita tiene mayor certeza que una altura estimada por contenido.

| Archivo:línea | Evidencia | Dimensión nominal | Evaluación |
|---|---|---:|---|
| components/Sidebar.tsx:239 | w-6 h-6 | 24×24 | Inferior a 44 |
| components/Sidebar.tsx:189, :277 | text-sm + py-2.5 | Alto aproximado 40 | Inferior a 44 si ninguna regla adicional lo amplía |
| components/Modal.tsx:47 | p-2 + icono 20 | 36×36 | Inferior a 44; portal en body, fuera de service-ui |
| pages/TecnicoVista.tsx:822, :830, :834 | p-2 + icono 18 | 34×34 | Inferior a 48 |
| pages/TecnicoVista.tsx:1062 | min-h-[40px] y texto sm | Mínimo declarado 40 | No garantiza 48 |
| pages/TecnicoVista.tsx:1143 | texto sm + py-3 | Alto aproximado 44 | Inferior al objetivo técnico 48 |
| pages/OrdenDetalle.tsx:1341 | acción text-[11px], sin mínimo local | Sin garantía de 44 | Verificar y ampliar la caja |
| pages/InboxConversacion.tsx:698, :703, :829 | min-h-11 y min-w-11 | Mínimo 44×44 | Cumple la intención admin |
| index.css:229 | navegación inferior min-height 54 | Alto mínimo 54 | Conservar; comprobar ancho de cada opción |

Cautela de cascada: `src/index.css:242` aplica min-height 44 a botones dentro de `.service-ui .service-page` bajo 1024px. No cubre todos los enlaces, portales ni la vista del técnico. Por eso no se presenta toda aparición de py-2 como fallo móvil confirmado. Tampoco garantiza ancho 44.

El mínimo 44/48 es un requisito del proyecto. WCAG 2.2 AA para tamaño mínimo usa 24px con excepciones; no atribuirle el mínimo propio de 44. [Referencia oficial de tamaño](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html).

## 5. Lectura por componente y página

- **Modal:** tiene rol, nombre accesible y bloqueo de scroll; el archivo no implementa Escape, confinamiento del foco ni restauración al disparador. Incorporarlos posteriormente conservando la política de cierre y protección de cambios pendientes.
- **Badge:** conserva etiquetas y fases mediante utilidades compartidas; necesita mapear semántica visual sin cambiar estados de negocio. El tamaño de una etiqueta no debe tratarse como botón si no es interactiva.
- **EmptyState:** `src/components/EmptyState.tsx:35` usa espacio generoso y jerarquía simple; reutilizar su API y contenido real. No convertir error de consulta en estado vacío.
- **Skeleton:** `src/components/Skeleton.tsx:28` usa pulse y superficies grises; alinear cada variante con su contenido final y detener el pulso con movimiento reducido.
- **LoadingSpinner:** `src/components/LoadingSpinner.tsx:12` usa primary-medium. Alinear color y asegurar anuncio de carga en el componente o su contenedor, sin anuncios repetidos por cada indicador.
- **NavegacionMovil:** cuatro destinos existentes; preservar permisos, selección y comportamiento al abrir teclado. La regla tipográfica de 11px está en CSS compartido.
- **Sidebar:** tamaño táctil, contadores rojos y transición de 300ms requieren ajuste. `:233` usa transition-all; especificar propiedades.
- **Layout:** administra alturas, scroll, áreas seguras y visibilidad de navegación en chat. No sustituir esta lógica al simplificar la superficie visual.
- **Inbox:** `src/pages/Inbox.tsx:274` presenta tarjetas con varias líneas; el menú separado en `:344` aumenta la altura. Proponer una fila de lectura rápida sin perder sus metadatos. `:297` todavía admite teléfono como título si falta el nombre.
- **InboxConversacion:** `:701` admite también teléfono como título. Conservar teléfono como dato secundario; usar identificación neutral si no existe nombre, sin inventar identidad. `:745` representa envío pendiente y fallo: esos estados deben sobrevivir al rediseño. `:750` preserva bloqueo por baja y `:753` el aviso de ventana de respuesta.
- **Ordenes:** `:899` emplea service-page, pero estilos locales y CSS global compiten. Cambiar presentación por secciones sin extraer ni reorganizar su lógica monolítica.
- **OrdenDetalle:** concentra densidad de texto pequeño y variedad visual. Riesgo alto en pagos, estados, auditoría y acciones; migrar visualmente manteniendo handlers y condiciones.
- **TecnicoVista:** tiene superficie propia en `:793` y cabecera en `:796`; no asumir que hereda las protecciones táctiles del administrador. Reducir saturación de acciones y priorizar lectura exterior, sin alterar asignaciones ni operaciones.

## 6. Movimiento y límites de esta auditoría

`Sidebar.tsx:233`, `:245` y `Layout.tsx:36` usan 300ms. `index.css:173` desplaza el botón 1px al presionar. Existen reglas de reduced-motion en `:136` y `:268`; la primera limita iteraciones dentro de app-shell, la segunda acorta duración globalmente. No basta con añadir otra regla: consolidar y comprobar portales, técnico, spinner y skeleton.

No se ejecutaron recorridos visuales nuevos, pruebas de accesibilidad automatizadas, pruebas de APK ni mediciones de cajas en navegador durante esta fase. Las incidencias visuales históricas sirven de antecedentes, no de evidencia actual. Las verificaciones en 375px y 1440px son criterios de la migración descrita en DESIGN.md, no resultados ya obtenidos.

No se encontraron skills apple-design, emil-design-eng ni Impeccable en las raíces de skills inspeccionadas. Se utilizaron la dirección explícita de Jorge y referencias oficiales de accesibilidad; no se instaló ninguna dependencia. La página de Apple HIG consultada requiere JavaScript y no aportó contenido verificable en la lectura realizada; las medidas y duraciones de esta propuesta se atribuyen a la decisión del proyecto.
