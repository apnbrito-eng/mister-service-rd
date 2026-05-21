# Análisis Kommo CRM vs Mister Service RD

**Fecha:** 2026-05-20
**Autor:** Cowork (sesión con Jorge)
**Workspace Kommo analizado:** `misterservicerdm.kommo.com`
**Objetivo:** Identificar qué del CRM Kommo vale la pena clonar al admin de Mister Service para tener chat con cliente, toggle bot, acceso a órdenes desde la conversación.

---

## Resumen ejecutivo

Kommo es un CRM conversacional construido alrededor de **un solo concepto:** todo lo que pasa con un cliente vive dentro de una "conversación". Mensajes entrantes, salientes, cambios de etapa, asignaciones, edits — todo en un timeline único por lead.

Mister Service RD hoy tiene una arquitectura distinta: el centro NO es la conversación, es la **orden de servicio**. Un cliente puede tener varias órdenes, cada una con su fase, su técnico, su cierre. El WhatsApp se usa manualmente (botón que abre `wa.me/...?text=...`).

**Recomendación de alto nivel:**

1. **No copiar el concepto "Lead" de Kommo** — Mister Service ya tiene `clientes` + `ordenes_servicio`, que es más rico para reparación. Forzar Leads sería retroceder.
2. **Sí copiar el concepto "Conversación por cliente"** — un timeline persistente de WhatsApp por número de teléfono, separado de las órdenes pero linkeable a ellas.
3. **Sí copiar el toggle "Bot pausado/activo" por conversación** — UI explícita (un switch), no escondido en etapas del pipeline como hace Kommo.
4. **Sí copiar la vista 3-columnas (Inbox / Datos cliente / Chat)** para operarias y coordinadora.
5. **No copiar el modelo "16 salesbots disparados por etapa"** — overkill. El bot IA único de Mister Service ya cumple el rol.

Lo demás (calendar, lists con 99,945 contactos, dashboard analytics) ya existe o no aplica.

---

## Recorrido módulo por módulo

### 1. Leads (Pipeline)
- Pipeline visual estilo Kanban. 4 etapas customizables ("7667 WhatsApp API", "Seguimiento", "Agendado", "Pruebas").
- Cada lead = una tarjeta con responsible user, sale RD$, próxima cita.
- 6 leads totales en el pipeline visible. En total 20,679 leads activos en el workspace.

**Mister Service ya tiene:** `OrdenServicio.fase` con transiciones `nuevo_lead → en_gestion → en_diagnostico → en_cotizacion → aprobado → agendado → trabajo_realizado → cerrado`. Es más rico que Kommo.

**Veredicto:** No clonar el pipeline visual de Kommo. La vista actual de `Ordenes.tsx` ya cumple. Si Jorge quiere vista Kanban, es sprint separado opcional.

### 2. Lead detail (la vista que motivó este análisis)
3 secciones:
- **Header:** Número del lead, ADD TAGS, etapa actual con días en etapa ("Agendado 86 days").
- **Sidebar izquierda:** Tabs Main / Statistics / Media / Setup. Datos: Responsible user, Sale, Próxima cita, Contacto con WhatsApp Business badge, teléfono, email, posición, Add contact, Add company.
- **Stream derecha:** Timeline cronológico de todos los mensajes (entrantes gris, salientes del bot azul), fechas, separadores "Yesterday/Today", URLs renderizadas con preview (Google Maps embed, imágenes inline).
- **Footer chat:** "Chat with [contact]: ⚡ Write a message or type '/' for your Salesbot list". Sin escribir el "/" muestra el input limpio.
- **Botones encima del input:** Summarize (resumir conversación con IA), Close conversation, Mark answered.
- **Indicador "Messaging session ends in: 8h 55m"** — la famosa ventana 24h de WhatsApp Business.

**Veredicto:** Esta es LA vista a clonar. Adaptada para Mister Service significa: vista por cliente, no por orden.

### 3. Chats (Inbox global cross-canal)
- Lista izquierda con conversaciones ordenadas por última actividad. 27,502 conversaciones abiertas, 6,553 sin responder, longest awaiting reply: 47 semanas.
- Click en una abre la vista 3-columnas (inbox / lead / chat).
- Cada conversación muestra: número de lead, ID interno (A41354), última actividad (Today 08:22), preview del último mensaje.
- Filtros: Open conversations, "Mentions & Team chats" (chat interno entre operarios).
- Cross-canal: mismo inbox unifica WhatsApp, Instagram, Messenger, TikTok, Live chat.

**Mister Service no tiene esto en absoluto hoy.** Es el corazón de lo que Jorge quiere.

### 4. AI Agent (clave para entender automatización IA)
- 1 agente configurado: "Asistente mister service RD". Status: Turned on. Créditos 5,000/5,000 renovados cada 4 días.
- **Dashboard:** KPIs (Unique leads, Answered conversations, Weekend leads, Handover rate, Average response time, Unanswered questions).
- **Persona:**
  - Role: "eres un asistente de citas amable y prudente de pocas palabras..."
  - Tone of voice: Casual
  - Length of replies: Short
  - Reply language: Spanish
  - Delay before replying: 15 segundos
  - Guidelines: "Saluda y preséntate como Grace.", "No menciones que eres un bot"
- **Sources:** 2 fuentes propias ("Fuente 22/02/2026 22:38" y 22:21) + 4 recomendadas (Privacy policy, Contact information, Terms of service, General knowledge). Toggle adicional para usar Products list.
- **Actions:** Pares When/Do/More. Ejemplos vistos:
  - When "Incoming message contains greeting" → Do "Answer using knowledge base source Fuente 22/02/2026 22:38".
  - When "Client wants to get support" → Do "Answer using knowledge base source" → More "manten una conversacion con el cliente para adquirir la informacion necesaria".
- **Settings:**
  - **Launch AI agent:** Selecciona canales y etapas del pipeline donde el agente responde. **Cada etapa solo permite un agente.**
  - **Stages where AI agent stops replying:** Selecciona etapas donde el agente DEJA de responder cuando el lead entra. También se agrega como trigger en automatizaciones.

**Hallazgo crítico:** El toggle ON/OFF del bot en Kommo NO es por conversación. Es por **etapa del pipeline**. Para "parar el bot", la operaria mueve el lead a una etapa donde el bot no responde.

**Para Mister Service:** Implementar el toggle a nivel conversación (un switch UI explícito) es más simple y más usable que forzar a la operaria a mover el cliente entre fases artificiales.

