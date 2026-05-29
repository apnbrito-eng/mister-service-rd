# 📱 Rediseño de la vista del técnico (móvil) — Spec

> **Para:** coordinator + builder autónomos.
> **Origen:** auditoría de diseño senior (`docs/AUDITORIA_DISENO_SENIOR_2026-05-29.md`), pantalla con nota **3/10**, la más crítica del negocio.
> **Decisión Jorge:** 2026-05-29 — "vamos con A" (rediseño en fases).
> **Archivo único:** `src/pages/TecnicoVista.tsx` (1,722 líneas, monolítico, sin componentes hijos en `src/components/tecnico/`).
> **Ruta:** `/tecnico` (definida en `App.tsx:47/224`).

---

## 1. Por qué importa

El técnico en campo (Pedro, Aury, etc.) usa esta pantalla **todos los días, parado en una casa de un cliente con una mano libre, bajo el sol, con la lavadora abierta**. Cada segundo de fricción es un costo real del negocio. Hoy esta pantalla tiene:

- Textos a 10-11 píxeles (`text-[10px]`, `text-[11px]`) → ilegibles bajo el sol.
- Saludo "Buenos días Pedro" arriba del fold → ocupa espacio donde debería estar la próxima cita.
- Card "Mis ganancias quincenales" arriba de todo → no es lo primero que el técnico necesita ver con la lavadora abierta.
- 7+ botones de acción amontonados por cada cita sin jerarquía → no sabe cuál tocar primero.
- Mapa de 320px de alto consumiendo media pantalla del iPhone SE.

**Objetivo:** llevar la pantalla de nota **3/10 → 7/10** en 4 fases pequeñas (~1 semana de implementación), cada una con QA de Jorge antes de pasar a la siguiente.

---

## 2. Estado actual — handlers que NO se pueden romper

El rediseño cambia **presentación**, NO lógica. Estos 11 handlers + 11 onClick inline deben seguir funcionando exactamente igual:

| Handler / acción | Línea actual | Lo que hace |
|---|---|---|
| `openCompletar` | 416 | Abre modal de "Marcar realizado / Iniciar chequeo" |
| `openNota` | 421 | Abre modal de agregar nota |
| `handleAgregarNota` | 428 | Persiste la nota en Firestore + notifica |
| `handleLogout` | 580 | Cierra sesión |
| `handleConfirmarAviso` | 590 | Confirma "avisar oficina" |
| `abrirSugerirChequeo` | 627 | Modal "sugerir solo chequeo" |
| `abrirStandby` | 637 | Modal stand-by de piezas |
| `handleConfirmarStandby` | 649 | Confirma stand-by |
| `handleReactivarOrden` | 694 | Reactiva orden cancelada |
| `handleCapturarGpsOrden` | 722 | Captura coordenadas GPS de la orden |
| `handleAplicarRango` | 330 | Aplica filtro de rango de fechas |

Plus selectores de vista (`setVista('hoy'|'semana'|'mes'|'rango')` líneas 957-973), toggle del mapa (`setShowMap`), selección de orden para modal de detalle (`setSelectedOrden`), badge de nueva cita.

**Permisos por rol:** algunos botones se muestran solo si el rol es técnico (vs ayudante). Esa lógica condicional vive intacta.

---

## 3. Diseño objetivo (mockup)

### Hoy se ve así:

```
┌──────────────────────────────┐
│ [Logo] [✉] [🗺] [👤 Logout]    │
├──────────────────────────────┤
│ ☀ Buenos días Pedro 👋        │ ← saludo grande
│ ┌──────────────────────────┐ │
│ │ 💰 Mis ganancias          │ │ ← ocupa premium
│ │ RD$ 12,500 (quincena)     │ │
│ │ Detalle ▼                  │ │
│ └──────────────────────────┘ │
├──────────────────────────────┤
│ [Hoy] [Semana] [Mes] [Rango] │ ← tabs grandes
├──────────────────────────────┤
│ [Mapa de ruta — 320px]       │ ← media pantalla
├──────────────────────────────┤
│ ┌──────────────────────────┐ │
│ │ Cita #1 — Juan García     │ │
│ │ 10:30 — Lavadora LG       │ │
│ │ Calle Duarte 45           │ │
│ │ [Iniciar] [Sug.Chq.] [Stby]│ │ ← 7 botones
│ │ [Avisar] [Nota] [GPS] [WA]│ │ amontonados
│ └──────────────────────────┘ │
└──────────────────────────────┘
```

### Cómo debería verse (objetivo final F1+F2+F3):

