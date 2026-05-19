# Módulo WhatsApp Cloud API — arquitectura de referencia

**Estado:** SPEC v0.2 — 10 decisiones de negocio FIRMES al 2026-05-19. SPRINT-WA-0 cerrado. Implementación arrancando con SPRINT-WA-RULES → SPRINT-WA-1.

**Decisión arquitectónica raíz (2026-05-15):** integración **directa a Meta Cloud API**, sin BSP intermediario (no Wati, no 360dialog). Endpoints serverless en `api/whatsapp/*` siguiendo el patrón existente de `api/gps/ubicacion.ts`.

**Audiencia:** coordinator + builders + Jorge. Sirve como mapa cuando se procesen los sprints WA, y como referencia "cómo extender" para features futuras.

---

## Decisiones de negocio FIRMES (D1-D10, OK Jorge 2026-05-19)

| # | Decisión | Valor firme | Impacto |
|---|---|---|---|
| **D1** | Número default envío | **Sticky por conversación** — usa el último `phoneNumberId` que el cliente usó. Override manual disponible en composer. | `whatsapp_conversaciones.ultimoPhoneNumberId` se respeta. Composer expone dropdown para override puntual. |
| **D2** | 2 números → conversaciones | **1 conversación por `wa_id`** — doc id `whatsapp_conversaciones/{wa_id}` único; `phoneNumberId` se preserva por mensaje individual. | Operaria ve historial completo del cliente sin importar a qué número escribió. |
| **D3** | Horario bot | **Bot 24/7 con escalación a humano por triggers.** Cambio B→A el 2026-05-19 noche por decisión Jorge: respuesta instantánea + UX consistente. La plantilla `auto_respuesta_fuera_horario` (en approval Meta) queda como FALLBACK de emergencia (bot caído, ban temporal, mantenimiento), NO flujo normal. | `whatsapp_config.bot.horario.activo = false`, `fueraDeHorario = 'siempre_bot'`. Plantilla referenciada con `plantillaFueraHorarioModo = 'fallback_emergencia'`. |
| **D4** | Plantillas autónomas del bot | **Solo categoría UTILITY** (ej. `cita_confirmada` post-creación OS). MARKETING requiere acción operaria. | Bot no manda marketing autónomamente — previene abuso/spam. |
| **D5** | Límite turnos | **20 turnos** por conversación. Al alcanzar → escalar a humano. | `whatsapp_config.bot.limiteTurnosConversacion = 20`. |
| **D6** | Roles autorizados envío UI | **admin, coord, secretaria, operaria.** Técnico/ayudante NO mandan WhatsApp. | `api/whatsapp/send.ts` valida `rol ∈ [admin, coord, secretaria, operaria]`. |
| **D7** | Body literal plantillas | **Cron `sync-plantillas` corre primero**; mapping CRM se ajusta tras ver bodies reales. | WA-5 desplegado antes que WA-2 puede mandar plantillas reales. |
| **D8** | Opt-out automático | **STOP/BAJA/NO MAS → `whatsapp_config.optOuts[]` + `clientes/{id}.optOutMarketing=true`.** Defense-in-depth. | Webhook entrante detecta keywords, agrega a opt-outs. `api/whatsapp/send.ts` rechaza si cliente está en opt-out. |
| **D9** | Plan Vercel | **Pro** — 3 crons separados OK (no consolidar). | `vercel.json` tendrá 3 entradas independientes: `sync-plantillas`, `recordatorios-mantenimiento`, `garantias-por-vencer`. |
| **D10** | Tono/nombre bot | **"Fixman"**. Trato: **usted en primer turno, tú si cliente lo usa primero (adaptive)**. | System prompt v1.0 lo refleja — ver `docs/specs/bot-ia-system-prompt.md`. |

**Cambio D3 B→A (2026-05-19 noche):** Jorge decidió que el bot atienda 24/7 con escalación a humano por los 7 triggers (palabras clave, intentos fallidos, urgencia, complejo, límite turnos, venta perdida potencial, post-venta). La plantilla `auto_respuesta_fuera_horario` está en approval Meta como FALLBACK de emergencia (uso administrativo manual, no parte del flujo normal). Esto DESBLOQUEA SPRINT-WA-6 — ya no depende de approval Meta.

**Próximas decisiones esperadas (no bloquean WA-RULES ni WA-1):**
- Naming format de campañas marketing (impacta WA-4 — se acuerda durante el sprint).
- (resuelto) ~~Plantilla auto-respuesta fuera de horario~~ — D3=A elimina dependencia del flujo normal.

---

## 0. Resumen ejecutivo

- **6 colecciones Firestore nuevas** (`whatsapp_mensajes_inbox`, `whatsapp_mensajes_outbox`, `whatsapp_conversaciones`, `whatsapp_plantillas`, `whatsapp_recordatorios_enviados`, `whatsapp_config`).
- **2 endpoints serverless** (`api/whatsapp/webhook.ts` GET+POST, `api/whatsapp/send.ts` POST).
- **3 cron jobs** (`sync-plantillas` c/12h, `recordatorios-mantenimiento` diario 10am RD, `garantias-por-vencer` lunes 11am RD).
- **6 rules nuevas** en `firestore.rules` (read staff oficina, write nunca desde cliente excepto campos UI seguros).
- **3 cazadores anti-regresión nuevos** (P-016 HMAC, P-017 idempotency, P-018 window 24h).
- **1 página UI nueva** `/admin/whatsapp` con bandeja + composer + selector plantilla.
- **4 permisos nuevos** en `PermisosSistema` (`whatsappVer`, `whatsappResponder`, `whatsappEnviarPlantilla`, `whatsappConfigurar`).
- **4 tipos de notificación nuevos** en `TipoNotificacion`.
- **Bot IA opcional** (Claude Haiku 4.5) con escalado a humano por 7 triggers.
- **2 números activos**: 6767 (Phone Number ID `1151997541323577` "Fixman Mister service") y 6265 (`1226992440486630` "Fixman 6265").

**Estimación:** 8 sprints (Sprint 0 pre-requisitos + WA-1 a WA-7). Riesgo de bug en producción alto si HMAC, idempotency o window 24h se omiten — los 3 cazadores nuevos son obligatorios.

---

## 1. Mapa de Firestore collections

Cada colección tiene un propósito atómico. Ninguna se escribe desde cliente — la admin SDK del serverless es el único actor con permiso de write para inbox/outbox/recordatorios.

### 1.1 `whatsapp_mensajes_inbox` (entrantes raw)