### 5. Calendar
- Vista Day/Week/Month con eventos.
- Sidebar izquierdo muestra "My events" + "New filter".
- Botón "+ NEW EVENT" arriba derecha.
- Para esta cuenta: vacío esta semana.

**Mister Service ya tiene:** `Calendario.tsx`, `calendarios` collection, agenda por técnico. Más completo para reparación.

**Veredicto:** No clonar.

### 6. Lists
- **Contacts:** 99,945 contactos individuales. Columnas: Name, Company, Phone, Email.
- **Companies, All Contacts and Companies, Media** y "Add list" para custom lists.

**Mister Service ya tiene:** `clientes` collection con normalización RD de teléfonos.

**Veredicto:** No clonar. El volumen de 99,945 contactos sugiere que Kommo absorbió mucho lead spam — es problema, no feature.

### 7. Stats / Analytics
Submódulos:
- Win-Loss Analysis
- Consolidated report
- ROI
- Report by activities
- **Activity Log** — 810,232 actividades totales. Tabla con Date, User (SalesBot/Robot/humano), Object Type (Lead/Contact/Conversation), Object Name, Activities (Sales stage changed, Assigned responsible, Conversation started, Phone field value changed, Contact created, Incoming/Outgoing message, Lead created), Value Before/After. Audit log unificado de TODO.
- Call report
- Goal report
- WhatsApp Business (analytics específicos de WA)

**Mister Service tiene:** `auditoria` por orden + `historialFases`. Es similar pero por orden, no global.

**Veredicto:** Clonar la idea de Activity Log unificado del workspace en una vista admin nueva (sprint a futuro, no urgente).

### 8. Dashboard
KPIs en cards grandes:
- Incoming messages today (0 hoy, por canal: IG/Messenger/WA/TikTok/Live chat/Other).
- **Ongoing conversations: 27,503** (-12,135 today).
- **Unanswered conversations: 6,551** (+30 today).
- Median reply time: 0 today.
- **Longest awaiting reply: 47 weeks.** (Algunos clientes esperando casi un año.)
- Won leads: 0 (RD$0).
- Active leads: 20,679.
- Tasks: 0.
- Lead sources: MISTER SERVICE RD FLOTA 2, MISTERSERVICE FLOTA 1, etc.

Filtros: Today/Yesterday/Week/Month/Time + por usuario.

**Veredicto:** Mister Service tiene Dashboard propio pero NO mide reply time, unanswered conversations, ni longest awaiting reply. Esto es deuda — clonar 3 cards a `Dashboard.tsx` (sprint corto).

### 9. Settings → Integrations
- Catálogo de canales: WhatsApp Business (installed), TikTok (installed), Instagram (installed), Apple Messages for Business (install), Facebook (installed), Viber, Telegram, WeChat.
- AI solutions, Automations, Lead sources tabs.

**Veredicto:** No clonar. Mister Service no necesita ser una plataforma multi-canal.

### 10. Settings → Communication tools (SALESBOTS)
- 16+ salesbots configurados. Vistos: Whatsapp tecnicos Yoniel, trolo mover, Robinson albert, Mover mon/yunior/juan Pablo, Whatsapp tecnicos, Bot DM Messenger, Asistencia bot pablo, Bot whatsapp citas, iosbot dm a whatsap (97% conv 404 launched), iosbot mover, iOs bot dm a Whatsapp, bot tecnicos a oficina, Mover Diorky/yoniel.
- Cada bot tiene: Trigger ("Moved to or created in stage", "Created in pipeline stage", "Moved to pipeline stage"), Conversion rate, Total launched, Active sessions.
- Bot con más activos: Bot DM Messenger con 832 sesiones activas.

**Hallazgo crítico:** Los salesbots son trigger-driven (no manuales). Funcionan como state machines disparadas por movimientos del pipeline. Esto es POTENTE pero también explica los 6,553 conversaciones sin responder y los 47 semanas de longest awaiting — automatización sin gobernanza humana llena el inbox.

**Veredicto:** No clonar 16 bots. Mister Service usa 1 bot IA bien configurado + plantillas Meta para casos específicos. Más mantenible.

### 11. Settings → Templates → Chat templates
- **WhatsApp templates:** "Reach clients on WhatsApp Business, Send out marketing campaigns, Start new conversations, Use interactive forms and product cards, Message fees apply, Reviewed by Meta for quality." Botón "Add new WhatsApp template".
- **General templates:** "Use in all channels, Automate answers to common questions, Send simple messages with text and images, No fees." Botón "Add new general template".

**Mister Service tiene:** 4 plantillas WhatsApp APPROVED en Meta (`cita_confirmada`, `conduce_emitido`, `recordatorio_mantenimiento`, `garantia_por_vencer`). El sprint WA-3/4/5/6/7 las dispara desde el admin.

**Veredicto:** Mister Service tiene mejor control sobre las plantillas (gestionadas directo en Meta + cache en Firestore). No clonar el "Chat templates" editor de Kommo, pero SÍ exponer en el chat UI un acceso rápido tipo "/" para insertar plantilla aprobada — eso es UX excelente.

### 12. Salesbot menu en el input (gem oculto)
- En el lead detail, click en el ⚡ del input abre menú "SALESBOT" con 16+ bots accesibles por nombre. Cada uno empieza con `/` (`/TestBot`, `/NPS Bot`, `/Asignador de Clientes`, `/Etiqueta pendiente`, `/Bot whatsap mister service`, etc.).
- Además: "Send a voice message" arriba.
- Footer cuando se selecciona bot: Send / mic / Cancel + "Messaging session ends in: 8h 55m" + keyboard/sticker/attachment.

**Veredicto:** Clonar la UX del "/" para insertar plantillas o disparar acciones. Excelente para operarias rápidas.

---

## Tabla comparativa Kommo vs Mister Service hoy

