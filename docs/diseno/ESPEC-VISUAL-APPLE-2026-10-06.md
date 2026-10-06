# Especificación visual completa — concepto «Mister Service App» (estilo Apple)

**Fecha:** 06/10/2026 · **Autor:** Claude (Cowork) · **Para:** Codex y Claude Code · **Pedido por:** Jorge
**Qué es:** todo el detalle del concepto visual aprobado como dirección («Que se sienta como WhatsApp y se vea como Apple»), traducido a valores de producción, con los conflictos entre documentos ya resueltos.

> Etiquetas (regla del cerebro compartido): ✅ verificado con evidencia · 🟦 decisión de Jorge · 💡 propuesta de esta especificación · ⏳ pendiente · ❓ sin verificar.

---

## 0. Cómo usar este documento

### 0.1 Precedencia (no cambia)
1. Lo que diga Jorge en el chat.
2. `DESIGN.md` (versión de `~/.codex/worktrees/cierre-ordenes-recuperado/mister-service-rd/DESIGN.md`, 262 líneas, la más reciente ✅).
3. `docs/diseno/handoff-codex-2026-10-01/ESPEC-DISENO.md` (pasos de progreso, Centro de operaciones, equipos A/B).
4. **Este documento** (detalle visual de cada pantalla y componente).
5. Los prototipos HTML. **Solo referencia visual; sus nombres, montos, horas y vans son inventados.**

Si este documento contradice 1–3, manda 1–3. Donde encontré contradicción la marco con **⚠ Conflicto** y doy la resolución.

### 0.2 Fuentes que se leyeron completas para escribir esto
- ✅ Concepto publicado «Mister Service App» (artifact `claude.ai/artifact/QTXDgyrVGgFBWg54RAu6pe`, 879 líneas). Copia en el repo: `docs/diseno/2026-10-01-concepto-app.html` (63.941 bytes, worktree `cierre-ordenes-recuperado`).
- ✅ `DESIGN.md` (ambas versiones de worktree), `ESPEC-DISENO.md`, `PROMPT-CODEX.md`, `codigo/tokens.css`, `codigo/tailwind.tokens.js`.
- ✅ `src/utils/motion.ts`, `src/index.css` (bloque `.service-ui`, `--ms-action`, `--ms-touch`), `src/components/Badge.tsx`, `tailwind.config.js`.
- ✅ Antes/después de la agenda del técnico: `~/Desktop/mister-service-rd/.tmp-preview-rediseno/{antes,despues}.html` (04/10).

### 0.3 ❓ Advertencia sobre la carpeta base
El 06/10 `~/Desktop/mister-service-rd` está en la rama `rediseno-agenda-tecnico` (HEAD `bc59269`, hay un stash `WIP antes de rediseno-agenda-tecnico`) y **no tiene** `DESIGN.md`, `docs/diseno/` ni la dependencia `motion`. Esas piezas sí existen en los worktrees de Codex (`web-blanca-publicacion`, `cierre-ordenes-recuperado`, `motion 13.4.4`). **Antes de implementar, Codex debe confirmar sobre qué rama/carpeta trabaja** y no mezclar.

---

## 1. La idea en una frase y sus seis reglas

**«Todo el servicio. En una sola app.»** La operación que hoy vive en seis apps (Google Calendar, WhatsApp, rastreo GPS, Paso Rápido, DGII, notas de la cita) se ve en un solo lugar. La sensación Apple no sale de efectos: sale de **espacio, una sola tipografía bien escalada, movimiento con física y color que siempre significa algo**.

Seis principios de interfaz (texto literal del concepto, vigentes en `DESIGN.md`):
1. **Una acción principal por pantalla.** El botón azul es lo siguiente que debes hacer. Lo demás, en segundo plano.
2. **Hojas en vez de páginas.** Una orden se abre como hoja desde abajo y se cierra deslizando con la velocidad del dedo, sin perder la agenda detrás.
3. **Coherencia espacial.** Menú por la izquierda, hoja por abajo, modal al centro. Solo se anima `transform` y `opacity`, y todo se puede interrumpir.
4. **Superficies sólidas.** Sin vidrio ni degradados en la app. La jerarquía sale del tamaño, el peso y el espacio.
5. **Pensada para el pulgar.** Toques de 44 px en oficina y 48 px en la vista del técnico.
6. **Se siente como WhatsApp.** Filas de 64–72 px con nombre, contexto y hora. Lista → detalle, búsqueda arriba.

---

## 2. Regla de conversión maqueta → producción (importante)

El teléfono del concepto mide **300 × 624 px** con 11 px de bisel: la pantalla útil es **278 px** de ancho. Un iPhone/Samsung real tiene **360–430 px** (referencia 390). Por eso **los px de la maqueta NO se copian**:

| Maqueta | Producción | Regla |
|---|---|---|
| Texto 8,5–12 px | mínimo **12 px**; operativo **16 px** | `DESIGN.md §2.2`: nada de 9/10/11 px en información operativa. `index.css` ya fuerza 12 px a `text-[9px…11px]`. |
| Título pantalla 24 px | `.text-h1` 30/36 700 −0,02em | |
| Cifra KPI 17 px | `.text-h2` 20/28 **700**, `tabular-nums`, −0,02em | 💡 mismo tamaño h2, peso 700 solo para cifras. No se crea escala nueva. |
| Padding pantalla 16 px | 16 px móvil / 24 px web | igual |
| Gap 7 px | 8 px | escala 4·8·12·16·24·32·48 |
| Padding tarjeta 9–12 px | 16 px (12 px en KPI) | |
| Fila de lista ~36 px | **64 px mín., 72 px preferida** | |
| Tabbar 56 px | 56 px + `env(safe-area-inset-bottom)` | |

---

## 3. Tokens

### 3.1 Color — base (✅ `tokens.css` + `DESIGN.md §2.1`)

| Token CSS | Tailwind | Hex | Uso | Contraste |
|---|---|---|---|---|
| `--ms-fondo` | `bg-ms-fondo` | `#F0F4F8` | Fondo general de la app | — |
| `--ms-superficie` | `bg-ms-superficie` | `#FFFFFF` | Tarjetas, listas, hojas, tabbar | — |
| `--ms-texto` | `text-ms-texto` | `#111827` | Títulos y contenido | 17,74:1 en blanco |
| `--ms-texto-2` | `text-ms-texto-2` | `#4B5563` | Contexto secundario | 7,56:1 blanco · 6,84:1 en fondo |
| `--ms-texto-micro` | `text-ms-micro` | `#6B7280` | Metadatos **solo sobre blanco** | 4,83:1 blanco · **4,37:1 en `#F0F4F8` ✗** |
| `--ms-borde` | `border-ms-borde` | `#E5E7EB` | Separadores de tarjeta y filas | decorativo |
| `--ms-borde-control` | `border-ms-control` | `#6B7280` | Borde de inputs | |
| `--ms-pista` | `bg-ms-pista` | `#EDF1F6` | Fondo vacío de barras y anillos | |
| `--ms-accion` | `bg-ms-accion` | `#0F3460` | 🟦 Acción, foco, pestaña activa | 12,50:1 |
| `--ms-accion-50` | | `#EFF4FA` | Fondo tarjeta IA, selección | |
| `--ms-accion-100` | | `#DCE7F2` | Chip «Agendada», hover neutro | |
| `--ms-marca` | | `#4A6FA5` | Color del logo. **No texto pequeño** | 5,11:1 |
| `--ms-exito` | | `#15803D` | Completado confirmado | 5,02:1 |
| `--ms-advertencia` | | `#B45309` | Atraso, saldo bajo, stand-by > 14 días | 5,02:1 |
| `--ms-peligro` | | `#B91C1C` | Solo acciones destructivas | 6,47:1 |
| `--ms-garantia` | | `#DC2626` | 🟦 **Exclusivo garantía** (mapa, chips, barras) | 4,83:1 |
| `--ms-standby` | | `#9CA3AF` | Rayado de stand-by (con etiqueta) | decorativo |

**Regla nueva derivada de la medición:** 💡 el texto `#6B7280` **no** va directo sobre el fondo `#F0F4F8` (4,37:1, no cumple AA). Sobre el fondo usar `#4B5563`; `#6B7280` solo dentro de superficies blancas.

### 3.2 Color — rampa de progreso (✅ `tokens.css`)
`--ms-paso-0 #C9D8EA` Agendada · `-1 #9DB7D6` En camino · `-2 #7697C4` En sitio · `-3 #4A6FA5` Diagnóstico · `-4 #2F4E7E` Trabajando · `-5 #0F3460` Cobro · `-6 #15803D` Cerrada.

### 3.3 Chips de estado — definitivos (💡, medidos)

⚠ **Conflicto:** el concepto Apple (01/10, por la mañana) usaba colores por tono (*En ruta* ámbar `#B26A00/#FFF1DC`, *En sitio* violeta `#6A3FE0/#EDE6FF`, *Completada* verde `#11804E/#DDF7EA`). La especificación aprobada después (`ESPEC-DISENO.md`, 01/10) reserva **ámbar para atraso** y **rojo para garantía**, y define pasos en rampa azul. Además dos chips del concepto **no cumplen contraste** (ámbar 3,81:1; verde 4,40:1). **Resolución: se usan los chips de esta tabla; los del concepto quedan descartados.**