```
┌──────────────────────────────┐
│ [Logo] Pedro · 3 citas hoy   │ ← compacto (1 línea)
├──────────────────────────────┤
│ ── PRÓXIMA CITA ──            │ ← TAG, no card decorativa
│                                │
│ Juan García                    │ ← text-xl bold
│ 10:30 AM · en 25 min           │ ← text-sm gray
│ Lavadora LG · 4 años           │
│ 📍 Calle Duarte 45              │
│                                │
│ ┌──────────────────────────┐ │
│ │   CÓMO LLEGAR (Maps)     │ │ ← btn primario, alto 56px
│ └──────────────────────────┘ │
│ ┌──────────┐ ┌──────────┐    │
│ │ ✓ Llegué │ │ Más  ▾   │    │ ← btn secundario + menú
│ └──────────┘ └──────────┘    │
│                                │
│ Menú "Más" colapsable:         │
│   · Iniciar chequeo            │
│   · Sugerir solo chequeo       │
│   · Stand-by piezas            │
│   · Avisar oficina             │
│   · Agregar nota               │
│   · WhatsApp cliente           │
│   · Capturar GPS               │
├──────────────────────────────┤
│ Siguientes 2 citas →           │ ← scroll horizontal
│ [10:30 Juan][14:00 María]     │
├──────────────────────────────┤
│ Ganancias quincena: RD$ 12,500 │ ← compacto, abajo
│ Ver detalle ▼                  │
├──────────────────────────────┤
│ [Hoy] · Semana · Mes · Rango  │ ← tab activo, resto pequeño
└──────────────────────────────┘
```

**Principios del rediseño:**
1. **Lo más importante en la primera pantalla.** La cita actual es lo primero, no el saludo ni las ganancias.
2. **Un solo botón primario por sección.** "Cómo llegar" es el más grande. "Llegué" es el secundario. Todo lo demás va al menú "Más".
3. **Botones mínimo 48px de alto.** Texto mínimo 14px.
4. **Sin emojis decorativos en el código.** Solo el emoji 📍 del location pin (claro y universal).
5. **Sin gradientes saturados.** Color sólido de marca.
6. **El mapa va detrás del botón "Cómo llegar"**, no consumiendo 320px arriba.

---

## 4. Fases del rediseño

### 🟢 FASE 1 — Jerarquía visual (segura, sin tocar handlers)

**Objetivo:** reordenar componentes para que lo importante esté arriba. NO cambia ningún handler, ninguna lógica, ningún permiso. Solo reordena bloques.

**Cambios concretos en `TecnicoVista.tsx`:**

1. **Mover el saludo "Buenos días Pedro 👋"** (~línea 935) → arriba a la **misma fila** que el logo y los botones del header. Una sola línea: `[Logo] Pedro · 3 citas hoy`.

2. **Mover la card "Mis ganancias quincenales"** (~línea 823) desde arriba → abajo del listado de citas. Compactarla a 1 línea con "Ver detalle ▼" expandible.

3. **Etiquetar la primera cita como "PRÓXIMA CITA"** (text small uppercase, color brand) ANTES de su card. Las demás siguen como están.

4. **Mover los tabs "Hoy / Semana / Mes / Rango"** (línea 954) → al final de la pantalla como filtro, no arriba del listado. El default sigue siendo "Hoy".

5. **Cambiar el mapa** (línea 1015): por defecto **colapsado** (no visible). Botón "Ver ruta del día" que lo expande.

**Touch-list (Fase 1):**
- `src/pages/TecnicoVista.tsx` (único archivo). Reordenar bloques JSX en el `return`. Lógica de hooks intacta.

**NO toca:**
- Ningún `handle*`.
- Ningún componente importado.
- Ningún permiso por rol.
- Ningún tipo / interface.
- Ninguna llamada a Firestore.

**Criterio de éxito F1:**
- La pantalla del técnico ahora muestra arriba: header compacto + "PRÓXIMA CITA" + datos de la primera cita.
- Las ganancias y el filtro de período están abajo, accesibles pero no compitiendo.
- TODOS los botones siguen funcionando como antes (Iniciar, Stand-by, Avisar, Nota, GPS, WhatsApp).
- Cazadores + typecheck + lint PASS.
- **QA Jorge:** abrir `/tecnico` desde un celular real, confirmar que la próxima cita se ve primero. Probar 2-3 botones de acción (Stand-by, Nota) — siguen funcionando.

**Riesgo:** BAJO. Solo composición de JSX.

---

### 🟡 FASE 2 — Accesibilidad táctil (técnico-crítica, sin tocar handlers)

**Objetivo:** que los textos se lean bajo el sol y los botones se puedan tocar con dedos sudados.

**Cambios concretos en `TecnicoVista.tsx`:**

1. **Eliminar todos los `text-[10px]` y `text-[11px]`** (líneas 982-991, 1083, 1090, 1094 y donde aparezcan). Mínimo `text-xs` (12px) para metadatos. Datos importantes (cliente, hora, dirección): `text-sm` (14px) o `text-base` (16px).