| Capacidad | Kommo | Mister Service hoy | Decisión |
|---|---|---|---|
| Pipeline visual | Sí (Kanban) | Lista en Ordenes.tsx | Mantener actual |
| Concepto central | Lead | Orden de servicio + Cliente | Mantener actual |
| Conversación por cliente | Sí (timeline persistente) | NO existe | **CLONAR** |
| Inbox global de WA | Sí (cross-canal) | NO existe | **CLONAR** (solo WA) |
| Vista 3-columnas chat | Sí | NO existe | **CLONAR** |
| Toggle bot ON/OFF | Por etapa del pipeline (frágil) | NO existe | **CLONAR mejorado** (por conversación) |
| Templates WA disparables | Sí (editor) | Solo desde Meta + endpoint funciona | Sprint WA-3/4/5/6/7 ya cubre |
| Shortcut "/" para plantillas | Sí | NO existe | **CLONAR** |
| Audit log unificado | Sí (Activity Log) | Por orden | Diferir a sprint futuro |
| Dashboard reply time / longest waiting | Sí | NO mide | **CLONAR** (3 cards) |
| Resumen IA de conversación | Sí (botón Summarize) | NO existe | **CLONAR** (opcional) |
| Indicador ventana 24h WA | Sí ("Messaging session ends in: Xh Ym") | NO existe | **CLONAR** |
| Multi-bot disparados por etapa | Sí (16 bots) | 1 bot IA único | NO clonar |
| Calendar | Sí (genérico) | Calendario.tsx específico repair | Mantener actual |
| Lists 99,945 contactos | Sí | clientes collection normalizada | Mantener actual |
| Multi-canal (IG/FB/Tiktok) | Sí | Solo WhatsApp | NO clonar |

---

## Sprints propuestos (escritos en docs/sprints/BLOQUEOS.md)

Resumen — el detalle completo va en BLOQUEOS.md para que tú apruebes uno por uno.

1. **SPRINT-WA-CHAT-1: Modelo de datos "Conversación por cliente"** — Colección `whatsapp_conversaciones/{telefono}` que agrupa todos los `whatsapp_mensajes` por número, con denormalización de `ultimoMensajeAt`, `ultimoMensajeTexto`, `noLeidosCount`, `botActivo` (boolean), `responsable`. Migración one-time para llenar desde mensajes existentes.

2. **SPRINT-WA-CHAT-2: Inbox global `/admin/inbox`** — Página nueva en sidebar. Lista de conversaciones ordenada por `ultimoMensajeAt desc`. Filtros: "Sin responder", "Mías", "Bot ON/OFF", "Con orden activa". Badge de no leídos. Real-time vía `onSnapshot`.

3. **SPRINT-WA-CHAT-3: Vista 3-columnas `/admin/inbox/:telefono`** — Columna 1: lista de conversaciones (reutilizada). Columna 2: datos del cliente + sus órdenes activas (link a cada una). Columna 3: timeline de mensajes con bubbles + footer con input + botones Summarize/Mark answered + indicador ventana 24h.

4. **SPRINT-WA-CHAT-4: Toggle bot ON/OFF por conversación** — Switch UI en columna 2. Persiste `botActivo` en `whatsapp_conversaciones/{telefono}`. El bot IA (cuando exista en backend) consulta este flag antes de responder. Audit log de quién apagó/encendió y cuándo.

5. **SPRINT-WA-CHAT-5: Shortcut "/" para insertar plantillas** — En el input del chat, escribir "/" abre menú con las 4 plantillas APPROVED + opción "Enviar mensaje libre". Seleccionar plantilla precarga el wizard de variables y dispara `api/whatsapp/send` al confirmar.

6. **SPRINT-WA-CHAT-6: Acceso a órdenes del cliente desde el chat** — En columna 2, sección "Órdenes activas" con links a `/admin/ordenes/:id`. Botón "Crear nueva orden" precargando teléfono. Incluye historial cerrado colapsable.

7. **SPRINT-WA-CHAT-7: Dashboard de comunicación (3 cards)** — Agregar a `Dashboard.tsx` cards: "Conversaciones sin responder" (count + tendencia 7d), "Tiempo mediano de respuesta" (calculado desde mensajes), "Conversación más antigua sin responder" (max wait time). Sin tocar layout existente.

8. **SPRINT-WA-CHAT-8 (opcional): Botón Summarize con IA** — Botón "Resumir" en columna 3 que llama OpenAI/Anthropic con el thread de la conversación y devuelve resumen 3 líneas. Costo ~$0.01 por resumen. Requiere endpoint nuevo `api/ai/resumir-conversacion`.

Total: 7 sprints obligatorios + 1 opcional. Estimo 3-4 días de trabajo del coordinator + builder + tester por sprint.

**Por qué van a BLOQUEOS y no a la cola directa:** son features que afectan UX de operarias y coordinadora (no solo backend). Quiero que tú revises el approach antes de procesarlas.

---

## Hallazgos laterales (no bloquean, vale anotar)

1. **Kommo tiene 47 semanas de longest awaiting reply.** Eso es un problema operacional, no técnico. Mister Service NO debe heredar esa cultura. El dashboard nuevo (WA-CHAT-7) sirve también como alarma temprana.

2. **Bot Salesbot disparados por etapa = inbox abandonado.** 6,553 unanswered. Mister Service debe mantener el bot único IA + plantillas Meta, NO replicar el modelo 16-bots.

3. **El concepto "Conversation Nº A18152" de Kommo es útil para soporte.** Cuando un cliente llama y dice "el mensaje del miércoles", la operaria busca por ID de conversación. Sprint futuro (no incluido arriba): ID legible auto-incremental tipo `WA-####` para cada conversación.

4. **Indicador "Messaging session ends in: 8h 55m" es ORO.** WhatsApp Business cobra extra fuera de ventana 24h. Mostrarlo evita errores caros. Incluido en WA-CHAT-3.

---

## Anexo: rutas Kommo donde se ve cada cosa

- Pipeline: `/leads`
- Lead detail: `/leads/detail/:id`
- Inbox: `/chats`
- AI Agent: `/settings/ai-agent/?selectedAgentId=:id`
- Calendar: `/todo/calendar/week/`
- Lists: `/contacts/list/contacts/`
- Activity Log: `/events/list/`
- Dashboard: `/dashboard/`
- Settings global: `/settings/widgets/`, `/settings/templates/`, `/settings/communications/`

Relacionado en el repo Mister Service:
- `src/types/index.ts` — types existentes que extenderán
- `src/services/whatsapp.service.ts` (si existe) o crear nuevo
- `api/whatsapp/send.ts` + `api/whatsapp/webhook.ts` ya funcionan
- `firestore.rules` — agregar rules para `whatsapp_conversaciones` (sprint dedicado, requiere OK Jorge)

---

# Escaneo profundo (segunda pasada) — 2026-05-20

Después del primer recorrido, Jorge pidió ir más adentro: editor de pipelines, automaciones, billing, users, menús no vistos. Esto es lo nuevo.

## 1. Editor de pipelines (capacidad real)

**Confirmado: los pipelines son totalmente configurables.** Creé el pipeline `TEST - CLAUDE 2026-05-20` (id `13784732`) con 5 etapas custom (Lead recibido → Diagnostico → Cotizacion enviada → Aprobado → Agendado) más las 2 etapas cerradas (Closed - won / Closed - lost) que vienen forzadas por sistema.