| Estado / bandera | Fondo | Texto | Contraste | Notas |
|---|---|---|---|---|
| Agendada (paso 0) | `#DCE7F2` | `#0F3460` | 9,97:1 | |
| En camino (1) | `#C9D8EA` | `#0F3460` | 8,63:1 | |
| En sitio (2) | `#9DB7D6` | `#0F3460` | 6,06:1 | **no** texto blanco sobre `#7697C4` (3,0:1 ✗) |
| Diagnóstico / Revisión (3) | `#4A6FA5` | `#FFFFFF` | 5,11:1 | |
| Trabajando (4) | `#2F4E7E` | `#FFFFFF` | 8,36:1 | |
| Cobro / Validación (5) | `#0F3460` | `#FFFFFF` | 12,50:1 | |
| Cerrada (6) | `#15803D` | `#FFFFFF` | 5,02:1 | |
| **Garantía** (bandera) | `#DC2626` | `#FFFFFF` | 4,83:1 | ⚠ `#DC2626` sobre rosa `#FDE3E3` da 3,97:1 ✗ → siempre sólido |
| **Atrasada** (bandera) | `#FEF3C7` + borde 1 px `#B45309` | `#92400E` | 6,37:1 | texto «+N min» |
| **Stand-by** (bandera) | `#E5E7EB` | `#374151` | 8,33:1 | en barras: patrón `.ms-rayado-standby` |

Anatomía del chip (✅ `DESIGN.md §3 Badge`): texto 12/16 peso 500, padding 4 px × 8 px, `border-radius: 9999px`, `white-space: nowrap`, sin interacción por defecto. Siempre con etiqueta: **el color nunca es la única señal**. Si el chip filtra, es botón de 44/48 px con `aria-pressed`.

Implementación: ampliar `faseColor()` en `src/utils/index.ts` (mapeo visual, sin tocar fases) o mapear desde `progresoOrden.ts`. `Badge.tsx` hoy usa `px-2.5 py-0.5 text-xs font-medium` → pasar a `px-2 py-1 text-[12px] leading-4 font-medium`.

### 3.4 Tipografía (✅ `DESIGN.md §2.2`)
Una familia: **Plus Jakarta Sans** (400/500/600/700/800 ya cargada), respaldo `system-ui, sans-serif`. Nada de Geist ni SF en la app (Geist solo era de la página de presentación del concepto).

| Clase | Tamaño/interlineado | Peso | Tracking | Uso en las pantallas del concepto |
|---|---|---|---|---|
| `.text-h1` | 30/36 | 700 | −0,02em | «Hoy», «Agenda», «Cobro», «Flota», nombre del cliente en la orden |
| `.text-h2` | 20/28 | 600 (700 en cifras) | −0,01em | Títulos de hoja, cifras KPI, total |
| `.text-body` | 16/24 | 400 · **600 en títulos de fila y botones** | 0 | Contenido, filas, botones |
| `.text-caption` | 14/20 | 400 · 600 en etiquetas | 0 | Contexto de fila, subtítulo de fecha |
| `.text-micro` | 12/16 | 500 | 0 | Hora, etiqueta de KPI, chips, tabbar |

Detalles: cifras y horas con `font-variant-numeric: tabular-nums`. Sección («AHORA», «SIGUIENTE», «REQUIERE TU ATENCIÓN»): micro 12/16, peso 600, `text-transform: uppercase`, `letter-spacing: .06em`, color `#4B5563`. Número de orden «OS-2481»: caption, `tabular-nums`, color texto-2 (el concepto usaba mono; 💡 no se añade fuente mono).

### 3.5 Espaciado, radios, sombra, capas
- Escala: **4, 8, 12, 16, 24, 32, 48**.
- Márgenes: móvil 16; web 24 (32 en vistas holgadas). Icono↔texto 8. Entre controles ≥ 8. Grupo 16. Sección 24.
- Radios: **8** controles · **12** tarjetas, KPI, chips de agenda (bloques) · **16** hoja (solo esquinas superiores), modal, tarjeta IA · **24** tabbar flotante · **9999** chips, avatar, botón flotante.
- Sombra única `--ms-elevacion: 0 8px 24px rgb(15 23 42 / .12)` solo en hoja, menú, modal y tabbar flotante. Tarjetas: sin sombra, borde 1 px `#E5E7EB`.
- Velo de diálogo: negro 40 %, sin blur.
- Capas (💡): contenido 0 · cabecera sticky 20 · tabbar 30 · hoja/menú 40 · modal 50 · toast 60 · banner nueva versión 9999 (✅ existente).

