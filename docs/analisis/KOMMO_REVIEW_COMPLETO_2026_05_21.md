# Review completo de Kommo (módulo por módulo, con modelo de datos) — 2026-05-21

**Autor:** Cowork (vía Playwright sobre Kommo logueado + 3 subagentes)
**Método:** A diferencia del primer análisis (visual, con screenshots), este usa los **snapshots de texto + las llamadas de red reales** de Kommo, así que documenta el **modelo de datos** detrás de cada UI, no solo lo que se ve. Sin integraciones (no se replican).

**¿Playwright agregó valor vs la primera vez?** Sí, concreto: capturé los shapes reales de las APIs (modelo de `talks`, embeds del lead, modelo de etapa, catálogo de acciones del AI agent, campos UTM). Eso es más profundo que el recorrido visual. Para re-confirmar el overview el valor fue bajo; para el modelo de datos fue alto.

Cuenta: `Misterservicerd` (id 32519327), DO, RD$, español, 1 usuario activo (jorge, Administrador).

---

## Módulo por módulo

### 1. Leads / Pipeline
- **22 pipelines** (1 principal "Embudo de ventas" `is_main:true` + 20 uno-por-canal/agente + "Formulario Meta" + "TEST-CLAUDE"). Fragmentación = deuda organizacional, NO replicar.
- **Modelo de etapa (`status`):** `id, name, sort, color (hex), type (1=entrante, 0=normal), is_editable, pipeline_id`. 2 fijas no editables por pipeline: `Leads ganados` (142), `Leads perdidos` (143).
- **Tarjeta de lead:** nombre/`Lead #id`, `price` (RD$), responsable, tags, canal origen, fecha.
- **Copiar:** UN pipeline con estados mapeados a `OrdenServicio.fase` (ya existe). El `color` por etapa es buena UX de board. Evitar el anti-patrón de un embudo por agente.

### 2. Lead detail
- **Layout 3 columnas:** izq = datos (tags, embudo+etapa, campo **`Próxima cita`** tipo `date_time`, contacto, compañía); centro = **feed unificado** (notas + tareas + mensajes WA/IG/FB + cambios de responsable + Salesbot inline); der = Copilot IA "Resumen del lead".
- **Embeds del lead (API):** `tags, catalog_elements (productos), loss_reason, companies, contacts`.
- **Custom fields del lead:** 12 de tracking/UTM + `Próxima cita`. (Contacto: solo Position/Phone/Email.)
- **Tags como asignación informal:** `Pendiente, ⏳, laura, wilainny, laisa`.
- **Copiar (ALTO):** el **feed unificado por orden** (timeline de notas + mensajes + cambios de estado + tareas en un solo hilo) — es exactamente lo que falta en la vista de orden de Mister Service. + `Próxima cita` denormalizada en la tarjeta.

### 3. Chats / Inbox (`/ajax/v4/inbox/list`)
- Lista de "talks" ordenada por `last_message_at`. 5 filtros de fábrica: Chats abiertos, **Sin respuesta**, Asignado a mí, Suscrito, Destacados.
- **Modelo `talks[]`:** `id, status (opened/closed), is_read, emotion, last_message {text, author, last_message_at_msec, profile_avatar}, chat_source ("waba"), contact_id/contact, entity {type, id, title, status_id, pipeline_id} (vincula chat↔lead+etapa), is_starred, first_unanswered_message_at, last_reaction, tags, custom_fields, company`.
- **Copiar (ALTO):** `first_unanswered_message_at` + filtro **"Sin respuesta"** = SLA de respuesta. El resto (inbox unificado vinculado a la orden) ya está en los sprints WA-CHAT (INBOX-1..6 ya construidos).