**Propósito:** log raw de cada mensaje que Meta nos manda. Fuente de verdad de "qué nos escribió el cliente". Idempotente por `wamid` (el id que provee Meta) → reintentos del webhook NO duplican docs.

**Doc id:** `{wamid}` (ej. `wamid.HBgMNTI5...`). Garantiza idempotencia con `setDoc(ref, data, { merge: false })` o `tx.set(...)` dentro de transacción.

**Campos clave:**

| Campo | Tipo | Notas |
|---|---|---|
| `wamid` | string | Duplicado del doc id para queries |
| `phoneNumberId` | string | `1151997541323577` (6767) o `1226992440486630` (6265) |
| `wa_id` | string | Teléfono normalizado RD 10 dígitos |
| `from` | string | Raw con `+1` |
| `tipo` | enum | `text` \| `image` \| `audio` \| `video` \| `document` \| `location` \| `button` \| `interactive` \| `reaction` \| `unsupported` |
| `contenido.texto` | string? | Si tipo=text |
| `contenido.mediaId` | string? | Si media — usar para descargar desde Meta |
| `contenido.storageUrl` | string? | URL permanente en Firebase Storage `/whatsapp/media/{wamid}` |
| `contenido.location` | object? | `{lat, lng, name?}` |
| `timestampMeta` | Timestamp | Lo que Meta dice |
| `timestampRecibido` | Timestamp | server timestamp al llegar a Vercel |
| `procesadoBot` | boolean | Si pasó por bot IA |
| `conversacionId` | string | FK a `whatsapp_conversaciones`, == `wa_id` |
| `raw` | object | Payload Meta sin tocar (debug, capear a 50KB) |

**Índices:**
- `conversacionId ASC, timestampMeta DESC` (render hilo)
- `procesadoBot ASC, timestampRecibido ASC` (cola async si se necesita)

**Rules:** read `esStaffOficina()`. **Write nunca desde cliente** (`allow write: if false`). Solo admin SDK del webhook escribe.

---

### 1.2 `whatsapp_mensajes_outbox` (salientes con tracking)

**Propósito:** log de mensajes que NOSOTROS mandamos. Tracking de estados Meta: `queued → sent → delivered → read → failed`.

**Doc id:** `nanoid()` local. Campo `wamid` indexado se popula al recibir respuesta de Meta. Razón: si Meta timeoutea pero igual envió, podemos reconciliar por nuestro id sin crear duplicado físico.

**Campos clave:**

| Campo | Tipo | Notas |
|---|---|---|
| `id` | string | nanoid local |
| `wamid` | string? | null hasta que Meta responde 200 |
| `phoneNumberId` | string | 6767 o 6265 |
| `wa_id` | string | Destinatario |
| `tipo` | enum | `texto_libre` \| `plantilla` \| `media` |
| `plantilla.nombre` | string? | `conduce_emitido` \| `cita_confirmada` \| `recordatorio_mantenimiento` \| `garantia_por_vencer` |
| `plantilla.idioma` | string | `es` o `es_DO` |
| `plantilla.variables` | string[] | Valores ordenados {{1}}, {{2}}, ... |
| `texto` | string? | Solo si `tipo='texto_libre'` y window 24h abierta |
| `estado` | enum | `queued` \| `sent` \| `delivered` \| `read` \| `failed` \| `deleted` |
| `errorMeta` | object? | `{code, mensaje, detalles?}` |
| `intentosEnvio` | number | Backoff 429 |
| `creadoPor` | string | `auth.uid` del operador, o `sistema_cron_recordatorios`, o `bot_ia` |
| `creadoPorNombre` | string | snapshot |
| `ordenId` | string? | FK a `ordenes_servicio` si nace de flujo de orden |
| `conversacionId` | string | == `wa_id` |
| `enviadoEn` / `entregadoEn` / `leidoEn` / `falladoEn` | Timestamp? | Timestamps de estado |
| `createdAt` | Timestamp | serverTimestamp() al crear |

**Índices:**
- `conversacionId ASC, createdAt DESC` (render hilo)
- `estado ASC, createdAt ASC` (dashboard fallidos + reintentos)
- `wamid ASC` (resolución status callback → outbox)
- `ordenId ASC, createdAt DESC` (auditoría: qué le mandamos al cliente de OS-1234)

**Rules:** read `esStaffOficina()`. **Write nunca desde cliente** — el cliente llama `api/whatsapp/send.ts` que escribe vía admin SDK. Defense-in-depth: `allow write: if false`.

---

### 1.3 `whatsapp_conversaciones` (agregado por contraparte)

**Propósito:** estado consolidado por `wa_id`. Último mensaje, no leídos, bot vs humano, contexto del bot, window 24h.

**Doc id:** `{wa_id}` (teléfono normalizado RD 10 dígitos). Un solo doc por cliente WhatsApp.

**Campos clave:**

| Campo | Tipo | Notas |
|---|---|---|
| `wa_id` | string | Duplicado del doc id |
| `clienteId` | string? | FK a `clientes` — null si número nuevo |
| `clienteNombre` | string? | snapshot |
| `ultimoPhoneNumberId` | string | 6767 o 6265 (decisión D2 define si separamos por número) |
| `ultimoMensajeEntrante.timestamp` | Timestamp | **CLAVE para window 24h** |
| `ultimoMensajeEntrante.preview` | string | Primeros 80 chars |
| `ultimoMensajeSaliente` | object? | Mismo shape |
| `noLeidos` | number | Badge sidebar |
| `requiereHumano` | boolean | Bot escaló a operaria |
| `requiereHumanoMotivo` | enum? | `palabra_clave` \| `tres_intentos_fallidos` \| `urgencia_detectada` \| `mensaje_complejo` \| `limite_turnos` \| `venta_perdida_potencial` \| `manual` |
| `asignadaA` | string? | `uid` de la operaria que tomó la conversación |
| `asignadaANombre` | string? | snapshot |
| `bot.habilitado` | boolean | false una vez escaló a humano |
| `bot.turnosCount` | number | Hard limit 20 default |
| `bot.contexto.ultimaIntencion` | enum? | `cita` \| `precio` \| `estado_orden` \| `queja` \| `saludo` \| `otro` |
| `bot.contexto.datosRecolectados` | object | `{equipoTipo?, equipoMarca?, descripcionFalla?, zona?, direccion?, fechaPreferida?}` |
| `bot.contexto.intentosFallidosSeguidos` | number | Resetea con cada éxito |
| `ventana24h.abierta` | boolean | computed |
| `ventana24h.cierraEn` | Timestamp? | `ultimoMensajeEntrante + 24h` |
| `totalMensajesEntrantes` / `totalMensajesSalientes` | number | Contadores |
| `primeraInteraccion` / `ultimaActividad` | Timestamp | Index para sort |
| `etiquetas` | string[] | `vip`, `b2b`, `reclamo_garantia` — UI lo setea |
| `updatedAt` | Timestamp | |

