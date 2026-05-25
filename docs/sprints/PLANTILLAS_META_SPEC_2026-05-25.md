# Especificación REAL de las plantillas de Meta (capturas de Jorge, 2026-05-25)

> **Fuente de verdad.** Estructura exacta de cada plantilla aprobada en el Administrador de WhatsApp (WABA `1666941167686824`, business `103664415995101`), leída de las capturas de Jorge. El catálogo del app (`src/config/plantillasWhatsApp.ts`) está DESFASADO de esto → por eso los envíos fallan (errores #132000 / #132012 / #131008).
>
> **Causa raíz:** las plantillas se rediseñaron en Meta el ~15 may 2026 (se les agregó **encabezado de IMAGEN** y cambiaron variables), pero el app sigue mandando la versión anterior (sin imagen y/o con otra cantidad de variables).

## Estructura exacta por plantilla

| Plantilla | Categoría | Encabezado | Variables del cuerpo (en orden) | Pie de página |
|---|---|---|---|---|
| `auto_respuesta_fuera_horario` | Marketing | **Ninguno** | `{{1}}` Nombre | — |
| `cita_confirmada` | Utilidad | **IMAGEN** ("AGENDA TU CITA") | `{{1}}` Nombre · `{{2}}` Día · `{{3}}` Hora · `{{4}}` Técnico · `{{5}}` Dirección | Mister Service · Reparación de electrodomésticos |
| `conduce_emitido` | Utilidad | **IMAGEN** (técnico) | `{{1}}` Nombre · `{{2}}` # conduce (ej. CG-00019) · `{{3}}` días de garantía · `{{4}}` enlace | idem |
| `garantia_por_vencer` | Utilidad | **IMAGEN** ("VIGENCIA DE GARANTÍA") | `{{1}}` Nombre · `{{2}}` fecha de vencimiento · `{{3}}` equipo · `{{4}}` # orden · `{{5}}` enlace | idem |
| `recordatorio_mantenimiento` | Marketing | **IMAGEN** (técnico) | `{{1}}` Nombre · `{{2}}` # meses · `{{3}}` equipo | idem |

### Textos del cuerpo (verbatim, para mapear variables)

- **auto_respuesta_fuera_horario:** "Hola {{1}}, gracias por escribir a Mister Service RD. Nuestro horario de atención es lunes a sábado de 8:00 AM a 6:00 PM. Te respondemos en cuanto abramos. Si es urgente, llamanos al 849-564-6767."
- **cita_confirmada:** "Hola {{1}}, su cita con Mister Service RD está confirmada.\nDía: {{2}}\nHora: {{3}}\nTécnico asignado: {{4}}\nDirección: {{5}}\nSi necesita reagendar responda este mensaje..."
- **conduce_emitido:** "Hola {{1}}, su conduce {{2}} de Mister Service RD está listo. Su garantía cubre {{3}} días.\nConsulte el estado o reporte cualquier inconveniente en este enlace: {{4}}\nGracias por confiar en nosotros."
- **garantia_por_vencer:** "Hola {{1}}, le recordamos que la garantía de su servicio con Mister Service RD vence el {{2}}.\nEquipo: {{3}}\nNo. de orden: {{4}}\nConsulte los detalles de su garantía en este enlace: {{5}}"
- **recordatorio_mantenimiento:** "Hola {{1}}, le saluda Mister Service RD. Hace {{2}} meses que reparamos su {{3}}.\nEs momento de un mantenimiento preventivo... ¿Le agendamos una visita esta semana?\nResponda SI para coordinar o NO si prefiere que le contactemos más adelante."

## Qué manda hoy el app (y por qué falla) — de los errores reales del outbox

- **`recordatorio_mantenimiento`** → el modal del app pide solo **2 datos** (Nombre + "Fecha del último servicio") y NO manda imagen. Meta espera **3 variables** (Nombre, # meses, equipo) **+ encabezado de IMAGEN**. → error **#132000** (params 2≠3). **Doble error:** faltan variables Y falta la imagen.
- **`cita_confirmada`** → el app manda cuerpo pero **sin el encabezado de IMAGEN** → error **#132012** ("expected IMAGE, received UNKNOWN"); en otra variante faltó un texto → **#131008**. (Una sí entregó/leyó cuando los datos coincidieron, pero sin imagen igual debería fallar — confirmar.)
- Las **4 plantillas con imagen** (`cita_confirmada`, `conduce_emitido`, `garantia_por_vencer`, `recordatorio_mantenimiento`) necesitan que el app mande el **componente header de tipo image** con una URL pública de la imagen.

## Plan de arreglo (sprint `SPRINT-WA-FIX-PLANTILLAS-PARAMS`)

1. **Actualizar `src/config/plantillasWhatsApp.ts`** para que cada plantilla declare exactamente las variables de la tabla de arriba (cantidad + orden + etiquetas legibles para el mini-wizard) y marque cuáles llevan **encabezado de imagen**.
2. **Actualizar el armado del payload en `api/whatsapp/send.ts`** para incluir el componente `header` de tipo `image` (con `link`) en las 4 plantillas con imagen. **Toca el endpoint público `api/` → requiere OK de Jorge.**
3. **Hospedar las 5 imágenes de encabezado** (los diseños branded: AGENDA TU CITA, VIGENCIA DE GARANTÍA, técnico, etc.) en una URL pública estable (Firebase Storage público o CDN) y configurar la URL por plantilla. **Pendiente:** Jorge debe pasar los archivos de imagen, o confirmar de dónde se toman.
4. **Ajustar el mini-wizard del inbox** (`SelectorPlantillas` / modal de variables) para pedir los datos correctos por plantilla (ej. recordatorio: Nombre + # meses + equipo, no "fecha del último servicio").
5. **QA:** enviar cada plantilla a un número de prueba y confirmar ✓✓ (entregado), no ⚠️.

---

## ⚠️ CORRECCIÓN IMPORTANTE (Cowork, 2026-05-25, tras leer el código real)

Al leer `api/whatsapp/send.ts` línea por línea, **el plan de arriba estaba parcialmente equivocado**. El endpoint **YA soporta** encabezado de imagen y botones desde SPRINT-WA-2-HEADER-IMAGE (2026-05-19) y SPRINT-WA-2-BUTTON-URL (2026-05-20). Esto **reduce el alcance del fix a SOLO FRONTEND**:

- **`construirPayloadMeta` (send.ts ~L295-341) SIEMPRE agrega un componente `header` de tipo `image`** a toda plantilla. Si el caller pasa `plantilla.headerImageUrl` (https) la usa; si no, cae a `DEFAULT_HEADER_IMAGE_URL = https://www.misterservicerd.com/logo-full.png` (el logo genérico). → **El paso 2 del plan original ya está hecho. NO hay que tocar `send.ts` ni escalar a OK de Jorge por el endpoint.**
- **El problema real es doble y vive en el frontend:**
  1. **El catálogo `plantillasWhatsApp.ts` tiene las variables mal** (cantidad/orden/significado) → causa #132000 en `recordatorio` (2≠3) y contenido en slots equivocados en las otras. **Esta es la causa dura.**
  2. **El frontend nunca pasa la imagen branded.** `enviarPlantilla` (`src/services/whatsapp.service.ts` ~L187) arma `plantilla: { nombre, idioma, variables }` **sin `headerImageUrl`** → send.ts siempre manda el logo genérico, nunca el banner "AGENDA TU CITA" / "VIGENCIA DE GARANTÍA". Cosmético, no es un fallo duro, pero hay que conectarlo.
- **Imágenes:** ya colocadas por Cowork en `public/plantillas/` (se sirven en `https://www.misterservicerd.com/plantillas/<archivo>.png`). NO hace falta Firebase Storage. Mapeo final: `cita_confirmada.png`=AGENDA TU CITA · `garantia_por_vencer.png`=VIGENCIA DE GARANTÍA · `recordatorio_mantenimiento.png`=foto técnico (16:9) · `conduce_emitido.png`=íconos de electrodomésticos.
- **`auto_respuesta_fuera_horario`** (sin encabezado + botón URL estático) NO se envía por el selector del inbox (es auto-reply del webhook). Queda **fuera de este sprint**; follow-up aparte si el webhook le agrega header de imagen indebido (eso sí tocaría `api/whatsapp/webhook.ts` → escalaría).
- **Recategorización de `recordatorio` a Marketing:** la categoría es propiedad de la plantilla EN Meta, no se manda en el payload → **no requiere cambio de código**. `send.ts` ya chequea `optOutMarketing` para TODOS los envíos. Solo respetar la regla anti-bloqueo de Jorge (1 recordatorio automático + resto manual) a nivel de proceso.

**Conclusión:** el fix es **frontend-only** (`plantillasWhatsApp.ts` + `whatsapp.service.ts` + `SelectorPlantillas.tsx`), **autónomo** — NO toca `api/`, ni `firestore.rules`, ni `storage.rules`, ni migra datos.

**Decisión de fondo:** mantener los diseños nuevos con imagen (Path A, recomendado) y alinear el app — NO revertir las plantillas de Meta a texto plano.

**Cazador candidato:** validar que el nº de variables que el app manda por plantilla == el nº declarado en un snapshot de las plantillas Meta (este archivo).

---

## Verificación independiente (Claude in Chrome, 2026-05-25) — CONFIRMA el spec + 2 hallazgos nuevos

Un segundo agente (Claude in Chrome, logueado en Meta) revisó las 5 plantillas y **coincide 1:1** con la tabla de arriba (1 / 5 / 5 / 3 / 4 variables; las 4 con imagen excepto `auto_respuesta_fuera_horario`). Las 5 están **"Activa: calidad pendiente"** → todas enviables (ninguna rechazada/pausada). Hallazgos extra a incorporar al sprint:

1. **`recordatorio_mantenimiento` fue RECATEGORIZADA por Meta de Utilidad → Marketing** (hay 60 días para apelar). Implicación: si el app la envía por API marcándola como `utility`, Meta ya la trata como `marketing` (cambia cobro + reglas de opt-in). El fix debe enviarla con la categoría correcta (marketing) y respetar la regla anti-bloqueo de Jorge (1 recordatorio automático + resto manual).
2. **`auto_respuesta_fuera_horario` tiene un BOTÓN URL** "Agendar cita" → `https://www.misterservicerd.com/agendar` (URL estática, sin variable). El fix debe incluir el componente de botón si el app arma esa plantilla. (Las otras 4 NO tienen botones.)
3. **Nota de cuenta:** las plantillas viven bajo el asset/WABA `1884486412326904` ("Mister service República Dominicana"). Verificar que el `phone_number_id` que usa el app pertenece a ESE WABA (si el número y la plantilla están en WABAs distintos, también falla). Como un `cita_confirmada` sí entregó, probablemente alinean — pero confirmar.

**Las imágenes de encabezado** son PNG/JPG estáticos branded (AGENDA TU CITA, VIGENCIA DE GARANTÍA, técnico). Para enviarlas por API el app debe pasar un `link` público (o media id) en el componente `header.image`. → Jorge debe proveer los 4 archivos para hospedarlos (Firebase Storage público), o confirmar URLs existentes.

---

## El catálogo del app HOY (`src/config/plantillasWhatsApp.ts`) — leído 2026-05-25, CONFIRMA el desfase

Cowork revisó el admin (no hay config de plantillas/imágenes ahí — está en código) Y el código. El catálogo está desfasado de Meta:

| Plantilla | App manda hoy (vars, en orden) | Meta REAL espera | Veredicto |
|---|---|---|---|
| `cita_confirmada` | 5: nombre, **fecha+hora (junta)**, **# orden**, técnico, **notas** — SIN imagen | 5: nombre, **día**, **hora**, técnico, **dirección** + IMAGEN | Cuenta 5=5 pero **el significado de {{2}}..{{5}} está cambiado** + falta imagen → #132012 |
| `conduce_emitido` | 3: nombre, # conduce, **monto total** — SIN imagen | 4: nombre, # conduce, **días garantía**, **enlace** + IMAGEN | App manda 3, Meta 5... digo 4; var equivocada (monto) + falta imagen |
| `recordatorio_mantenimiento` | 2: nombre, **fecha último servicio** — SIN imagen | 3: nombre, **# meses**, **equipo** + IMAGEN | App 2 ≠ Meta 3 → #132000; vars equivocadas + falta imagen |
| `garantia_por_vencer` | 3: nombre, # orden, fecha venc — SIN imagen | 5: nombre, fecha venc, **equipo**, # orden, **enlace** + IMAGEN | App 3 ≠ Meta 5; orden distinto + falta imagen |
| `auto_respuesta_fuera_horario` | **NO existe en el catálogo del app** | 1: nombre + botón URL | Falta agregarla |

**Conclusión:** el catálogo es de ANTES del rediseño de Meta (15 may). NINGUNA plantilla manda la imagen, y 4 de 5 tienen variables mal. El tipo `PlantillaCatalogo` ni siquiera tiene campo para "encabezado de imagen" → hay que extender el tipo.

**Imágenes:** NO están ni en el admin ni en el código (no hay URLs de imagen en ningún lado). → Jorge debe proveer los 4 archivos.

**Mapeo de autopopulado sugerido para el fix** (el builder lo afina):
- `cita_confirmada`: nombre=cliente.nombrePrimero · día=parte fecha de `orden.fechaCita` · hora=parte hora de `orden.fechaCita` · técnico=orden.tecnicoNombre · dirección=cliente.direccion.
- `conduce_emitido`: nombre · # conduce=factura.numero/manual · días garantía=`periodoGarantiaDias` (default 60) · enlace=URL del portal de garantía (token).
- `recordatorio_mantenimiento`: nombre · # meses=manual/calculado desde fechaCierre · equipo=orden.equipoTipo.
- `garantia_por_vencer`: nombre · fecha venc=`garantiaVencimiento` · equipo=orden.equipoTipo · # orden=orden.numero · enlace=URL portal garantía.
