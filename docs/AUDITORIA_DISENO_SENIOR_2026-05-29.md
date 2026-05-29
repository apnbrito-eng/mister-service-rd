# 🎨 AUDITORÍA DE DISEÑO — Mister Service RD

> **Para Jorge — 2026-05-29.** Un diseñador senior (visión estilo Stripe / Linear / Vercel) leyó las pantallas más importantes del software y calificó dimensión por dimensión. Notas 0-10, ejemplos concretos con archivo:línea, y un roadmap de cambios por impacto.
>
> **Método:** subagent dedicado leyó ~12 archivos clave (Dashboard, Órdenes, Inbox, TecnicoVista, CierreServicioWizard, HomePage pública, calendario público, formulario público + `tailwind.config.js` + `index.css`) y aplicó la metodología tipo `gstack /plan-design-review`.

---

## 1. Resumen en 60 segundos

Jorge, te lo digo directo. **El software funciona, pero parece hecho por un developer, no por un diseñador.** La marca tiene una paleta bonita en `tailwind.config.js` (azul "brand" + acento rojo del toolbox) pero **el código real usa colores hardcodeados** (`#0f3460`, `#1a5fa8`) que ignoran esa paleta — eso es la primera señal de incoherencia. La página pública (`HomePage.tsx`) está bien resuelta, casi profesional, y es lo mejor que tenés. El dashboard administrativo y la vista del técnico tienen **AI slop puro**: cada card un color de ícono distinto, emojis sueltos en código (💰, 👋, 📅, ⏸), 12 KPIs flotando sin jerarquía. Lo más urgente: **la vista del técnico móvil necesita un rediseño completo** — es la herramienta que se usa parado en la casa del cliente con una mano libre, y hoy tiene texto a 10px, botones diminutos, y 7 botones de acción amontonados sin prioridad.

---

## 2. Notas por dimensión (0-10)

### Jerarquía visual — **4/10**

**Qué es un 10:** abrís cualquier pantalla y en 1 segundo sabés qué es lo más importante. Un solo título grande, un solo botón primario por sección.

**Hoy:** en el Dashboard hay 11+ cards "card blanca con borde gris claro y rounded-2xl" — todas iguales. En `OrdenCard.tsx` la fila tiene el número de orden (importante) en el mismo tamaño que el badge "Reagendada" (no importante). En la vista técnico, el saludo "Buenos días Pedro 👋" tiene el mismo peso visual que las 5 cards de acciones que están abajo.