2. **Eliminar `opacity-75` y `opacity-90`** en texto. Si querés baja jerarquía, usar `text-gray-500` (mantiene contraste).

3. **Todos los botones de acción mínimo 48px de alto.** Cambiar `px-3 py-2 text-xs` → `px-4 py-3 text-sm` en los botones por cita.

4. **Agregar focus rings visibles** a todos los botones: `focus:ring-2 focus:ring-brand-500 focus:ring-offset-2`. Idealmente vía `@apply` en `src/index.css` para que afecte todos los botones de la app, pero si es muy grande limitarlo a este archivo.

5. **Border-left de color por estado de orden** (preservar el patrón Linear-like que ya tenés en `OrdenCard`).

**Touch-list (Fase 2):**
- `src/pages/TecnicoVista.tsx` (cambios de clase Tailwind).
- Opcional: `src/index.css` (definir focus ring global).

**NO toca:** handlers, lógica, componentes externos.

**Criterio de éxito F2:**
- Ningún texto por debajo de 12px en la pantalla del técnico.
- Botones miden ≥48px en alto.
- Focus visible al hacer Tab.
- Cazadores + typecheck + lint PASS.
- **QA Jorge:** abrir `/tecnico` desde un iPhone SE (la pantalla más chica), confirmar legibilidad de textos. Hacer Tab por los botones y ver el focus ring.

**Riesgo:** BAJO. Solo clases CSS.

---

### 🟠 FASE 3 — Reorganización de acciones (cambia comportamiento UX, no lógica)

**Objetivo:** que el técnico vea **2 botones primarios** ("Cómo llegar" + "Llegué"/"Iniciar chequeo") en lugar de los 7+ amontonados. El resto va a un menú "Más" colapsable.

**Cambios concretos en `TecnicoVista.tsx`:**

1. **Por cada cita,** los 7 botones (líneas 1267-1404) se agrupan así:

   **Botón primario (grande, alto 56px, brand-700):**
   - "Cómo llegar" → abre Maps con la dirección (handler nuevo o existente — verificar `handleCapturarGpsOrden` o usar `window.open(google.com/maps...)`).

   **Botones secundarios (alto 48px, lado a lado):**
   - "✓ Llegué" o "Iniciar chequeo" según la fase actual de la orden (handler: `openCompletar`).
   - "Más" ▾ (abre menú).

   **Menú "Más" colapsable (Sheet/Drawer o Popover):**
   - Sugerir solo chequeo (`abrirSugerirChequeo`)
   - Stand-by piezas (`abrirStandby`)
   - Avisar oficina (`setOrdenAvisar`)
   - Agregar nota (`openNota`)
   - WhatsApp cliente (handler existente, verificar línea ~1390)
   - Capturar GPS (`handleCapturarGpsOrden`)
   - Reactivar (solo si la orden está cancelada — `handleReactivarOrden`)

2. **El botón de "Ver detalle"** (`setSelectedOrden`) se activa **tocando la card completa** (no un botón separado).

3. **Mantener visualmente el banner de "Siguiente paso"** (`BannerSiguientePaso` o `FaseStepper` si aparece — verificar línea ~1187-1230).

**Touch-list (Fase 3):**
- `src/pages/TecnicoVista.tsx` (refactor del bloque de botones por cita).
- Opcional crear: `src/components/tecnico/AccionesCita.tsx` (extraer el bloque a un componente — recomendado para que no crezca más el monolito).

**NO toca:**
- Ningún handler (todos los `openXxx`, `abrirXxx`, `handleXxx` siguen iguales).
- Permisos por rol.

**Criterio de éxito F3:**
- Cada cita muestra 1 botón primario gigante ("Cómo llegar") + 2 secundarios (Llegué + Más).
- El menú "Más" abre y todos los handlers funcionan idéntico a antes.
- Mantener accesibilidad de F2 (focus, tamaños).
- Cazadores + typecheck + lint PASS.
- **QA Jorge + 1 técnico real (Pedro o Aury):** probar 1 día completo. Confirmar que es más rápido tocar el botón correcto. **Si el técnico real lo rechaza, revertir.**

**Riesgo:** MEDIO. Cambia el hábito del técnico. Por eso QA con técnico real obligatorio.

---

### 🟣 FASE 4 — Limpieza estética (último paso, opcional)

**Objetivo:** quitar el "AI slop look" restante.

**Cambios:**
1. Quitar gradientes saturados (`from-green-400 to-green-500`, etc.) — color sólido brand.
2. Reemplazar emojis del código (💰, 👋, 📅, ⏸, 🗺️, 🔧) por íconos lucide-react.
3. `<LoadingSpinner />` → skeleton (rectángulos grises animados con `animate-pulse`).
4. `rounded-2xl` → `rounded-lg` excepto en hero cards.
5. Compactar las "stats card" decorativas que no aportan info crítica.

