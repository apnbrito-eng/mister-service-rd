# Análisis crítico — Plan ejecutivo de Claude Desktop vs. WA-1 a WA-7 actuales

**Fecha:** 2026-05-18 noche
**Autor:** Cowork (Anthropic Claude) — análisis técnico senior pre-implementación
**Audiencia:** Jorge + futuro coordinator de Claude Code
**Estado:** Documento de planificación — NO se implementa nada de esto hasta que Jorge apruebe el plan resultante.

## Contexto

El 2026-05-18 noche Jorge trajo a esta sesión un "resumen ejecutivo" generado en otra conversación de Claude (Desktop o web). El plan propone un módulo CRM de WhatsApp para Mister Service RD con:

- Stack: **NestJS + PostgreSQL + BullMQ (Redis) + Socket.io**
- Storage: **S3 o Cloudflare R2**
- 8 sprints en 12 semanas
- Integración híbrida con **Chatwoot** como motor de inbox
- Modelo de datos SQL (contacts, conversations, messages, pipelines, templates, quick_replies)
- 6 plantillas Meta a aprobar (factura_emitida, cita_recordatorio_dia_anterior, cita_modificada, etc.)
- WhatsApp Flow JSON de 5 pantallas para agendar cita

**Problema fundamental:** ese plan fue producido sin contexto del repo Mister Service RD actual. Diseñó un sistema greenfield ignorando que ya existe:

- 187 sprints commiteados en producción
- Backend Firebase Firestore + Auth + Storage + Vercel serverless (NO NestJS, NO Postgres)
- 2 números WhatsApp Cloud API operativos hoy (token regenerado, POST /register hecho)
- 4 plantillas HSM **APPROVED** en producción Meta: `conduce_emitido`, `cita_confirmada`, `recordatorio_mantenimiento`, `garantia_por_vencer`
- 7 sprints WA-1 a WA-7 ya redactados en `docs/sprints/COLA_AUTONOMA.md` adaptados a la base Firebase
- 12 cazadores anti-regresión + 4 postmortems + sistema de roles + ERP completo

Este documento mapea el plan ejecutivo contra esa realidad, identifica:

1. **Discrepancias estructurales** — qué del plan NO se puede ni debe adoptar.
2. **Mejoras valiosas** — qué del plan SÍ enriquece nuestros WA actuales.
3. **Gaps comunes** — qué falta en ambos planes vs. CRMs reales del mercado.
4. **Plan de batalla recomendado** — síntesis priorizada lista para que Jorge apruebe.

---

## 1. Discrepancias estructurales del plan ejecutivo

### 1.1 Stack backend incompatible (CRÍTICO)

El plan propone NestJS + Postgres + BullMQ + Redis + Socket.io. Mister Service RD usa Firebase + Vercel serverless. Adoptar el stack del plan implicaría:

- **Reescribir el backend completo** del CRM existente. No solo el módulo WhatsApp — todo el ERP corre sobre Firestore.
- **Migración masiva de datos** de Firestore a Postgres. 9112 clientes + miles de órdenes/cotizaciones/facturas/citas.
- **Pérdida de 12 cazadores anti-regresión** que asumen modelo Firestore (P-001 a P-014).
- **Pérdida del sistema de roles + rules** ya estable (`firestore.rules` versionada, deploys controlados).
- **Pérdida de Realtime subscriptions** que toda la UI consume con `onSnapshot`.

**Costo estimado de migración stack:** 3-6 meses de re-escritura completa, alto riesgo de incidentes productivos.

**Veredicto:** **descartar 100%.** No tocar el stack. La integración WhatsApp debe ir sobre Firebase como ya están los WA-1 a WA-7.

### 1.2 Chatwoot híbrido — overkill innecesario

El plan recomienda integrar Chatwoot self-hosted como "motor de inbox" mientras la UI/CRM se construye custom encima.

**Por qué no aplica:**