**3 cambios de mayor impacto:**
1. Dashboard: mostrar **1 KPI gigante "lo de hoy"** (ej: ingresos del día o citas pendientes) en lugar de la grilla de 4 KPIs iguales en `Dashboard.tsx:690-715`.
2. OrdenCard: el número (#OS-1234) debería ser **el doble de grande** que los badges. Hoy es `text-sm`, debería ser `text-lg font-bold`.
3. TecnicoVista: el botón "Cómo llegar" debería ser **el único botón grande verde-azul** arriba de cada cita. Los otros 7 (Sugerir chequeo, Stand-by, Avisar oficina, Nota, Maps, GPS, WhatsApp) deberían colapsarse en un menú "Más acciones".

### Tipografía — **5/10**

**Qué es un 10:** una escala clara (12, 14, 16, 20, 28, 40 por ejemplo). Pesos consistentes. Body 16px mínimo.

**Hoy:** usás Inter (bien). Pero hay **6 tamaños diferentes mezclados sin sistema**: `text-[10px]`, `text-[11px]`, `text-xs (12px)`, `text-sm`, `text-base`, `text-lg`, `text-2xl`. En la vista técnico aparecen muchos `text-[10px]` y `text-[11px]` — **eso es ilegible parado bajo el sol** (`TecnicoVista.tsx:982-991, 1083, 1090, 1094`).

**3 cambios:**
1. **Eliminar todos los `text-[10px]` y `text-[11px]`** del archivo del técnico. Mínimo `text-xs` (12px), y para datos importantes `text-sm` (14px).
2. Definir 5 niveles tipográficos en `index.css` con `@apply`: H1, H2, body, caption, micro. Y aplicarlos en lugar de tamaños inline.
3. Sacar `font-extrabold` (peso 800) del home público — es demasiado pesado en `HomePage.tsx:77, 107, 174`. Bajar a `font-bold` (700) que es más Stripe-like.

### Sistema de color — **3/10**

**Qué es un 10:** una paleta de marca usada en todos lados. Verde = éxito. Rojo = error. Amarillo = aviso. Azul = info. Nunca colores hardcodeados.

**Hoy:** **bug grave de identidad**. `tailwind.config.js` define una paleta hermosa (`brand-500: #4A6FA5`, `accent-500: #B73E3A`) — y **el código casi no la usa**. En su lugar veo `#0f3460`, `#1a5fa8`, `bg-[#0f3460]` repetido más de 50 veces (Sidebar, TecnicoVista, Dashboard). Eso significa que si querés cambiar el azul de marca, hay que tocar 50+ archivos. Además, los íconos de servicios en `HomePage.tsx:14-22` tienen 7 colores diferentes (azul, cyan, índigo, naranja, púrpura, amarillo, gris) que **no significan nada**: Lavadora azul, Nevera cyan, Estufa naranja… es decoración random.

**3 cambios:**
1. **Buscar y reemplazar todos los `#0f3460` por `primary` o `brand-800`** del tailwind config. Lo mismo con `#1a5fa8` → `brand-500`. Es un día de trabajo y la marca se vuelve consistente.
2. Sacar el color por tipo de equipo en `HomePage.tsx:14-22`. **Todos los íconos en gris-azul brand**. Si querés diferenciar, usá la imagen del equipo, no el color del ícono.
3. Bajar la saturación de los gradientes verdes "$$ Mis ganancias" (`TecnicoVista.tsx:824`) y los gradientes verdes-rojos del balance (`Dashboard.tsx:940, 960`). Los gradientes saturados gritan "plantilla SaaS 2019".

### Espaciado y ritmo — **6/10**

**Qué es un 10:** todo respira el mismo número (múltiplos de 4 u 8). El ojo no se cansa.

**Hoy:** el espaciado es decente pero inconsistente. `gap-2`, `gap-3`, `gap-4`, `gap-5`, `gap-6`, `gap-8` aparecen mezclados sin ritmo. En `TecnicoVista.tsx:807` el contenedor tiene `p-4 space-y-4`, pero las cards adentro usan `p-4` también — eso amontona.

**3 cambios:**
1. Establecer escala: solo `gap-2, gap-4, gap-8`. Eliminar `gap-3, gap-5, gap-6` excepto casos justificados.
2. Aumentar el espacio entre secciones grandes del Dashboard de `gap-6` a `gap-8` o `gap-10`. Las cards se sienten apretadas.
3. En el formulario `AgendarPage.tsx` darle más respiro vertical entre el hero y el formulario.

### Densidad de información — **4/10**

**Qué es un 10:** justo la info necesaria. Nada de scroll vertical eterno con 15 cards.

**Hoy:** el Dashboard muestra **11 secciones** (KPIs, atrasadas, embudo, alertas, ingresos vs gastos, balance pendiente, casos por técnico, rendimiento técnicos, agenda hoy, nómina, anuladas). Para administrar no hace falta tanto en una sola página — termina siendo ruido.

**3 cambios:**
1. Dashboard: 3 secciones máximo arriba del fold ("Hoy", "Atención inmediata", "Métricas del mes"). El resto a tabs o a su propia página.
2. OrdenCard muestra hoy: número, badges, foto, equipo, falla, dirección, técnico, fecha, hora, fase, estado, botones. **Demasiado**. Esconder "falla" y "técnico" detrás de un click en la card.
3. Sidebar tiene **38+ items en 9 secciones**. Cuando una herramienta tiene 9 secciones, el dueño no la usa toda — usa 5. Pedir a las operarias cuáles abren a diario y mover el resto a "Más".

### Accesibilidad — **3/10**

**Qué es un 10:** todo el texto pasa contraste WCAG AA (qué tan legible es texto sobre fondo). Botones mínimo 44px de alto. Focus visible. ARIA labels donde toca.

**Hoy:** **el problema más serio.** Los textos en azul claro sobre fondo azul oscuro del sidebar (`text-blue-200` sobre `bg-brand-800`) tienen contraste pobre. Los `text-[10px] opacity-75` del técnico son básicamente invisibles bajo el sol. Botones de `px-3 py-2 text-xs` miden ~32px de alto, **menos del mínimo de 44px** para tap target. No veo focus rings visibles en muchos botones. ARIA labels solo en los íconos de estado del inbox.

**3 cambios:**
1. **Botones del técnico mínimo 48px de alto.** Cambiar `px-3 py-2 text-xs` por `px-4 py-3 text-sm`.
2. Agregar `focus:ring-2 focus:ring-brand-500 focus:ring-offset-2` a TODOS los botones globalmente vía `@apply` en `index.css`.
3. Quitar `opacity-75` y `opacity-90` de texto. Si querés baja jerarquía, usá `text-gray-500` que mantiene contraste.

### Estados vacíos / error / loading — **5/10**

**Qué es un 10:** cada estado vacío es un diseño con ilustración, microcopy y siguiente paso. Loading es skeleton, no spinner.

**Hoy:** mezcla. El técnico tiene un empty state decente ("Sin citas en este período" con ícono `Clock`). Pero el Dashboard tiene `<LoadingSpinner />` genérico, y el OrdenCard sin foto muestra solo el placeholder gris. **Todos los empty states son texto + ícono lucide gris** — eso es AI slop puro.

**3 cambios:**
1. Reemplazar `<LoadingSpinner />` por **skeletons** (rectángulos grises animados) en las pantallas pesadas (Dashboard, Ordenes, Inbox). Es el detalle que separa Stripe de WordPress.
2. Diseñar 3-4 empty states con ilustraciones simples SVG o emoji **único** (no genéricos): "Sin citas hoy — aprovecha para llamar a clientes que dejaste en seguimiento".
3. Toasts de error deberían incluir **qué hacer**, no solo qué falló. "Error al guardar" → "No se pudo guardar. Revisá tu conexión y reintentá. Si sigue fallando, avisa a soporte."

### Mobile — **3/10**

La vista del técnico es la más crítica del negocio. **Análisis profundo abajo en sección 5.**

### Microcopy / tono — **6/10**

**Qué es un 10:** humano, claro, regional. Una marca dominicana habla como dominicano.

**Hoy:** mezcla rara. Hay momentos buenos ("Buenos días, Pedro 👋", "Bandeja al día", "nada urgente") y momentos robóticos ("Enviado a facturación", "Estado de aprobación", "SLA >24h", "Esperando aprobación del precio por operaciones"). El **"SLA"** es jerga corporativa pura — un mecánico no sabe qué es eso.

**3 cambios:**
1. Reemplazar **"SLA >24h"** → "Atrasadas más de 1 día" en `Dashboard.tsx:780`.
2. **"Esperando aprobación del precio por operaciones"** → "La oficina está revisando el precio".
3. **"Conduces emitidos"** + "Conduces de Garantía" — el término "Conduce" es regional dominicano y está bien, mantenerlo. Pero "Pendiente de piezas" en stand-by es claro, dejarlo.

### AI Slop / genericidad — **3/10**

Detalle en sección 4.

---

## 3. Pantalla por pantalla (top 6 más importantes)

### A. Dashboard admin (`src/pages/Dashboard.tsx`)

**Hoy:** 11 secciones apiladas. 4 KPIs idénticos arriba con colores random (azul, púrpura, verde, amarillo). Embudo de servicio en barras horizontales coloreadas que **se ven como un gráfico de marketing**, no como datos serios. Cards de Comunicación WhatsApp con íconos coloreados sin sentido (la mediana en azul, "sin responder" en ámbar, "más antigua" en rojo).

**Qué cambiaría:**
- **Una sola fila hero arriba** con 2 KPIs gigantes: "Lo de hoy" (ingresos del día / nuevas citas) y "Atención" (cuántas órdenes atrasadas + un botón "Ver").
- Pasar el resto del dashboard a 2 columnas: izquierda "Pipeline" (embudo + atrasadas + alertas), derecha "Plata" (ingresos vs gastos + balance + nómina).
- Eliminar los gradientes verdes y rojos de las barras de ingresos/gastos. Barras de color sólido.
- Sacar los íconos de colores de cada KpiCard. Un solo color (brand) para todos los íconos del Dashboard.

### B. Lista de órdenes (`src/pages/Ordenes.tsx` + `OrdenCard.tsx`)

**Hoy:** card con border-left de color por estado (bien). Demasiados badges arriba (#OS-1234, Reagendada, Solo chequeo, Reparación post-chequeo, Pendiente de piezas, Reactivar, Eliminada, motivo cancelación, fase, estado…). Foto del equipo a la izquierda como thumbnail (bien).

**Qué cambiaría:**
- Una sola jerarquía visual: número grande arriba a la izquierda, cliente abajo, fecha+hora a la derecha. Badges max 2 (el más relevante + el estado).
- Eliminar el botón "Reactivar" inline en la card — debería estar en el modal de detalle, no compitiendo con el click principal de la card.
- En vez de iconitos lucide en todas partes, dejar solo el de "estado" y el de "WhatsApp".

### C. Detalle de orden (`OrdenDetailModal.tsx`)

**Hoy:** modal con scroll vertical largo. Toda la info y todas las acciones mezcladas.

**Qué cambiaría:**
- Patrón de "split panel": izquierda info de cliente/equipo, derecha timeline de eventos. Acciones primarias en footer pegajoso (no enterradas en scroll).
- Botones de acción agrupados por tipo: "Cambiar fase" (1 botón → menú), "Comunicar" (WhatsApp/llamar), "Avanzado" (anular, reactivar). Hoy todos son botones igualmente prominentes.

### D. Inbox WhatsApp (`InboxConversacion.tsx` + `MensajeBubble.tsx`)

**Hoy:** lo más cuidado del software. Bubbles con indicador de lectura (check, doble check azul) bien resueltos. **Buen trabajo.**

**Qué cambiaría poco:**
- Las plantillas en `SelectorPlantillas.tsx` posiblemente se sienten genéricas. Solo verifiqué el archivo de bubbles.
- Mantener el sentido "WhatsApp-like" — eso le da confianza al usuario.

### E. Vista técnico móvil (`TecnicoVista.tsx`) — **CRÍTICA**, ver sección 5.

### F. HomePage pública (`HomePage.tsx`) — ver sección 6.

---

## 4. AI Slop detectado

Lista cruda. Esto grita "plantilla GPT 2024":

1. **Íconos coloreados sin semántica.** Lavadora azul, Nevera cyan, Estufa naranja, Microondas amarillo (`HomePage.tsx:14-22`). 7 colores que no enseñan nada al usuario.
2. **Cards iguales con colores diferentes.** Los 4 KPIs del Dashboard (`Dashboard.tsx:690-715`) son la misma estructura con 4 colores random (purple, green, amber, blue). Esto es **el patrón #1 de slop**.
3. **Emojis en el código.** `💰 Mis ganancias` (`TecnicoVista.tsx:833`), `👋` en saludos, `📅`, `⏸`, `🗺️`, `🔧`, `📍` salpicados. Los emojis no escalan ni son consistentes entre OS. Reemplazar por íconos lucide o quitar.
4. **`rounded-2xl` por todo lado.** Tarjetas, botones, modales, todo con `rounded-2xl` (16px). Cuando todo está redondeado igual, nada se destaca. Stripe usa `rounded-lg` (8px) para la mayoría, `rounded-2xl` solo para hero cards.
5. **Gradientes saturados.** `from-emerald-500 to-emerald-600`, `from-green-400 to-green-500`, `from-primary to-primary-medium`. Los gradientes están out desde 2022. Color sólido.
6. **CheckCircle verde y AlertTriangle naranja decorativos.** `Dashboard.tsx:864-868` muestra "Sin alertas activas" con un AlertTriangle gris al 30%. Decoración que no aporta — solo dice "ChatGPT diseñó esto".
7. **Hover-translate-y-1.** En las cards de servicios (`HomePage.tsx:191`) `hover:-translate-y-1`. Es el efecto "Bootstrap landing page 2018".
8. **Stats card del hero con número gigante** (`HomePage.tsx:107` `text-4xl font-extrabold`) repetido 4 veces. "16 años / 5,000+ servicios / 98% satisfacción / 24h respuesta". Si los números son inventados, eso huele a slop. Si son reales, **igual** se ve como template.
9. **`text-blue-300` para "Buenos días"** o subtítulos. Stripe-vibe sería gris neutro, no azul claro.

---

## 5. La pantalla del técnico en mobile (sección especial)

**Esto es lo más importante del negocio y hoy no está pensado para uso real en campo.**

Imagen mental: el técnico Pedro está en una casa, hace calor, tiene la lavadora abierta, una mano sostiene el celular, la otra una llave inglesa. Necesita en 2 segundos: **dónde está la próxima cita, cómo llegar, llamar al cliente**. Hoy lo que ve:

**Problemas concretos en `TecnicoVista.tsx`:**

1. **El saludo "Buenos días Pedro 👋" ocupa espacio premium arriba.** Línea 935. Eso debería ser el panel de info más pequeño abajo. Lo más arriba debería ser: **"Próxima cita en 25 min"** o **"Cliente Juan García, llegada en 12 min"**.

2. **Card de ganancias quincenales arriba de todo (línea 823).** Está bonita visualmente — pero Pedro está parado bajo el sol con la lavadora abierta. **Las ganancias no son lo primero**. Eso debería ser una pantalla `/ganancias` separada. Lo primero es la cita actual.

3. **`text-[10px]` y `text-[11px]` por todo lado.** Líneas 982-991, 1083, 1090, 1094. Esos tamaños son **ilegibles bajo el sol al aire libre**. Mínimo absoluto: 14px (text-sm).

4. **7 botones de acción amontonados en cada cita** (línea 1297-1410): Iniciar chequeo, Marcar realizado, Sugerir solo chequeo, Stand-by, Avisar oficina, Nota, Maps, GPS, WhatsApp. Pedro **no puede decidir cuál tocar** con prisa. Solución: **2 botones principales** (Cómo llegar + Marcar realizado) y un menú "Más" con el resto.

5. **El botón WhatsApp y el botón "Marcar Realizado" están al mismo nivel visual.** Verde uno y verde el otro. No hay jerarquía.

6. **Tabs "Hoy / Semana / Mes / Rango"** (línea 954) consumen una fila grande arriba. Probablemente Pedro solo usa "Hoy" 99% del tiempo. Mover los otros tabs a un menú colapsable.

7. **El mapa de ruta** (línea 1015) tiene 320px de alto. En un iPhone SE eso ocupa media pantalla. Debería ser un botón "Ver ruta en pantalla completa".

**Rediseño que recomiendo (mockup ASCII):**

```
┌─────────────────────┐
│ Logo  · Pedro  · 3 citas │ ← compacto
├─────────────────────┤
│  PRÓXIMA CITA       │ ← card grande
│  Juan García         │
│  10:30 AM (en 25 min)│
│  Lavadora LG         │
│  📍 Calle Duarte 45  │
│ [Cómo llegar GRANDE] │
│ [✓ Llegué]  [···]   │
├─────────────────────┤
│ Siguientes 2 →       │
└─────────────────────┘
```

---

## 6. La página de marketing pública (la cara del negocio)

**Es lo mejor que tiene el software.** Bien estructurada: hero con stats card, servicios en grilla, "cómo funciona" en 3 pasos, marcas, "por qué elegirnos", CTA final. Patrón de landing dominicana profesional.

**Pero todavía tiene cosas que delatan plantilla:**

1. **El badge "Garantía en cada servicio"** con escudo arriba es el primer thing que cualquier landing 2024 muestra. Genérico.

2. **Las stats** ("16 años · 5,000+ servicios · 98% satisfacción · 24h respuesta") son número-decoración. Mejor: **un testimonio real con foto**. Una señora dominicana sonriendo con su lavadora arreglada vende más que "98%".

3. **Las 4 cards "Por qué elegirnos"** (`HomePage.tsx:289-305`) con ícono brand + título + texto son **el patrón #1 de landing AI**. Sirven, pero podrías diferenciarte con un **video corto de 30s del técnico explicando el proceso**.

4. **El CTA final "¿Tiene un electrodoméstico que necesita reparación?"** es funcional pero genérico. Algo más humano: "¿Algo dejó de funcionar? Mandanos foto por WhatsApp y te decimos cuánto cuesta arreglarlo." — eso es dominicano real.

5. **Marcas en pills** (`HomePage.tsx:271-278`) está bien hecho. Mantener.

6. **Faltan testimonios reales** con foto del cliente. Es la prueba social #1 en RD.

7. **Botón verde WhatsApp + botón blanco Agendar.** Bien la jerarquía. Pero **el verde WhatsApp es más alto-contraste que el blanco** — visualmente "WhatsApp" gana. Quizás sea lo correcto para tu negocio dominicano (¿la gente prefiere WhatsApp que el form?). Confirmá con métricas reales.

**Veredicto público:** un 7/10 ya. Con testimonios + video + microcopy más dominicano llega a 9.

---

## 7. Roadmap de cambios por impacto (de mayor a menor)

| # | Cambio | Dónde | Esfuerzo | Impacto |
|---|---|---|---|---|
| 1 | **Rediseño vista técnico móvil completa** (1 cita gigante + Cómo llegar arriba + menú de acciones) | `TecnicoVista.tsx` | Grande | **Altísimo** |
| 2 | **Migrar colores hardcodeados `#0f3460` → tokens `brand-*`** | Todo el repo (find&replace) | Medio | Alto |
| 3 | **Reducir Dashboard a 3 secciones** ("Hoy", "Pipeline", "Plata") | `Dashboard.tsx` | Medio | Alto |
| 4 | **Botones del técnico mínimo 48px de alto + focus visibles** | `TecnicoVista.tsx`, global | Chico | Alto |
| 5 | **Eliminar `text-[10px]` y `text-[11px]`** del técnico | `TecnicoVista.tsx` | Chico | Alto |
| 6 | **Quitar colores random de íconos de servicios + cards** | `HomePage.tsx`, `Dashboard.tsx` | Chico | Medio |
| 7 | **Reemplazar `<LoadingSpinner />` por skeletons** | Dashboard, Ordenes | Medio | Medio |
| 8 | **Microcopy más dominicano** ("SLA" → "atrasadas", etc.) | Múltiples | Chico | Medio |
| 9 | **Empty states con ilustración + acción siguiente** | Global | Medio | Medio |
| 10 | **Testimonios reales + video** en HomePage | `HomePage.tsx` | Medio | Medio |
| 11 | **Quitar emojis del código** (reemplazar por íconos lucide o nada) | Global | Chico | Bajo |
| 12 | **Bajar saturación de gradientes** (verde, rojo) a colores sólidos | Múltiples | Chico | Bajo |
| 13 | **Definir escala tipográfica en `index.css` con `@apply`** | `index.css` | Chico | Bajo (largo plazo: alto) |

---

## 8. Lo que está bien — no romper

- **Paleta de marca en `tailwind.config.js`** (brand + accent inspirados en el logo). Bien pensada. El problema es que no se usa, no que esté mal.
- **Sidebar agrupado con secciones colapsables y badges de conteo** (`Sidebar.tsx`). La estructura es clara y el badge rojo de notificaciones es estándar y funciona.
- **Border-left de color por estado en `OrdenCard`** (`estadoSimpleBorder`). Patrón Linear-like, mantenerlo.
- **MensajeBubble del inbox** (`MensajeBubble.tsx`). El sistema de check/doble-check/azul es WhatsApp-native y los usuarios lo entienden de una.
- **HomePage estructura** (hero / servicios / cómo funciona / marcas / por qué / CTA). La narrativa de página pública está bien resuelta. Solo necesita pulir colores y agregar pruebas sociales reales.
- **Tabs de período en Dashboard** ("Hoy / Semana / Mes / Año" en `Dashboard.tsx:915`). El pattern de tabs como filtro es correcto.
- **Toast custom con acciones inline para "Programar próximo mantenimiento"** en `CierreServicioWizard.tsx:75`. Eso es UX bueno: ofrecer la siguiente acción en el momento correcto, en lugar de dejarla huérfana.
- **Sistema de permisos granular** que oculta items del sidebar y botones según rol. Es el tipo de detalle invisible que evita que los técnicos vean cosas que no deben.

---

## Cierre

El software tiene huesos sólidos pero le falta capa de diseño. La marca está definida pero no aplicada. El técnico móvil — que es la herramienta de mayor uso diario — es la más descuidada. **Tres semanas de un diseñador (no developer, diseñador) lo llevarían de 5/10 a 8/10.** Y la página pública con un par de mejoras llega a 9.

---

## Cómo seguir (próximos pasos)

Tres opciones, vos elegís:

**A. Rediseño en fases**, empezando por el dolor más alto (vista técnico móvil). Cowork escribe el sprint con touch-list + mockup en docs, y el coordinator autónomo lo ejecuta. Riesgo medio, valor altísimo.

**B. Ver primero la versión visual real** corriendo gstack `/design-review` en Claude Code sobre producción. Eso abre el browser y compara con lo que veo acá. Confirma o desmiente. Le toma ~5 min, gratis.

**C. Solo migrar los colores hardcodeados** (cambio #2 del roadmap, esfuerzo medio, alto valor). Es la base para que cualquier rediseño futuro sea fácil.

Decime cuál y arrancamos.