### 3.6 Iconos
Lucide (✅ `lucide-react` ya instalado). 20 px en filas y botones, 24 px en tabbar, caja táctil 44/48. Trazo por defecto (2). Correspondencias sugeridas: Hoy `Home` · Agenda `CalendarDays` · Mapa `Map` · Chats `MessageCircle` · Más `MoreHorizontal` · Llamar `Phone` · WhatsApp `MessageCircle` (sin verde de marca, `DESIGN.md`) · Navegar `Navigation` · Garantía `ShieldAlert` · Stand-by `PackageX` · Atraso `Clock` · Combustible `Fuel` · Peaje `Ticket` · Cámara `Camera` · Firma `PenLine` · IA `Sparkles`.

### 3.7 Breakpoints
375 px y 1440 px obligatorios (aceptación). Teléfono < 760 px (ESPEC). Lista+detalle en web cuando el ancho útil tras la barra lateral lo permita (`DESIGN.md §4`). Tableta: ambas orientaciones.

---

## 4. Componentes (anatomía exacta)

### 4.1 Contenedor móvil
- Fondo `#F0F4F8`. Padding lateral 16. Respeta `env(safe-area-inset-*)`.
- Cabecera de pantalla: subtítulo de fecha (caption, `#4B5563`, ej. «Miércoles, 30 de septiembre») y debajo título h1. Separación título→contenido 12.
- Scroll único por pantalla. Padding inferior = alto tabbar + 16 + safe area (hoy `index.css` usa 80 px).

### 4.2 Barra inferior (tabbar)
⚠ **Conflicto:** el concepto propone 5 pestañas **Hoy · Agenda · Mapa · Chats · Más**. `DESIGN.md §4` dice que el móvil admin **conserva las 4 opciones actuales de `NavegacionMovil`** y sus permisos. **Resolución: ⏳ decisión de Jorge.** Mientras no decida, aplicar solo el **estilo** a los destinos actuales.
- Estilo 💡: superficie blanca sólida, borde 1 px `#E5E7EB`, radio 24, flotante con margen 12 px a los lados y 12 px + safe area abajo, alto 56, sombra elevación. Sin blur (el `index.css` ya quita `backdrop-filter`).
- Ítem: icono 24 + etiqueta micro 12/16 peso 500, gap 4, columna centrada, caja ≥ 44 × 44. Inactivo `#4B5563`; activo `#0F3460` con icono relleno o trazo 2,25. `aria-current="page"` en el activo.
- Técnico: su contenedor propio (`TecnicoVista`), no hereda esta barra (`DESIGN.md §4`).

### 4.3 Tarjeta
Blanca, radio 12, borde 1 px `#E5E7EB`, padding 16, sin sombra. Fila de tarjeta con lista: padding vertical 0 y filas internas.

### 4.4 KPI (fila de 3)
Grid 3 columnas, gap 8. Cada KPI: tarjeta radio 12, padding 12. Etiqueta micro 12/16 `#6B7280` (sobre blanco); cifra h2 20/28 **700**, `tabular-nums`, −0,02em, color texto. Cifra de garantía en `#DC2626` + texto. **Las cifras aparecen inmediato, sin contador animado** (✅ `ESPEC-DISENO.md §1.3`).
Formato: montos grandes abreviados solo en KPI («41,2 k») 💡 con `aria-label` completo («RD$41,200»). En detalle siempre completo.

### 4.5 Título de sección
Micro 12/16, 600, mayúsculas, tracking .06em, `#4B5563`, margen 16 arriba / 8 abajo, 4 px de sangría.

### 4.6 Fila de lista (orden / cita)
✅ `DESIGN.md §3 Fila`: mín. 64, preferida 72, crece con el texto.
- Izquierda: hora en caja de 48 px de ancho, caption 14/20 `tabular-nums`, `#4B5563` (en el concepto 34 px mono → se amplía).
- Centro (`min-width:0`): título body 16/24 **600** = **cliente primero** 🟦 (aclaración de Jorge 01/10: «los bloques de citas identifican primero al cliente, con equipo secundario»). ⚠ El concepto ponía el equipo de título («Lavadora Samsung»); **se invierte**: título = cliente, contexto = «Lavadora Samsung · Pedro Brand · Miguel».
- Debajo del contexto: `BarraSegmentada` (ESPEC §3.4), alto 4, radio 9999.
- Derecha: chip de estado (§3.3).
- Separador 1 px `#E5E7EB` entre filas (no en la primera). Toda la fila es botón; menú secundario es botón hermano de 44 px.

### 4.7 Control segmentado (Día · Semana · Mes / Efectivo · Transfer. · Tarjeta)
Contenedor `#E4E8F0` 💡 (o `#EDF1F6` pista), radio 9, padding 2. Segmento: alto ≥ 44, body 14/20 600, color `#4B5563`; seleccionado fondo blanco, texto `#111827`, sombra `0 1px 3px rgb(0 0 0 / .08)`, radio 7. `role="radiogroup"` / `aria-checked`, o `tablist` si cambia vista. El indicador blanco se desliza con `transform` (resorte predeterminado).