- Chatwoot está diseñado para empresas que NO tienen CRM previo. Mister Service ya tiene ERP completo.
- Chatwoot requiere un servidor adicional (Postgres + Redis + Rails). Operacionalmente costoso (~$30-50/mes + DevOps).
- Sincronización entre Chatwoot y Firestore agrega complejidad: 2 fuentes de verdad para conversaciones, riesgo de divergencia.
- El supuesto "ahorro de 3 semanas" es ilusorio: integrar Chatwoot con un CRM propio (especialmente con asignación, pipelines y bot IA personalizados) suele consumir más tiempo del que ahorra.

**Lo que sí copiar de Chatwoot (sin instalarlo):**

- Sus patrones de UI inbox (lista izquierda + hilo derecho + panel cliente lateral). Ya está en WA-3 implícito.
- Su modelo de "saved replies" (quick replies). Falta agregar a WA actuales.
- Su sistema de labels/tags. Falta agregar.

**Veredicto:** **descartar Chatwoot.** Adoptar sus patrones UI conceptuales en WA-3.

### 1.3 Sprints 0-8 ignoran trabajo existente

El plan dice "Sprint 0 (1 sem): Preparación Meta (verificación, número, tokens, webhook)". Eso ya está hecho:

- 2 números Meta verificados (6767 + 6265).
- 4 plantillas APPROVED.
- Token System User generado.
- POST /register completado en ambos números.

Y propone "Sprint 1 (2 sem): Inbox básica con tracking de ventana 24h" como si arrancara de cero, ignorando que tenemos WA-1 (webhook) + WA-3 (UI conversaciones) escritos con touch-list real, criterios de aceptación, rules, restricciones específicas.

**Veredicto:** **descartar la numeración Sprint 0-8.** Los WA-1 a WA-7 actuales tienen mejor especificación técnica.

### 1.4 Plantillas con nombres incompatibles

El plan propone aprobar 6 plantillas nuevas:

| Plan ejecutivo | Estado Meta actual |
|---|---|
| `factura_emitida` | ❌ No existe. Sería redundante con `conduce_emitido` (mismo flujo de negocio para Mister Service: no se emite factura sin conduce). |
| `cita_recordatorio_dia_anterior` | ❌ No existe pero **VALIOSO**, se debe crear. |
| `cita_recordatorio_dia_de_la_cita` | ❌ No existe pero **VALIOSO**. |
| `cita_modificada` | ❌ No existe pero **VALIOSO** (cambio de fecha/hora/técnico). |
| `cita_cancelada` | ❌ No existe pero **VALIOSO**. |
| `tecnico_en_camino` | ❌ No existe pero **VALIOSO** (avisar cuando técnico inicia ruta). |

Y omite las 4 que ya tenemos APPROVED:

- `conduce_emitido` (cubre lo que el plan llama `factura_emitida`)
- `cita_confirmada` (post-agendamiento)
- `recordatorio_mantenimiento` (preventivo)
- `garantia_por_vencer` (CRM-driven, ya APPROVED)

**Veredicto:** **agregar 5 plantillas nuevas** del plan que SÍ son valiosas (descartando `factura_emitida` por redundancia). Mantener las 4 APPROVED actuales. Total objetivo: **9 plantillas**.

### 1.5 WhatsApp Flow JSON — innecesario para el caso de uso

El plan menciona un Flow JSON de 5 pantallas para agendar cita técnica via WhatsApp.

**Por qué no es prioritario:**

- Mister Service ya tiene `/agendar` form web público.
- WhatsApp Flows tiene **limitaciones técnicas** documentadas: sin geolocalización GPS nativa, sin autocompletado Google Maps (el plan lo admite). Para servicio técnico en RD donde dirección + GPS es crítico para router técnico → zona, perder esos campos degrada UX.
- Maintaining 2 formularios paralelos (web + Flow) duplica trabajo.

**Cuándo sí adoptarlo:**

- Cuando WhatsApp tenga >50% del volumen de leads.
- Cuando los clientes pidan explícitamente agendar sin salir de WhatsApp.
- Cuando Meta libere geo + maps en Flows (hoy en roadmap, sin fecha).