**Capacidades del editor de pipelines:**

- **Templates pre-armados:** Custom, Online store, Consulting, Services, Marketing, Travel agency. Cargan etapas típicas del rubro.
- **Incoming leads stage** (toggle on/off): cuando ON, captura automáticamente todos los leads nuevos de canales conectados (WA/IG/FB/etc) y los pone en esta etapa antes de procesar.
- **Active stages** (drag to reorder): cada etapa tiene nombre editable + color de 8 paleta (azul/amarillo/naranja/rosa/lavanda/verde claro/etc). Sin límite de etapas vistas en mi prueba (probé 5).
- **Closed stages** (no editables): Closed - won y Closed - lost son etapas terminales fijas. NO se pueden quitar, solo cambian de color/nombre.
- Botones por etapa al editar: ⋮⋮ (drag), ✏️ (edit), ✕ (delete).
- Cada workspace tiene tantos pipelines como quieras. Vi 17 pipelines existentes en este workspace (uno por canal de WhatsApp + uno por técnico + uno general "Embudo de ventas" + el TEST que creé).

**Editor de leads y vista pipeline tiene un menú "..." con:**
- New broadcast (mensaje masivo a todos los leads del pipeline)
- Edit pipeline
- Edit card layout (qué campos se muestran en cada tarjeta del Kanban)
- Import / Export
- Find duplicates
- Select multiple
- Sort by: last message / last event / creation date / name / sale value
- Auto update toggle

## 2. Motor de automatizaciones (Settings → Communication tools era solo bots; el motor está dentro del editor de cada pipeline)

Click en `AUTOMATE` (botón naranja arriba derecha del pipeline) abre el editor visual de automaciones. Por cada etapa puedes agregar triggers con **14 tipos de acciones disponibles**:

| Acción | Qué hace |
|---|---|
| **Salesbot** | Dispara bot custom (de los 16+ que Kommo tiene configurados) |
| **Launch AI agent** | Activa agente IA en esa etapa |
| **Stop AI agent** | Pausa agente IA en esa etapa |
| **Add task** | Crea tarea automática para usuario asignado |
| **Create lead** | Crea nuevo lead (en otro pipeline incluso) |
| **Send email** | Manda email automático |
| **Send webhook** | POST a URL externa con payload del lead |
| **Change lead stage** | Mueve el lead a otra etapa (chaining) |
| **Edit tags** | Agrega/quita tags |
| **Complete tasks** | Marca tareas pendientes como hechas |
| **Generate form** | Crea formulario web nuevo |
| **Change lead's user** | Reasigna responsable |
| **Change field** | Sobrescribe valor de campo del lead |
| **Delete files** | Borra archivos asociados |

Adicional en sidebar izquierdo: **Lead sources** — conectar fuentes de captura (formularios, ads, chat público) que envían leads directo a esta etapa. Cada pipeline puede tener fuentes propias.

**Por qué es relevante para Mister Service:** Mister Service tiene `historialFases` en `OrdenServicio` pero NO tiene este editor visual de automaciones por etapa. La operaria tiene que recordar qué hacer cuando una orden pasa a "agendado" — no hay sistema que dispare "enviar plantilla WhatsApp + asignar técnico + crear tarea de recordatorio". Esto sí vale clonarlo en el FUTURO, pero NO ahora (overkill para el sprint actual del inbox).

## 3. Inventario completo de pipelines del workspace

Lista de los 17 pipelines existentes (sirve para entender la cultura operacional de Jorge en Kommo):

1. Embudo de ventas (default — INCOMING LEADS / MISTER SERVICE COMENTARIOS / IOSSOLUTIONS COMENTARIOS / CARNIPEZ COMENTARIOS) — 1,305 leads
2. 9601 Wila DM IG
3. 7474 Karina Messenger
4. 7880 Johana
5. 7667 api claro
6. 15558620587 API whatsapp
7. 15558860006 Api whatsapp
8. Carnipez
9. iOSsolutionsrd 4685 DM Mess...
10. Yoniel 809-641-6576
11. Diorky 829-363-7779
12. Yunior 829-717-0509
13. Aury Mon 829-364-6430
14. Robinson 849-393-7474
15. Carlos trolo 829-366-3819
16. Juan Pablo 809-992-7574
17. Arjelis 829-827-7296
18. Wilfredo 849-817-7474
19. Jesús 849-423-7474
20. Miguel Oriental 849-585-4747
21. Formulario Meta
22. TEST - CLAUDE 2026-05-20 (creado por mí, lo puedes borrar)

**Hallazgo:** Hay **un pipeline por técnico** (Yoniel, Diorky, Yunior, Aury Mon, Robinson, Carlos, Juan Pablo, Arjelis, Wilfredo, Jesús, Miguel) y otros pipelines por canal/marca. Esto es síntoma de que Kommo se usa como pseudo-CRM de operación, no como CRM de ventas puro. Replica el "estado de los técnicos en la calle" en un Kanban. **Mister Service ya tiene esto mejor:** `personal` collection con técnicos + `ordenes_servicio.tecnicoId` + filtros por técnico en `Ordenes.tsx`. No necesitamos 11 pipelines distintos.

## 4. Página HOME (no vista en primera pasada)

URL: `/home/`. Es la landing del workspace:
- Banner "Welcome to Kommo!" con "Turn chats into sales with powerful AI tools" (descartable con X).
- **Advanced plan Active** — "Your plan includes everything in Base plus broadcasting, automations, and bots."
- **Workspace overview (caja derecha):**
  - **Days left: 35** (renueva 23/06/2026)
  - **Leads: 20,683 / 25,000** (83% del límite!)
  - **Users: 1 / 5** (4 seats sin usar pero pagados)
  - **Contacts & companies: 93,894 / 125,000** (75% del límite)
  - **Media storage: Unlimited**
- Botón Go to Billing.
- Sección Tutorials abajo.

## 5. Billing (URL `/settings/pay/`)

**Costo real que Jorge paga hoy en Kommo:**

> Your Advanced plan with 5 seats will renew automatically on 23/06/2026. You will be charged **$924 USD** from your Mastercard ending in 0992.
> Your Starter package for the AI agent (5000 credits/month) will renew automatically on the same date.

**Comparativa de planes Kommo:**