### 4.8 Botones
✅ `DESIGN.md §3 Botón`. Primario: fondo `#0F3460`, texto blanco body 16/24 600, alto 44 (técnico 48), radio 8, padding 0 16, ancho completo dentro de tarjetas (como «Crear cita 2:00 PM», «Enviar factura por WhatsApp», «Aprobar RD$2,000»). Secundario: blanco, borde `#6B7280`, texto acción. Neutro (ej. «Editar»): fondo `#EEF1F6`, texto `#111827`. Presión: `scale .97` desde `pointerdown` (✅ ya en `index.css`). Una sola acción primaria visible por contexto.

### 4.9 Trío de acciones (Llamar · WhatsApp · Navegar)
Grid 3 columnas gap 8, debajo del técnico en la orden. Cada uno: tarjeta blanca borde 1 px, radio 8, alto 48, icono 20 + etiqueta caption 600 color acción. Enlaces reales `tel:`, `https://wa.me/<tel normalizado>`, Google Maps con lat/lng del cliente. Solo si existe el dato; si falta, deshabilitado con motivo.

### 4.10 Avatar
Círculo 40 (filas) / 32 (compacto), fondo `#0F3460`, inicial blanca 600. En el mapa, el avatar toma el color del **estado** de su orden actual, no un color por técnico.

### 4.11 Lista clave-valor (detalle de orden / factura)
Grid 2 columnas (`auto 1fr`), gap 8 × 16. Clave caption `#4B5563`; valor body 500 alineado a la derecha. Total: separador discontinuo 1 px `#E5E7EB`, etiqueta caption, monto h2 700 `tabular-nums` («RD$6,800»).

### 4.12 Hoja inferior (orden, técnico)
- Blanca, radio 16 arriba, sombra elevación, asa 34 × 4 radio 4 `#D6DAE3` centrada, 8 px bajo el borde.
- Alto máximo: viewport útil − 48 (respeta teclado y safe area). Una sola zona de scroll; acciones fijas abajo sin tapar el último campo.
- Arrastre (✅ código del concepto + `motion.ts`): sigue al dedo 1:1 (`drag="y"`, `dragConstraints={{ top: 0 }}`); al soltar **cierra si** `y + velocidad.y × 0,2 > alto × 0,4`; anima con `obtenerTransicionMovimiento(reducido, true, velocidad.y)`. Umbral para empezar arrastre: 6 px (`UMBRAL_ARRASTRE`).
- Web: la misma información en `Modal` centrado (tamaños actuales sm/md/lg/xl), o hoja lateral derecha para la ficha del técnico (ESPEC §3.3).
- Foco atrapado, Escape cierra (si hay cambios sin guardar, pregunta), foco vuelve al disparador.

### 4.13 Tarjeta «Sugerencia de Claude» (chat)
Borde 1 px `#B7CCE5` (brand-200 ✅), fondo `#EFF4FA`, radio 12, padding 12. Etiqueta micro 700 mayúsculas acción «SUGERENCIA DE CLAUDE». Línea 1 body: **equipo** en 600 · falla · zona. Línea 2 caption: técnico y hora disponibles. Botón primario «Crear cita 2:00 PM». ⏳ La IA de WhatsApp está **apagada**; la tarjeta no aparece mientras no se active. Nunca crea la cita sola: el botón abre el formulario de cita prellenado.

### 4.14 Burbujas de chat
Entrante: blanca, radio 15 con esquina inferior izquierda 5, máx. 78 % ancho, padding 8 × 12, body 16. Saliente: `#D9F7CF` (verde WhatsApp claro), esquina inferior derecha 5, alineada a la derecha. ✅ Las burbujas viven en `src/components/inbox/MensajeBubble.tsx`: cambiarlas es **subfase propia** (`DESIGN.md §5`).

### 4.15 Agenda por técnico
- Cabecera: columna de horas 48 px + una columna por técnico. Nombre del técnico caption 600; debajo micro con van («VAN-02») o «Contratista» para Wilmer (ESPEC).
- Horas fijas 9–18 (🟦), una fila por hora, alto 64 💡 (maqueta 40 escalado), línea 1 px `#E5E7EB` por hora. Almuerzo: bloque neutro `#E5E7EB` con texto «Almuerzo».
- Bloque de cita: posición absoluta, inset 2 px, radio 8, padding 4 × 6. Título = **cliente** (600) y debajo equipo/zona (micro). Color = **estado** (§3.3), nunca quién la creó. Bloque es botón: abre la orden; nombre del técnico abre su ficha (🟦 01/10).
- Línea de «ahora»: 2 px `#0F3460` horizontal en la hora actual.
- Reasignar arrastrando: 💡 solo si el handler de reasignación ya existe; si no, menú «Reasignar a…». **No crear lógica nueva.**
- Móvil: 3 columnas visibles con scroll horizontal por técnico; selector Equipo A · Wila / Equipo B · Yohana (ESPEC §3.3).