**Veredicto:** **descartar Flow JSON ahora.** Re-evaluar en 6 meses. Mientras tanto, el bot IA (WA-6) puede recolectar los mismos datos en conversación natural.

---

## 2. Mejoras valiosas del plan ejecutivo que SÍ adoptar

### 2.1 Pipelines/embudos configurables tipo Kanban — **ALTO valor**

El plan propone una entidad `pipelines + pipeline_stages` con vista Kanban. Hoy las órdenes tienen fase fija (`nuevo_lead → en_gestion → ... → cerrado`). No hay distinción visual entre flujos de venta vs. servicio vs. cobranza.

**Por qué es valioso:**

- Mister Service tiene 3 flujos distintos hoy mezclados: ventas (lead → cotización), servicio (orden → cierre), cobranza (factura → pagada). Kanban configurable los separa visualmente.
- Operativamente permite que cada rol vea su Kanban: Maria coordinadora ve "leads-a-clasificar / cotización-pendiente / aprobado", Wilainy operaria ve "asignado / en-camino / cerrado-sin-facturar".

**Cómo adaptar a Firebase:**

Crear colección `pipelines` y `pipeline_stages`:

```ts
// types/index.ts (nuevo)
interface Pipeline {
  id: string;
  nombre: string;          // "Servicio técnico", "Cobranza", "Marketing"
  tipo: 'venta' | 'servicio' | 'cobranza' | 'marketing';
  stages: PipelineStage[]; // inline o subcolección
  rolesPermitidos: Rol[];  // qué roles ven este pipeline
  activo: boolean;
}

interface PipelineStage {
  id: string;
  pipelineId: string;
  nombre: string;          // "Lead crudo", "Calificado", "Cotización", ...
  orden: number;
  color: string;
  diasMaximoEnStage?: number; // SLA opcional
}
```

Las órdenes existentes ganan `orden.pipelineId` + `orden.stageId` opcionales. Migración: detectar fase actual → mapear a stage equivalente del pipeline default.

**Esfuerzo:** sprint nuevo **SPRINT-WA-8** (~6-10h con Claude Code).

### 2.2 Window 24h tracking explícito en UI

El plan menciona "UI debe bloquear texto libre fuera de ventana 24h (error 131047)". WA-1 implementa el webhook pero no especifica este guard UI.

**Por qué es valioso:**

- Sin guard, una operaria puede escribir texto libre a un cliente que respondió hace >24h, el envío falla con error críptico de Meta, frustración operativa.
- Con guard, la UI deshabilita el composer de texto libre y solo permite plantillas HSM (claramente marcadas como "solo plantillas, este cliente respondió hace 26h").

**Cómo adaptar:**

Agregar a `whatsapp_conversaciones`:

```ts
interface Conversacion {
  ...
  ultimoMensajeEntranteAt?: Timestamp; // del cliente
  ventana24hVence?: Timestamp;          // computed: ultimoMensajeEntranteAt + 24h
  estadoVentana: 'abierta' | 'cerrada' | 'sin_mensajes';
}
```

UI lee `estadoVentana`. Si `cerrada`, composer texto libre se deshabilita + tooltip explica. Solo el selector de plantillas queda activo.

**Esfuerzo:** se integra en **WA-3** existente (~+2h adicionales).

### 2.3 Plantillas faltantes — 5 a crear

Crear en WhatsApp Manager (Meta tarda 24-72h aprobar):

| Plantilla | Categoría Meta | Uso | Variables propuestas |
|---|---|---|---|
| `cita_recordatorio_dia_anterior` | UTILITY | Cron WA-7: 1 día antes recordar cita | {{1}}=nombre, {{2}}=fecha, {{3}}=hora, {{4}}=técnico |
| `cita_recordatorio_dia_de` | UTILITY | Cron WA-7: día de la cita (mañana) | {{1}}=nombre, {{2}}=hora_aprox, {{3}}=técnico |
| `cita_modificada` | UTILITY | Cuando coord cambia fecha/hora/técnico | {{1}}=nombre, {{2}}=fecha_anterior, {{3}}=fecha_nueva, {{4}}=motivo |
| `cita_cancelada` | UTILITY | Cuando se cancela la orden | {{1}}=nombre, {{2}}=fecha, {{3}}=motivo |
| `tecnico_en_camino` | UTILITY | Botón técnico "iniciar viaje" → notifica cliente | {{1}}=nombre, {{2}}=técnico, {{3}}=tiempo_estimado |