| Feature | Base $15/mes/seat | Advanced $25/mes/seat (Jorge) | Pro $45/mes/seat |
|---|---|---|---|
| Leads/seat | 2,500 | 5,000 | 10,000 |
| Contacts/seat | 12,500 | 25,000 | 50,000 |
| Unified inbox | ✓ | ✓ | ✓ |
| Multiple pipelines | ✓ | ✓ | ✓ |
| Customizable dashboard | ✓ | ✓ | ✓ |
| AI summaries & writing assistance | ✓ | ✓ | ✓ |
| Pipeline automation | — | ✓ | ✓ |
| Broadcasting | — | ✓ | ✓ |
| No-code bots | — | ✓ | ✓ |
| Automated lead assignment | — | ✓ | ✓ |
| AI field value suggestions | — | ✓ | ✓ |
| AI unanswered questions | — | ✓ | ✓ |
| AI agent automations | — | ✓ | ✓ |
| Field-level user permissions | — | — | ✓ |
| ROI analytics | — | — | ✓ |
| Multi-currency & formulas | — | — | ✓ |
| Full data exports | — | — | ✓ |
| AI suggested replies | — | — | ✓ |
| AI task suggestions | — | — | ✓ |
| Voice messages handling | — | — | ✓ |
| Appointment scheduling | — | — | ✓ |

**Costo total anual Jorge:** $924/año = ~RD$54,000 al año (USD 1 = RD$58.5 aprox). Si Mister Service implementa los sprints WA-CHAT (sobre todo 1, 2, 3, 4) + cron de plantillas (WA-6/7), Jorge puede **migrar OUT de Kommo y ahorrar ese costo recurrente**. Es payback de los sprints en ~6 meses de no-pagar Kommo.

## 6. Users (URL `/settings/users/`)

Solo **1 user creado:** jorge luis brito, group "Sales Office", role Administrator. Tiene cupo para 5 (4 unused pero pagados).

**Implicación grande:** Las operarias/técnicos NO tienen cuentas en Kommo. Todo el trabajo se hace bajo la cuenta admin de Jorge. Eso significa:
- No hay audit de quién hizo qué dentro de Kommo (todo "es Jorge").
- No hay permisos diferenciados.
- No hay vistas por usuario.
- Los técnicos no pueden ver sus propios leads desde sus celulares.

**Mister Service hoy es radicalmente mejor en esto:** roles diferenciados (técnico, operaria, secretaria, coordinadora, administrador) con cuentas reales en Firebase Auth, vista `/tecnico` específica para celular, audit log por usuario. Cuando termines de migrar el inbox, dale a las operarias la vista del inbox dentro de Mister Service y ya no necesitan Kommo.

## 7. Mail (URL `/mail/inbox/`)

Vacío. Sin email conectado. Submódulos: Inbox / Sent / Deleted + botón "Connect email". Top: SETTINGS / COMPOSE.

**Veredicto:** No clonar. Mister Service no maneja email de soporte hoy. Si en el futuro Jorge quiere email-to-orden, usar un connector externo.

## 8. General settings (URL `/settings/`)

Config del workspace:
- Account name: Misterservicerd
- Subdomain: misterservicerdm
- Time zone: GMT-04:00 Santo Domingo
- Country: Dominican Republic
- Date format: 31/12/2026
- Time format: 24 hours
- Currency: Dominican Peso
- Contact name format: First name, Last name
- **Mandatory 2-step verification: OFF** ← potencial vulnerabilidad si Kommo es activo.
- Products toggle: ON (catálogo de productos).

## 9. Kommo AI (URL `/settings/ai/`) — distinto del AI Agent

Esto es CAPA ADICIONAL de IA del CRM, separada del AI Agent que ya vi (el bot que responde clientes).

3 features:

- **Kommo Copilot [Beta] — ON:** "Your go-to AI assistant, built right into your workspace. Supports you on a daily basis by answering questions, providing lead overviews, and reducing manual input through automated profile filling."
- **AI reply suggestions [Beta] — OFF:** "Suggested replies help your team respond faster by providing smart response options during chats. To enable, add content (FAQs, policies, help center URL) in AI knowledge sources tab."
- **AI Task Suggestions — OFF:** "Automatically identifies tasks in your chats by scanning both sent and received messages."

**Para Mister Service futuro (no urgente):** AI Reply Suggestions es muy útil para operarias — la IA propone respuesta, la operaria edita y manda. Es menos arriesgado que un bot fully autonomous. Vale considerarlo cuando los inboxes funcionen.

## 10. Settings → AI knowledge sources

URL: `/settings/ai/knowledge-sources/` (similar a la sección Sources del AI Agent). Acá viven los docs de conocimiento (FAQs, políticas) que alimentan tanto el AI Agent como el AI Reply Suggestions.

## 11. Settings → Chatter ("Chatter — WA+C...")

Sub-item en sidebar settings. No lo abrí (riesgo de cambiar algo). Por el nombre parece relacionado al canal de WhatsApp y otros connectors comerciales (¿addon de pago?). Lo dejo para futura inspección si Jorge pide.

## 12. Plan limits que importan ahora

El plan Advanced de Jorge tiene **5,000 leads/seat × 5 seats = 25,000 leads totales**. Actualmente 20,683 usados → **quedan 4,317 leads de margen**. Cada conversación nueva = 1 lead. Si Jorge sigue creciendo el ritmo de Kommo (~30 leads/día por dashboard), llena el plan en ~5 meses y le obligan a upgradear a Pro o a comprar seats extras.

**Esto es un timer real para migrar el inbox a Mister Service** antes de que Kommo lo presione a pagar más.

---

## Adendum a la decisión de sprints

Después de este escaneo profundo, **mantengo las recomendaciones de los 8 sprints WA-CHAT**, pero agrego 2 ideas adicionales como sprints opcionales muy futuros (NO escribir en BLOQUEOS aún, solo dejarlas anotadas):

### Sprint futuro opcional A: Editor de automaciones por fase (replica AUTOMATE de Kommo)

Cuando los inboxes funcionen y Jorge use el sistema 3-6 meses, considerar un editor visual donde la coordinadora define qué pasa cuando una orden cambia de fase. Por ejemplo: "Cuando orden pasa a `agendado` → enviar plantilla `cita_confirmada` al cliente + crear tarea de llamada al técnico para confirmar + cambiar tag de orden". Hoy todo eso se hace manual (cuando se hace).

**Por qué no ahora:** Mister Service no necesita el editor visual primero. Necesita el chat funcional + plantillas disparables a mano. Cuando esté operando se ve qué automatización repite más y se diseña el motor con datos reales, no con suposiciones.