### 4.16 Mapa
- Fondo del mapa real (Google Maps/Leaflet existente). Marcadores: círculo 18 px, borde blanco 3 px, color del estado de la orden actual; garantía siempre `#DC2626` (✅ `src/components/mapa/marcadores.ts`).
- Ruta prevista: línea punteada `#0F3460` 4 px, `stroke-dasharray: 1 7`, puntas redondas.
- Destino: punto negro 14 px con centro blanco 6 px.
- Hoja inferior sobre el mapa (asa + lista): fila «VAN-02 · Miguel» (600) / «→ Pedro Brand · OS-2481» (caption) / chip con ETA («12 min») a la derecha.
- Animación de vans: posición nueva del GPS se interpola con transform; con movimiento reducido salta.

### 4.17 Barra de avance del día
Tarjeta: fila «Avance del día» (body 600) + porcentaje a la derecha (caption). Barra alto 8, radio 8, fondo pista, segmentos en fila: completadas verde `#15803D`, en curso azul `#4A6FA5`, en sitio `#2F4E7E` 💡 (los ámbar/violeta del concepto se reemplazan, §3.3). Leyenda debajo: micro con «● Completadas · ● En camino · ● En sitio». Es la `BarraDelDia` de ESPEC (✅ `codigo/componentes/BarraDelDia.tsx`).

### 4.18 Fila de van (Flota / Mapa web)
Fila 64, radio 20 💡 en tarjeta oscura del concepto → en la app: tarjeta blanca radio 12. Punto 12 px del color de estado, nombre «VAN-02 · Miguel» 600, contexto caption, ETA a la derecha caption `tabular-nums`.

### 4.19 Foto/vídeo de diagnóstico (técnico)
Grid 3 columnas gap 8, celdas cuadradas radio 12, `object-fit: cover`; última celda «+» para añadir (botón 48, borde discontinuo, icono `Camera`).

### 4.20 Firma
Lienzo blanco alto 120 💡, borde 1 px `#6B7280`, radio 12, trazo `#111827` 2 px, botón «Borrar» secundario. Debajo caption con método y monto: «Efectivo · RD$6,800 recibido».

### 4.21 Estados vacío / carga / error
✅ Reutilizar `EmptyState`, `Skeleton`, `LoadingSpinner`. Skeleton con la geometría de la fila (72 px). Nunca rellenar con datos inventados.

---

## 5. Pantallas — app de oficina (7)

Datos en paréntesis = de dónde salen (listeners existentes; no crear consultas nuevas).

### 5.1 Hoy (inicio / Dashboard)
Orden vertical:
1. Fecha (caption) + saludo h1 «Buenos días, Jorge» (💡 «Buenas tardes» desde 12:00, «Buenas noches» desde 19:00; nombre = usuario).
2. KPI ×3: **Citas hoy** · **Vans en ruta** · **Por cobrar** (variante «Hoy» del recorrido: Completadas 6/14 · Cobrado · Garantías en rojo).
3. Tarjeta «Avance del día» (§4.17).
4. Sección **AHORA / SIGUIENTE**: tarjeta con 3–4 filas (§4.6) de las próximas citas.
5. Sección **REQUIERE TU ATENCIÓN**: tarjeta con chip Stand-by + «3 órdenes esperan piezas» (600) + piezas (caption). Lista de `codigo/atencion.ts`.
Sin datos: `EmptyState`. ⚠ `Dashboard.tsx` hoy lee 8 colecciones completas sin filtro (deuda P-2 de la auditoría 09/09): no empeorarlo.

### 5.2 Agenda
Título «Agenda» · segmentado Día/Semana/Mes · agenda por técnico (§4.15). Vista Semana/Mes 💡: mantener las vistas que ya existan; si no existen, solo Día.

### 5.3 Orden (hoja)
Arriba: «OS-2481» (caption tabular) a la izquierda, chip de estado a la derecha. Título h1 = **cliente** («Ana Rodríguez»). Subtítulo caption: dirección · hora. Tarjeta clave-valor: Equipo · Falla · Trabajo · Piezas · Pago, y Total acordado. Tarjeta técnico: avatar + «Miguel · Zona Oriental» + «VAN-02 · llega en 12 min». Trío Llamar/WhatsApp/Navegar. En detalle web: `RielEstaciones` + barra doble trabajo/cobro (ESPEC §3.5).
⚠ `OrdenDetalle.tsx` = riesgo muy alto: **solo presentación**.