**Índices:**
- `requiereHumano ASC, ultimaActividad DESC` (bandeja "necesita humano")
- `asignadaA ASC, ultimaActividad DESC` (mis conversaciones)
- `clienteId ASC` (hidratar ficha cliente)
- `ultimaActividad DESC` (bandeja global)

**Rules:**
- Read `esStaffOficina()`.
- **Update parcial permitido a `esStaffOficina()`** sobre campos UI seguros (`asignadaA`, `etiquetas`, `noLeidos`, `requiereHumano=false` para "tomar control", `bot.habilitado=false` para "apagar bot").
- **Campos críticos inmutables desde cliente** (`ultimoMensaje*`, `totales*`, `ventana24h`, `primeraInteraccion`, `bot.contexto.*`) — solo admin SDK los toca.
- Patrón de inmutabilidad usa `.get(field, null)` siguiendo precedente de `campanas_marketing` (firestore.rules:633). Ver gotcha en CLAUDE.md.

---

### 1.4 `whatsapp_plantillas` (cache HSM aprobadas Meta)

**Propósito:** cache local de plantillas HSM aprobadas. Sync c/12h via cron desde Graph API. UI muestra solo `estado='APPROVED'`. Mapping de variables al CRM vive acá editable por admin sin redeploy.

**Doc id:** `{nombre}__{idioma}` (ej. `conduce_emitido__es`). Permite múltiples idiomas.

**Campos clave:**

| Campo | Tipo | Notas |
|---|---|---|
| `nombre` | string | `conduce_emitido` |
| `idiomaCode` | string | `es`, `es_DO` |
| `idMeta` | string | `3315829318618800` |
| `categoria` | enum | `MARKETING` \| `UTILITY` \| `AUTHENTICATION` |
| `estado` | enum | `APPROVED` \| `PENDING` \| `REJECTED` \| `DISABLED` |
| `componentes` | array | Body con `{{1}}..{{N}}`, header opcional, botones opcionales |
| `cantidadVariables` | number | Calculado de regex `/\{\{\d+\}\}/g` sobre body |
| `mappingCRM` | object? | `{ "1": "cliente.nombre", "2": "orden.numero", ... }` (ver sección 3) |
| `ultimaSincronizacion` | Timestamp | |
| `rawMeta` | object | Payload Graph API completo |

**Índices:** `estado ASC, nombre ASC`.

**Rules:** read `esStaff()` (cualquier rol que envía mensajes necesita conocer plantillas). Write `false` (solo admin SDK desde cron). Mappings CRM se editan desde UI admin que llama un endpoint serverless con admin SDK.

---

### 1.5 `whatsapp_recordatorios_enviados` (idempotencia crons)

**Propósito:** evitar que un cron que corre 2x por bug Vercel mande 2 mensajes al mismo cliente.

**Doc id:** `{tipo}__{entidadId}__{fechaYYYYMMDD}`. Ej.:
- `mantenimiento__cliente_abc123__2026-05-18` (un recordatorio de mantenimiento por cliente por día).
- `garantia__OS-0987__2026-05-18` (un recordatorio de garantía por orden por día).

**Campos clave:** `tipo`, `entidadId`, `clienteId`, `wa_id`, `plantillaUsada`, `outboxId` (FK), `fechaEnvio`, `resultado` (`enviado` \| `fallido`), `motivo` (si falló).

**Rules:** read `esStaffOficina()`. Write `false`.

---

### 1.6 `whatsapp_config` (doc único de configuración)

**Propósito:** configuración operativa del módulo. **Secretos NO viven acá** — viven en `process.env.*` de Vercel.

**Doc id fijo:** `whatsapp_config/sistema`.

**Campos clave:**

```typescript
{
  numerosActivos: [
    { phoneNumberId: '1151997541323577', display: '6767', nombre: 'Fixman Mister service', activo: true },
    { phoneNumberId: '1226992440486630', display: '6265', nombre: 'Fixman 6265', activo: true },
  ],
  numeroDefaultEnvio: '1151997541323577', // override por conversación (sticky) — ver D1
  bot: {
    habilitadoGlobal: boolean,       // kill-switch
    horario: {
      activo: boolean,
      inicio: '08:00',
      fin: '18:00',
      zona: 'America/Santo_Domingo',
      fueraDeHorario: 'auto_responder_plantilla' | 'silenciar' | 'siempre_bot',
    },
    limiteTurnosConversacion: 20,
    palabrasEscaladoHumano: string[],
    palabrasUrgencia: string[],
    umbralCaracteresComplejo: 200,
  },
  optOuts: string[],                  // wa_ids que pidieron STOP
  routingZonas: { [zonaNombre]: tecnicoUid },  // ver sección 5
  costosReferencia: {                 // tabla manual desde Meta Business Manager
    marketing_DO: 2.5,                // RD$ aprox por conversación
    utility_DO: 0.5,
    authentication_DO: 0.3,
  },
}
```

**Secretos (vivien en `process.env.*`, NO en este doc):**
- `META_VERIFY_TOKEN` — handshake GET webhook.
- `META_APP_SECRET` — HMAC SHA256.
- `META_ACCESS_TOKEN` — System User token permanente.
- `META_WABA_ID=1884486412326904`, `META_BUSINESS_ID=103664415995101`, `META_APP_ID=1558940908663280`, `META_PHONE_NUMBER_ID=1151997541323577` (default), `META_API_VERSION=v21.0`.
- `FIREBASE_ADMIN_SERVICE_ACCOUNT_BASE64` (o el patrón actual de `api/_lib/firebaseAdmin.ts`).
- `ANTHROPIC_API_KEY` — Bot IA.

**Rules:** read `esAdminOCoord()`. Write `esAdmin()`. UI admin tiene formularios para los campos no críticos (horario, palabras escalado, routing zonas).

---

### Colección RECHAZADA: `whatsapp_eventos_webhook`

Idea original: log raw de cada POST de Meta para forensia. **Descartada** porque:
1. `whatsapp_mensajes_inbox.raw` ya guarda el payload completo.
2. Status callbacks (delivered/read) ya actualizan `whatsapp_mensajes_outbox` con timestamps.
3. Costo Firestore: ~10x escrituras adicionales innecesarias.

Si después se necesita forensia profunda → logs estructurados a Vercel + rotación a bucket Storage via cron diario. Sprint follow-up cuando aplique.