### 4. "Marketing" (no es módulo propio)
- **No existe sección `/marketing/`.** El marketing real = **atribución de leads** por custom fields tipo `tracking_data`: `utm_content, utm_medium, utm_campaign, utm_source, utm_term, utm_referrer, referrer, gclientid, gclid, fbclid, ttad_id, ttad_name`.
- Broadcast/mensajes masivos viven dentro de Leads (selección múltiple) y Chats, no como sección.
- **Copiar (MEDIO):** capturar UTMs/`fbclid`/`gclid` en `citas_por_confirmar` para saber qué anuncio/canal generó cada lead. Es lo único de "marketing" con sustancia.

### 5. Agente IA (`/settings/ai-agent/`)
- **`is_ai_agent_enabled: true` pero `is_ai_agent_configured: false`, `trigger_conditions: []`.** Hay 1 agente borrador sin actividad desde 25/02. Créditos 5.000/5.000. **NO está operando.**
- **Catálogo (endpoint `airewriter/features`):** condiciones `outside_worktime, message_type, user_asks_first_time, user_offline`; acciones `manage_tags, run_salesbot, set_custom_field, add_task (+fill_with_ai), change_responsible, change_lead_status, make_an_appointment, guideline`.
- **Copiar:** el catálogo como checklist de acciones para el motor de automatización (ya mapeado en `KOMMO_AUTOMATIZACIONES_2026_05_21.md`). NO copiar el módulo — Mister Service tendrá su propio bot WhatsApp.

### 6. Salesbots / Automatizaciones por etapa
- ~25 bots, 3 arquetipos: (A) "Mover" = enrutar/asignar al crear en etapa, (B) "WhatsApp" = mandar mensaje al mover/crear en etapa, (C) NPS = encuesta al cerrar conversación.
- Detalle completo + mapeo a fases en `KOMMO_AUTOMATIZACIONES_2026_05_21.md`.
- **Copiar (ALTO):** motor único hardcodeado (4-6 reglas), NO los 25 bots. La **encuesta NPS al cerrar** es el módulo nuevo de mayor valor.

### 7. Dashboard (`/dashboard/`)
- Filtros: Hoy/Ayer/Semana/Mes/Todo + por usuario + por embudo.
- Widgets chat: mensajes entrantes por canal, Diálogos vigentes (27.717), **Sin réplica (6.505)**, **Lapso medio/mayor de réplica**. Comerciales: leads ganados/activos (20.833)/perdidos, sin tareas, fuentes, embudo en vivo.
- **Copiar (ALTO):** panel de **tiempos de respuesta de chat (medio/mayor) + diálogos sin réplica**. Mister Service no lo tiene; gran candidato con el inbox (parte ya en INBOX-6).

### 8. Estadísticas (6 submódulos)
- **Win-Loss** (`/stats/pipeline/`): conversión por etapa (% + leads + monto), tiempo promedio por lead, pronóstico 30/60/90d. **Copiar (MEDIO):** funnel por fase mapea casi 1:1 a `OrdenServicio.fase`.
- **Consolidado** (`/stats/consolidated/`): leads por estatus/usuario/canal. Mister Service ya tiene equivalente.
- **ROI** (`/stats/roi/`): **vacío** (0 reportes). No aplica.
- **Metas** (`/stats/goals/`): objetivos por usuario. Sin metas. **Copiar (opcional):** metas por técnico/operaria.
- **Llamadas** (`/stats/calls/`): **vacío**, sin telefonía. No aplica.
- **WhatsApp Business** (`/stats/widgets/whatsapp_cloud_api/`): métricas por plantilla (enviadas/entregadas/leídas/cliqueadas). **Copiar (MEDIO):** medir las plantillas HSM de Mister Service.
- **Registro de actividad** (`/events/list/`): audit log global (816.241 eventos: fecha/usuario/objeto/valor previo-posterior). Mister Service ya tiene `auditoria`/`historialFases`; la vista tabular unificada es buena referencia de UX.