**Esfuerzo Meta:** 30 min crear las 5 + 24-72h espera aprobación.
**Esfuerzo código:** 1-2h por plantilla integrarlas a flujo correspondiente.

### 2.4 Modelo `conversations` explícito + idempotencia con wamid

WA-1 actual escribe a `whatsapp_mensajes_inbox`. WA-3 lee `whatsapp_conversaciones`. Pero **no hay flujo explícito** que agrupe mensajes en conversaciones. El plan ejecutivo lo modela mejor:

```ts
interface Conversacion {
  id: string;
  contactWaId: string;       // tel cliente
  clienteId?: string;        // ref a `clientes` si está vinculado
  canal: 'whatsapp' | 'web_form';
  ultimoMensajeAt: Timestamp;
  ultimoMensajeTexto: string;       // preview en lista
  noLeidos: number;                  // counter
  asignadoA?: string;                // uid del staff
  pipelineId?: string;
  stageId?: string;
  estado: 'abierta' | 'pendiente' | 'cerrada';
  tags: string[];                    // ['urgente', 'cliente_vip']
  ventana24h: { vence?: Timestamp; estado: 'abierta'|'cerrada' };
  createdAt: Timestamp;
}

interface Mensaje {
  id: string;
  wamid: string;            // ID único de Meta para idempotencia
  conversacionId: string;
  direccion: 'in' | 'out';
  tipo: 'text' | 'image' | 'audio' | 'template' | 'button';
  contenido: any;
  estado?: 'sent' | 'delivered' | 'read' | 'failed';
  errorMeta?: string;
  enviadoPor?: string;       // staff uid si es out manual
  esBot?: boolean;           // si fue el bot IA
  timestamp: Timestamp;
}
```

**Por qué es mejor:** WA-1 actual escribe payload crudo de Meta. Eso es OK como log raw pero **no es consumible por UI**. Necesita un layer de "conversaciones" agregadas.

**Cómo adaptar:** WA-1 actual permanece (escribe inbox raw). Agregar **paso 2 en el mismo webhook** que: lee el mensaje raw, identifica/crea conversación, agrega mensaje a conversación, actualiza counters.

**Esfuerzo:** **modificar WA-1** para que produzca ambas estructuras (raw + agregadas). +3-4h sobre el alcance original.

### 2.5 Web Form unificado con WhatsApp

El plan menciona "inbox unificada de WhatsApp + Web Form". Mister Service tiene `/agendar` form público que escribe a `citas_por_confirmar`. Hoy esas citas se procesan en `/admin/citas`. No están en el mismo inbox que conversaciones WhatsApp.

**Por qué es valioso:**

- Operativamente, Maria coordinadora maneja 2 inboxes: WhatsApp + Citas por confirmar. Si están separados, fricción.
- Unificarlos en `/admin/inbox` con filtros (canal = WhatsApp / WebForm / Llamada manual) facilita asignación + priorización.

**Cómo adaptar:** las citas del form público se convierten en "conversaciones" virtuales con `canal: 'web_form'` + primer mensaje sintético "Lead web: solicita servicio para [equipo]. Falla: [texto]". A partir de ahí Maria puede responder por WhatsApp si el cliente lo dejó, o llamarlo manual.

**Esfuerzo:** sprint nuevo **SPRINT-WA-9** (~4-6h).

### 2.6 Mapeo variables HSM → datos CRM (decisión que faltaba)

El plan dice "Mapping de variables {{1}}..{{N}} de cada plantilla HSM a campos del CRM" como decisión pendiente. WA-5 actual no lo formaliza.

**Propuesta de mapping inicial:**