---

## 2. Flujo entrante (cliente → Meta → nosotros)

```
┌─────────────┐       ┌──────────────┐       ┌──────────────────────────────┐
│  Cliente WA │──msg─▶│  Meta Cloud  │──POST▶│  api/whatsapp/webhook.ts     │
│ (8095551234)│       │  API         │       │  (Vercel serverless)         │
└─────────────┘       └──────────────┘       └──────────┬───────────────────┘
                                                         │
            ┌────────────────────────────────────────────┼────────────────────┐
            ▼ 1. HMAC validation                         ▼ 2. Idempotency     ▼ 3. Persist
      ┌──────────────────┐                  ┌────────────────────┐    ┌──────────────────────┐
      │ verify x-hub-    │  fail → 401      │ tx.get(wamid)      │    │ tx.set(inbox/wamid)  │
      │ signature-256    │                  │ if exists → 200    │    │ tx.set(conv/wa_id)   │
      │ con APP_SECRET   │                  │   (no-op)          │    │ atómicamente         │
      └──────────────────┘                  └────────────────────┘    └──────────┬───────────┘
                                                                                   │
                                                          ┌────────────────────────┴───────────────┐
                                                          ▼                                        ▼
                                                ┌──────────────┐                       ┌──────────────────┐
                                                │ status       │                       │ mensaje entrante │
                                                │ callback?    │                       │ nuevo?           │
                                                └──────┬───────┘                       └────┬─────────────┘
                                                       │ sí                                  │ sí
                                                       ▼                                     ▼
                                          ┌─────────────────────────┐         ┌─────────────────────────────┐
                                          │ update outbox/{wamid}   │         │ ¿conv.bot.habilitado &&     │
                                          │ con estado nuevo        │         │   !requiereHumano &&        │
                                          │ (delivered/read/failed) │         │   horario OK?               │
                                          └─────────────────────────┘         └────┬─────────────┬──────────┘
                                                                                    │ sí          │ no
                                                                                    ▼             ▼
                                                                  ┌──────────────────┐     ┌────────────────────┐
                                                                  │ runBotIA(msg)    │     │ crearNotificacion  │
                                                                  │ Anthropic call   │     │ a operaria activa  │
                                                                  │ sincrónico <8s   │     │ (sidebar badge)    │
                                                                  └────────┬─────────┘     └────────────────────┘
                                                                           │
                                                                           ▼
                                                          ┌────────────────────────────────┐
                                                          │ ¿bot decide responder?         │
                                                          │  - sí texto: send.ts interno   │
                                                          │  - sí plantilla utility: idem  │
                                                          │  - no (escala): notif operaria │
                                                          └────────────────────────────────┘
                                                                           │
                                                                           ▼ retornar 200 a Meta
                                                                  (siempre <10s o reintenta)
```

### Decisiones críticas del flujo entrante

**A. HMAC validation** (cazador P-016 obligatorio):

- Header `X-Hub-Signature-256: sha256=<hex>` → `crypto.createHmac('sha256', META_APP_SECRET).update(rawBody).digest('hex')` y comparar con `crypto.timingSafeEqual()` (anti-timing attack).
- Si falla → `res.status(401).json({ error: 'invalid signature' })`.
- **CRÍTICO:** `req.body` debe leerse como `Buffer` raw, NO el JSON parseado por Vercel. Configurar `export const config = { api: { bodyParser: false } }` y parsear manualmente después del HMAC.

**B. Idempotency** (cazador P-017 obligatorio):

```typescript
await runTransaction(adminDb, async tx => {
  const ref = doc(adminDb, 'whatsapp_mensajes_inbox', wamid);
  const snap = await tx.get(ref);
  if (snap.exists()) return; // reintento Meta — no-op
  tx.set(ref, payloadInbox);
  tx.set(doc(adminDb, 'whatsapp_conversaciones', wa_id), conversacionUpdate, { merge: true });
});
```

Atomicidad inbox + conversaciones en el MISMO `runTransaction`. Si crashea entre los dos, no queda estado parcial.

**C. `whatsapp_conversaciones` se actualiza en el MISMO POST handler.** Razón:

1. No tenemos Cloud Functions habilitadas (solo Vercel serverless).
2. Atomicidad: si triggerizamos vía Cloud Function, hay ventana de inconsistencia.
3. Costo: 1 invocación vs 2.

**D. Trigger del Bot IA: sincrónico dentro del POST.**

- Meta da 10s de timeout. Anthropic Haiku 4.5 responde en 1-3s. Margen amplio.
- Sin cola Pub/Sub ni QStash mientras volumen sea bajo (<500 conversaciones/mes).
- Si Anthropic timeoutea o falla → fallback graceful: crear notificación a operaria, marcar `requiereHumano=true`. Cliente NO queda en limbo.
- Si volumen sube → migrar a cola (sprint follow-up).

**E. Webhook GET verify (handshake inicial Meta):**

```
GET /api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=<X>&hub.challenge=<Y>
→ si X === process.env.META_VERIFY_TOKEN → return text plain Y
→ sino → return 403
```

Mismo endpoint maneja GET y POST.

---

## 3. Flujo saliente (UI/cron → Meta → callback)

```
┌────────────────┐
│ UI BandejaWA   │
│ ó cron Vercel  │
│ ó bot IA       │
└───────┬────────┘
        │ POST /api/whatsapp/send
        │ Authorization: Bearer <idToken>
        │ Body: { wa_id, tipo, plantilla?, texto?, ordenId? }
        ▼
┌────────────────────────────────────────────────────────────────────┐
│ api/whatsapp/send.ts                                               │
│                                                                    │
│  1. verifyIdToken → rolCaller (patrón api/gps/ubicacion.ts)        │
│  2. Validar rol ∈ [admin, coord, secretaria, operaria]             │
│     (técnico/ayudante NO mandan WhatsApp directo)                  │
│  3. Validar body con schema                                        │
│  4. Si tipo='texto_libre' → chequear window 24h (P-018)            │
│     - read conversaciones/{wa_id}.ultimoMensajeEntrante.timestamp  │
│     - si (now - ts) > 24h → reject 422 + sugerir plantilla         │
│  5. Si tipo='plantilla' → validar variables vs whatsapp_plantillas │
│  6. tempId = nanoid()                                              │
│     setDoc(outbox/{tempId}, { estado:'queued', wamid:null, ... })  │
│  7. POST https://graph.facebook.com/v21.0/{phoneNumberId}/messages │
│     con header Authorization: Bearer ${META_ACCESS_TOKEN}          │
│  8. Si 429 → backoff exp con jitter (1s±0.5, 2s±1, 4s±2, 8s±4,     │
│     16s±8). Max 5 intentos. intentosEnvio++; si >5 → estado=failed │
│  9. Si 200 → update outbox/{tempId}.wamid + estado='sent'          │
│ 10. update conversaciones/{wa_id}.ultimoMensajeSaliente            │
│ 11. crearAuditoria('enviar_whatsapp', { wamid, plantilla, ... })   │
│ 12. return 200 con { id: tempId, wamid, estado }                   │
└────────────────────────┬───────────────────────────────────────────┘
                         │
                         ▼  (más tarde, async)
                ┌─────────────────────┐
                │ Meta callback POST  │ ──▶  /api/whatsapp/webhook.ts
                │ con statuses:[]     │      (rama "status callback")
                │ wamid + estado:     │      update outbox/{tempId}
                │ delivered/read/fail │      via query por wamid
                └─────────────────────┘
```