### 5.4 Mapa
§4.16. Lista de vans en la hoja. ⏳ Seguimiento para el cliente bloqueado hasta resolver la regla `ubicaciones_vehiculos` (ESPEC §6).

### 5.5 Chats
Cabecera: avatar + nombre del cliente (600) + «Cliente desde 2023 · 3 órdenes» (caption). Burbujas §4.14. Tarjeta IA §4.13 (oculta mientras la IA esté apagada). Lista de chats = filas WhatsApp (§4.6 con último mensaje como contexto y hora a la derecha). Nombre del cliente como título, teléfono secundario (🟦).

### 5.6 Cobro
⚠ **Conflicto de alcance:** el concepto muestra «Factura de consumo electrónica · e-NCF E32…», ITBIS 18 % y envío por WhatsApp. 🟦 Jorge estableció que **las facturas fiscales se hacen en el software del gobierno, fuera de la app**; la app emite **Conduces de Garantía**. **Resolución: no implementar e-NCF.** La pantalla de cobro aplica el estilo a lo que ya existe (registro de pago, conduce de garantía). Si Jorge quiere e-NCF dentro de la app, es un proyecto aparte.
Estilo: «OS-2481» + chip Cerrada; h1 «Cobro»; tarjeta clave-valor con detalle y total; segmentado Efectivo/Transfer./Tarjeta (si esos métodos existen en el modelo); botón primario; nota caption centrada «Firmada por la cliente · 10:07 AM».

### 5.7 Flota
⚠ **Funciones nuevas, no visuales:** aprobación de combustible y saldo de Paso Rápido **no existen** en el software (❓ no encontrados). **No implementar** en el rediseño; quedan como ideas para Jorge (Fase 3 del concepto). Si existe Gastos e Ingresos, solo se aplica estilo.

---

## 6. Pantallas — técnico (APK, 48 px)

✅ Flujo de ESPEC §3.6: Mi ruta → **Salí** → **Llegué** → Diagnóstico → Cotiza en sitio → Firma y cobra → Cierre.

| Paso | Contenido visual | Notas |
|---|---|---|
| 1 Mi ruta | Lista de citas del día: hora · **cliente** · equipo · falla (lo dicho por WhatsApp si existe) | filas 72 |
| 2 Salí / Llegué | Botón primario ancho completo 48: «Salí hacia el cliente» → luego «Llegué». Confirmación: chip/píldora «✓ Llegada registrada · 9:04 AM» (fondo acción, texto blanco, radio 8) | Escriben `visita.enCaminoEn` / `enSitioEn` por endpoint autorizado (ESPEC §5). Geocerca solo **propone**. |
| 3 Diagnóstico | Grid de fotos §4.19 | fotos ya suben a Storage (✅ prueba OS-0011 28/09) |
| 4 Cotiza en sitio | Clave-valor piezas + mano de obra, total «QT-10482 · RD$6,800» | catálogo existente |
| 5 Firma y cobra | Firma §4.20 + método de pago | |
| 6 Cierre | Chip Cerrada + «Siguiente: 12:00 Arroyo Hondo» | |

Antes/después de la agenda del técnico (04/10, `.tmp-preview-rediseno/`): cabecera azul `#0F3460` sticky con logo «MS» en cuadro blanco 15 % radio 12 40×40, «Buen día,» (micro blanco 70 %) y nombre (h2 blanco 700); fondo `#F0F4F8`; secciones plegables `<details>` con chevron que gira 180°. ⚠ En la app usar el chevron con `transform` y resorte, no `transition-all`.

---

## 7. Movimiento (✅ `src/utils/motion.ts`)

| Interacción | Token | Detalle |
|---|---|---|
| Por defecto (abrir hoja, cambiar pestaña, segmentado, menú) | `RESORTE_PREDETERMINADO` k400 c40 m1 | sin rebote |
| Tras gesto (soltar hoja, arrastrar botón IA) | `RESORTE_GESTO` k400 c32 | hereda velocidad del dedo (px/s) |
| Presión | `ESCALA_PRESION` .97 desde `pointerdown` | |
| Entrada de panel | desplazamiento 16 px (`DESPLAZAMIENTO_PANEL`) + opacidad, escala .97 | |
| Arrastre | umbral 6 px, muestra de velocidad 100 ms, desaceleración .998 | `proyectarDestinoMovimiento` |
| Cambio de pantalla en el recorrido | opacidad 0→1 + escala .985→1 | (concepto: 550 ms `cubic-bezier(.2,.8,.2,1)` → en la app **resorte**, no duración) |
| Mapa (vans) | lineal continuo | solo para posición GPS |
| Movimiento reducido | `MOVIMIENTO_REDUCIDO` (duración 0) | sin desplazar, escalar ni inercia; el arrastre sigue al dedo |

Prohibido: animar `width/height/top/left`, `transition-all`, filtros, sombras, colores, blur; contadores animados; stagger en cifras o tablas financieras.