| Plantilla | Variables | Mapping al CRM |
|---|---|---|
| `conduce_emitido` | {{1}} nombre, {{2}} CG#, {{3}} monto | `cliente.nombre.split(' ')[0]`, `factura.numero`, `formatMoneda(factura.total)` |
| `cita_confirmada` | {{1}} nombre, {{2}} fecha, {{3}} hora, {{4}} técnico | similar al anterior |
| `recordatorio_mantenimiento` | {{1}} nombre, {{2}} último_servicio | `formatFechaCorta(cliente.legacyMetricas.fechaUltimoServicio)` |
| `garantia_por_vencer` | {{1}} nombre, {{2}} OS#, {{3}} fecha_vencimiento | calculado |
| `cita_recordatorio_dia_anterior` | {{1}} nombre, {{2}} fecha, {{3}} hora, {{4}} técnico | desde `orden.fechaCita` + `orden.tecnicoNombre` |
| `tecnico_en_camino` | {{1}} nombre, {{2}} técnico, {{3}} ETA | desde GPS actual del técnico + distancia |

Persistir mapeos en `whatsapp_plantillas/{name}.mappingCRM` para que el envío sea automático sin tocar código cuando se modifique.

**Esfuerzo:** agregar al **WA-5** (~+2h).

### 2.7 Decisiones pendientes que el plan identifica bien

El plan ejecutivo identifica 5 decisiones de negocio que faltaban:

1. **Mapping variables HSM → CRM** (resuelta arriba en 2.6).
2. **Routing zona → técnico del bot y fallback.**
3. **Política de window 24h** (texto libre con guard / o degradar a HSM automático).
4. **Límite de costos del bot Haiku** (per conversation cap).
5. **Naming de campañas** (ya estaba flagged en WA-4).

**Decisiones recomendadas (Jorge ajusta):**

| Decisión | Recomendación |
|---|---|
| Routing zona → técnico | Default: usar `cliente.zona` → buscar técnicos con esa zona en `personal.zonas[]`. Si match único, sugerir. Si múltiple, asignar al menos cargado. Si zero match, asignar a "sin asignar" + notif Maria. |
| Política window 24h | Guard UI estricto: texto libre deshabilitado fuera de ventana. Composer solo permite plantillas HSM. NO degradar automático (puede gastar plata sin saber). |
| Límite costos bot Haiku | $0.20 USD per conversation max. ~50 turnos antes de escalar a humano. Notif si una conversación supera $0.10. |
| Naming campañas | `[Producto]_[Objetivo]_[Audiencia]_[YYYYMM]_[Variante]` ej: `aires_leads_jardines_202605_a`. Auto-poblado por Cowork al crear campaña en Meta Ads. |

---

## 3. Gaps comunes — qué falta en AMBOS planes vs. CRMs reales

Análisis basado en benchmarks de Chatwoot, Front, Intercom, ManyChat, HubSpot Service Hub, Kommo (ex amoCRM), Twilio Flex.

### 3.1 Quick replies / saved replies — **falta** en ambos

CRMs maduros tienen una librería de "respuestas rápidas" que la operaria invoca con `/comando` o desde un menú: "Hola! Soy Maria de Mister Service, ¿en qué le puedo ayudar?", "Su orden está agendada para...". Reduce typing y mantiene tono consistente.

**Recomendación:** sprint nuevo **SPRINT-WA-10** (~3-4h). Colección `whatsapp_quick_replies` con shortcuts y body.

### 3.2 Tags/labels en conversaciones — **falta** en ambos

Permite a Maria etiquetar conversaciones: `urgente`, `cliente_vip`, `reclamo`, `referido`. Después filtrar por tag.

**Recomendación:** campo `conversacion.tags: string[]` + UI chips selector. Incluir en **WA-3** (+1h).

### 3.3 Notas internas — **falta** en ambos

Operaria escribe nota visible solo al staff ("Cliente me dijo por teléfono que prefiere efectivo, no copiar al chat"). Hoy en Mister Service, esto se hace ad-hoc en notas internas de la orden. Pero en conversaciones WhatsApp no hay equivalente.