### Decisiones críticas del flujo saliente

**A. Auth.** Firebase ID token verify igual que `api/gps/ubicacion.ts`. Roles autorizados (D6 default propuesto): `administrador`, `coordinadora`, `secretaria`, `operaria`. NO técnico, NO ayudante (riesgo de fuga de marca + costo no controlado).

**B. Window 24h** — server check ANTES de llamar Meta:

- Si fuera de window y `tipo='texto_libre'` → `422 Unprocessable Entity` con `{ error: 'window_cerrada', sugerencia: 'Usar plantilla [conduce_emitido, cita_confirmada, ...]' }`.
- **NO degradación automática a plantilla** — el contenido sería distinto. La operaria decide qué plantilla mandar (decisión D5 confirma esta política).

**C. Estados outbox:**

| Estado | Cuándo |
|---|---|
| `queued` | Doc creado en Firestore, aún no llamamos a Meta |
| `sent` | Meta respondió 200 con `wamid` |
| `delivered` | Callback Meta `status='delivered'` |
| `read` | Callback Meta `status='read'` |
| `failed` | Meta 4xx/5xx después de 5 intentos, o callback `status='failed'` |
| `deleted` | Operaria borró desde UI (soft delete) |

**D. Backoff 429.** Meta rate limit ~80 mps por phone number. Nunca lo alcanzamos en volumen actual. Si igual responde 429: backoff exp con jitter, max 5 intentos, ~30s total.

**E. Idempotency contra duplicados Meta:** doc creado pre-call con `tempId` propio; si Meta timeoutea pero igual envió, el callback con wamid llega después y reconciliamos por `tempId` que va como `biz_opaque_callback_data`.

---

## 4. Mapeo de variables HSM → CRM

> **Pendiente confirmar el body literal de las 4 plantillas APPROVED** (decisión D7). El cron `sync-plantillas` lo trae automáticamente. Antes del primer envío real, validar el mapping propuesto abajo contra el body real.

### 4.1 `conduce_emitido` (id Meta 3315829318618800)

**Uso:** notificación post-emisión de conduce CG-#### con link al PDF.

| Variable | Campo CRM | Validación |
|---|---|---|
| `{{1}}` | `cliente.nombre` (primer nombre) | required, 1-60 chars |
| `{{2}}` | `factura.numero` o `conduce.numero` (`CG-####`) | required, regex `^CG-\d{4,}$` |
| `{{3}}` | URL pública del PDF (Firebase Storage signed URL 7d) | required, https |

**Botones del CTA (si la plantilla los tiene):** URL al PDF + número de contacto.

### 4.2 `cita_confirmada` (id Meta 954386164046647)

**Uso:** confirmación de cita (de `citas_por_confirmar` o agendamiento directo).

| Variable | Campo CRM | Validación |
|---|---|---|
| `{{1}}` | `cliente.nombre` | required |
| `{{2}}` | `orden.fechaCita` formateada `dd/MM/yyyy HH:mm` (date-fns/locale/es) | required |
| `{{3}}` | `orden.numero` (`OS-####`) | required |
| `{{4}}` | `tecnico.nombre` o `'nuestro equipo técnico'` si no asignado | optional |
| `{{5}}` | Link tracking `https://misterservicerd.com/tracking/{token}` si `trackingGPS.activo` | optional |

### 4.3 `recordatorio_mantenimiento` (id Meta 2151324502097238)

**Uso:** cron diario. Identifica clientes con último servicio entre 5-7 meses atrás.

| Variable | Campo CRM | Validación |
|---|---|---|
| `{{1}}` | `cliente.nombre` | required |
| `{{2}}` | `mesesSinServicio` (computed: `differenceInMonths(now, ultimoCierre)`) | required, int |
| `{{3}}` | `equipoTipo` del último servicio | required |
| `{{4}}` | Link `/agendar?cliente={clienteId}&plantilla=recordatorio` | optional |

**Lógica de selección:**
1. Query `ordenes_servicio where estado='cerrado' and fechaCierre between (now-7m, now-5m)`.
2. Agrupar por `clienteId` (más reciente por cliente).
3. Filtrar: NO en `optOuts`, NO enviado en últimos 90 días (consulta `whatsapp_recordatorios_enviados`).

### 4.4 `garantia_por_vencer` (id Meta 2415325218966527)

**Uso:** cron semanal lunes. Órdenes con `garantia.estado='vigente'` y `garantia.fechaVencimiento` en próximos 15-30 días.

| Variable | Campo CRM | Validación |
|---|---|---|
| `{{1}}` | `cliente.nombre` | required |
| `{{2}}` | `orden.equipoTipo` + `orden.equipoMarca` (ej. "nevera LG") | required |
| `{{3}}` | Días que faltan (computed) | required, int |
| `{{4}}` | `orden.numero` | required |
| `{{5}}` | Link `/garantia/{token}` (endpoint ya existe) | optional |

**Existencia confirmada:** `OrdenServicio.garantia` (GarantiaInfo) tiene `estado` y `fechaVencimiento` — ver `src/types/index.ts:298`.

---

## 5. Política de window 24h

**Regla Meta (estricta):** se puede mandar texto plano SOLO si el cliente nos escribió en las últimas 24h. Fuera de eso → solo plantillas HSM.

### Cómo el sistema sabe si hay window abierta

Fuente única: `whatsapp_conversaciones/{wa_id}.ultimoMensajeEntrante.timestamp`.

```typescript
const ventanaAbierta = ultimoMensajeEntrante &&
  (Date.now() - ultimoMensajeEntrante.timestamp.toMillis()) < 24 * 60 * 60 * 1000;
```