### 9. Calendar / Tareas (`/todo/calendar/`)
- **0 tareas.** Solo 2 tipos de fábrica: Seguimiento, Reunión. Modelo estándar v4 (`task_type_id, text, complete_till, is_completed, entity_id, responsible_user_id, result`).
- **No copiar:** Mister Service ya tiene mejor (calendarios, citas, mantenimientos con fechas).

### 10. Lists / Contactos (`/contacts/list/`)
- Contactos paginan (nav "999+"). Modelo: `id, name, first_name, last_name, responsible_user_id, custom_fields_values, _embedded {tags, leads, companies}`. **Cero campos custom**: solo `Position, Phone (multitext WORK/MOB/HOME/FAX), Email (WORK/PRIV)`.
- **Copiar (BAJO):** el `Phone` **multitext con enums tipados** (varios teléfonos etiquetados por cliente). El resto: Mister Service es superior (clientes con equipos/órdenes/historial).

### 11. Settings (sin integraciones)
- **General:** huso Santo Domingo, RD$, 2FA opcional. Estándar.
- **Usuarios:** 1 usuario (jorge, Administrador, grupo "Sales Office"). Roles = grupos + permisos granulares por entidad. **Mister Service ya es mejor** (jerarquía técnico→operaria→coordinadora con audit en `firestore.rules`).
- **Plantillas:** WhatsApp (con cargo, revisión Meta) + generales (sin cargo). Mister Service gestiona las suyas en Meta.
- **Kommo AI** (`/settings/ai/`): **vacío/no configurado.**

---

## Veredicto: qué copiar (priorizado), qué NO

### Copiar — ALTO (Mister Service no lo tiene)
1. **Feed unificado por orden** (timeline notas + mensajes + cambios de fase + tareas en un hilo). El mayor faltante.
2. **Motor de automatización por fase** + **encuesta NPS al cerrar** (ver doc de automatizaciones).
3. **KPIs de tiempo de respuesta de chat** (medio/mayor + sin responder) — Dashboard. Parte en INBOX-6.
4. **`first_unanswered_message_at` + filtro "Sin respuesta"** en el inbox (SLA).

### Copiar — MEDIO
5. **Atribución UTM** (utm_*, gclid, fbclid, ttad) en `citas_por_confirmar` — saber de qué anuncio vino el lead.
6. **Funnel de conversión por fase** (Win-Loss) — analítica de órdenes.
7. **Métricas por plantilla WhatsApp** (enviada/entregada/leída/cliqueada).

### Copiar — BAJO / opcional
8. Teléfonos multi-etiquetados por cliente (enums tipados).
9. `color` por etapa en el board. Metas por técnico/operaria.

### NO copiar (Mister Service ya es igual o mejor, o está vacío en Kommo)
- 22 pipelines (1 por agente) — deuda.
- AI Agent (sin configurar) y módulo Kommo AI (vacío).
- Calendar/Tareas (vacío) — MS superior.
- Lists/Contactos (sin campos custom) — MS superior.
- Roles/permisos — MS superior.
- ROI, Llamadas, Metas — vacíos / no aplican.
- Editor de plantillas — MS las gestiona en Meta.

---

## Próximos sprints candidatos (a tu OK)
- **SPRINT-FEED-UNIFICADO-ORDEN** — timeline unificado en la vista de orden (ALTO valor).
- **SPRINT-MOTOR-AUTOMATIZACION** + **encuesta NPS** (ver `KOMMO_AUTOMATIZACIONES_2026_05_21.md`).
- **SPRINT-DASHBOARD-SLA-CHAT** — KPIs de tiempo de respuesta + sin responder (complementa INBOX-6).
- **SPRINT-ATRIBUCION-UTM** — capturar UTM/ad source en `citas_por_confirmar`.
- **SPRINT-FUNNEL-FASES** — analítica de conversión por fase de orden.

Ninguno tocado aún. Cuando Claude Code esté libre, redacto los que priorices en BLOQUEOS.