### Sprint futuro opcional B: AI Reply Suggestions para operarias

Cuando una operaria abre una conversación, la IA propone 3 respuestas posibles ("Sí, te confirmamos cita para mañana", "El técnico va en camino", "Disculpa la demora, ya te respondo"). La operaria click y manda, o edita primero. Reduce tiempo de respuesta sin riesgo de bot incontrolable.

**Por qué no ahora:** Requiere el inbox funcionando + dataset de respuestas anteriores para entrenar/few-shot el modelo. Es Fase 2.

---

## Resumen de qué creé en tu Kommo

| Acción | Resultado |
|---|---|
| Pipeline TEST creado | `TEST - CLAUDE 2026-05-20` (id `13784732`) con 5 etapas custom + 2 cerradas. Vacío de leads. Puedes borrarlo cuando quieras desde el menú "..." → Edit pipeline → scroll abajo → Delete pipeline. |
| Otros cambios | Cero. No toqué leads existentes, ni rules, ni el AI agent, ni billing, ni users. |

---

# Tercera pasada — bots, cadena trigger→acción, flujos WhatsApp (2026-05-20)

Jorge pidió ir aún más profundo: cómo se crean los bots por dentro, la cadena de "qué pasa cuando algo se modifica", y los flujos de WhatsApp. Abrí el bot builder en modo lectura (creé un bot de prueba que NO guardé) y la config del canal WhatsApp.

## 1. Anatomía del Salesbot Builder (flow visual no-code)

Es un editor de flujo visual con canvas y nodos conectados. Empieza con un nodo **Start bot** y se van encadenando pasos. Tipos de nodos disponibles ("Add next step"):

| Nodo | Función |
|---|---|
| **Message** | Enviar mensaje al cliente (texto, imagen, archivo, botones) |
| **Reaction** | Reaccionar con emoji a un mensaje |
| **Comment** | Comentar (en posts de IG/FB) |
| **Send internal message** | Mensaje interno al equipo (no al cliente) |
| **List Message (WhatsApp)** | Mensaje con lista interactiva nativa de WhatsApp (menú de opciones) |
| **Pause** | Esperar X tiempo antes del siguiente paso |
| **Subscribe (Meta)** | Suscribir el contacto a flujos de Meta |
| **Action** | Una de las 14 acciones del motor (ver tabla AUTOMATE en 2da pasada) |
| **Condition** | Branching: if/else según datos del lead |
| **Validation** | Validar el input del cliente (ej: que un email tenga formato válido) |
| **Start bot** | Lanzar OTRO bot (anidamiento — bots que llaman bots) |
| **Custom step (code)** | Paso con código custom (lógica programada) |

Toolbar del builder: zoom +/-, varita mágica (auto-layout), `</>` (ver/editar como código), share, **Preview bot** (probar el flujo sin publicarlo).

**Lectura para Mister Service:** Este es un motor de chatbot conversacional completo. Construir esto desde cero sería un proyecto enorme. **NO lo necesitas.** Tu estrategia es 1 bot IA único (que ya tienes parcialmente vía el AI agent de Kommo / o el que construyas en backend) + plantillas Meta disparadas por eventos. El valor de haberlo visto: confirma que NO debemos intentar clonar un "constructor de bots" — es sobre-ingeniería para una operación de reparación.

## 2. La cadena "qué pasa cuando algo se modifica" (triggers)

Esta es la parte que más te interesaba. Cada bot/automatización se dispara con un **trigger** (condición). Kommo agrupa los triggers en 4 familias. Documenté TODAS las opciones:

### PIPELINE TRIGGERS (cuando cambia la etapa)
- Inmediatamente cuando un lead **se crea** en una etapa.
- Inmediatamente cuando un lead **se mueve** a una etapa.
- Inmediatamente cuando un lead **se mueve o se crea** en una etapa.
- Cuando **cambia el usuario responsable** del lead.

### SCHEDULED TRIGGERS (basados en tiempo)
- X horas **antes/después** de [un campo de fecha que seleccionas] (ej: 24h antes de la cita).
- En [fecha específica] a [hora específica].

### BEHAVIOR-BASED TRIGGERS (acciones del cliente/sistema)
- Cuando **se envía un formulario**.
- Cuando **se recibe un email**.
- Cuando **se recibe una llamada**.
- Inmediatamente **después de que visita un sitio web** seleccionado.

### CONVERSATIONAL TRIGGERS (sobre la conversación)
- Cuando una conversación **se inicia con un mensaje entrante** en [cualquier canal o uno específico].
- X horas **después del último mensaje entrante**.
- En un mensaje entrante (con **cooldown** de relanzamiento, ej: 1 día).
- Cuando mencionan en una **historia de Instagram**.
- Cuando se recibe un **comentario en un post**.
- Cuando un **mensaje saliente es visto** (leído) — ventana 24h.
- Inmediatamente **después de que una conversación se cierra**.

### Condiciones extra de ejecución (encima del trigger)
- **"For all leads with"** — filtro adicional: solo dispara si el lead cumple ciertos criterios (tags, campos, etapa, etc).
- **"Active hours"** — Always, o una franja horaria (ej: solo 8am-6pm).
- **"Leave message unanswered"** — toggle: si el bot responde, marca igual el mensaje como "sin responder" para que un humano lo revise.

**Lectura para Mister Service — esto SÍ es valioso conceptualmente:**

La cadena "cuando orden cambia a fase X → dispara acción Y" es exactamente lo que falta en Mister Service. Hoy `OrdenServicio.fase` cambia y se registra en `historialFases`, pero NO hay un sistema que reaccione automáticamente. Ejemplos de lo que se podría automatizar con un motor así (sprint MUY futuro, NO ahora):

- Orden pasa a `agendado` → enviar plantilla `cita_confirmada` al cliente + crear tarea de recordatorio.
- Orden pasa a `trabajo_realizado` → enviar plantilla de encuesta de satisfacción 2h después.
- Orden lleva 30 días en `en_cotizacion` sin avanzar → notificar a coordinadora.
- Mantenimiento cumple 6 meses → disparar `recordatorio_mantenimiento` (esto es el cron WA-6 que ya está en BLOQUEOS).

Pero el approach correcto NO es construir un editor visual de triggers como Kommo. Es **hardcodear las 4-5 automatizaciones reales que Jorge necesita** directamente en código (Firestore triggers / Vercel cron), porque son pocas y estables. El editor visual solo vale la pena cuando tienes 20+ automatizaciones que cambian seguido — no es el caso.

## 3. Galería de templates de bots (punto de partida)