- Webhook entrante setea `ventana24h.cierraEn = timestamp + 24h` en cada mensaje nuevo.
- UI lee este campo para mostrar banner y deshabilitar input texto libre.
- Server (`api/whatsapp/send.ts`) re-valida — NO confiar en cliente.

### Qué hace si operaria intenta mandar texto plano fuera de window

**Política: error con sugerencia, NO degradación automática a plantilla.**

Razones:
1. Si auto-degradamos, el contenido se pierde (las plantillas son fijas). La operaria piensa "le mandé X" pero llegó algo distinto. Riesgo de comunicación incoherente.
2. Las plantillas HSM cuestan (categoría utility/marketing) vs free para texto en window.
3. Educar al equipo: "esta conversación está cerrada — abrir con plantilla X" mejora el uso.

**UX:**
- Banner amarillo: *"Conversación cerrada hace Xh. Para reabrirla, envía una plantilla."*
- Input texto libre **deshabilitado**.
- Selector de plantillas **habilitado**.

---

## 6. Routing técnico por zona (bot crea OS automáticamente)

### Mapping zona → técnico

Vive en `whatsapp_config/sistema.routingZonas`, editable por admin desde UI. NO en `Personal.zona` directamente porque:
1. Un técnico puede cubrir varias zonas.
2. Una zona puede tener varios técnicos — el routing es decisión comercial, no atributo del técnico.

```typescript
routingZonas: {
  'Distrito Nacional': 'uid_tecnico_A',
  'Santo Domingo Este': 'uid_tecnico_A',
  'Santo Domingo Oeste': 'uid_tecnico_B',
  'Santiago': 'uid_tecnico_C',
  'general': 'uid_tecnico_fallback',  // catch-all
}
```

**Validación pre-save** del doc config: cada `uid` debe existir en `personal where rol='tecnico' and activo=true and uid != null`.

### Qué hace si la zona no matchea

**Política: crear OS sin técnico asignado + notificación a coord/admin para asignar manualmente.**

Razones:
- vs "asignar al técnico general": si el general no cubre esa zona, igual hay reasignación. Mejor que la coord vea la cola "sin asignar".
- vs "rechazar la cita": mala experiencia. El cliente ya dio sus datos al bot.

**Flujo:**
1. Bot recolecta `zona` (pregunta directa o detecta por sector mencionado).
2. Si `routingZonas[zona]` existe → `tecnicoId = ese uid`.
3. Si NO → `tecnicoId = '', tecnicoNombre = ''`.
4. Crear OS con `fase='nuevo_lead'`, `creadaPor='whatsapp_bot'`.
5. Si sin técnico: `crearNotificacion({ userId: coordinadora_uid, tipo: 'orden_asignada', titulo: 'Cita nueva sin técnico', mensaje: 'OS-####  zona "Punta Cana" — asignar manualmente' })`.

---

## 7. Política de escalado bot → humano (7 triggers)

| # | Trigger | Configurable | Acción |
|---|---|---|---|
| 1 | Palabra clave escalado (lista en `bot.palabrasEscaladoHumano`) | Sí | `requiereHumano=true`, motivo `palabra_clave` |
| 2 | 3 intentos sin entender (incremento `intentosFallidosSeguidos`) | Sí (umbral) | `requiereHumano=true`, motivo `tres_intentos_fallidos` |
| 3 | Urgencia detectada (lista + LLM evalúa tono) | Sí | `requiereHumano=true` + notif prioritaria, motivo `urgencia_detectada` |
| 4 | Mensaje complejo (LLM decide en system prompt) | No | `requiereHumano=true`, motivo `mensaje_complejo` |
| 5 | Fuera de horario | Sí (horario + modo) | Depende de `bot.horario.fueraDeHorario` |
| 6 | Límite turnos (default 20) | Sí | `requiereHumano=true`, motivo `limite_turnos` |
| 7 | Venta perdida potencial (LLM detecta queja precio) | No | `requiereHumano=true` + notif a coord, motivo `venta_perdida_potencial` |

**Detalles de cada trigger** y el system prompt que los implementa están en `docs/specs/bot-ia-system-prompt.md`.

**Cuando escala:**
1. `conversaciones/{wa_id}.requiereHumano = true`.
2. `conversaciones/{wa_id}.bot.habilitado = false` (bot deja de responder hasta que humano lo reactive).
3. `crearNotificacion({ tipo: 'whatsapp_requiere_humano', titulo: ..., mensaje: ... })` a operarias activas.
4. Mensaje al cliente: "Te conecto con una persona de nuestro equipo, te responde pronto." (decisión bot-prompt).
5. Audit log en `auditoria_admin` con `accion: 'bot_escalo_humano'`.

---

## 8. Cazadores anti-regresión nuevos

### P-016: HMAC validation en webhook entrante

**Archivo:** `scripts/invariantes/check-whatsapp-webhook-hmac.ts`

**Patrón:** `api/whatsapp/webhook.ts` debe contener TODOS:
- `crypto.createHmac('sha256', ...)`
- `req.headers['x-hub-signature-256']`
- `timingSafeEqual(`
- Lectura raw del body (no `req.body` parsed) — buscar `config = { api: { bodyParser: false } }`.

Si falta alguno → ERROR pre-commit.

### P-017: Idempotency en outbox y inbox

**Archivo:** `scripts/invariantes/check-whatsapp-idempotency.ts`

**Patrón a cazar:**
- `api/whatsapp/webhook.ts` debe usar `runTransaction` con `tx.get(wamidRef)` antes de `tx.set(...)`.
- `api/whatsapp/send.ts` debe generar `tempId` único pre-call y persistir doc antes de Meta.

### P-018: Window 24h check antes de texto libre

**Archivo:** `scripts/invariantes/check-whatsapp-window-24h.ts`

**Patrón:** en `api/whatsapp/send.ts`, si `tipo === 'texto_libre'`, debe haber lectura de `whatsapp_conversaciones/{wa_id}.ultimoMensajeEntrante.timestamp` y comparación `< 24h * ms`.

**Opcional P-019:** detectar tokens/secretos hardcoded (`META_APP_SECRET`, `META_ACCESS_TOKEN`, `META_VERIFY_TOKEN`) que NO sean references `process.env.X`.

---

## 9. Impactos cross-archivo del repo existente

### `firestore.rules` — 6 rules nuevas

```
match /whatsapp_mensajes_inbox/{docId}        → read esStaffOficina, write false
match /whatsapp_mensajes_outbox/{docId}       → read esStaffOficina, write false
match /whatsapp_conversaciones/{docId}        → read esStaffOficina, update parcial (asignadaA, etiquetas, etc.)
match /whatsapp_plantillas/{docId}            → read esStaff, write false (admin SDK cron)
match /whatsapp_recordatorios_enviados/{id}   → read esStaffOficina, write false
match /whatsapp_config/{docId}                → read esAdminOCoord, write esAdmin (no secretos acá)
```