**Touch-list (Fase 4):**
- `src/pages/TecnicoVista.tsx`.

**Riesgo:** BAJO-MEDIO. Solo estética.

**QA Jorge:** comparar pantalla antes/después. Verificar que se ve "menos plantilla".

---

## 5. Restricciones duras (NO romper en NINGUNA fase)

1. **Todos los 11 handlers nombrados arriba siguen ahí y siguen funcionando.** Si un handler cambia, justificar explícitamente en el commit message.
2. **Permisos por rol intactos.** Los botones que aparecen solo para técnicos (vs ayudantes) siguen iguales.
3. **Cazadores P-001..P-024 PASS** en cada commit.
4. **Sin cambios a Firestore rules.**
5. **Sin cambios a endpoints `api/`.**
6. **Sin cambios a tipos `OrdenServicio`, `Cliente`, `Personal`.**
7. **Mantener funcionalidad de:** notificaciones de nueva cita, badge de cita nueva, listado de órdenes histórico (vista "semana"/"mes"/"rango"), filtro por rango personalizado, captura de GPS, integración con módulo de chequeo (banner siguiente paso, fase stepper).
8. **El componente `BannerSiguientePaso`** (si se usa) sigue mostrándose donde corresponda.

---

## 6. QA por fase — checklist concreto

Jorge debe ejecutar este checklist en cada cierre de fase. **Si algo falla, revertir antes de pasar a la siguiente fase.**

### Checklist Fase 1 (5 min)
- [ ] Abrir `/tecnico` desde un celular real (iPhone SE o Android chico).
- [ ] La "próxima cita" se ve en la primera pantalla, sin scroll.
- [ ] El saludo "Pedro · 3 citas hoy" está arriba en una sola línea compacta.
- [ ] La card de ganancias está abajo, no arriba.
- [ ] El mapa está colapsado por defecto. Hay botón para verlo.
- [ ] Probar 3 botones de acción (Stand-by + Nota + Avisar oficina) — todos abren su modal y guardan.
- [ ] Los tabs "Hoy/Semana/Mes" siguen filtrando bien.

### Checklist Fase 2 (5 min)
- [ ] Ningún texto se ve más chico que un mensaje de WhatsApp normal.
- [ ] Botones se tocan fácil con el dedo (no necesitás precisión).
- [ ] Hacer Tab por la pantalla — todos los botones muestran outline azul al recibir foco.
- [ ] Probar bajo luz natural / luz fuerte — todo se lee.

### Checklist Fase 3 (15 min + 1 día con técnico real)
- [ ] Cada cita muestra "Cómo llegar" como botón grande arriba.
- [ ] El botón "Llegué" o "Iniciar chequeo" cambia según el estado de la orden.
- [ ] Tocar "Más" abre menú con: Sug. Chequeo, Stand-by, Avisar oficina, Nota, WhatsApp, GPS.
- [ ] Cada opción del menú abre su modal y persiste igual que antes.
- [ ] Tocar la card (fuera de los botones) abre el detalle de la orden.
- [ ] **Pedro / Aury usaron la pantalla nueva durante 1 día y dicen que es más rápida (o igual). Si dicen que es peor, revertir.**

### Checklist Fase 4 (3 min)
- [ ] Sin emojis 💰 👋 📅 ⏸ en el código.
- [ ] Skeleton al cargar en lugar de spinner.
- [ ] Sin gradientes saturados.

---

## 7. Métricas de éxito (cómo sabemos que funcionó)

Si tenés tracking de uso (hoy no lo tenés según el plan integrado de gstack, pero a futuro):

- **Tiempo desde abrir `/tecnico` hasta tocar primer botón:** bajar de X→Y.
- **% de técnicos que tocan "Cómo llegar"** en lugar de copiar dirección manual: subir.
- **Errores de tocar botón equivocado** (acción inversa o ESC): bajar.

Por ahora, métrica cualitativa: **¿Pedro y Aury dicen que es más rápida la nueva pantalla?** Si sí, éxito.

---

## 8. Cómo se procesa esto en la cola autónoma

**Solo se encola FASE 1 en `COLA_AUTONOMA.md` hoy.** Las fases 2-4 quedan documentadas en este spec pero NO en la cola hasta que Jorge:
- Aprueba la FASE 1 (QA visual).
- Decide si quiere seguir, ajustar, o parar.

Esto respeta la disciplina anti-bucle: cada fase con QA Jorge antes de la siguiente. Sin esto, el rediseño completo en una pasada sería: alto riesgo + cambios grandes simultáneos + sin tiempo de detectar problemas.