**Recomendación:** mensaje tipo `internal_note` con flag, no se envía a Meta, visible solo en UI staff. Incluir en **WA-3** (+1h).

### 3.4 SLA tracking por conversación — **falta** en ambos

Timer desde último mensaje del cliente → primer respuesta del staff. Alerta si excede target (ej: >2h). Métrica Time-To-First-Response (TTFR) es estándar industria.

**Recomendación:** computar en cron job liviano cada 15 min. Notificación a coord si una conversación supera SLA. Sprint nuevo **SPRINT-WA-11** (~3-5h).

### 3.5 Routing rules avanzados — **falta** en ambos

Reglas tipo "si llega lead de campaña X → asignar a Wilainy. Si menciona 'garantía' → Maria. Si zona = Punta Cana → técnico Y. Si fuera de horario → bot IA."

**Recomendación:** entidad `whatsapp_routing_rules` con condiciones JSON + acciones. Sprint nuevo **SPRINT-WA-12** post-WA-6 (~6-8h).

### 3.6 Búsqueda full-text en conversaciones — **falta** en ambos

Operaria necesita buscar "Maytag 7kg" entre 500 conversaciones del último mes.

**Recomendación:** indexar mensajes en Algolia o servicio similar. O usar full-text de Firestore (limitado, pero alcanza para MVP). Sprint nuevo **SPRINT-WA-13** (~4-6h).

### 3.7 Mensajes programados — **falta** en ambos

"Mandar este recordatorio mañana 9am" — operaria escribe ahora, sistema envía después.

**Recomendación:** colección `whatsapp_mensajes_programados` + cron 5 min que dispara. Sprint nuevo **SPRINT-WA-14** (~3-4h).

### 3.8 Métricas de conversación — **falta** en ambos

KPIs estándar industria:
- **TTFR** (Time-To-First-Response) — primera respuesta.
- **TTR** (Time-To-Resolution) — cerrar conversación.
- **CSAT** (Customer Satisfaction) — encuesta post-cierre.
- **Conversion Rate** — leads → órdenes facturadas.

**Recomendación:** dashboard `/admin/whatsapp/metricas` con estos 4 KPIs. Sprint nuevo **SPRINT-WA-15** (~5-7h).

### 3.9 Encriptación campos sensibles — **falta** en ambos

Si en mensaje cliente comparte cédula, número de cuenta, etc. — debería encriptarse en Firestore (no plaintext). Compliance básico.

**Recomendación:** función `encryptSensitive(text)` con AES-256 + clave de Vercel env. Aplicar en webhook al persistir. Decryptar en UI staff bajo demanda. Sprint nuevo **SPRINT-WA-16** post-MVP (~4-6h).

### 3.10 Audit trail de asignaciones — **falta** en ambos

Quién asignó la conversación a quién y cuándo. Para auditoría operativa.

**Recomendación:** array `conversacion.historialAsignaciones[]` con `{de, a, por, en}`. Trivial agregar a **WA-3** (+0.5h).

---

## 4. Tabla maestra — discrepancias + mejoras + gaps por sprint