**Reviewer obligatorio** (sub-regla CLAUDE.md sprints que tocan rules). Deploy con `npm run deploy:rules` antes de marcar COMPLETADO (cazador P-005).

### `CLAUDE.md` — gotchas nuevos esperados (capturar tras implementación)

1. **"Webhook entrante DEBE leer raw body antes de HMAC"** — Vercel default parsea JSON, romper esto invalida HMAC silenciosamente.
2. **"`whatsapp_conversaciones` no acepta write de campos críticos desde cliente"** — defensa contra spoof de `ultimoMensajeEntrante` para abusar window 24h.
3. **"Bot IA timeout debe degradar a humano, no a 500"** — UX: cliente espera respuesta, no error.
4. **"Mappings de variables HSM viven en `whatsapp_plantillas.mappingCRM`, no hardcoded en send.ts"** — admin puede ajustar sin redeploy.
5. **"Opt-out: cliente manda STOP → escribir a `whatsapp_config.optOuts[]` Y `clientes/{id}.optOutMarketing=true`"** — defense-in-depth.

### `package.json` — deps nuevas

- `firebase-admin` — verificar si ya está (auditoría dice que sí, `api/_lib/firebaseAdmin.ts` existe).
- `@anthropic-ai/sdk` — verificar (auditoría dice que sí, `api/ai/chat.ts` existe).
- `nanoid` — verificar (probable).
- `date-fns-tz` — para zona `America/Santo_Domingo` en horario bot.

Probable: cero deps nuevas mayores. Confirmar.

### `vercel.json` — 3 crons nuevos

```json
{
  "crons": [
    { "path": "/api/whatsapp/cron/sync-plantillas",           "schedule": "0 */12 * * *" },
    { "path": "/api/whatsapp/cron/recordatorios-mantenimiento", "schedule": "0 14 * * *" },
    { "path": "/api/whatsapp/cron/garantias-por-vencer",       "schedule": "0 15 * * 1" }
  ]
}
```

**ATENCIÓN billing:** Vercel Hobby permite 2 crons. Si estamos en Hobby → consolidar a 2 (combinar recordatorios + garantías en un solo endpoint con switch por path query). Si estamos en Pro → no problem. **Confirmar plan en BLOQUEOS D9.**

### `src/components/Sidebar.tsx` — entrada nueva

- Icon: `MessageCircle` o `MessageSquare` (lucide).
- Badge: count de `whatsapp_conversaciones where requiereHumano=true and (asignadaA==me || !asignadaA)`.
- Subscribe vía `onSnapshot` — **CUIDADO**: ya hay ~6 listeners en Dashboard. Recomendación: lazy subscribe solo cuando el usuario abre la página WhatsApp por primera vez en la sesión. Para el badge global, query unario rápido cada 60s en vez de listener permanente.
- Visible solo si `permisos.whatsappVer === true`.

### Permisos nuevos en `PermisosSistema`

```typescript
whatsappVer: boolean;                // ver bandeja
whatsappResponder: boolean;          // mandar texto libre en window
whatsappEnviarPlantilla: boolean;    // mandar plantillas HSM
whatsappConfigurar: boolean;         // editar whatsapp_config
```

Defaults por rol:

| Rol | Ver | Responder | Plantilla | Configurar |
|---|---|---|---|---|
| Administrador | ✓ | ✓ | ✓ | ✓ |
| Coordinadora | ✓ | ✓ | ✓ | ✓ |
| Secretaria | ✓ | ✓ | ✓ | ✗ |
| Operaria | ✓ | ✓ | ✓ | ✗ |
| Técnico | ✗ | ✗ | ✗ | ✗ |
| Ayudante | ✗ | ✗ | ✗ | ✗ |

### `notificaciones.service.ts` — 4 tipos nuevos

```typescript
| 'whatsapp_entrante_nuevo'      // cliente escribió por primera vez hoy
| 'whatsapp_requiere_humano'     // bot escaló
| 'whatsapp_envio_fallido'       // outbox quedó en 'failed' tras 5 intentos
| 'whatsapp_opt_out_cliente'     // cliente mandó STOP — marketing debe parar
```

Actualizar cazador `check-tipo-notificacion-huerfano.ts` si valida lista cerrada.

---

## 10. Cómo extender el módulo (para builders futuros)

### Agregar una plantilla HSM nueva

1. Crear plantilla en Meta Business Manager → esperar approval (24-72h).
2. Esperar próximo run del cron `sync-plantillas` (12h máx) o trigger manual.
3. Verificar que aparece en `whatsapp_plantillas/{nombre}__es` con `estado='APPROVED'`.
4. Editar `mappingCRM` desde UI admin (campo por variable).
5. Si se usa desde cron (recordatorios), agregar lógica de selección en el endpoint de cron correspondiente.

### Agregar un nuevo trigger de escalado bot

1. Decidir si es palabra/regla determinística o evaluación LLM.
2. Si determinística: agregar a `whatsapp_config.bot.palabras*` o `bot.umbral*`.
3. Si LLM: actualizar `docs/specs/bot-ia-system-prompt.md` con la regla y subir `bot.systemPromptVersion`.
4. Agregar enum nuevo a `conversaciones.requiereHumanoMotivo`.
5. Actualizar UI de bandeja para mostrar el motivo.

### Cambiar el número default de envío

Editar `whatsapp_config/sistema.numeroDefaultEnvio` desde UI admin. Sticky por conversación se preserva en `conversaciones.ultimoPhoneNumberId` (no se sobrescribe automáticamente).

### Agregar un nuevo cron WhatsApp

1. Crear `api/whatsapp/cron/<nombre>.ts` siguiendo patrón de `sync-plantillas.ts`.
2. Idempotencia obligatoria: doc en `whatsapp_recordatorios_enviados` con id determinístico `{tipo}__{entidad}__{fecha}`.
3. Agregar entrada a `vercel.json.crons`.
4. Validar billing Vercel (Hobby = 2 crons max).

### Apagar el bot temporalmente

`whatsapp_config/sistema.bot.habilitadoGlobal = false` desde UI admin. Las conversaciones existentes con `bot.habilitado=true` seguirán respondiendo hasta su próximo turno y luego se detendrán (el chequeo se hace dentro del flujo entrante).

### Apagar el bot solo para una conversación

`whatsapp_conversaciones/{wa_id}.bot.habilitado = false` desde UI ("Tomar control"). Disparable por operaria que abre la conversación.