Al crear un bot, Kommo ofrece templates pre-armados filtrables por canal (WhatsApp, Telegram, Instagram, TikTok, Messenger, Email, Live chat) y categoría (Generate leads, Business info, Nurture leads, Reduce busywork):

- Welcome bot
- Follow up to confirm appointments
- Receive appointment bookings
- Capture leads who want a call
- Make it easy for TikTok leads to ask for a callback
- Share promo codes for story mentions
- Reply to keywords in comments (IG/FB/TikTok)
- React to comments/story mentions with heart + reply
- Share exclusive rewards with followers
- Reward followers for messaging keywords

Más opción "Start from scratch" y banner "Try the AI agent — 24/7 tailored automation".

## 4. Flujo de WhatsApp — config del canal

`Settings → Integrations → WhatsApp Business` (Installed) tiene 3 secciones:

1. **Templates** — crear plantillas para broadcasts y para iniciar conversaciones (las que revisa Meta).
2. **Statistics** — métricas de conversaciones.
3. **Accounts** — gestionar los números conectados.

### Números WhatsApp conectados (hallazgo importante)

En **Accounts** hay 7+ números conectados, **uno por técnico/flota**, todos "Connected" con Quality rating "High":

| Número | Display name | Estado |
|---|---|---|
| +1 849-817-7474 | Wilfredo 9 mister service | Connected / High |
| +1 829-717-0509 | tecnico 8 mister service | Connected / High |
| +1 809-280-9601 | Mister Service RD Flota... | Connected / High |
| +1 829-366-3819 | Técnico 7 mister service | Connected / High |
| +1 829-828-7880 | Secretaria Flota 3. Mister... | Connected / High |
| +1 829-389-7474 | MisterService Flota 1. | Connected / High |
| +1 849-423-7474 | Técnico 11 mister service | Connected / High |

(Botón "Connect new account" para agregar más. Cada número tiene gear de config + trash.)

**Hallazgo crítico:** Estos números son DISTINTOS a los 2 que tiene la WABA productiva del proyecto Mister Service (8495646767 + 8294716265 con `api/whatsapp/send`). Los de Kommo están conectados vía la integración WhatsApp de Kommo (un proveedor/BSP que Kommo usa), y cada uno probablemente cobra por conversación además del costo de Kommo.

**Implicación para la decisión de migrar:**

Cuando migres el inbox a Mister Service tienes que decidir la estrategia de números:

- **Opción A (consolidar):** 1-2 números Cloud API directos (los que ya tienes funcionando). Más barato, más simple, pero los clientes que escriben a los números de técnicos individuales tendrían que migrar. Posible confusión transitoria.
- **Opción B (multi-número):** replicar el modelo de Kommo con varios números Cloud API. Más caro (cada número en Cloud API tiene su costo) y más complejo de gestionar, pero mantiene la cultura actual donde cada técnico/flota tiene su línea.

Esto NO es decisión técnica, es decisión de negocio tuya. Lo dejo anotado porque impacta el diseño del modelo `whatsapp_conversaciones` (sprint WA-CHAT-1): si vas multi-número, la conversación debe particionar por `(numeroNegocio, telefonoCliente)` y no solo por `telefonoCliente`. **Esto cambia el sprint WA-CHAT-1 — lo marco como decisión D4 pendiente.**

## 5. Síntesis de la 3ra pasada

Lo que confirmé:

1. **El bot builder es potente pero NO lo necesitas.** Sobre-ingeniería para reparación de electrodomésticos. Mantén 1 bot IA + plantillas.
2. **La cadena trigger→acción SÍ es valiosa conceptualmente**, pero impleméntala hardcodeada (4-5 automatizaciones reales en código), no como editor visual.
3. **El flujo WhatsApp de Kommo usa 7+ números** (uno por técnico). Antes de migrar el inbox, decide consolidar vs multi-número. Esto afecta el modelo de datos de WA-CHAT-1 → agrego decisión D4.

### Acción requerida en BLOQUEOS

Voy a agregar a `SPRINT-WA-CHAT-1` la decisión **D4: ¿conversaciones por (numeroNegocio + telefonoCliente) o solo por telefonoCliente?** porque el hallazgo de los 7+ números lo hace necesario. Sin esa decisión, el modelo de datos puede quedar mal diseñado.

---

# Cuarta pasada — gaps que faltaban (2026-05-20)

Jorge pidió cerrar 4 gaps que había nombrado pero no abierto a fondo: campos del lead, broadcast, editor de plantillas WhatsApp, y los 6 submódulos de Stats. Aquí están.

## 1. Campos del lead / contacto (Edit card layout)

Abrí "Edit card layout" (menú "..." del pipeline) que muestra los campos disponibles de un lead. El catálogo de campos del lead en este workspace:

**Campos de sistema:** Lead ID, Lead title, Resp. user (responsable), Sales value, Date created, Contact Name, Company Name, Last message from contact.

**Campos custom de negocio:** solo **"Próxima cita"** (fecha) y **"ttad_id"** (TikTok ad id).

**Campos de tracking de marketing:** utm_campaign, utm_source, utm_term, utm_referrer, referrer, gclientid, gclid (Google Ads click id).

**Lectura para Mister Service:** Kommo casi no tiene campos custom de negocio (solo "Próxima cita"). La mayoría son campos de atribución de marketing (de dónde vino el lead). Esto confirma que Kommo se usa como **inbox + atribución de leads**, NO como sistema operativo de reparación. Mister Service ya tiene un modelo de datos muchísimo más rico (`OrdenServicio` con fase, técnico, equipo, cierre, garantía, comisiones, etc.). No hay campos de Kommo que valga la pena migrar — al contrario, Mister Service tiene que ENVIAR datos hacia el inbox, no traer de Kommo.

El editor "card layout" en sí (qué campos se muestran en cada tarjeta del Kanban) es configurable: avatar del contacto on/off, "last message from contact" on/off, y hasta 6-7 campos por tarjeta. Es un detalle de UI que NO necesitamos clonar.

## 2. Broadcast (mensajes masivos) — completo

Hay 2 tipos de broadcast:

- **Basic broadcast** — un mensaje rápido en un canal.
- **Bot broadcast** — secuencia de mensajes/acciones en uno o varios canales (dispara un bot a una lista de gente).

El editor de Basic broadcast tiene 4 bloques:

1. **Recipients** — segmentación de audiencia. Opciones: elegir un Segmento (filtro guardado de leads), "+ New segment", "Send to the main contacts only", "Tag failed recipients to resend later" (re-enviar a los que fallaron).
2. **Channel** — qué número/canal usa para enviar (ej: WhatsApp +1 829-389-7474).
3. **Content** — el mensaje (con preview WhatsApp en vivo).
4. **Launch time** — Immediately o programado.

Además trae **galería de presets** de mensajes: holiday celebration, new product announcement, event reminder, new location offer, seasonal offer, exclusive personal offer, welcome offer, discount for loyal clients, abandoned cart reminder, free trial, reengaging lost leads, app promotion.

**Lectura para Mister Service:** El broadcast es útil para **campañas/recordatorios masivos** — exactamente lo que harían los crons WA-6 (recordatorio_mantenimiento) y WA-7 (garantia_por_vencer) que ya están en BLOQUEOS. La diferencia: Kommo lo hace manual desde UI; Mister Service lo hará automático por cron. Para envíos masivos manuales puntuales (ej: "promo de diciembre a todos los clientes"), valdría un sprint futuro de "envío masivo" pero NO es prioritario. La segmentación (filtrar a quién mandar) sí es un concepto a tener en cuenta cuando se diseñe ese sprint.

## 3. Editor de plantillas WhatsApp — completo

Flujo de crear plantilla en Kommo (`Settings → Templates → Add new WhatsApp template`):

**Paso 1 — Categoría:** Marketing o Utility. Y subtipo:
- **Custom** — texto, imágenes y botones.
- **Carousel** — tarjetas swipeables (varios productos).
- **Flows** — formularios paso a paso dentro de WhatsApp.

**Paso 2 — Editor:**
- **WABA ID** (elige cuál WhatsApp Business Account, ej: "MisterService Flota 1. 781888044815288").
- **Language** (idioma).
- **Validity period** (validez del mensaje).
- **Header (opcional)** — None / texto / imagen / video / documento.
- **Body text** — hasta 1024 chars, con formato (negrita, itálica, emoji) y **variables** `[-]`.
- **Footer (opcional)** — 60 chars.
- **Buttons (opcional)** — Quick Reply y/o Call to Action (URL/teléfono).
- Botones: **Save draft** / **Send for review** (lo manda a Meta para aprobación).
- Preview WhatsApp en vivo a la derecha.

**Lectura para Mister Service:** Esto es esencialmente lo mismo que haces directo en Meta Business Manager. Las 4 plantillas APPROVED del proyecto (`cita_confirmada`, `conduce_emitido`, `recordatorio_mantenimiento`, `garantia_por_vencer`) se gestionan mejor directo en Meta. **NO clonar este editor.** El único valor de haberlo visto: confirma que Kommo soporta Carousel y Flows (formularios dentro de WhatsApp), que son features Meta que Mister Service podría usar en el futuro directo desde Meta si los necesita (ej: un Flow para que el cliente llene los datos de su equipo dentro del chat).

## 4. Los 6 submódulos de Stats — completos

| Submódulo | Qué hace | ¿Mister Service lo necesita? |
|---|---|---|
| **Win-Loss Analysis** | Embudo de conversión visual: NEW → por etapa (within/entered/lost) → Won. Avg lead life-cycle 30d. Conversión Initial Contact 100% → Offer 75% → Negotiation 42% → Contract 25% → Implemented 10%. | Parcial. Mister Service podría tener un embudo de órdenes (lead → cerrado) pero NO es prioritario. |
| **Consolidated report** | Leads creados/cerrados en el tiempo (Day/Week/Month) + distribución por pipeline (7474 whatsapp 41%, 7880 22%, 9601 18%, etc) + leads por usuario. Total 20,768. | No urgente. Mister Service tiene su propio Dashboard. |
| **ROI** | Track spend / broadcast impact / template costs. Compara inversión vs revenue por reporte (hasta 25). Jorge NO lo usa (0 reportes). | No. Mister Service no hace marketing pago trackeado aquí. |
| **Report by activities** | Actividades por usuario/tipo (no abierto a fondo, es tabla de productividad). | No. |
| **Activity Log** | Audit log unificado de TODO: 815,014 actividades. Date, User, Object Type, Activity, Value Before/After. | Concepto valioso (audit unificado) pero Mister Service ya tiene `auditoria` por orden. Sprint futuro opcional. |
| **Call report** | Log de llamadas (inbound/outbound), quantity/duration. Vacío — Jorge no usa llamadas en Kommo. | No. |
| **Goal report** | Metas por usuario/grupo con barras verde/rojo (cumple/no cumple), by sale / by amount. | No urgente. Útil si Jorge pone metas a operarias/técnicos en el futuro. |
| **WhatsApp Business** | Stats de plantillas: por plantilla → Category, Sent, Delivered, Read, Clicked. + tab Messages. Reporte últimos 7 días. | **SÍ vale.** Saber qué plantilla se lee/clickea más es oro para optimizar. Mister Service podría exponer esto leyendo de su `outbox`. Sprint futuro chico. |

**Lectura general de Stats:** La mayoría de reportes de Kommo son de **ventas** (conversión, ROI, metas comerciales) — no aplican a una operación de reparación. Los 2 que sí valen para Mister Service (sprint futuro, no ahora): **WhatsApp Business stats** (performance de plantillas: delivered/read/clicked) y el **Activity Log unificado**.

## 5. Cierre de la cuarta pasada — cobertura ahora completa

Con esta pasada cubrí los 4 gaps que faltaban. Lo que queda SIN abrir y por qué no importa:

- **AI knowledge sources** (Settings) — es el repositorio de docs que alimenta el AI Agent (ya visto en la sección Sources del agente). Mismo concepto.
- **Chatter** — addon de pago de Kommo, irrelevante para la migración.
- **Webhooks** (botón en Integrations) — Kommo puede emitir webhooks a URLs externas. Concepto estándar, Mister Service ya tiene su propio `api/whatsapp/webhook.ts`.
- **Report by activities** a fondo — tabla de productividad por usuario, no aplica.
- **Nodos del bot por dentro (Message/Condition config)** — confirmado que no clonamos el bot builder, no vale el detalle.

**Conclusión final:** la cobertura del CRM Kommo ahora es completa para efectos de la decisión. Ningún hallazgo de esta 4ta pasada cambia las recomendaciones ni los 8 sprints. Confirman el patrón: **Kommo = inbox + atribución de leads + reportes de ventas. Mister Service = sistema operativo de reparación.** Lo único que Mister Service necesita de Kommo es la capa de inbox/conversación (sprints WA-CHAT), no la maquinaria de ventas.