| Sprint actual | Estado | Plan ejecutivo coincide? | Mejoras a integrar | Gaps a cubrir |
|---|---|---|---|---|
| **WA-1** webhook entrante | Bien definido | Sí, en líneas generales | Modelo `conversations` agregado (2.4), window 24h tracking (2.2) | Encriptación campos sensibles (3.9) |
| **WA-2** servicio saliente | Bien definido | Sí | Window 24h guard llamada (2.2) | Mensajes programados (3.7) |
| **WA-3** UI conversaciones | Bien definido | Parcial — plan menciona Kanban pero WA-3 actual es solo inbox | Quick replies (3.1), tags (3.2), notas internas (3.3), audit asignaciones (3.10) | Búsqueda full-text (3.6) |
| **WA-4** tracking referral | Bien definido | Sí, plan menciona | Mapping variables HSM (2.6) | Naming campañas (decisión negocio) |
| **WA-5** plantillas HSM | Bien definido | Plan propone 6 plantillas, 5 valiosas | Crear 5 nuevas plantillas (2.3) | Mapeo automático CRM (2.6) |
| **WA-6** Bot IA Haiku | Bien definido pero faltan decisiones | Plan no menciona bot | Sin cambios mayores | Límite costos (3.8 indirect) |
| **WA-7** crons proactivos | Bien definido | Sí, plan menciona recordatorios | Plantillas nuevas (2.3) | Mensajes programados manual (3.7) |
| **SPRINT-WA-8** (nuevo) | — | Plan propone | Pipelines/Kanban configurables (2.1) | — |
| **SPRINT-WA-9** (nuevo) | — | Plan propone | Web Form unificado con WhatsApp (2.5) | — |
| **SPRINT-WA-10** (nuevo) | — | Industria standard | — | Quick replies (3.1) |
| **SPRINT-WA-11** (nuevo) | — | Industria standard | — | SLA tracking + TTFR (3.4) |
| **SPRINT-WA-12** (nuevo) | — | Industria standard | — | Routing rules avanzado (3.5) |
| **SPRINT-WA-13** (nuevo) | — | Industria standard | — | Búsqueda full-text (3.6) |
| **SPRINT-WA-14** (nuevo) | — | Industria standard | — | Mensajes programados (3.7) |
| **SPRINT-WA-15** (nuevo) | — | Industria standard | — | Métricas TTFR/TTR/CSAT (3.8) |
| **SPRINT-WA-16** (nuevo) | — | Compliance básico | — | Encriptación campos (3.9) |

Total sprints WhatsApp del plan integrado: **16** (los 7 actuales + 9 nuevos).

---

## 5. Plan de batalla recomendado — 3 fases

### Fase 1 — MVP funcional (Sprints en orden, ~30-40h de Claude Code distribuidos en 2-3 semanas)

Lo mínimo para reemplazar el flujo actual `wa.me/?text=...` con automation real:

1. **WA-1 mejorado** webhook entrante + modelo conversaciones + window 24h tracking + encriptación básica.
2. **WA-2 mejorado** servicio saliente + guard window 24h.
3. **WA-3 mejorado** UI conversaciones + quick replies + tags + notas internas + audit asignaciones.
4. **WA-5 mejorado** plantillas HSM con mapping CRM + crear las 5 nuevas plantillas en Meta.

**Salida de fase 1:** operativa tiene inbox real con tracking 24h, puede responder con texto + plantillas, ve quién está asignado, etiqueta urgencias, deja notas internas. Reemplaza el `wa.me/` manual actual.

**No tocar todavía:** bot IA, pipelines, crons, métricas.

### Fase 2 — Automatización (Sprints en orden, ~25-35h, 2-3 semanas)

1. **WA-7** cron jobs recordatorios + NPS + garantía.
2. **WA-4** tracking referral campañas.
3. **WA-9** Web Form unificado en inbox.
4. **WA-6** Bot IA Claude Haiku (lo más complejo, va al final de fase 2).

**Salida de fase 2:** sistema envía recordatorios automáticos, captura leads de Click-to-WhatsApp con campaña, bot atiende 24/7 capturando datos básicos.

### Fase 3 — Diferenciación enterprise (Sprints opcionales, ~30-40h, 3-4 semanas)

1. **WA-8** pipelines/Kanban configurables.
2. **WA-11** SLA tracking + TTFR.
3. **WA-15** métricas TTFR/TTR/CSAT.
4. **WA-12** routing rules avanzado.
5. **WA-10** quick replies (si no se hizo en fase 1).
6. **WA-13** búsqueda full-text.
7. **WA-14** mensajes programados.
8. **WA-16** encriptación campos sensibles avanzada.

**Salida de fase 3:** CRM-grade. Comparable con Front/Intercom para servicio técnico, pero conectado al ERP propio.

---

## 6. Decisiones de negocio — confirmadas por Jorge 2026-05-18 noche

Las 7 decisiones quedaron resueltas en la opción "Recomendada" en sesión Cowork:

| # | Decisión | Resolución Jorge |
|---|---|---|
| 1 | Adopción pipelines/Kanban (WA-8) | ✅ **SÍ** — 3 flujos visualmente separados (venta, servicio, cobranza). Cada rol ve su Kanban. Sprint nuevo en Fase 3. |
| 2 | Crear 5 plantillas Meta faltantes | ✅ **SÍ, esta semana** — `cita_recordatorio_dia_anterior`, `cita_recordatorio_dia_de`, `cita_modificada`, `cita_cancelada`, `tecnico_en_camino`. Meta 24-72h aprobación. |
| 3 | Window 24h guard UI estricto | ✅ **SÍ** — UI deshabilita composer texto libre fuera de ventana. Solo plantillas HSM permitidas. Evita errores Meta + gastos sorpresa. |
| 4 | Límite costo bot Haiku | ✅ **$0.20 USD por conversación** — ~50 turnos antes de escalar a humano. Notif admin si supera $0.10. Estimado total: $5-15/mes. |
| 5 | Mapeo variables HSM → datos CRM | ✅ **Mapping automático** según sección 2.6 — `whatsapp_plantillas/{name}.mappingCRM` formaliza el binding por plantilla. |
| 6 | Routing zona → técnico | ✅ **Default propuesto** — `cliente.zona` → `personal.zonas[]` match. Único: asignar. Múltiple: menos cargado. Zero: "sin asignar" + notif Maria. |
| 7 | Naming campañas | ✅ **Formato estructurado** — `[Producto]_[Objetivo]_[Audiencia]_[YYYYMM]_[Variante]`. Ej: `aires_leads_jardines_202605_a`. Cowork auto-completa al crear. |

**Decisiones registradas y listas para procesar.** El coordinator de Claude Code puede arrancar Fase 1 cuando Jorge dé el OK.

---

## 7. Lo que se descarta del plan ejecutivo (definitivo)

- ❌ Stack NestJS + PostgreSQL + BullMQ + Redis + Socket.io.
- ❌ Storage S3/R2.
- ❌ Chatwoot híbrido.
- ❌ Numeración Sprint 0-8 del plan.
- ❌ Plantilla `factura_emitida` (redundante con `conduce_emitido`).
- ❌ WhatsApp Flow JSON 5 pantallas (re-evaluar en 6 meses).

---

## 8. Conclusión

El plan ejecutivo de Claude Desktop tiene **buenas ideas conceptuales** pero está **arquitectónicamente desconectado** del repo real de Mister Service RD. Adoptarlo tal cual implicaría tirar 6 meses de trabajo a la basura.

La síntesis recomendada:

- **Mantener stack actual** (Firebase + Vercel).
- **Mantener los 7 sprints WA-1 a WA-7** como están escritos (ya son sólidos técnicamente).
- **Agregar 9 sprints nuevos** (WA-8 a WA-16) tomando ideas del plan ejecutivo + gaps de CRMs reales.
- **Tomar las 5 plantillas faltantes** del plan ejecutivo, descartar `factura_emitida`.
- **Mejorar WA-3 con quick replies + tags + notas internas + audit** (todos estándar industria).
- **Procesar en 3 fases** distribuidas en 6-9 semanas, no en una sola sesión de 25-40 horas.

El total de trabajo es similar (3 meses) pero **respeta el código existente, no rompe producción y aprovecha el sistema anti-regresión** ya en funcionamiento.

---

**Próximos pasos sugeridos para Jorge:**

1. Leer este documento entero.
2. Responder las 7 decisiones de negocio (sección 6).
3. Crear las 5 plantillas Meta faltantes esta semana (paralelo, sin código).
4. Cuando regreses a Claude Code, pegale: "procesá Fase 1 según `docs/sprints/ANALISIS_PLAN_WHATSAPP_VS_PLAN_EJECUTIVO.md` con las decisiones de Jorge: [las 7 respuestas]".
5. El coordinator integra los mejoras al touch-list de cada sprint y procesa con OK manual por bloque (como ya estaba en Opción A).