---

## 11. Riesgos identificados (mitigaciones)

| # | Riesgo | Mitigación |
|---|---|---|
| R1 | Meta reintenta webhook → duplicados | Idempotency por wamid + cazador P-017 |
| R2 | HMAC mal implementado → spoof | Cazador P-016 + reviewer obligatorio sprint WA-1 |
| R3 | Bot loop infinito (cliente y bot se confunden) | Trigger 6 (limiteTurnos=20) |
| R4 | Costo Anthropic descontrolado | Hard limit turnos + horario bot + escalado |
| R5 | Costo Meta descontrolado | Plantillas marketing solo desde UI con confirmación; cron con cap por día |
| R6 | Window 24h check no se ejecuta → Meta cobra error | Cazador P-018 + server-side double-check |
| R7 | Plantillas se desincronizan (Meta deshabilita una) | Cron c/12h + UI muestra `estado` |
| R8 | Operaria abusa plantillas marketing fuera de campaña | Audit log + permiso `whatsappEnviarPlantilla` granular + reporte mensual |
| R9 | Cliente cambia de número WA → conversación nueva sin contexto | Re-vincular manualmente desde UI (`clienteId` editable) |
| R10 | Secretos en logs (token, signature) | Lint console.log con regex; cazador opcional P-019 |
| R11 | Vercel Hobby limita crons a 2 | Confirmar plan en D9; si Hobby → consolidar 2 crons en 1 endpoint con switch |
| R12 | 6 colecciones + onSnapshot sidebar = +N listeners | Lazy subscribe solo cuando user abre /admin/whatsapp |

---

## 12. Convenciones aplicables (de CLAUDE.md)

1. **Strip `undefined` antes de `addDoc`/`setDoc`** — todos los handlers serverless.
2. **Spanish identifiers**: `whatsapp_mensajes_inbox`, `conversacionId`, `ventana24h`, `requiereHumano`. NO `messages`, `conversationId`.
3. **No emojis** en código ni commits.
4. **Commits**: `feat(whatsapp): ...`, `fix(whatsapp): ...`, conventional commits style.
5. **`userProfile.id` ≠ `auth.uid`** — `outbox.creadoPor` usa `currentUser.uid` del context.
6. **Mutaciones cross-collection en `runTransaction`** — inbox + conversaciones en mismo tx (es CORE del módulo).
7. **Inmutabilidad de campos opcionales con `.get(field, null)`** — rules de `whatsapp_conversaciones`.
8. **Postmortem obligatorio si bug en producción** — antes de cerrar sprint hotfix.
9. **Reviewer obligatorio** en sprints que tocan rules (WA-1, WA-2, WA-3, WA-4, WA-7).
10. **`npm run deploy:rules` antes de marcar COMPLETADO** (P-005).
11. **No exportes helpers desde `.tsx`** — utilidades WhatsApp van en `src/utils/whatsappFormat.ts` y `src/utils/whatsappPlantillas.ts`.
12. **Hidratadores defensivos** `parseConversacion`, `parseOutboxMensaje` para Timestamp ↔ Date.

---

## 13. Referencias del repo (lectura previa para builders)

Antes de codear cada sprint WA, leer:

- `api/gps/ubicacion.ts` — patrón serverless con auth Firebase + verificación rol.
- `api/_lib/firebaseAdmin.ts` — admin SDK init + App Check.
- `firestore.rules:606-647` — patrón de inmutabilidad con `.get(field, null)` sobre `campanas_marketing`.
- `src/services/campanasMarketing.service.ts` — patrón de mutación cross-collection con `runTransaction` + audit log.
- `src/services/notificaciones.service.ts` — patrón de `crearNotificacion` con `userId`.
- `src/types/index.ts:1309-1455` — modelo de `PermisosSistema`.
- `scripts/invariantes/check-cross-collection-tx.ts` — template para cazadores nuevos P-016/017/018.
- `src/services/contadores.service.ts` — patrón de transacción atómica con `runTransaction` (referencia para crear OS desde bot).

---

## 14. Estado actual + próximos pasos

**Hoy 2026-05-18:**
- Preconditions externas listas: 4 plantillas HSM APPROVED, 2 números activos, todos los secretos en Vercel, ANTHROPIC_API_KEY cargada.
- Acciones manuales pendientes de Jorge para empezar:
  - Configurar webhook en `developers.facebook.com → app 1558940908663280 → WhatsApp → Configuration → Webhooks`. URL: `https://www.misterservicerd.com/api/whatsapp/webhook` (después de deploy WA-1).
  - Pegar `META_VERIFY_TOKEN` en la pantalla del webhook.
  - Suscribir campos: `messages`, `message_status`, `message_template_status_update`, `account_update`.
  - Probar con botón "Verify and save".

**Antes de codear:**
- Jorge responde D1-D8 en `docs/sprints/BLOQUEOS.md` (sección SPRINT-WA-0).
- Confirma billing Vercel (D9): Hobby o Pro.
- Pega el body literal de las 4 plantillas (D7) o autoriza correr `sync-plantillas` primero como sprint cero.

**Orden de implementación recomendado:**

| Orden | Sprint | Depende de | Estimación realista |
|---|---|---|---|
| 1 | WA-1 Webhook entrante (HMAC + idempotency) | — | 8-12 h |
| 2 | WA-5 UI plantillas HSM (sync + selector) | — (paralelo a WA-1) | 4-6 h |
| 3 | WA-2 Servicio saliente proxy | WA-1 (para validar callbacks) | 6-8 h |
| 4 | WA-3 UI conversaciones admin | WA-1 + WA-2 | 8-12 h |
| 5 | WA-4 Tracking referral campañas | WA-1 | 3-5 h |
| 6 | WA-7 Cron jobs (recordatorios + NPS + garantía) | WA-2 + WA-5 | 6-8 h |
| 7 | WA-6 Bot IA Claude Haiku | WA-1 + WA-2 + WA-3 | 10-15 h |

**Total realista:** 45-66 horas de builder + tester + reviewer + iteraciones. 6-10 sesiones de Claude Code a lo largo de 1-2 semanas. **NO 4-7 horas** como estimación inicial.

---

**Última actualización:** 2026-05-18 — versión inicial post-Opción A (Jorge confirmó hoy reestructurar en planning + docs antes de codear).

**Próxima actualización esperada:** después de Jorge responder D1-D9 en BLOQUEOS, este doc se ajusta con las decisiones firmes y los sprints WA-1 a WA-7 se mueven a `COLA_AUTONOMA.md` con scope refinado.