**Efectos que son solo de la página de presentación del concepto y NO van a la app:** teléfono inclinado (tilt 16° con scroll), las seis apps que se juntan en un ícono, el resaltado línea a línea nota→campos, el carrusel horizontal de pasos del técnico, los contadores 6→1 / 10,000+, el brillo radial y los degradados del fondo oscuro.

---

## 8. Textos y formatos

- Idioma: español dominicano, frases cortas, sin emojis decorativos.
- Fecha larga: «Miércoles, 30 de septiembre» (`date-fns` locale `es`, primera letra en mayúscula). Hora: «9:00», «2:00 PM» (horas cerradas 🟦).
- Moneda: «RD$6,800» y «RD$6,800.00» en cobro (✅ formato del concepto; confirmar con el formateador existente del repo antes de cambiarlo).
- Orden «OS-XXXX», cotización «QT-XXXXX» (✅ reglas de numeración, no tocar).
- Textos de interfaz del concepto: «Requiere tu atención», «Ahora», «Siguiente», «Avance del día», «Total acordado», «Llamar», «WhatsApp», «Navegar», «Sugerencia de Claude», «Crear cita», «Enviar factura por WhatsApp» (⚠ no aplica: ver 5.6), «Llegada registrada», «Firmada por la cliente».
- Nunca precios en mensajes automáticos al cliente (🟦 regla de Meta AI).

---

## 9. Accesibilidad (aceptación)
- Contraste AA medido sobre estilos computados (tablas §3).
- Toques 44 / 48 técnico; filas 64–72.
- Foco: contorno 2 px `#0F3460`, separación 2 px (✅ `index.css`).
- Texto al 200 % sin perder acciones; no alturas fijas.
- Estados siempre con texto además de color (garantía, atraso, stand-by).
- Hojas y modales: foco atrapado, Escape, retorno de foco, `aria-modal`, título accesible.
- `prefers-reduced-motion` leído en vivo.

---

## 10. Mapeo a archivos (solo presentación)

| Pieza | Archivo existente | Acción |
|---|---|---|
| Tokens | `src/index.css`, `tailwind.config.js` | añadir `tokens.css` y `tailwind.tokens.js` (sin borrar primary/brand/accent) |
| Chips | `src/components/Badge.tsx`, `src/utils/index.ts` (`faseColor`) | §3.3 |
| Hoja | `src/components/Modal.tsx` | variante hoja (DESIGN §5 fase 5) |
| Tabbar | `src/components/NavegacionMovil.tsx` | estilo §4.2; destinos ⏳ Jorge |
| Barra lateral | `src/components/Sidebar.tsx` | grupos DESIGN §4 |
| Hoy | `src/pages/Dashboard.tsx` | §5.1 |
| Agenda / órdenes | `src/pages/Ordenes.tsx` (monolítico, solo presentación), `OrdenesTablero` | §5.2 |
| Orden | `src/pages/OrdenDetalle.tsx` | §5.3, riesgo muy alto |
| Mapa | `MapaRutas`, `src/components/mapa/marcadores.ts` | §5.4 |
| Chats | `src/pages/Inbox.tsx`, `InboxConversacion.tsx`, `inbox/MensajeBubble.tsx` | §5.5, subfase propia para burbujas |
| Técnico | `src/pages/TecnicoVista.tsx` | §6 |
| Progreso | `codigo/componentes/*` del handoff → `src/components/progreso/` | ESPEC §4 |

---

## 11. Orden sugerido (una entrega a la vez, aceptación ESPEC §7)
1. Tokens + chips (§3) en `Badge` → un consumidor.
2. Fila de lista (§4.6) + `BarraSegmentada` en la lista de órdenes.
3. Hoy (§5.1).
4. Hoja de orden (§4.12, §5.3).
5. Agenda por técnico (§4.15).
6. Técnico (§6).
7. Chats (§5.5).
8. Mapa (§5.4).
Cada entrega: capturas 375/1440 antes-después, `tsc`, lint, pruebas, informe en `docs/qa/`, registro en el cerebro compartido con etiquetas.

---

## 12. Decisiones pendientes de Jorge (no inventar)
1. ⏳ Tabbar móvil: ¿5 pestañas del concepto (Hoy · Agenda · Mapa · Chats · Más) o las 4 actuales?
2. ⏳ ¿Facturación e-NCF dentro de la app algún día? (hoy 🟦 fuera de alcance).
3. ⏳ Combustible y peajes (Flota): ¿se construyen como función nueva?
4. ⏳ Regla GPS `ubicaciones_vehiculos` (ESPEC §6).
5. ⏳ Qué módulo sigue después del Centro de operaciones.

— Claude (Cowork), 06/10/2026
