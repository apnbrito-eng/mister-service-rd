# Bloqueos — sprints que requieren OK de Jorge

> El coordinator mueve sprints acá cuando detecta que afectan rules,
> migraciones masivas, integraciones de pago, o borrados.
>
> **Para desbloquear:** editá el sprint y agregá `OK: jorge YYYY-MM-DD HH:MM`
> al final, después pegá `procesa bloqueos` al coordinator.
>
> **Para rechazar:** editá el sprint y agregá `RECHAZADO: jorge YYYY-MM-DD HH:MM <motivo>`.

---

## SPRINT-WA-REAGENDAR-PORTAL — Portal público para reagendamiento de citas

**Prioridad:** ALTA (bloquea actualización plantilla `cita_confirmada` en Meta con botón "Reagendar" → portal).

**Estado:** PENDIENTE OK JORGE (toca `firestore.rules` con rule pública nueva).

**Origen:** SPRINT-WA-2-HEADER-IMAGE cerró ok (commit `7f6b17a`). Curl E2E entregó WhatsApp con logo + body. Jorge decidió 2026-05-19 noche que la plantilla `cita_confirmada` debe llevar 2 botones: (1) "Consultar" Quick Reply al bot 24/7, (2) "Reagendar" URL al portal donde el cliente sugiere nuevo día/hora. El portal NO existe. Si se agregan botones a la plantilla apuntando a URL inexistente, Meta puede rechazar la aprobación. Hay que crear el portal PRIMERO.

### Touch-list

1. **`src/pages/public/ReagendarCita.tsx`** (NUEVO) — formulario público standalone:
   - Lee orden por `:token` desde URL.
   - Si token inválido/expirado → estado de error con CTA a contactar por WhatsApp.
   - Muestra (read-only): nombre cliente, equipo, día/hora actualmente confirmada, técnico asignado, OS#.
   - Inputs: `nuevoDiaPreferido` (DatePicker, mínimo hoy), `nuevaHoraPreferida` (TimePicker, rango 8am-6pm), `nota` (textarea opcional, 200 chars).
   - Submit → llama servicio que escribe a `solicitudes_reagendamiento`.
   - Pantalla de confirmación post-submit con resumen y mensaje "una operaria te contactará para confirmar".

2. **`src/App.tsx`** — agregar ruta pública `/reagendar/:token` en el bloque de rutas standalone (no `PublicLayout`, no `Layout`, sin auth). Patrón ya establecido en `/cita/:calendarId`, `/tracking/:token`, `/f/:slug`.

3. **`src/services/reagendamiento.service.ts`** (NUEVO):
   - `leerOrdenPorTokenReagendamiento(token: string)` → query `ordenes_servicio` where `tokenReagendamiento.token == token`. Valida `tokenReagendamiento.expiraEn > now`. Retorna `Orden | null`.
   - `crearSolicitudReagendamiento(payload)` → `addDoc` a `solicitudes_reagendamiento` con shape `{ ordenId, ordenOS, clienteNombre, fechaActualConfirmada, nuevoDiaPreferido, nuevaHoraPreferida, nota, token, estado: 'pendiente', creadoEn: serverTimestamp() }`. Strip de `undefined` (patrón ya en repo).

4. **`src/utils/tokenReagendamiento.ts`** (NUEVO):
   - `generarTokenReagendamiento(ordenId: string)` → string random URL-safe + expiración 90 días desde envío.
   - Patrón heredado de `tokenPortalCliente` (SPRINT-139) y `garantia.token` (SPRINT-140).
   - Persiste en `ordenes_servicio/{ordenId}.tokenReagendamiento = { token, generadoEn, expiraEn }`.

5. **`firestore.rules`** — dos cambios:
   - Nuevo match `/solicitudes_reagendamiento/{id}`:
     - `allow create: if request.resource.data.token is string && request.resource.data.token.size() >= 32 && request.resource.data.estado == 'pendiente' && request.resource.data.creadoEn == request.time;`
     - `allow read, update, delete: if isInternalUser();` (operaria/coordinadora/admin).
   - Ampliar rule de `ordenes_servicio` read: permitir lectura por token reagendamiento (similar a `tokenPortalCliente` existente — patrón ya en archivo).
   - **Sub-regla obligatoria post-deploy:** correr `npm run deploy:rules` ANTES de marcar el sprint COMPLETADO. Sin esto, la rule no aplica y `/reagendar/:token` falla con permission-denied en producción.

6. **Helper de envío plantilla `cita_confirmada`** — el lugar donde el sistema dispara la plantilla (a determinar por builder via grep `cita_confirmada`) debe:
   - Generar token reagendamiento + persistir en orden ANTES de enviar plantilla.
   - Pasar el token como variable adicional del componente de URL del botón en el payload Meta (requiere extender `PayloadMeta.template.components` para soportar `type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: token }]`).

7. **UI admin `/admin/reagendamientos`** (NUEVO) — vista para operaria/coordinadora:
   - Lista `solicitudes_reagendamiento` con `estado == 'pendiente'` (real-time via onSnapshot).
   - Por cada solicitud: card con datos cliente + fecha actual + nueva fecha preferida + nota + botones "Aprobar" / "Rechazar".
   - Aprobar: actualiza orden con nueva fecha + estado solicitud `aprobada` + dispara notificación al cliente (sprint propio para esto último).
   - Rechazar: estado solicitud `rechazada` + nota interna.

### Consumidores verificados (read-only check)

- **`firestore.rules`:** ya tiene patrones de "token público" para `tokenPortalCliente` (SPRINT-139), `garantia.token` (SPRINT-140), `formularios.slug`. Usar mismo formato.
- **`src/App.tsx`:** ya tiene rutas standalone agrupadas (`/cita/:calendarId`, `/tracking/:token`, `/f/:slug`). Agregar `/reagendar/:token` en mismo bloque.
- **`src/services/`:** patrón establecido en `solicitudes.service.ts` y `formularios.service.ts` (writes públicos a colecciones nuevas con strip de `undefined`).
- **Plantilla `cita_confirmada` (Meta):** ID `954386164046647`. Sin botones actuales. Una vez deployado el portal, Jorge editará la plantilla en Meta para agregar botones (prompt sidepanel separado).

### Consumidores NO afectados (justificación)

- `api/whatsapp/webhook.ts` — solo lee mensajes entrantes, no afectado por el portal saliente.
- `api/whatsapp/send.ts` — el cambio del payload con componente button puede ir como sub-sprint dentro del helper de envío (touch-list #6). No requiere fix nuevo del endpoint, solo extensión de la interface.
- Plantillas `conduce_emitido`, `recordatorio_mantenimiento`, `garantia_por_vencer` — no llevan botón Reagendar.

### Hallazgos laterales

- **Notificación al cliente cuando operaria aprueba/rechaza:** fuera de scope. Documentar como SPRINT-WA-REAGENDAR-NOTIF (futuro). Si se mete acá, scope crece >50% y el sprint se vuelve inmanejable.
- **Validación de slot disponible en agenda** (que el día/hora preferida no choque con otra cita): fuera de scope. Por ahora operaria revisa manual. Sprint futuro: `SPRINT-WA-REAGENDAR-SLOT-CHECK`.
- **Cazador P-020 "rule pública sin validación de token":** evaluar si el patrón se repite en 1-2 sprints más. Por ahora no se crea.

### Verificación

1. `npm run check:regression` → 17/17 PASS.
2. `npm run build` → typecheck + build OK.
3. `npm run lint` → 0 warnings.
4. `npm run deploy:rules` → rules deployadas a Firebase (sub-regla CLAUDE.md obligatoria).
5. QA manual:
   - Generar token de prueba en una orden mock.
   - Abrir `https://www.misterservicerd.com/reagendar/<token>` en navegador anónimo.
   - Verificar que muestra datos de orden.
   - Submit con nuevo día/hora + nota.
   - Verificar doc creado en `solicitudes_reagendamiento`.
6. QA negativo:
   - `/reagendar/token-expirado` → muestra estado de error.
   - `/reagendar/token-inexistente` → muestra estado de error.
   - POST directo a `solicitudes_reagendamiento` sin token válido (curl con SDK Firebase) → rule rechaza.
7. UI admin: verificar que `/admin/reagendamientos` lista la solicitud creada.

### No requiere

- Postmortem (feature nueva, no bug).

### Sub-tareas para el coordinator

- archivist PRE-CHANGE (touch-list ≥7 archivos, sub-regla obligatoria).
- builder → tester → regression_guardian → reviewer.
- devops corre `npm run deploy:rules` ANTES de marcar COMPLETADO.
- Commit messages: separar en 2-3 commits lógicos si scope grande (servicio + UI pública + UI admin + rules deploy).

### Decisión Jorge (para desbloquear)

OK Jorge si:
1. Confirma rule pública nueva (`/solicitudes_reagendamiento` create sin auth, gate por token + estado).
2. Confirma OK para 90 días de expiración del token (mismo patrón que `tokenPortalCliente`).
3. Confirma OK para vista admin `/admin/reagendamientos` con acceso operaria/coordinadora/admin (no técnico).

---

## 🟦 MÓDULO WHATSAPP CLOUD API — 7 sprints encolados

**Origen:** Jorge eligió Opción A (planning estructurado por bloques) el 2026-05-18 tras el coordinator detectar que el pedido "trabaja en una sola pasada" violaba las sub-reglas de CLAUDE.md (rules nuevas + endpoints públicos + integraciones de terceros requieren OK explícito).

**Referencias técnicas:**
- `docs/MODULO_WHATSAPP.md` — arquitectura completa del módulo (6 colecciones, 2 endpoints, 3 crons, 3 cazadores nuevos, flujos entrante/saliente, mapeo HSM, window 24h, routing técnico, escalado bot).
- `docs/specs/bot-ia-system-prompt.md` — prompt versionado del bot Claude Haiku (tono, captura, escalado, ejemplos).
- `docs/sprints/COLA_AUTONOMA.md:1278-1559` — drafts originales de los 7 sprints WA (ahora superados por las versiones estructuradas abajo).

**Precondiciones externas verificadas hoy 2026-05-18:**
- 4 plantillas HSM APPROVED en español: `conduce_emitido` (3315829318618800), `cita_confirmada` (954386164046647), `recordatorio_mantenimiento` (2151324502097238), `garantia_por_vencer` (2415325218966527). WABA ID `1884486412326904`.
- 2 números activos: `1151997541323577` (6767 "Fixman Mister service") + `1226992440486630` (6265 "Fixman 6265"). Tests E2E recientes envían texto plano OK.
- `ANTHROPIC_API_KEY` cargada en Vercel.
- `META_ACCESS_TOKEN` (nuevo, sin newline), `META_APP_SECRET`, `META_VERIFY_TOKEN`, `META_BUSINESS_ID=103664415995101`, `META_WABA_ID=1884486412326904`, `META_PHONE_NUMBER_ID=1151997541323577` ya en Vercel.
- App ID Meta: `1558940908663280`.

---

### SPRINT-WA-0 — Decisiones de negocio (10 puntos) + confirmación billing Vercel

**Tipo:** Decisiones de Jorge. NO toca código.
**Estado:** ✅ COMPLETADO 2026-05-19 — Jorge respondió las 10 decisiones. Bloque original preservado abajo para trazabilidad.

**Respuestas Jorge 2026-05-19:** D1=D (sticky por conversación), D2=A (una conversación por wa_id), **D3=A (cambio B→A el 2026-05-19 noche — bot 24/7, plantilla auto-respuesta queda como fallback opcional)**, D4=C (bot solo UTILITY autónomas), D5=B (20 turnos), D6=C (admin/coord/secretaria/operaria), D7=A (cron sync-plantillas primero), D8=A (opt-out automático STOP/BAJA), D9=Pro (3 crons separados OK), D10=A (Fixman, usted/tú adaptive).

**Próximo desbloqueado:** SPRINT-WA-RULES (rules nuevas) + SPRINT-WA-1 (webhook).

**Artefactos producidos por el cierre:**
- `docs/MODULO_WHATSAPP.md` sección "Decisiones de negocio FIRMES" actualizada con los 10 valores.
- `scripts/init-whatsapp-config.ts` (nuevo): script idempotente que crea/actualiza `whatsapp_config/sistema` con los valores firmes. Jorge corre con `npx tsx scripts/init-whatsapp-config.ts` cuando WA-RULES esté deployado.
- ~~Nuevo blocker identificado en WA-6 por D3=B~~ — RESUELTO 2026-05-19 noche con cambio D3 B→A. Plantilla `auto_respuesta_fuera_horario` queda como FALLBACK de emergencia opcional, NO bloqueante para WA-6.

---

#### Por qué estuvo bloqueado (preservado para trazabilidad)

Sin estas 10 decisiones, el architect y el builder estarían adivinando criterios de negocio. Cada una tiene una propuesta default que Jorge puede aceptar tal cual con un solo OK, o ajustar específicamente.

#### Decisiones (responder A/B/C/D + cualquier comentario)

**D1 — Número default de envío.** ¿Desde cuál número sale un mensaje cuando una operaria escribe desde la UI?
- (A) Siempre 6767 (Fixman Mister service principal).
- (B) Siempre 6265.
- (C) La operaria elige cada vez (dropdown).
- **(D) Sticky por conversación: usa el número que el cliente usó la última vez, con override manual disponible. (recomendado)**

**D2 — Mismo cliente desde 2 números = 1 o 2 conversaciones?**
- **(A) Una sola conversación (doc `whatsapp_conversaciones/{wa_id}` único, los mensajes traen `phoneNumberId` cada uno). (recomendado)**
- (B) Dos hilos separados (doc id = `{wa_id}__{phoneNumberId}`).

**D3 — Horario del bot.**
- (A) 24/7 — el bot atiende siempre, escala a humano por los 7 triggers.
- **(B) Lunes-Sábado 8:00-18:00 RD. Fuera de eso, plantilla auto-respuesta "te respondemos mañana 8am" + cola para humano. Requiere CREAR una plantilla HSM nueva y esperar approval Meta (24-72h). (recomendado pero requiere plantilla nueva)**
- (C) L-S 8:00-18:00 RD. Fuera de eso, silencio total (no responde nada, marca `requiereHumano=true`).

**D4 — Plantillas que el bot puede mandar autónomamente.**
- (A) Solo texto en window. Si necesita reabrir window → escala a humano.
- (B) El bot puede mandar cualquier plantilla aprobada cuando lo decida.
- **(C) Solo plantillas categoría UTILITY (ej. `cita_confirmada` post-creación OS). Las MARKETING requieren operaria. (recomendado)**

**D5 — Límite hard de turnos por conversación.**
- (A) 10 turnos.
- **(B) 20 turnos. (recomendado — balance costo/UX)**
- (C) 50 turnos.
- (D) Sin límite.

**D6 — Roles autorizados para mandar mensajes desde UI.**
- (A) Solo admin/coord.
- (B) admin/coord/secretaria.
- **(C) admin/coord/secretaria/operaria. (recomendado — operaria es el rol que más se comunica)**
- (D) Todos incluso técnico/ayudante.

**D7 — Body literal de las 4 plantillas APPROVED.**
- (A) Corremos el cron `sync-plantillas` antes de WA-2 y vemos qué hay; ajustamos mapping CRM si el body real difiere de lo propuesto en `docs/MODULO_WHATSAPP.md` sección 4.
- (B) Jorge pega el body literal de las 4 plantillas en este sprint.

*Recomendado A si Jorge no tiene a mano el body. Bloquea WA-2 (envío) hasta tener el cron corrido al menos una vez.*

**D8 — Opt-out automático.** ¿Si cliente escribe "STOP", "BAJA", "NO MAS"?
- **(A) Automático: agregar a `whatsapp_config.optOuts[]` Y marcar `clientes/{id}.optOutMarketing=true`. Próximo envío rechaza. (recomendado — cumplimiento legal Meta)**
- (B) Manual: requiere acción de operaria.

**D9 — Plan Vercel actual.**
- (A) Hobby (limitado a 2 crons → consolidar `recordatorios-mantenimiento` + `garantias-por-vencer` en un solo endpoint con switch por path query).
- (B) Pro o superior (3 crons OK).

*Bloquea WA-7. Jorge confirma desde dashboard Vercel.*

**D10 — Tono/nombre del bot.**
- (A) Nombre "Fixman" (matchea display del número 6767).
- (B) Otro nombre (especificar).
- Trato por defecto: usted en primer turno, tú si cliente lo usa primero. ¿Cambio?

*Recomendado A + trato por defecto propuesto.*

#### Cómo desbloquear

1. Jorge responde D1-D10 con letras (ej. "D1=D, D2=A, D3=B, D4=C, D5=B, D6=C, D7=A, D8=A, D9=Pro, D10=A").
2. Coordinator actualiza `whatsapp_config/sistema` (lo crea desde script + agrega los valores firmes a `docs/MODULO_WHATSAPP.md` y `docs/specs/bot-ia-system-prompt.md` si difieren de los defaults).
3. Mueve SPRINT-WA-1 a `COLA_AUTONOMA.md` y procesa.

**OK Jorge 2026-05-19:** D1=D, D2=A, **D3=A (cambiado desde B el 2026-05-19 noche)**, D4=C, D5=B, D6=C, D7=A, D8=A, D9=Pro, D10=A.

**Cambio D3 B→A:** Jorge decidió que el bot IA atienda 24/7 con escalación a humano por triggers, en lugar de mandar plantilla "volvemos mañana" fuera de horario. Razón: respuesta instantánea siempre + experiencia consistente. Implicancias:
- WA-6 (bot IA) NO respeta horario para responder — solo lo respeta para decidir cuándo notificar a Maria/Wilainy "hay caso urgente esperando" (push fuera de horario solo si trigger crítico).
- La plantilla `auto_respuesta_fuera_horario` se mandó a revisión Meta el 2026-05-19 como **respaldo de emergencia** (bot caído, banneo temporal, mantenimiento) — NO es parte del flujo normal. Una vez APPROVED, queda en `whatsapp_plantillas` con flag `usoFallback: true`. **Meta auto-reclasificó la categoría de UTILITY → MARKETING** en el momento del Submit por la presencia del botón URL "Agendar cita" hacia `/agendar`. Jorge aceptó la reclasificación porque el uso esperado es 1-2 envíos/mes y el costo Marketing es despreciable. Acción pendiente: **apelar a UTILITY** vía "Help Business / Request a review" si vale la pena el ahorro (a evaluar post-MVP).
- D4=C sigue: bot solo manda autónomamente plantillas UTILITY (la fallback es UTILITY así que califica si se necesita).

**Cambio adicional 2026-05-19 noche — capacidad dual del bot (capturar conversacional O delegar al formulario):** Jorge agregó que el bot IA debe poder elegir entre dos modos para capturar datos de cita:
- **Modo conversacional:** bot pregunta turno por turno (nombre, teléfono, dirección, equipo, falla) y al final escribe a `citas_por_confirmar` con `origen: 'whatsapp_bot'`.
- **Modo formulario:** bot manda link `https://www.misterservicerd.com/agendar` (con UTM tracking opcional `?utm_source=whatsapp&utm_medium=bot&waId={waId}`) y queda esperando que la operaria/coordinadora lo retome cuando el cliente confirme el form llenado, O detecta automáticamente cuando llega un doc nuevo en `citas_por_confirmar` con el `clienteTelefono` matching → bot agradece y cierra hilo.

El system prompt del bot debe darle al modelo criterios para elegir entre los dos modos:
- Cliente activo/responde rápido → modo conversacional.
- Cliente pasivo/conversación se atasca/escribe poco → enviar link.
- Cliente lo pide explícito ("mándame un formulario" / "mejor lo lleno por web") → enviar link.
- Cliente con conversación muy técnica que ya capturó >60% de los datos → terminar conversacional.

Además, la plantilla `auto_respuesta_fuera_horario` incorpora un botón URL "Agendar cita" → `https://www.misterservicerd.com/agendar`. Esto permite que aun en caso de bot caído, el cliente tenga camino directo a registrar su cita. Detección de origen vía `citas_por_confirmar.origen='formulario_publico'` ya existe (no requiere cambio en `AgendarPage`).

WA-6 system prompt debe quedar actualizado con (1) ambos modos de captura; (2) decisión cuál usar; (3) detección de "form ya llenado" para cerrar el loop. Touch-list de WA-6 ahora incluye: `docs/specs/bot-ia-system-prompt.md` + lógica de listener en `api/whatsapp/bot.ts` que escucha `citas_por_confirmar` para correlación por teléfono.

Coordinator debe (1) crear `whatsapp_config/sistema` con D3=A; (2) documentar plantilla fallback en `docs/MODULO_WHATSAPP.md` como caso especial; (3) mover SPRINT-WA-RULES a la cola autónoma.

---

### SPRINT-WA-RULES — Sub-sprint dedicado a `firestore.rules` (6 rules nuevas)

**Tipo:** Cambio a `firestore.rules`. Sub-sprint separado por sub-regla CLAUDE.md "Reviewer obligatorio cuando un sprint toca firestore.rules".
**Estado:** BLOQUEADO 2026-05-18 — depende de SPRINT-WA-0.

#### Touch-list expandido

**Archivos a modificar (1):**
- `firestore.rules` — agregar 6 bloques nuevos (insertar bajo el bloque de `campanas_marketing` por afinidad temática).

**Consumidores verificados (read-only):**
- `firestore.rules.deployed.lock` — se actualiza con el hash post-deploy.
- Cazador P-005 (`check-rules-pendientes-deploy.ts`) — bloquea pre-commit si hay diff entre repo y lock.

**No afectados:** ninguna rule existente cambia.

#### Rules a agregar

```javascript
// === WhatsApp Cloud API module ===

match /whatsapp_mensajes_inbox/{wamid} {
  allow read: if esStaffOficina();
  allow write: if false;             // solo admin SDK del webhook
}

match /whatsapp_mensajes_outbox/{docId} {
  allow read: if esStaffOficina();
  allow write: if false;             // solo admin SDK de api/whatsapp/send
}

match /whatsapp_conversaciones/{waId} {
  allow read: if esStaffOficina();
  // Update parcial permitido a staff oficina solo sobre campos UI seguros
  allow update: if esStaffOficina()
    && request.resource.data.diff(resource.data).affectedKeys().hasOnly([
      'asignadaA', 'asignadaANombre', 'etiquetas', 'noLeidos',
      'requiereHumano', 'bot', 'updatedAt'
    ])
    // Campos críticos inmutables (patrón .get(field, null) por opcionales)
    && request.resource.data.get('ultimoMensajeEntrante', null) == resource.data.get('ultimoMensajeEntrante', null)
    && request.resource.data.get('totalMensajesEntrantes', null) == resource.data.get('totalMensajesEntrantes', null)
    && request.resource.data.get('totalMensajesSalientes', null) == resource.data.get('totalMensajesSalientes', null)
    && request.resource.data.get('ventana24h', null) == resource.data.get('ventana24h', null);
  allow create: if false;            // solo admin SDK lo crea desde webhook
  allow delete: if false;
}

match /whatsapp_plantillas/{plantillaId} {
  allow read: if esStaff();          // cualquier rol que envía conoce plantillas
  allow write: if false;             // solo admin SDK del cron
}

match /whatsapp_recordatorios_enviados/{id} {
  allow read: if esStaffOficina();
  allow write: if false;
}

match /whatsapp_config/{docId} {
  allow read: if esAdminOCoord();
  allow write: if esAdmin();         // editor de config (sin secretos — esos van en process.env)
}
```

**Funciones helper esperadas:** `esStaff()`, `esStaffOficina()`, `esAdmin()`, `esAdminOCoord()` ya existen en `firestore.rules` actual (líneas ~30-80). Verificar antes del PR.

#### Criterios de éxito específicos

- [ ] 6 bloques nuevos aparecen en `firestore.rules`.
- [ ] `npm run check:regression` PASS (los 12 cazadores actuales + posibles P-016/017/018 si se agregaron en sprints anteriores).
- [ ] `npm run deploy:rules` ejecutado SIN errores.
- [ ] `firestore.rules.deployed.lock` actualizado.
- [ ] Reviewer aprueba con foco en defense-in-depth.
- [ ] Test manual desde Firestore Console: técnico autenticado intenta leer `whatsapp_mensajes_inbox` → DENIED. Admin lee → ALLOWED.
- [ ] Test manual: staff oficina intenta `update` de `whatsapp_conversaciones` cambiando `ultimoMensajeEntrante` → DENIED (campo crítico inmutable).
- [ ] Test manual: staff oficina hace update solo de `asignadaA` → ALLOWED.

#### Tiempo realista

**1.5-2.5 horas:**
- Builder: 30-45 min (edición + verificar helpers existentes).
- Reviewer: 30-45 min (security audit).
- Deploy + verificación manual: 15-30 min.
- Postmortem si rompe algo: +1h.

#### Cómo desbloquear

1. SPRINT-WA-0 cerrado con OK Jorge en D1-D10.
2. Jorge pega `OK: jorge YYYY-MM-DD HH:MM rules WA` al final de este bloque.
3. Coordinator procesa con builder → reviewer → security → devops → docs.
4. **NO procesar este sprint en pasada autónoma sin OK explícito.**

**OK Jorge:** _pendiente_

---

### SPRINT-WA-1 — Webhook entrante (HMAC + idempotencia) — FUNDACIÓN

**Tipo:** Endpoint público nuevo + integración terceros (Meta). Requiere OK Jorge.
**Estado:** ✅ COMPLETADO 2026-05-19 por builder. Hash: pendiente (coordinator commitea tras tester + regression_guardian + reviewer + security). Implementación entregada:

- `api/whatsapp/webhook.ts` — GET verify + POST receive con HMAC SHA-256 + `timingSafeEqual` + `bodyParser: false` + body raw como Buffer + idempotency via `runTransaction` (inbox + conversaciones atómico) + status callbacks con `debeActualizarEstado` (resistente a callbacks fuera de orden).
- `api/_lib/whatsappWebhook.ts` — helpers puros (parsing, normalización wa_id RD, extracción de contenido por tipo, strip undefined recursivo, cap raw payload 50KB). Sin side effects, sin Firebase imports.
- `scripts/invariantes/check-whatsapp-webhook-hmac.ts` (P-016) — caza ausencia de los 4 invariantes críticos (createHmac sha256, header x-hub-signature-256, timingSafeEqual, bodyParser: false). PASS silent si archivos no existen.
- `scripts/invariantes/check-whatsapp-idempotency.ts` (P-017) — caza ausencia de `runTransaction` + `tx.get` en webhook entrante + tempId pre-Meta en send saliente (cuando exista). PASS silent para send (todavía no implementado).
- `scripts/invariantes/run-all.ts` — P-016 y P-017 registrados (15 cazadores activos).
- `docs/PATRONES_REGRESION.md` — entradas P-016 y P-017 agregadas con explicación completa.

**Notas del builder:**
- `nanoid` NO se agregó al `package.json` (CLAUDE.md dice no usar — `crypto.randomUUID` built-in cubre el caso de WA-2). El cazador P-017 explícitamente exige `randomUUID` y NO acepta `nanoid`.
- Función helper `runTransaction` ya disponible directo del Admin SDK via `getAdminFirestore().runTransaction(...)` (patrón existente en `api/portal-cliente/[token]/posponer.ts:174` y `api/ai/chat.ts:292`).
- Body raw size cap defensivo: 5MB para evitar memory abuse (Meta payloads reales son <50KB).
- Log policy aplicada: NUNCA loggea texto del mensaje; sólo `wamid`, `wa_id` truncado a 4 dígitos, `tipo`, contadores.

**Próximos pasos para coordinator:**
1. tester: typecheck + lint + `npm run check:regression` (esperado 15/15 PASS).
2. regression_guardian: verificación semántica (orden tx.get → tx.set, atomicidad inbox+conversaciones, evitar leaks de PII en logs).
3. reviewer: foco HMAC + raw body + spoof prevention.
4. security: vector análisis (qué pasa si Meta cambia formato de wamid, qué pasa si el secret rota mid-flight, etc.).
5. commit + push + Jorge configura webhook URL en Meta Developers + E2E manual.

**Estado original:** BLOQUEADO 2026-05-18 — depende de SPRINT-WA-0 + SPRINT-WA-RULES.
**Prioridad:** 🔴 ALTA — sin esto, no entran mensajes de WhatsApp al CRM.

#### Dependencias

- SPRINT-WA-0 (decisiones D1-D10).
- SPRINT-WA-RULES (las 6 rules deployadas — porque el webhook escribe vía admin SDK pero los reads desde UI usan rules).

#### Touch-list expandido

**Archivos a crear (3):**
1. `api/whatsapp/webhook.ts` — GET verify + POST receive con HMAC + idempotency via `runTransaction`.
2. `api/_lib/whatsappWebhook.ts` — helpers de parsing payload Meta (extraer `entry[].changes[].value.messages[]` y `statuses[]`).
3. `scripts/invariantes/check-whatsapp-webhook-hmac.ts` — cazador P-016.
4. `scripts/invariantes/check-whatsapp-idempotency.ts` — cazador P-017.

**Archivos a modificar (3):**
1. `package.json` — verificar/agregar `nanoid`.
2. `docs/PATRONES_REGRESION.md` — agregar P-016, P-017.
3. `scripts/invariantes/index.ts` (o donde se registran cazadores) — incluir P-016, P-017.

**Consumidores verificados (read-only — esperado tras grep):**
- `api/_lib/firebaseAdmin.ts` — admin SDK init. El webhook lo importa para escribir a Firestore sin rules.
- Cazador P-005 — verifica `deploy:rules` antes de marcar COMPLETADO (no aplica acá porque WA-RULES ya deployó).
- Sub-regla CLAUDE.md "Mutaciones cross-collection en `runTransaction`" — aplica acá (inbox + conversaciones atómico).

**No afectados:**
- Ninguna rule existente cambia (las nuevas las creó WA-RULES).
- Ningún componente UI consume aún `whatsapp_mensajes_inbox` (WA-3 lo hará).

**Hallazgos laterales esperados (audit del builder):**
- Verificar si `api/_lib/firebaseAdmin.ts` exporta `adminDb` o usa otro nombre — alinear imports.
- Verificar si hay un helper `runTransaction` de admin SDK ya importado en otro endpoint serverless. Si no, usar el patrón directo de `firebase-admin/firestore`.

#### Criterios de éxito específicos

- [ ] GET con `verify_token` correcto retorna `challenge` como text/plain status 200.
- [ ] GET con token incorrecto retorna 403 sin info útil.
- [ ] POST con HMAC inválido retorna 401 sin escribir nada en Firestore.
- [ ] POST con HMAC válido y `messages[]` entrante → crea doc en `whatsapp_mensajes_inbox/{wamid}` Y actualiza `whatsapp_conversaciones/{wa_id}` en MISMO `runTransaction`.
- [ ] POST duplicado (mismo `wamid`) NO crea segundo doc ni duplica counters de conversación.
- [ ] POST con `statuses[]` (callback) actualiza `whatsapp_mensajes_outbox` con estado nuevo + timestamp correspondiente (`enviadoEn`/`entregadoEn`/`leidoEn`/`falladoEn`).
- [ ] Cazador P-016 PASS: detecta `crypto.createHmac` + `timingSafeEqual` + `bodyParser: false` + lectura raw body.
- [ ] Cazador P-017 PASS: detecta `runTransaction` + `tx.get` antes de `tx.set` en webhook.
- [ ] Typecheck + lint + 12 cazadores existentes PASS.
- [ ] Vercel preview deploy OK (URL `*.vercel.app/api/whatsapp/webhook`).
- [ ] Test E2E manual: Jorge configura webhook URL en Meta Developers, pasa "Verify and save", manda mensaje desde su teléfono al +1 849-564-6767 → aparece doc en Firestore con texto + timestamp correctos.

#### Restricciones explícitas

- NO procesar lógica de negocio en webhook (NO crear OS, NO llamar Anthropic). Solo escribir a Firestore + responder 200 rápido (<5s).
- NO exponer `META_APP_SECRET` ni `META_ACCESS_TOKEN` en respuesta HTTP NUNCA.
- archivist PRE-CHANGE obligatorio.
- reviewer obligatorio (endpoint público con HMAC).
- security obligatorio (datos sensibles + spoof prevention).

#### Tiempo realista

**8-12 horas:**
- archivist PRE-CHANGE: 30 min.
- builder: 4-6 h (HMAC raw body es delicado en Vercel; reintentos Meta requieren tests).
- tester: 1 h.
- regression_guardian: 30 min.
- reviewer: 1-2 h (foco HMAC + idempotency).
- security: 1 h.
- Iteraciones post review: 1-2 h.
- Deploy + E2E manual con Jorge: 30-60 min.

#### Cómo desbloquear

1. SPRINT-WA-RULES cerrado con commit + deploy.
2. Jorge pega `OK: jorge YYYY-MM-DD HH:MM webhook entrante` acá.
3. Coordinator procesa con flujo completo (archivist → builder → tester → regression_guardian → reviewer → security → commit + push → devops → docs).

**OK Jorge:** _pendiente_

---

### SPRINT-WA-5 — UI plantillas HSM (sync + selector)

**Tipo:** Endpoint cron público + UI. Requiere OK por integración Meta y plantillas son operacionales.
**Estado:** BLOQUEADO 2026-05-18 — depende de SPRINT-WA-RULES.
**Prioridad:** 🟡 MEDIA. Independiente de WA-1 (puede correr en paralelo).

#### Dependencias

- SPRINT-WA-RULES (necesita rule `whatsapp_plantillas`).
- D7 de SPRINT-WA-0 (cómo se obtienen los bodies — sync o pegar manual).
- D9 de SPRINT-WA-0 (plan Vercel para el cron).

#### Touch-list expandido

**Archivos a crear (3):**
1. `api/whatsapp/cron/sync-plantillas.ts` — cron c/12h. Llama `https://graph.facebook.com/v21.0/{WABA_ID}/message_templates` y upsert en `whatsapp_plantillas/{nombre}__{idioma}`.
2. `src/components/whatsapp/SelectorPlantilla.tsx` — modal de selección con form dinámico por variables {{1}}..{{N}}, preview, envío vía WA-2.
3. `src/services/whatsapp-plantillas.service.ts` — wrapper de queries de `whatsapp_plantillas`.

**Archivos a modificar (2):**
1. `vercel.json` — agregar cron `sync-plantillas`.
2. `src/types/index.ts` — agregar interfaces `WhatsappPlantilla`, `WhatsappPlantillaComponente`.

**Consumidores verificados:**
- WA-2 va a importar `SelectorPlantilla` para integrar en composer.
- WA-7 va a leer `whatsapp_plantillas` para validar que plantilla del cron sigue APPROVED antes de enviar.

**Hallazgos laterales esperados:**
- Confirmar `META_WABA_ID=1884486412326904` es el correcto (vs `META_BUSINESS_ID=103664415995101`).
- Si plan Vercel = Hobby (D9), este cron CUENTA contra el límite de 2.

#### Criterios de éxito

- [ ] Cron `sync-plantillas` corre y trae las 4 plantillas APPROVED. Doc id en formato `conduce_emitido__es`.
- [ ] Cada doc tiene `componentes[]` con body + variables detectadas.
- [ ] `cantidadVariables` se calcula correctamente de regex `/\{\{\d+\}\}/g` sobre body.
- [ ] UI muestra SOLO plantillas con `estado='APPROVED'`.
- [ ] Form dinámico se ajusta a la cantidad de variables de la plantilla seleccionada.
- [ ] Preview muestra plantilla con variables sustituidas antes de enviar.
- [ ] Botón "Enviar" deshabilitado hasta que todas las variables required estén llenas.
- [ ] Typecheck + lint + 12 cazadores PASS.

#### Restricciones

- NO eliminar el patrón actual `wa.me/...?text=...` manual (sigue como fallback si plantillas fallan).
- NO permitir envío directo desde este sprint — el componente se monta pero el envío real lo hace WA-2.
- archivist PRE-CHANGE obligatorio.

#### Tiempo realista

**4-6 horas:**
- builder: 3-4 h.
- tester + reviewer: 1-1.5 h.
- Iteraciones: 30-60 min.

#### Cómo desbloquear

1. SPRINT-WA-RULES cerrado.
2. Decisión D7 firmada (sync vs pegar manual).
3. Decisión D9 firmada (Hobby vs Pro — confirma si hay slot disponible de cron).
4. Jorge pega `OK: jorge YYYY-MM-DD HH:MM plantillas HSM`.

**OK Jorge:** _pendiente_

---

### SPRINT-WA-2 — Servicio saliente proxy `api/whatsapp/send`

**Tipo:** Endpoint público nuevo + integración Meta. Requiere OK.
**Estado:** ✅ COMPLETADO 2026-05-19 — commit pending hash al final de esta pasada. WA-5 plantillas cache PENDIENTE: el endpoint NO valida que la plantilla esté APPROVED ni que las variables coincidan con cuerpo — hoy un nombre inválido o variables faltantes resultan en error Meta 502. Documentado en código inline. Cubierto por WA-5 cuando se implemente.
**Prioridad:** 🔴 ALTA — sin esto el CRM no envía nada.

#### Resumen de implementación 2026-05-19

3 archivos nuevos + 3 modificados:
- `api/whatsapp/send.ts` (~1174 líneas) con auth Firebase + role check (D6=C) + check `activo!=false` + rate limit por uid/rol (replicado de `api/ai/chat.ts`) + window 24h check (P-018) + opt-out doble fuente fail-closed (D8=A) + allowlist phoneNumberId (simétrica con webhook) + idempotency con `doc(tempId)` (P-017) + backoff 429 con jitter (MAX=3 por Vercel Hobby) + retry post-Meta-OK + audit log centralizado en TODOS los rechazos y fallos + best-effort updates de conversaciones.
- `src/services/whatsapp.service.ts` (230 líneas): wrappers `enviarTexto`/`enviarPlantilla`/`enviarMedia` con `crypto.randomUUID()` para tempId.
- `scripts/invariantes/check-whatsapp-window-24h.ts`: cazador P-018 + entry en `PATRONES_REGRESION.md` + registro en `run-all.ts`.
- Cazador P-017 (idempotency) extendido para reconocer patrón transaccional además del directo.

Validadores 4/4 GO: tester (typecheck + 16/16 cazadores PASS), regression_guardian GO, reviewer cazó 3 BLOQUEADORES (privilege esc en idempotency, opt-out bypass por índice faltante, empleado deshabilitado puede enviar) — fixeados. Security audit cazó 1 ALTA + 3 MEDIAS + 2 BAJAS — todos aplicados (rate limit, audit log shape canónico + paths de rechazo, recovery post-Meta-OK, opt-out fail-closed, fix typo, JSDoc idempotent in-flight).

#### Acción manual de Jorge POST-deploy

Test E2E real con curl (comando listo, ver fin de DIARIO_2026-05-19.md).

#### Dependencias

- WA-1 (callbacks de status del webhook necesitan saber qué outbox actualizar).
- WA-5 (validación de plantillas y variables contra cache).

#### Touch-list expandido

**Archivos a crear (3):**
1. `api/whatsapp/send.ts` — POST con auth Firebase + role check + window 24h + backoff 429.
2. `src/services/whatsapp.service.ts` — wrapper cliente: `enviarTexto(to, texto)`, `enviarPlantilla(to, nombre, variables, ordenId?)`, `enviarMedia(to, storageUrl, mimeType, caption?)`.
3. `scripts/invariantes/check-whatsapp-window-24h.ts` — cazador P-018.

**Archivos a modificar (2):**
1. `docs/PATRONES_REGRESION.md` — agregar P-018.
2. `scripts/invariantes/index.ts` — incluir P-018.

**Consumidores verificados:**
- `api/whatsapp/cron/recordatorios-mantenimiento.ts` (WA-7) llamará este endpoint internamente con bypass de auth Firebase (admin SDK).
- `api/_lib/whatsappBot.ts` (WA-6) llamará este endpoint al responder al cliente.
- `src/pages/WhatsApp.tsx` (WA-3) lo invoca al enviar texto desde composer.

**Hallazgos laterales esperados:**
- ¿Hay un helper común para verificar ID token Firebase + extraer rol? Mirar `api/gps/ubicacion.ts`. Si no, crear `api/_lib/verifyAuthRol.ts` reusable.
- Verificar que `nanoid` esté en deps (lo usa `tempId` del outbox).

#### Criterios de éxito

- [ ] POST sin auth Firebase → 401.
- [ ] POST con auth válida pero rol técnico → 403.
- [ ] POST con `tipo='texto_libre'` y window 24h cerrada → 422 con sugerencia.
- [ ] POST con `tipo='texto_libre'` y window abierta → 200, doc en outbox, mensaje llega al destino.
- [ ] POST con `tipo='plantilla'` válida con variables completas → 200, doc en outbox, plantilla llega correctamente formateada al destino.
- [ ] POST con `tipo='plantilla'` con variables faltantes → 400.
- [ ] POST con `tipo='plantilla'` no APPROVED → 400.
- [ ] Backoff 429: simular respuesta 429 de Meta (mock o usar 6265 si está rate-limited) → reintenta hasta 5 veces, último intento → `estado='failed'`.
- [ ] Outbox actualizado con `wamid` y `estado='sent'` después de respuesta 200 Meta.
- [ ] Cazador P-018 PASS: detecta que `send.ts` lee `whatsapp_conversaciones.ultimoMensajeEntrante.timestamp` antes de aceptar `tipo='texto_libre'`.
- [ ] `whatsapp_conversaciones/{wa_id}.ultimoMensajeSaliente` se actualiza tras envío exitoso.
- [ ] Audit log en `auditoria_admin` con `accion='enviar_whatsapp'`.
- [ ] Test E2E manual: operaria desde UI manda plantilla `conduce_emitido` con variables reales a teléfono de prueba → mensaje llega → estado pasa de `queued` → `sent` → `delivered` (via callback de WA-1).

#### Restricciones

- NO exponer `META_ACCESS_TOKEN` al frontend NUNCA.
- archivist PRE-CHANGE obligatorio.
- reviewer obligatorio (endpoint público + auth + window 24h + plantillas).
- security obligatorio (token sensible, datos personales).

#### Tiempo realista

**6-8 horas:**
- builder: 3-4 h.
- tester + regression_guardian: 1 h.
- reviewer + security: 1.5-2 h.
- E2E manual con Jorge (envío real a número de prueba): 30-60 min.

#### Cómo desbloquear

1. WA-1 y WA-5 deployados y verificados.
2. Decisión D6 firmada (roles autorizados).
3. Jorge pega `OK: jorge YYYY-MM-DD HH:MM envío saliente`.

**OK Jorge:** _pendiente_

---

### SPRINT-WA-3 — UI conversaciones admin

**Tipo:** Página nueva en `/admin/whatsapp` + permiso nuevo. Requiere OK por el permiso (toca rules indirectamente via `PermisosSistema`).
**Estado:** BLOQUEADO 2026-05-18 — depende de WA-1 + WA-2.
**Prioridad:** 🟡 MEDIA — UX importante, pero no bloquea recepción/envío.

#### Dependencias

- WA-1 (lee `whatsapp_mensajes_inbox` + `whatsapp_conversaciones`).
- WA-2 (botón "Enviar" llama al proxy).

#### Touch-list expandido

**Archivos a crear (5):**
1. `src/pages/WhatsApp.tsx` — página `/admin/whatsapp`. Layout inbox: lista conversaciones izquierda + hilo derecha.
2. `src/components/whatsapp/HiloConversacion.tsx` — render del hilo con mensajes inbox+outbox merged y sorted by timestamp.
3. `src/components/whatsapp/ComposerWhatsapp.tsx` — input texto libre (gated por window 24h) + botón selector plantilla (importa de WA-5).
4. `src/components/whatsapp/BannerWindow24h.tsx` — banner amarillo cuando window cerrada.
5. `src/services/whatsapp-conversaciones.service.ts` — helpers query (`getConversacionesAsignadasA`, `getConversacionesRequiereHumano`, etc.).

**Archivos a modificar (5):**
1. `src/App.tsx` — agregar route `/admin/whatsapp` bajo `ProtectedRoute`.
2. `src/components/Sidebar.tsx` — entrada nueva con badge.
3. `src/types/index.ts` — agregar 4 permisos a `PermisosSistema` + interfaces `WhatsappConversacion`, `WhatsappMensajeInbox`, `WhatsappMensajeOutbox`.
4. `src/services/permisosDefault.service.ts` (o donde se definen defaults) — agregar defaults por rol.
5. `src/components/GestionUsuarios.tsx` (o donde se editan permisos) — agregar UI para los 4 permisos nuevos.

**Consumidores verificados:**
- Admin/coord pueden ver bandeja completa.
- Secretaria/operaria solo conversaciones asignadas a ellas o sin asignar.
- Técnico/ayudante: la ruta `/admin/whatsapp` ni aparece en Sidebar (permiso `whatsappVer=false`).

**Hallazgos laterales esperados:**
- ¿Es necesario un hidratador `parseConversacion` para Timestamps? Sí — patrón de `parseOrden`.
- `onSnapshot` global a `whatsapp_conversaciones` puede ser pesado — lazy subscribe.

#### Criterios de éxito

- [ ] `/admin/whatsapp` accesible para admin/coord/secretaria/operaria con permiso.
- [ ] Técnico/ayudante navegando manual a la URL → redirect a `/tecnico` o "no autorizado".
- [ ] Lista conversaciones se actualiza en real-time (mensaje nuevo entra → aparece arriba).
- [ ] Badge de no leídos en Sidebar actualizable.
- [ ] Hilo renderiza tipos: texto, imagen (con preview), audio (con player), location (link a Maps), botón (chip).
- [ ] Composer permite texto libre solo si window abierta.
- [ ] Banner amarillo se muestra si window cerrada.
- [ ] Selector plantilla integrado.
- [ ] Botón "Tomar control" desactiva bot (`bot.habilitado=false`, `requiereHumano=false`, `asignadaA=currentUser.uid`).
- [ ] Botón "Crear orden desde conversación" pre-popula form con datos del cliente y la conversación.
- [ ] Mobile responsive (operarias usan iPad).
- [ ] Typecheck + lint + 12 cazadores PASS.
- [ ] Sin nuevos `composite indexes` requeridos (sort/filter client-side cuando aplique).

#### Restricciones

- NO ampliar el alcance: este sprint NO incluye el bot IA (WA-6) ni el routing por zona (WA-6).
- archivist PRE-CHANGE obligatorio.
- reviewer obligatorio (permisos + rules consumption).

#### Tiempo realista

**8-12 horas:**
- builder: 5-7 h (UI compleja + integración permisos).
- tester + regression_guardian: 1 h.
- reviewer + qa (manual): 2-3 h.
- Iteraciones: 1 h.

#### Cómo desbloquear

1. WA-1 + WA-2 deployados.
2. Decisión D6 confirmada (impacta permisos defaults).
3. Jorge pega `OK: jorge YYYY-MM-DD HH:MM UI conversaciones`.

**OK Jorge:** _pendiente_

---

### SPRINT-WA-4 — Tracking referral → extender `campanas_marketing`

**Tipo:** Modifica endpoint público (webhook) + extiende colección existente. Requiere OK.
**Estado:** BLOQUEADO 2026-05-18 — depende de WA-1.
**Prioridad:** 🟢 BAJA-MEDIA. Sin esto los leads de WhatsApp ad no se atribuyen.

#### Dependencias

- WA-1 (extiende handler de POST inbox para extraer `messages[].referral`).
- Decisión Jorge: naming format de campañas (sub-decisión D-extra que se puede acordar en cualquier momento, no bloquea otros sprints).

#### Touch-list expandido

**Archivos a modificar (3):**
1. `api/whatsapp/webhook.ts` (creado en WA-1) — agregar parsing de `referral` cuando es primer mensaje del cliente.
2. `src/services/campanasMarketing.service.ts` — agregar `getOrCreateCampanaPorAdId(adId, headline, sourceUrl)` que upserta a `campanas_marketing` por `adId`.
3. `src/types/index.ts` — extender `Cliente` con `origen?: { tipo: 'whatsapp_ad', adId, campanaId, capturadoAt }`. Extender `CampanaMarketing` con `adId?`, `mediaType?`, `sourceUrl?`, `headlineMeta?`.

**Consumidores verificados:**
- `src/pages/Dashboard.tsx` o `Marketing.tsx` consume `campanas_marketing` — al agregar campos opcionales no se rompe nada (verificar parser).
- `firestore.rules:606+` regla de `campanas_marketing` ya tiene patrón de inmutabilidad. Si se agregan campos opcionales sin garantizarlos en create, la inmutabilidad con `.get(field, null)` los acepta correctamente (precedente SPRINT post-c7c8e34).

**No afectados:**
- Endpoint público de creación de campañas (si existe) sigue funcionando.
- Inserción de leads manuales no cambia.

**Hallazgos laterales esperados:**
- Verificar que el shape actual de `CampanaMarketing` no tiene un campo `adId` que pisamos.
- Decidir si el cliente que viene del ad pero no es la primera vez (ya existe en `clientes`) hereda el `origen` (NO) o lo agrega como audit (SÍ, en `auditoria_admin` con `accion='lead_via_ad'`).

#### Criterios de éxito

- [ ] Mensaje entrante con `referral` (Click-to-WhatsApp ad) → si es PRIMER mensaje del `wa_id`:
  - Crear/upsertar campaña en `campanas_marketing` por `adId`.
  - Crear/actualizar cliente en `clientes` con `origen: { tipo: 'whatsapp_ad', adId, campanaId, capturadoAt }`.
- [ ] Si ya existe el cliente con `origen` previo → NO sobrescribir, agregar audit log.
- [ ] Dashboard de campañas muestra conteo de leads por campaña.
- [ ] Typecheck + lint + 12 cazadores PASS.
- [ ] Test E2E: Jorge crea un Click-to-WhatsApp ad de prueba en Meta Ads Manager apuntando al 6767, hace click, manda mensaje → aparece campaña nueva en `campanas_marketing` con `adId` y `mediaType`.

#### Restricciones

- NO romper el shape actual de `campanas_marketing` — solo agregar campos OPCIONALES.
- archivist PRE-CHANGE obligatorio.
- reviewer obligatorio (toca `campanas_marketing` que tiene rules estrictas).

#### Tiempo realista

**3-5 horas:**
- builder: 2-3 h.
- tester + regression_guardian: 30-45 min.
- reviewer: 30-45 min.
- E2E con Jorge: 30 min.

#### Cómo desbloquear

1. WA-1 deployado y validado.
2. Jorge confirma naming format opcional (no bloqueante — se puede iterar).
3. Jorge pega `OK: jorge YYYY-MM-DD HH:MM tracking referral`.

**OK Jorge:** _pendiente_

---

### SPRINT-WA-7 — Cron jobs (recordatorios + NPS + garantía a vencer)

**Tipo:** Endpoints públicos cron + integración Meta. Requiere OK.
**Estado:** BLOQUEADO 2026-05-18 — depende de WA-2 + WA-5.
**Prioridad:** 🟢 BAJA. Mejora marketing/post-venta, no funcionalidad core.

#### Dependencias

- WA-2 (necesita el endpoint `send.ts` para enviar plantillas).
- WA-5 (necesita el cache de plantillas `whatsapp_plantillas` para validar APPROVED).
- Decisión D9 (plan Vercel — define si son 3 crons o 1 consolidado).

#### Touch-list expandido

**Archivos a crear (3, o 1 si plan Hobby):**

Si plan Pro (D9=B):
1. `api/whatsapp/cron/recordatorios-mantenimiento.ts` — diario 10am RD.
2. `api/whatsapp/cron/garantias-por-vencer.ts` — lunes 11am RD.
3. `api/whatsapp/cron/nps-post-cierre.ts` — diario 12pm RD. Envía encuesta NPS a órdenes cerradas hace 3 días sin NPS.

Si plan Hobby (D9=A):
1. `api/whatsapp/cron/recordatorios-consolidado.ts` — diario 10am RD. Switch interno por path query: `?tipo=mantenimiento`, `?tipo=garantia`, `?tipo=nps`. Vercel cron llama 3 veces con diferente query (NO — Vercel cron no permite query). Mejor: un solo endpoint que internamente corre los 3 tipos secuencialmente (mantenimiento → garantía → nps).

**Archivos a modificar (1):**
1. `vercel.json` — agregar entrada(s) de cron.

**Consumidores verificados:**
- Idempotencia: `whatsapp_recordatorios_enviados/{tipo}__{entidadId}__{fechaYYYYMMDD}`.
- Outbox: cada envío crea doc en `whatsapp_mensajes_outbox` via call interno a `api/whatsapp/send` (con admin SDK bypass de auth Firebase).

**No afectados:**
- Crons existentes (gps, otros) siguen funcionando — solo se agrega.

**Hallazgos laterales esperados:**
- ¿Hay opt-out global? Sí — `whatsapp_config.optOuts[]` Y `clientes/{id}.optOutMarketing=true`. El cron debe respetar ambos.
- ¿Se envía a clientes que no respondieron en 6+ meses (potencial spam)? Validar.

#### Criterios de éxito

- [ ] Cron `recordatorios-mantenimiento` corre diario 10am RD (= 14:00 UTC), identifica clientes con último cierre 5-7 meses atrás Y NO opt-out Y NO enviado en últimos 90 días.
- [ ] Cron `garantias-por-vencer` corre lunes 11am RD, identifica órdenes con `garantia.fechaVencimiento` en 15-30 días.
- [ ] Cron `nps-post-cierre` (si plan Pro) corre diario 12pm RD, identifica órdenes cerradas hace 3 días sin NPS.
- [ ] Idempotencia 100%: correr el cron 2 veces el mismo día → cero duplicados.
- [ ] Mensajes con plantilla HSM apropiada (`recordatorio_mantenimiento`, `garantia_por_vencer`, o una nueva para NPS).
- [ ] Si cliente está en `optOuts` → cron lo skipea Y crea audit log.
- [ ] Si cliente está fuera de window 24h y plantilla no es APPROVED → falla con error claro en audit (no envía).
- [ ] Typecheck + lint + 12 cazadores PASS.
- [ ] Test E2E manual: Jorge fuerza ejecución del cron via Vercel Dashboard "Run now" → mensajes llegan a clientes de prueba (no a clientes reales).

#### Restricciones

- Respetar window 24h: si el cliente respondió hace <24h, mandar texto plano (raro en cron pero posible). Default: siempre plantilla HSM (mantenimiento/garantía).
- NO mandar a opt-outs NI a teléfonos inválidos (validar con regex RD).
- Cron debe completar en <60s por restricción Vercel.
- archivist PRE-CHANGE obligatorio.
- reviewer obligatorio.

#### Tiempo realista

**6-8 horas:**
- builder: 3-4 h (incluyendo consolidación si plan Hobby).
- tester + regression_guardian: 1 h.
- reviewer: 1 h.
- E2E con Jorge: 1 h.

#### Cómo desbloquear

1. WA-2 + WA-5 deployados.
2. Decisión D9 firmada (plan Vercel).
3. Si Jorge quiere NPS por WhatsApp, necesita una plantilla nueva APPROVED. Si no la quiere ahora → sacar `nps-post-cierre` del scope.
4. Jorge pega `OK: jorge YYYY-MM-DD HH:MM crons WA`.

**OK Jorge:** _pendiente_

---

### SPRINT-WA-6 — Bot IA conversacional con Claude Haiku

**Tipo:** Integración Anthropic + datos sensibles + endpoint público trigger. Requiere OK.
**Estado:** BLOQUEADO 2026-05-19 — depende de WA-1 + WA-2 + WA-3 (sin restricciones adicionales tras decisión D3=A).
**Prioridad:** 🟡 MEDIA-ALTA — diferencial competitivo grande. Después de validar que los humanos pueden responder bien (WA-3).

#### Resuelto 2026-05-19 noche — D3 cambió B → A (bot 24/7)

**Decisión actualizada:** Jorge eligió D3=A (bot atiende 24/7 con escalación a humano por triggers). La restricción horaria de la decisión B/C ya no aplica. WA-6 **no depende de plantilla nueva en Meta** para arrancar — el bot responde a toda hora.

**La plantilla `auto_respuesta_fuera_horario` queda como FALLBACK opcional de emergencia** (uso administrativo manual cuando hay incidente: bot caído, ban temporal de Meta, mantenimiento programado). NO es flujo normal. Si Jorge ya la mandó a approval Meta, queda en `whatsapp_plantillas` con `usoFallback: true`. Si NO la creó todavía, puede crearla en cualquier momento futuro — no bloquea WA-6.

**Lo que SÍ sigue bloqueando WA-6:**
1. Dependencia técnica: WA-1 + WA-2 + WA-3 deben estar deployados y verificados.
2. System prompt v1.0 confirmado por Jorge tras lectura de `docs/specs/bot-ia-system-prompt.md` (actualizado con D3=A — Trigger 5 horario eliminado, 24/7 explícito).
3. OK final de Jorge para procesar el sprint (estándar de cualquier sprint en BLOQUEOS que toca endpoint público nuevo + integración terceros).

**Nota sobre push fuera de horario laboral a operarias:**
Aunque el bot atienda 24/7, las **notificaciones** a Maria/Wilainy fuera de horario L-S 8:00-18:00 RD deberían respetar criterio de criticidad (no spamear push a las 3am por consulta de precios). Lógica sugerida para WA-6: si `motivoEscalado in ['urgencia_detectada', 'venta_perdida_potencial']` → push siempre. Si motivo es genérico → encolar para notificación al inicio del próximo turno laboral. Detalles a definir durante el sprint.

#### Dependencias

- WA-1 (recibe mensajes entrantes).
- WA-2 (envía respuestas del bot).
- WA-3 (UI para que operaria tome control y vea conversaciones del bot).
- `ANTHROPIC_API_KEY` ya en Vercel.
- `docs/specs/bot-ia-system-prompt.md` con system prompt v1.0 aprobado.
- **NUEVO:** Plantilla `auto_respuesta_fuera_horario` APPROVED en Meta (ver blocker arriba).

#### Touch-list expandido

**Archivos a crear (4):**
1. `api/_lib/whatsappBot.ts` — lógica del bot (`procesarTurno`, `detectarEscaladoPostRespuesta`, `extraerDatosCliente`).
2. `api/_lib/anthropicClient.ts` — wrapper Anthropic SDK con manejo de errores + token tracking.
3. `src/components/whatsapp/EstadoBot.tsx` — UI admin mostrando bot habilitado/deshabilitado por conversación + botón "Reactivar bot" + "Tomar control".
4. `scripts/invariantes/check-bot-system-prompt-version-sync.ts` — cazador opcional P-019: verifica que `whatsapp_config.bot.systemPromptVersion` matchea el frontmatter de `docs/specs/bot-ia-system-prompt.md`.

**Archivos a modificar (3):**
1. `api/whatsapp/webhook.ts` (creado en WA-1) — agregar invocación del bot cuando `conversacion.bot.habilitado && !requiereHumano && horario_OK`.
2. `src/services/ordenes.service.ts` — agregar `crearOSDesdeBot(datos, conversacionId)` que crea OS con `creadaPor='whatsapp_bot'` + `fase='nuevo_lead'`. Routing zona → técnico via `whatsapp_config.routingZonas`.
3. `src/types/index.ts` — agregar `OrigenOrden` con tipo `whatsapp_bot`.

**Consumidores verificados:**
- WA-1 webhook llama `procesarTurno()` después de persistir inbox + conversacion.
- `crearOSDesdeBot` consume `whatsapp_config.routingZonas` y `personal where rol='tecnico'`.
- `notificaciones.service.ts` consume nuevos tipos `whatsapp_requiere_humano`.

**Hallazgos laterales esperados:**
- Confirmar versión Anthropic SDK actual (`@anthropic-ai/sdk` versión). Si ya existe `api/ai/chat.ts`, reusar setup.
- Verificar `auditoria_admin` shape para `accion='bot_turn'` y `accion='bot_escalo_humano'`.

#### Criterios de éxito

- [ ] System prompt cargado desde `docs/specs/bot-ia-system-prompt.md` (build-time via fs read, no hardcoded).
- [ ] Bot responde en <5s al 95% de los mensajes.
- [ ] Bot captura los 5 datos (nombre, teléfono, dirección, equipo, falla) en conversación natural.
- [ ] Bot escala correctamente por cada uno de los 7 triggers (test manual de cada uno).
- [ ] Bot crea OS automáticamente cuando recolecta los 5 datos.
- [ ] Routing zona → técnico funciona; si zona no matchea → OS con `tecnicoId=''` + notificación coord.
- [ ] Costos monitoreables: cada llamada Anthropic registrada en `auditoria_admin` con `tokensInput`, `tokensOutput`, `costoUSD`.
- [ ] Operaria puede "Tomar control" en cualquier momento desde UI WA-3 → bot deja de responder en esa conversación.
- [ ] `bot.systemPromptVersion` matchea el frontmatter del archivo.
- [ ] Cazador opcional P-019 PASS si se implementa.
- [ ] Test E2E manual: Jorge hace una conversación completa con el bot (saludo → equipo → zona → falla → confirmación), bot crea OS visible en `/admin/ordenes`.
- [ ] Test E2E manual: Jorge escribe "humano" → bot escala correctamente, notif a operaria llega.
- [ ] Test E2E manual: Jorge dice algo confuso 3 veces → bot escala.
- [ ] Test E2E manual: cliente intenta hacer pregunta fuera de scope (política, otro tema) → bot redirige educadamente.

#### Restricciones

- NO permitir al bot acciones financieras (no aprobar precios, no emitir conduces, no facturar).
- Cada turno del bot logueado en `auditoria_admin` con `accion='bot_turn'`.
- archivist PRE-CHANGE obligatorio.
- reviewer obligatorio (LLM + datos sensibles + endpoint público trigger).
- security obligatorio (PII en logs, escape de tokens [ESCALAR:X]).
- qa manual obligatorio (test de los 7 triggers).

#### Tiempo realista

**10-15 horas:**
- builder: 6-9 h (bot logic + escalado + crear OS + routing).
- tester + regression_guardian: 1 h.
- reviewer + security: 2 h.
- qa manual (7 triggers + ejemplos del prompt): 1-2 h.
- E2E con Jorge: 1 h.

#### Cómo desbloquear

1. WA-1 + WA-2 + WA-3 deployados.
2. Decisiones D3, D5, D10 firmadas (horario, límite turnos, nombre/tono).
3. System prompt v1.0 aprobado por Jorge tras revisar `docs/specs/bot-ia-system-prompt.md`.
4. Jorge pega `OK: jorge YYYY-MM-DD HH:MM bot IA`.

**OK Jorge:** _pendiente_

---

### Resumen del módulo WhatsApp — para Jorge

**Estado al 2026-05-18:** 7 sprints encolados + 2 sprints administrativos (WA-0 decisiones + WA-RULES rules).

**Orden de procesamiento recomendado por el architect:**

| # | Sprint | Tiempo | Depende de |
|---|---|---|---|
| 0 | SPRINT-WA-0 (decisiones) | 30 min Jorge | — |
| 1 | SPRINT-WA-RULES (firestore.rules) | 1.5-2.5 h | WA-0 |
| 2 | SPRINT-WA-1 (webhook entrante) | 8-12 h | WA-RULES |
| 3 | SPRINT-WA-5 (UI plantillas) — paralelo a WA-1 | 4-6 h | WA-RULES |
| 4 | SPRINT-WA-2 (envío saliente) | 6-8 h | WA-1 + WA-5 |
| 5 | SPRINT-WA-3 (UI conversaciones) | 8-12 h | WA-1 + WA-2 |
| 6 | SPRINT-WA-4 (tracking referral) | 3-5 h | WA-1 |
| 7 | SPRINT-WA-7 (crons) | 6-8 h | WA-2 + WA-5 |
| 8 | SPRINT-WA-6 (bot IA) | 10-15 h | WA-1 + WA-2 + WA-3 |

**Total realista:** 47-69 horas distribuidas en 6-10 sesiones de Claude Code a lo largo de 1-2 semanas.

**Acciones manuales pendientes de Jorge POST-deploy de WA-1:**
- Configurar webhook URL en `developers.facebook.com → app 1558940908663280 → WhatsApp → Configuration → Webhooks`. URL: `https://www.misterservicerd.com/api/whatsapp/webhook`.
- Pegar `META_VERIFY_TOKEN` en pantalla del webhook.
- Suscribir campos: `messages`, `message_status`, `message_template_status_update`, `account_update`.
- Probar con botón "Verify and save".

---

## SPRINT-186 — Surface aviso descuento chequeo previo en modal creación + bugs UX modal orden

**✅ DESBLOQUEADO 2026-05-18 — movido a COLA tras OK Jorge cliente consolidado (audit `33M7G5z6lEBVBdSf6yKK`). Ver bloque original abajo (preservado por trazabilidad).**

**Tipo:** Feature UX + bugfixes UX. ESPERA confirmación humana del estado de datos.
**Estado:** BLOQUEADO 2026-05-18 — ESPERANDO OK JORGE (cliente consolidado).
**Origen:** QA puntual sidepanel 2026-05-18 sobre SPRINT-178. Movido por coordinator autónomo pasada 22 a este archivo por dependencia explícita marcada en la cola.

**Por qué está bloqueado:**

SPRINT-185 ya completó la parte de código (commit `a3b56bf`): el guard runtime contra duplicados está en producción, el script `scripts/dedup-clientes-por-telefono.ts` con DRY-RUN/`--apply` está commiteado, el cazador P-014 está activo. **Pero**: la consolidación de los duplicados existentes en producción (incluyendo "QA Test") la dispara Jorge manualmente vía:

```bash
npx tsx scripts/dedup-clientes-por-telefono.ts                  # DRY-RUN: reporta conteo
npx tsx scripts/dedup-clientes-por-telefono.ts --apply           # consolida (si ≤50 docs)
npx tsx scripts/dedup-clientes-por-telefono.ts --apply --ok-ampliado  # si DRY-RUN reportó >50
```

SPRINT-186 NO puede procesarse autónomo hasta que Jorge confirme que el cliente "QA Test" quedó consolidado (1 sola entrada en typeahead, mismo `clienteId` para OS-0058 y OS-0059). Sin esto, el QA del aviso del descuento estaría viciado por el bug original.

**Por qué Jorge debe disparar el `--apply` (regla operacional Jorge 2026-05-18):**

- Mismo patrón que SPRINT-149-APPLY y SPRINT-175-APPLY: scripts de migración los corre Jorge tras revisar el DRY-RUN.
- Si DRY-RUN reporta >5 grupos duplicados → escalar como `SPRINT-185-APPLY` separado.
- Si DRY-RUN reporta >50 docs afectados → requerir `--ok-ampliado` (sub-regla CLAUDE.md migraciones masivas).

**Resumen del scope de SPRINT-186 al desbloquear:**

1. **Sugerencia automática al crear orden** (`useOrdenCreateForm.ts` + `OrdenCreateModal.tsx`): al cambiar `cliente.id` + `equipoTipo`, llamar `buscarChequeoVigentePorCliente(clienteId, equipoTipo)` (debounce 300ms). Si hay chequeo vigente, mostrar banner naranja con checkbox "Aplicar descuento" (replica patrón del banner "Operaria asignada" de SPRINT-170).
2. **Sub-bug Modelo perdido al editar:** verificar binding `equipoModelo` en `OrdenEditModal.tsx`. Posible duplicación de campos (Modelo + Modelo del fabricante).
3. **Sub-bug `MessageNotSentError` al cerrar modal con Esc:** identificar listener fantasma + limpiar.

**Touch-list estimado:** `src/hooks/useOrdenCreateForm.ts`, `src/components/ordenes/OrdenCreateModal.tsx`, `src/components/ordenes/OrdenEditModal.tsx`, posible componente con listener fantasma.

**Restricciones:**

- NO procesar hasta que Jorge confirme cliente consolidado.
- NO tocar `buscarChequeoVigentePorCliente` (ya correcto post-SPRINT-178).
- archivist PRE-CHANGE obligatorio al desbloquear.

**Cómo desbloquear:**

1. Jorge corre `npx tsx scripts/dedup-clientes-por-telefono.ts` (DRY-RUN).
2. Si reporta ≤5 grupos: re-correr con `--apply`. Si reporta >5 grupos: agregar sub-sprint `SPRINT-185-APPLY` acá con conteo.
3. Jorge verifica en `/admin/clientes` que el typeahead de "QA Test" muestra 1 sola entrada (post-deploy + hard refresh).
4. Jorge edita esta entrada agregando `OK: jorge YYYY-MM-DD HH:MM cliente consolidado` y pega `procesa bloqueos` al coordinator.

**OK: jorge 2026-05-18 — cliente consolidado.**

Ejecución del dedup `--apply` (vía Cowork → Jorge 2026-05-18):

- DRY-RUN reportó 2 grupos (QA Test + Brito/Jorge Brito). Decisión: apply directo (canónico = más antiguo en ambos casos).
- `--apply` real: 2 grupos consolidados, 2 duplicados soft-deleted, 3 docs reasignados (2 órdenes + 1 factura), 1 batch atómico (6 ops Firestore).
- Audit log id: `33M7G5z6lEBVBdSf6yKK` en `auditoria_admin` con `accion=dedup_clientes_por_telefono`.
- Resultado: typeahead "QA Test" debería mostrar 1 sola entrada (`Q0y6fB6NCIkNoZ3nlwIp` como `clienteId` canónico). OS-0058 y OS-0059 ahora apuntan al mismo `clienteId` → `buscarChequeoVigentePorCliente` debería retornar el chequeo vigente correctamente.

Coordinator: procesar SPRINT-186 con `procesa bloqueos`.

---

## SPRINT-178 — Vigencia 30 días del chequeo + descuento automático a cotización

**Tipo:** Feature de producto con decisión de negocio + scope amplio. Requiere OK Jorge antes de procesar.
**Estado:** ✅ DESBLOQUEADO 2026-05-18 — movido a `COLA_AUTONOMA.md` con scope refinado por coordinator autónomo pasada 20. Jorge OK con 4 decisiones explícitas. Ver scope final en COLA.
**Origen:** QA E2E 2026-05-16. Jorge clarificó regla: "Los chequeos tienen 30 días de vigencia para ser utilizado en monto a favor de la cotización que se le hizo al cliente."

**Por qué se escaló (coordinator autónomo pasada 19, 2026-05-18):**

1. **Decisión de negocio pendiente:** edge case 2+ chequeos vigentes simultáneos sobre el mismo equipo. La cola dice "decisión pendiente de Jorge — recomendación coordinator: aplicar el más reciente". Sin OK explícito de esa regla, el sprint queda con ambigüedad de comportamiento.

2. **Scope amplio:** touch-list inicial cubre 6 archivos (`ordenes.service.ts`, `ModalSugerirSoloChequeo.tsx`, `Ordenes.tsx`, `types/index.ts`, `ProcesarFacturacionModal.tsx`, posiblemente `firestore.rules`). El sprint mismo dice "AUDIT explícito de consumidores antes de redactar fix final" — el spec actual NO tiene la auditoría hecha. Procesar autónomo arriesga implementar la parte equivocada del feature.

3. **Posible touch a `firestore.rules`:** el spec dice "Si requiere ajuste → ESCALAR a BLOQUEOS.md". Sin auditar las rules actuales contra los campos nuevos (`descuentoChequeoPrevioId`, `descuentoChequeoPrevioMonto`), no se puede confirmar si Jorge necesita aprobar cambio de rules antes.

4. **Posible necesidad de índice compuesto Firestore:** la query `buscarChequeoVigentePorCliente(clienteId, equipoTipo, equipoModelo)` requeriría un índice compuesto sobre `ordenes_servicio` (clienteId + equipoTipo + tipoCierre + fechaCierre). Eso impacta cuota de Firebase + costos.

5. **Posible backfill de órdenes legacy:** si Jorge quiere aplicar el descuento retroactivamente a clientes que ya tuvieron chequeo previo en los últimos 30 días pre-deploy, requiere script de migración separado (>50 docs probable) que va a BLOQUEOS también.

**Acción solicitada a Jorge:**

Antes de mover este sprint de vuelta a la cola con `procesa bloqueos`, decidir:

1. **Edge case 2+ chequeos vigentes simultáneos:** ¿se acumulan descuentos? ¿solo el más reciente? ¿solo el más antiguo? (recomendación coordinator: solo el más reciente — más justo para el negocio).

2. **¿Aplica a órdenes legacy?** Si SÍ, el backfill va como sub-sprint con OK separado. Si NO, solo nuevas cotizaciones post-deploy.

3. **¿Permitir override manual?** Ej: admin puede aplicar descuento sobre chequeo de >30 días si negocia con el cliente, con audit log.

4. **¿Granularidad del matching cliente/equipo?** ¿Por `clienteId` + `equipoTipo` + `equipoModelo`? ¿Solo por `clienteId` + `equipoSerie` si existiera? (probable: clienteId + equipoTipo + equipoModelo, pero hay que confirmar — el spec original no lo aclara).

**Cómo desbloquear:**

1. Jorge edita este bloque con las 4 decisiones explícitas + `OK: jorge YYYY-MM-DD HH:MM`.
2. Si la decisión arquitectónica revela touch a rules → el sub-sprint de rules va con OK separado.
3. Coordinator mueve este sprint de vuelta a `COLA_AUTONOMA.md` con scope refinado.

**Si Jorge prefiere rechazar:** agregar `RECHAZADO: jorge YYYY-MM-DD HH:MM <motivo>`. El estado actual no rompe operación corriente — los chequeos siguen siendo válidos contablemente, el "descuento" no se aplica automáticamente pero la coord puede aplicarlo manual en la cotización si el cliente lo pide.

**OK / RECHAZADO de Jorge:**

**Decisiones (vía Cowork → Jorge 2026-05-18):**

1. **Edge case 2+ chequeos vigentes simultáneos:** **solo el más reciente.** Si el cliente tiene 2 chequeos del mismo equipo vigentes (≤30d), aplica el descuento del más reciente solamente. Los anteriores quedan registrados pero no se acumulan. Recomendación del coordinator aceptada — más justa para el negocio.

2. **¿Aplica a órdenes legacy?** **NO — solo cotizaciones nuevas post-deploy.** Cero migración retroactiva. Cero riesgo de tocar facturación previa. Si un cliente tuvo chequeo pre-deploy y vuelve a cotizar post-deploy, NO se le aplica descuento automáticamente (la coord puede usar el override manual del punto 3 si lo negocia).

3. **¿Permitir override manual?** **SÍ con audit log completo.** Admin/coord pueden aplicar descuento sobre chequeo vencido (>30d) o sobre cualquier monto custom, con audit trail obligatorio (quién, cuándo, motivo, monto override vs auto, ordenId origen). El override se persiste en `descuentoChequeoPrevioOverride: true` + `descuentoChequeoPrevioMotivoOverride: <string>` + `descuentoChequeoPrevioAplicadoPor: <auth.uid>`.

4. **Granularidad matching:** **clienteId + equipoTipo (sin equipoModelo).** Match permisivo. Cualquier "Aire Acondicionado" del mismo cliente cuenta como aplicable, no importa marca/modelo. Generoso con el cliente — fideliza más. Si Jorge en el futuro quiere endurecer, agregar equipoModelo es trivial.

**Implicaciones arquitectónicas:**

- Query `buscarChequeoVigentePorCliente(clienteId, equipoTipo)` requiere índice compuesto sobre `ordenes_servicio` con `clienteId + equipoTipo + tipoCierre + fechaCierre`. **Si Firestore no tiene el índice, el coordinator debe escribirlo en `firestore.indexes.json` y desplegarlo con `npm run deploy:indexes` antes de cerrar el sprint.** Si requiere `firestore.rules`, ESCALAR a sub-sprint con OK separado (sub-regla CLAUDE.md).

- Campos nuevos en `OrdenServicio` (todos opcionales):
  - `descuentoChequeoPrevioId?: string` (ordenId del chequeo origen)
  - `descuentoChequeoPrevioMonto?: number`
  - `descuentoChequeoPrevioFecha?: Timestamp` (fechaCierre del chequeo origen)
  - `descuentoChequeoPrevioOverride?: boolean` (true si fue manual)
  - `descuentoChequeoPrevioMotivoOverride?: string`
  - `descuentoChequeoPrevioAplicadoPor?: string` (auth.uid del admin/coord)

- Denormalizar también en `Factura` post-emisión (para trazabilidad fiscal + para que reportes financieros distingan "ingreso por chequeo independiente" vs "anticipo aplicado").

- archivist PRE-CHANGE obligatorio antes de tocar `ordenes.service.ts` y los componentes de cotización.
- regression_guardian + reviewer obligatorios (riesgo financiero — descuento automático afecta cuentas).
- Postmortem opcional (solo si la ejecución revela una causa raíz estructural).

**OK: jorge 2026-05-18 — confirmo las 4 decisiones arriba (más reciente / solo nuevas / override con audit / clienteId+equipoTipo). Procesar autónomo con scope refinado. Si toca firestore.rules → BLOQUEOS sub-sprint separado. Si requiere índice compuesto, deployar con `npm run deploy:indexes` antes de cerrar.**

---

## SPRINT-175-APPLY — Ejecución de `--apply` del script de migración de fases legacy stuck post-conduce

**Tipo:** Migración de datos — Jorge dispara manualmente (sub-regla CLAUDE.md "cambios destructivos a datos productivos").
**Estado:** ✅ EJECUTADO 2026-05-18 17:55 — Jorge corrió `npx tsx scripts/migrar-ordenes-cerradas-legacy.ts --apply` en su Mac. DRY-RUN confirmó 13 stuck (mismo conteo que el de 2026-05-12). `--apply` real: **13/13 docs actualizados** en 1 batch. Audit log escrito en `auditoria_admin` con `accion=migracion_fases_cerrado_legacy`. Órdenes migradas: OS-0033, OS-0054, OS-0034, OS-0023, OS-0035, OS-0032, OS-0049, OS-0028, OS-0036, OS-0055, OS-0031, OS-0039, OS-0038. Próximo paso: hard refresh en /admin/dashboard para validar que embudo "Cerrado" subió en +13 y "Trabajo Realizado" bajó en -13.
**Estado previo:** ESPERANDO_OK_JORGE
**Origen:** SPRINT-175 completado por coordinator pasada 13 (2026-05-12). El script `scripts/migrar-ordenes-cerradas-legacy.ts` está pusheado en DRY-RUN. Falta alinear datos legacy: órdenes con `facturada: true && fase != 'cerrado'` (stuck pre-SPRINT-161 commit `4015fe1`).

**Resultado DRY-RUN 2026-05-12 (corrido durante el sprint sobre Firestore productivo):**
- `ordenes_servicio` con `facturada == true`: 14 total.
- Ya en `fase: 'cerrado'` (idempotencia, skip): 1.
- En `fase: 'cancelado'` (skip terminal distinto): 0.
- **Stuck (a migrar): 13 órdenes, todas en `fase: 'trabajo_realizado'`**.
- Ejemplos: OS-0033/CG-00010, OS-0054/CG-00017, OS-0034/CG-00011, etc.
- 13 < umbral 50 → NO requiere `--ok-ampliado`.

**Cómo ejecutar (Jorge en su Mac, después del push del script):**

1. **DRY-RUN re-confirmación (opcional pero recomendado, ya se hizo durante el sprint):**
   ```bash
   cd /Users/jorgeluisbritogarcia/Desktop/mister-service-rd
   npx tsx scripts/migrar-ordenes-cerradas-legacy.ts
   ```
   Si el conteo difiere de 13, revisar por qué antes de seguir.

2. **`--apply` real:**
   ```bash
   npx tsx scripts/migrar-ordenes-cerradas-legacy.ts --apply
   ```
   El script:
   - Migra en batches de 200 docs con `writeBatch` atómico.
   - Setea `fase: 'cerrado'` + `estadoSimple: 'completado'` + `estado: 'cerrado'`.
   - Appendea entry a `historialFases` con shape `{ fase, timestamp, usuario, nota }` (patrón SPRINT-161, array reemplazado completo, NO arrayUnion).
   - Setea `migradoSprint: 'SPRINT-175'` + `migradoEn: serverTimestamp()` (forensia).
   - Escribe audit log en `auditoria_admin` con `accion: 'migracion_fases_cerrado_legacy'`.

3. **QA post-`--apply`:**
   - Hard refresh en `/admin/ordenes`. Las órdenes migradas deben aparecer en columna "Cerradas" (no en "Trabajo realizado").
   - Verificar dashboard: contador de "Cerradas" sube en +13, "Trabajo realizado" baja en -13.
   - Spot-check de 1-2 órdenes en Firestore Console: `historialFases` tiene la entry de migración como última.

**Idempotencia:** si Jorge corre `--apply` dos veces, la segunda corrida verá 0 stuck y termina sin tocar nada.

**Restricciones:**

- NO ejecutar `--apply` antes del DRY-RUN.
- NO ejecutar `--apply` si conteo difiere significativamente de 13 sin explicación (puede indicar que el bug post-SPRINT-161 reapareció).
- NO desactivar el umbral de 50 sin OK explícito en este sprint (campo `--ok-ampliado`).

**Si Jorge prefiere rechazar:** agregar `RECHAZADO: jorge YYYY-MM-DD HH:MM <motivo>`. El estado actual no rompe operación corriente — las órdenes legacy solo aparecen mal categorizadas en filtros por fase, pero su `facturada: true` + `facturaNumero` están correctos. La migración es óptima pero no urgente.

**OK / RECHAZADO de Jorge:**

_(pendiente — esperando decisión)_

---

## SPRINT-158e — GPS bloqueante o informativo al cerrar orden (bug 8 del SPRINT-158, decisión de negocio)

**Tipo:** Decisión de negocio — Jorge decide la política. NO se puede procesar autónomo.
**Estado:** ESPERANDO_OK_JORGE
**Origen:** QA E2E distribuido 2026-05-13 sobre OS-0055 → CG-00018. Aury Mon (técnico) cerró la orden sin verificación GPS en su ubicación. Sistema detectó el cierre sin GPS verificado pero NO lo bloqueó: solo generó alerta informativa en dashboard ("Aury Mon cerró OS-0055 sin verificación GPS").

#### Estado actual del comportamiento

- La app SÍ controla GPS en el cierre del wizard (`CierreServicioWizard.tsx`).
- El check de distancia al cliente se persiste en `cierreServicio.fotoCierre.distanciaCliente` + `gpsVerificado`.
- Si el GPS no se verifica (técnico fuera de zona, sin permisos, distancia >500m), la alerta aparece en dashboard pero **el cierre se permite**.
- Comportamiento intencional o omisión histórica — no documentado en CLAUDE.md.

#### Opciones para Jorge

**Opción A — Mantener como alerta informativa (status quo):**
- Pro: Flexibilidad operativa. Técnico que está en zona con mal GPS no queda bloqueado.
- Pro: Alerta visible permite auditoría posterior.
- Contra: Riesgo de cierres fraudulentos (técnico cierra desde su casa, no del cliente).

**Opción B — Bloqueante absoluto (siempre exige GPS verificado):**
- Pro: Defense-in-depth contra cierres fraudulentos.
- Contra: Puede bloquear cierres legítimos en zonas con mala señal. UX degradada en RD donde muchas casas tienen poca cobertura indoor.
- Contra: Requiere desarrollar UI/flujo de "override con razón" para casos excepcionales.

**Opción C — Parametrizable por rol o por tipo de servicio:**
- Pro: Técnicos juniors → bloqueante. Técnicos seniors (Aury, etc.) → con override.
- Pro: Servicios de mantenimiento (rutinario) → flexible. Servicios de reparación con conduce → bloqueante (más valor monetario).
- Contra: Complejidad de implementación. Requiere matriz de permisos nueva.

**Opción D — Bloqueante solo si distancia >X metros (umbral parametrizable):**
- Pro: Tolerancia a GPS impreciso pero detecta cierres remotos.
- Pro: Implementación más simple que C.
- Contra: Aún permite cierre desde la casa del vecino si está a <X metros.

#### Decisión solicitada a Jorge

1. ¿Cuál opción (A/B/C/D u otra)?
2. Si B/C/D: ¿cuál es el umbral aceptable de distancia? (sugerido: 200m si urbano, 500m si rural — actual es 500m según código).
3. Si C: ¿qué roles son los privilegiados (con override) vs gateados (sin override)?
4. ¿Aplica retroactivamente a órdenes legacy con GPS no verificado? (sugerido: NO — solo nuevas).

#### Implementación post-OK Jorge

Una vez decidida la política, redactar SPRINT-158e-IMPL en `COLA_AUTONOMA.md` con:

- Touch-list (probable: `CierreServicioWizard.tsx`, `firestore.rules` si gating server-side, `Dashboard.tsx` para ajustar el banner de alerta).
- Si toca `firestore.rules` → ese sub-sprint también requiere OK separado (sub-regla CLAUDE.md).
- archivist PRE-CHANGE obligatorio.

#### OK / RECHAZADO de Jorge

_(pendiente — esperando decisión)_

---

## SPRINT-158b — Denormalización `operariaNombre` correctamente al crear orden + display en chip

**Tipo:** Bug requiere reproducción humana y verificación en Firestore Console — coordinator autónomo NO puede deducir causa raíz desde auditoría estática.
**Estado:** ESPERANDO_REPRODUCCION_JORGE
**Origen:** QA E2E distribuido 2026-05-13 sobre OS-0055. Wilainy reportó chip "Op: Operaria" (literal). Yohana reportó que el chip parece tomar el nombre del CREADOR de la orden.

#### Por qué se escaló (coordinator autónomo pasada 16, 2026-05-15)

Auditoría estática completa con grep en `src/**` por `operariaNombre`:

1. **Cadena de derivación al crear orden:** `useOrdenCreateForm.ts:622-624` busca técnico con `personal.find(p => (p.uid || p.id) === form.tecnicoId)` y persiste `tecnicoElegido.operariaNombre` en la orden. Esto es correcto post-c4be345.
2. **Origen del campo en el doc personal del técnico:** `FormAltaEditarEmpleado.tsx:217` setea `personal.operariaNombre = op?.nombre || ''` al asignar operaria desde dropdown. Si `op` es undefined, queda string vacío. Si la operaria existe, queda el nombre real.
3. **Render del chip:** `OrdenCard.tsx:171-175` renderiza `orden.operariaNombre.split(' ')[0]` con guard truthy. Si `operariaNombre = "Operaria"` literal en BD, el chip muestra "Op: Operaria".
4. **NO se encontró código que escriba `operariaNombre = "Operaria"` literal en ningún archivo del repo.** `ROL_LABELS.operaria = 'Operaria'` (utils/personal.ts:20) se usa SOLO en displays de tablas y `<option>` labels, NUNCA se persiste a Firestore.
5. **NO se encontró código que copie el nombre del creador a `operariaNombre`.** El campo `creadoPor` y `responsableNombre` se persisten en sus propios campos (líneas 650-651 de useOrdenCreateForm.ts), no en `operariaNombre`.

**Conclusión coordinator:** las hipótesis del spec original (a) "lee operariaRol en lugar de operariaNombre" y (b) "copia nombre del creador" no se sustentan con la evidencia estática. La fuente probable es:

- **Hipótesis A:** un seed o backfill antiguo escribió `operariaNombre = "Operaria"` literal en algunos docs `personal/` viejos, y se propagó por denormalización al crear órdenes.
- **Hipótesis B:** Yohana describió mal el síntoma del bug 6 — quizás vio el chip vacío y lo interpretó como "el del creador".
- **Hipótesis C:** existe un path de actualización que pasé por alto (ej. un script de migración no commiteado, o un import desde otro origen).

#### Acción solicitada a Jorge

**Antes de aplicar cualquier fix:**

1. **Reproducir el bug en producción:** abrir `/admin/ordenes`, identificar una card con "Op: Operaria" literal (Wilainy lo vio sobre OS-0055). Si ya se re-derivó, buscar otra similar.
2. **Verificar en Firestore Console:** abrir el doc `ordenes_servicio/{id}` de la orden afectada. Reportar:
   - Valor exacto de `operariaNombre`.
   - Valor exacto de `operariaId`.
   - Valor de `tecnicoId`.
3. **Verificar el doc personal del técnico de esa orden:** abrir `personal/{auth.uid del técnico}`. Reportar:
   - Valor exacto de `operariaNombre` en ese doc.
   - Valor exacto de `operariaId`.
4. **Pegarme la respuesta acá** (o en un comentario en este archivo) para que pueda redactar SPRINT-158b-FIX con la causa raíz real.

#### Alternativa si Jorge prefiere fix preventivo sin reproducción

Si Jorge prefiere "defense-in-depth" sin esperar reproducción:

- Agregar guard en `useOrdenCreateForm.ts:624`: si `tecnicoElegido?.operariaNombre === 'Operaria'` (literal del rol), tratarlo como vacío y NO persistir el campo.
- Agregar script `scripts/reparar-operarianombre-literal.ts` (read-only por default + `--apply`) que detecte y limpie docs con `operariaNombre === 'Operaria'` literal en `ordenes_servicio` y `personal`.
- Riesgo: si Hipótesis B (Yohana confundida) es la real, este fix no resuelve nada y deja deuda morta.

#### OK / RECHAZADO / RESPUESTA de Jorge

_(pendiente — esperando reproducción o decisión de fix preventivo)_

---

## SPRINT-149-APPLY — Ejecución de `--apply` del script de migración operariaId (post-fix de código)

**Tipo:** Migración de datos — Jorge dispara manualmente (sub-regla CLAUDE.md "migraciones >50 docs sobre flujo de nómina").
**Estado:** COMPLETADO 2026-05-12 17:42 — 63 docs migrados (49 órdenes + 14 técnicos), 0 huérfanos. Audit log en `auditoria_admin` con `accion: migracion_operariaid_a_uid`. Cambio al script: flag `--ok-ampliado` agregado para destrabar el gate de 50 docs cuando BLOQUEOS.md tiene el OK firmado.
**Origen:** SPRINT-149 completado por coordinator pasada 12 (2026-05-12). El fix de código está pusheado y deployado. Falta alinear datos legacy: cualquier `ordenes_servicio.operariaId` o `personal[tecnico].operariaId` que sea docId de una operaria con uid poblado debe migrarse a uid.

**Cómo ejecutar (Jorge en su Mac, después del deploy del fix de código):**

1. **DRY-RUN primero (obligatorio):**
   ```bash
   cd /Users/jorgeluisbritogarcia/Desktop/mister-service-rd
   npx tsx scripts/migrar-operariaid-a-uid.ts
   ```
   Output esperado: tabla con conteos `Total/Sin operariaId/Ya correcto/Migrable/Huérfano/Sin uid destino` para `ordenes_servicio` y para `personal` (técnicos). Listado de primeros 10 cambios propuestos.

2. **Revisión:**
   - Si `totalMigrables == 0` → nada que migrar, archivar este sprint.
   - Si `totalMigrables > 0 && <= 50` → seguir al paso 3.
   - Si `totalMigrables > 50` → el script abortará al ver `--apply`. Jorge debe agregar OK adicional en este mismo sprint: `OK ampliado: jorge YYYY-MM-DD HH:MM — autorizo migrar N docs (>50)`.
   - Si aparecen huérfanos → revisar manualmente (probablemente operarias eliminadas). El script NO los toca.

3. **`--apply` real:**
   ```bash
   npx tsx scripts/migrar-operariaid-a-uid.ts --apply
   ```
   El script:
   - Migra en batches de 200 docs con `writeBatch` atómico.
   - Setea `operariaId: <uid>` + `operariaIdMigradoDesde: <docIdViejo>` (forensia).
   - Escribe audit log en `auditoria_admin` con accion `migracion_operariaid_a_uid`.
   - Reporta progreso `[BATCH N] N docs actualizados (total X/Y)`.

4. **QA post-`--apply`:**
   - Hard refresh en `/admin/dashboard` y `/admin/ordenes` como Yohana (operaria pre-SPRINT-105). Verificar que "mis órdenes" sigue mostrando lo correcto.
   - Si tenés ambiente de prueba: crear operaria nueva → asignar técnico → crear orden → verificar shape en Firestore Console.

**Lo que ya está pusheado (no requiere acción humana):**

- 13 archivos de código con lookups migrados a `(p.uid || p.id) === operariaId` (compatibles pre/post migración).
- Cazador P-006 extendido (variante 4) con 0 hits.
- Docs actualizados.

**Restricciones:**

- NO ejecutar `--apply` antes del DRY-RUN.
- NO ejecutar `--apply` si conteos no parecen razonables (>200 docs migrables sin explicación).
- NO desactivar el umbral de 50 sin OK explícito acá.

**Si Jorge prefiere rechazar:** agregar `RECHAZADO: jorge YYYY-MM-DD HH:MM <motivo>`. El código actual con fallback `(p.uid || p.id)` funciona correctamente para órdenes pre y post migración — los datos legacy siguen apuntando a docId pero los reads los matchean. La migración es óptima pero no urgente.

**Resultado DRY-RUN 2026-05-12 17:40 (Jorge):**
- `ordenes_servicio`: 55 total → 49 migrables, 6 sin operariaId, 0 huérfanos, 0 sin uid destino.
- `personal` (técnicos): 14 total → 14 migrables, 0 huérfanos, 0 sin uid destino.
- **Total: 63 docs migrables, 0 huérfanos.** Migración limpia.

**OK ampliado: jorge 2026-05-12 17:40 — autorizo migrar 63 docs (>50). Resultado del dry-run muestra 0 huérfanos y 100% de uids destino válidos. Apply autorizado.**

---

## SPRINT-149 — DESBLOQUEADO 2026-05-12 (OK: jorge "ambos en orden, 149 primero")

**Movido a `COLA_AUTONOMA.md` como PENDIENTE el 2026-05-12 por coordinator (pasada 12). desbloqueadoPor: jorge 2026-05-12 vía "ambos en orden, 149 primero".**

Conservado acá para histórico. NO procesar desde acá — la entrada activa está en `COLA_AUTONOMA.md`.

<details>
<summary>Spec original + decisión humana (preservada para forensia)</summary>

**Tipo:** Sprint con instrucción explícita del usuario delegante de NO procesar autónomo.
**Estado:** ESPERANDO OK JORGE
**Origen:** Cowork escribió la spec completa en `COLA_AUTONOMA.md` el 2026-05-12 ("Origen: Jorge 2026-05-12 vía Cowork. ... a pedido explícito de Jorge: 'vamos con operaria'"). El coordinator pasada 11 recibió instrucción explícita en el prompt del modo autónomo: "NO toques los 3 hits `operariaId === p.id` (nomina/Ordenes/Rendimiento) — esos sí requieren decisión arquitectónica humana y van a BLOQUEOS.md si no están ya."

**Por qué requiere OK humano (a pesar de que Cowork lo escribió):**

Hay un conflicto de autoridad que solo Jorge puede resolver:

- Cowork (vía interfaz natural con Jorge) escribió la spec dándola por aprobada con la frase "vamos con operaria".
- El prompt del coordinator en la pasada 11 dice expresamente "NO toques los 3 hits operariaId === p.id" y los redirige a BLOQUEOS.md.
- Ambos llegan vía Jorge. El coordinator NO puede resolverlo sin que Jorge confirme cuál instrucción es la actual.

**El riesgo de procesarlo autónomo sin clarificación es alto:**

1. Toca código de nómina/comisiones (riesgo financiero medio-alto, la propia spec lo declara).
2. Requiere reviewer obligatorio + archivist PRE-CHANGE obligatorio.
3. 13 archivos + script de migración de datos + cazador P-006 extendido.
4. Si Jorge cambió de opinión entre el dictado a Cowork y el prompt al coordinator, procesar autónomo es ir contra una instrucción explícita posterior.

**Lo que Jorge debe hacer para desbloquear:**

1. Decidir si la migración `operariaId → auth.uid` se procesa autónoma O queda en BLOQUEADO para revisión humana paso a paso.
2. Agregar al final de esta sección UNA de las dos opciones:
   - `OK: jorge YYYY-MM-DD HH:MM | confirmo "vamos con operaria" — procesar autónomo según spec de Cowork`
   - `MANTENER BLOQUEADO: jorge YYYY-MM-DD HH:MM | razón <X>`
3. Si OK, pegar `procesa bloqueos` al coordinator de Claude Code.

OK: jorge 2026-05-12 — confirmo SPRINT-149, procesalo según spec de Cowork ("vamos con operaria")

**OK adicional pasada 12:** jorge 2026-05-12 vía "ambos en orden, 149 primero" — confirma re-procesamiento de SPRINT-149 según spec de Cowork.

**Spec completa preservada:** la entrada original con scope, touch-list, auditoría de consumidores, script de migración y criterios sigue intacta en `COLA_AUTONOMA.md` (sección SPRINT-149). NO procesar desde acá — al desbloquear, el coordinator la mueve de vuelta a PENDIENTE en la cola.

**Restricciones reiteradas:**
- archivist PRE-CHANGE obligatorio.
- reviewer obligatorio (riesgo financiero — nómina).
- regression_guardian obligatorio.
- `--apply` del script de migración NO se ejecuta autónomo. Jorge lo dispara manual cuando esté listo después del fix de código.

</details>

---

## SPRINT-138 — Crear `storage.rules` versionado + flujo `deploy:storage-rules`

**Tipo:** Sprint bloqueado por OK humano (toca rules de seguridad productiva — equivalente al gate de `firestore.rules`).
**Estado:** ESPERANDO OK JORGE
**Origen:** Audit forense Cowork 2026-05-11. `firestore.rules` está versionado en el repo, pero `storage.rules` no existe — las rules de Storage viven solo en Firebase Console. Sin archivo en el repo no hay diff en PR ni protección contra `git revert`, y el flujo `npm run deploy:rules` no las cubre.

**Por qué requiere OK:**

1. Toca un archivo de rules nuevo que va a deployarse a producción → riesgo de bloquear flujos legítimos si está mal escrito (técnico que sube foto, cliente que firma).
2. Necesita que Jorge **dicte el baseline actual de las rules de consola** antes de empezar. Sin baseline, el sprint puede sobreescribir rules existentes con un default genérico.
3. Patrón espejo de `firestore.rules` que requiere reviewer obligatorio con foco en rules.

**Lo que Jorge debe hacer para desbloquear:**

1. Entrar a https://console.firebase.google.com/project/mister-service-app-cloude/storage/rules
2. Copiar el contenido completo del editor y pegarlo abajo en la sección "Baseline actual de rules" de esta entrada.
3. Agregar `OK: jorge YYYY-MM-DD HH:MM` al final de esta sección.
4. Pegar `procesa bloqueos` al coordinator de Claude Code.

**Baseline actual de rules** (Jorge completa esta sección antes de OK):

```
<pegá acá las rules tal como están en consola hoy>
```

**Restricciones reiteradas (también en el sprint):**

- archivist PRE-CHANGE obligatorio.
- reviewer obligatorio (foco rules + defense in depth).
- regression_guardian obligatorio.
- `npm run deploy:storage-rules` ejecutado por Jorge — coordinator NO ejecuta autónomo.
- Smoke test manual post-deploy: técnico sube foto, operaria sube foto, cliente firma. Si algo se rompe, revertir.

**Si Jorge prefiere rechazar:** agregá `RECHAZADO: jorge YYYY-MM-DD HH:MM <motivo>` y se archiva. Las rules de Storage siguen viviendo solo en consola hasta nuevo aviso.

### Dependencia explícita — SPRINT-159 (firma del cliente) agregó nuevo path

**Agregado:** 2026-05-13 por coordinator post-SPRINT-159.

SPRINT-159 implementó captura de firma del cliente en el wizard de cierre. El upload escribe a un path nuevo de Storage:

```
firmas_cierre/{ordenId}/firma-{timestamp}.png
```

**Acción manual requerida ANTES del QA E2E en iPad de Aury** (Jorge ajusta directamente en la consola Firebase):

1. Entrar a https://console.firebase.google.com/project/mister-service-app-cloude/storage/rules
2. Verificar/agregar regla que permita writes desde técnico autenticado al path `firmas_cierre/{ordenId}/{cualquier-nombre}`. Si las rules actuales permiten escrituras desde cualquier usuario autenticado a cualquier path (común en setups iniciales), no requiere cambio — el code ya valida MIME + size lado cliente vía `validarFirma()`.
3. Si las rules tienen whitelist explícita de paths, agregar:

```javascript
match /firmas_cierre/{ordenId}/{archivo} {
  allow read: if request.auth != null;       // staff lee para ver el cierre
  allow write: if request.auth != null
              && request.resource.size < 2 * 1024 * 1024
              && request.resource.contentType.matches('image/.*');
}
```

4. Si Aury intenta firmar en iPad y obtiene `permission-denied` o `unauthorized` al subir la firma → es exactamente este gap. Toast del wizard muestra "Error de permisos al subir la foto. Contacta al administrador." (mensaje genérico, no específico para firma — deuda menor).

**Cuando SPRINT-138 se desbloquee:** este path queda permanentemente cubierto en el archivo versionado `storage.rules`. Hasta entonces vive solo en consola.

---

## SPRINT-135a-UI — Refactor garantía fase 1, parte UI (countdown público + wizard cierre) — DESBLOQUEADO

**OK:** jorge 2026-05-11 18:25 | scope: ambos (endpoint público + wizard cierre).
**Movido a COLA_AUTONOMA.md como PENDIENTE el 2026-05-11 por coordinator (procesa bloqueos). desbloqueadoPor: jorge 2026-05-11 18:25.**

Conservado acá para histórico. NO procesar desde acá — la entrada activa está en `COLA_AUTONOMA.md`.

<details>
<summary>Spec original preservado para forensia</summary>

**Tipo:** Bloqueado por restricciones de protocolo + QA visual humano.
**Estado:** ESPERANDO OK JORGE
**Origen:** Coordinator autónomo 2026-05-11. La fase backend de SPRINT-135a (tipos `VisitaGarantia` + enum `garantia_reclamada` + `OrdenServicio.{visitasGarantia, periodoGarantiaDias, garantiaVencimiento}` + `src/utils/garantia.ts` helpers puros + maps `faseLabel`/`faseColor`/`faseBgColor`/`faseToEstadoSimple`) quedó cerrada autónoma. La parte UI (criterios 5 y 6 del spec original) requiere OK por dos motivos independientes:

**Motivo 1 — Endpoint público (regla protocolo "endpoints `api/` públicos"):**

El criterio "GarantiaCliente.tsx muestra countdown legible + botón Reclamar con estado disabled correcto" requiere modificar también el endpoint `api/garantia/[token].ts` para que retorne los campos nuevos (`periodoGarantiaDias`, `garantiaVencimiento`, días restantes computados server-side). El endpoint es público (consumido desde `/garantia/:token` sin auth), y la sub-regla CLAUDE.md/protocolo dice "Cambios a endpoints `api/` públicos" requieren OK Jorge.

**Motivo 2 — Wizard de cierre (sub-regla CLAUDE.md "cleanup en componentes wizard"):**

El criterio "Wizard de cierre tiene el input 'Período de garantía'" toca el componente del wizard de cierre (probablemente `CierreServicioWizard.tsx` o homólogo en `src/components/cierre/`). La sub-regla CLAUDE.md dice explícitamente que "cleanup de 'dead code' en archivos de páginas críticas requiere QA manual del flujo afectado antes de commit. Para cualquier cleanup sobre... `CierreServicio*` o componentes de wizard, el commit message debe declarar 'QA flujo X validado' o agregar a BLOQUEOS.md para validación humana." Si bien NO es cleanup sino feature nueva, el riesgo es idéntico: tocar el wizard de cierre sin QA visual puede romper el flujo crítico técnico→cierre.

**Lo que Jorge debe hacer para desbloquear:**

1. Decidir si autoriza el cambio al endpoint público `api/garantia/[token].ts`. Si SÍ → confirmar el shape del response que se agrega: `garantia.periodoGarantiaDias`, `garantia.garantiaVencimiento`, `garantia.diasRestantes` (estos ya existen como mock retornado por el endpoint — verificar coherencia).
2. Autorizar la modificación del wizard de cierre, sabiendo que el coordinator NO puede ejercitar el flujo end-to-end con técnico real.
3. Comprometerse a hacer un smoke test post-deploy:
   - Cerrar una orden de prueba con período 1 día.
   - Abrir `/garantia/:token` → countdown muestra "Vence en 1 día".
   - Setear manualmente `garantiaVencimiento` a ayer en Firestore Console → recargar → botón disabled.
4. Agregar `OK: jorge YYYY-MM-DD HH:MM | scope: ambos | tests acepta: <descripción>` al final de esta sección.
5. Pegar `procesa bloqueos` al coordinator de Claude Code.

**Si Jorge prefiere rechazar:** agregar `RECHAZADO: jorge YYYY-MM-DD HH:MM <motivo>`. La fase backend ya está mergeada y es retrocompatible (campos opcionales); el sprint queda como "parcial". La UI nueva puede esperar a SPRINT-135b en bloque.

**Touch-list adicional (cuando se desbloquee):**
- `api/garantia/[token].ts` — exponer campos nuevos en el response.
- `src/pages/public/GarantiaCliente.tsx` — UI countdown + botón disabled.
- `src/components/cierre/CierreServicioWizard.tsx` (o el componente real del wizard nuevo, identificar primero) — input "Período de garantía (días)" con default 60.
- Posiblemente `src/hooks/useCierreServicio.ts` u homólogo si la lógica vive en hook.

**Plan de QA post-deploy** (a ejecutar por Jorge):
1. Crear orden de prueba con cliente test.
2. Cerrar con `equipoFunciona=true` + `clienteSatisfecho=true` + período `1 día`.
3. Abrir `/garantia/:token` en otro browser/incognito → countdown debe decir "Vence en 1 día" (rojo si <7).
4. Setear `garantiaVencimiento` a ayer en Firestore Console → recargar → botón Reclamar debe quedar disabled.
5. Para órdenes legacy (sin `garantiaVencimiento`), confirmar que el countdown se computa al vuelo desde `cierreServicio.fechaCierre + 60d` y muestra valor coherente o mensaje neutro.

**OK: jorge 2026-05-11 18:25 | scope: ambos**

</details>

---

## SPRINT-141 — Activar App Check enforce (con ventana monitoreo 48h previo)

**Tipo:** Sprint bloqueado por OK humano (cambio operacional en Firebase Console, no es código).
**Estado:** ESPERANDO OK JORGE
**Origen:** Audit forense Cowork 2026-05-11. App Check está inicializado en `src/firebase/config.ts:22-42` con reCAPTCHA v3 pero en modo soft (no bloquea requests sin token). Audit recomienda activar enforce, pero con ventana de monitoreo previa de 48h para evitar bloquear usuarios legítimos.

**Por qué requiere OK:**

1. Activar enforce puede romper la app para usuarios reales si algún flujo no inicializa App Check correctamente. Es operación de alto riesgo.
2. El cambio se hace en consola, no en código — el coordinator no puede ejecutarlo.
3. Necesita ventana de monitoreo humano de 48h en Firebase Console mirando "App Check verified vs unverified requests".

**Lo que Jorge debe hacer para desbloquear (flujo en 3 pasos):**

**Paso 1 — Día 0 (Jorge inicia ventana de monitoreo):**

1. Entrar a https://console.firebase.google.com/project/mister-service-app-cloude/appcheck
2. Ver sección "Requests" para Firestore y Storage en últimos 7 días.
3. Anotar baseline: `% verified = ___` y `% unverified = ___` para cada producto.
4. Agregar acá: `Día 0 baseline: jorge YYYY-MM-DD HH:MM | Firestore verified ___% | Storage verified ___%`
5. NO activar enforce todavía. Solo iniciar la ventana.

**Paso 2 — Día 0+48h (Jorge revisa de nuevo):**

1. Volver a Firebase Console → App Check → Requests.
2. Si `verified > 99%` para ambos productos → continuar al Paso 3.
3. Si `verified < 99%` → investigar qué flujo no envía token (probablemente algún hook o ruta que no importa `firebase/config.ts` antes de hacer requests). Abrir sprint diagnóstico antes de enforce.

**Paso 3 — Día 0+48h (Jorge activa enforce, ya con OK del Paso 2):**

1. Firebase Console → App Check → Firestore → "Enforce" → ON.
2. Lo mismo para Storage.
3. Smoke test end-to-end con admin, coord, operaria, técnico, secretaria. Si todo OK:
4. Agregar `OK enforce activado: jorge YYYY-MM-DD HH:MM — Firestore + Storage` y archivar.
5. Si algo se rompe → desactivar enforce inmediatamente (1 click en consola) y abrir sprint diagnóstico.

**Restricciones reiteradas:**

- Coordinator solo registra los pasos acá y espera.
- Considerar activar primero Firestore, esperar 24h, después Storage. Reduce blast radius.
- Postmortem-positivo si todo OK (sub-regla continuous improvement loop, opcional).

**Si Jorge prefiere rechazar:** agregá `RECHAZADO: jorge YYYY-MM-DD HH:MM <motivo>`. App Check sigue en soft mode hasta nuevo aviso (vulnerable a abuso desde scripts externos con las API keys públicas del bundle).

---

## SPRINT-134-mant-QA — Validación funcional: generar orden desde mantenimiento programado (writeBatch atómico)

**Tipo:** QA humana **no bloqueante** (registro de pendiente, no impide cierre del sub-sprint).
**Estado:** PENDIENTE VALIDACIÓN HUMANA
**Origen:** SPRINT-134 sub-sprint Mantenimiento (pasada 5 del 2026-05-11). `handleGenerarOrden` envuelto en `writeBatch` para que la creación de la orden y la actualización de `proximaFecha` en el mantenimiento sean atómicas. Cazadores 7/7 PASS + typecheck + lint OK + regression_guardian PASS + reviewer APPROVED. PERO el sprint pide validación manual del flujo — el coordinator no puede ejercitar UI real ni network throttling.

**Casos a validar manualmente (Jorge en su Mac, en entorno de prueba):**

1. **Caso primary — generar orden desde mantenimiento vencido (happy path):**
   - Ir a `/admin/mantenimiento` y elegir un mantenimiento programado vencido (o crear uno con fecha en el pasado).
   - Click "Generar orden" (botón con icono RefreshCw o equivalente).
   - **Resultado esperado:** toast verde `Orden OS-XXXX creada`. Verificar en `/admin/ordenes` que la orden nueva aparece con `fase: 'agendado'`, cliente y equipo del mantenimiento, descripción "Mantenimiento programado (frecuencia)". Verificar en `/admin/mantenimiento` que la `proximaFecha` del item se movió N meses (mensual=1, trimestral=3, semestral=6, anual=12).

2. **Caso secondary — atomicidad (simular fallo a mitad):**
   - Abrir DevTools → Network tab → setear "Offline".
   - Click "Generar orden" sobre un mantenimiento programado.
   - **Resultado esperado:** el toast de error debe aparecer ("Error al generar orden") y verificar en Firestore Console:
     - **Ninguna** orden nueva en `ordenes_servicio` con el `numero` consumido del counter (el counter sí avanzó por ser tx aparte — esto es comportamiento esperado, idéntico al SPRINT-133).
     - El item de `mantenimiento` mantiene su `proximaFecha` original (NO se movió).
   - El test antiguo (pre-SPRINT-134) habría dejado la orden creada Y luego habría fallado al update de `proximaFecha`, resultando en una orden de mantenimiento "no contabilizada" en su item original.

3. **Caso terciario — orden secuencial de operaciones:**
   - Ejecutar el caso primary 2 veces consecutivas en el mismo mantenimiento.
   - **Resultado esperado:** ambas órdenes se crean con números secuenciales (OS-XXXX y OS-XXXX+1), y `proximaFecha` salta dos veces. No hay race condition aparente.

**Si todos pasan:** Jorge edita esta sección con `OK: jorge YYYY-MM-DD HH:MM — QA validado` y la archivamos.

**Si algún caso falla:** capturar consola del browser + Firestore Console (estado de docs afectados) y reportar a Cowork. Posible regresión del fix.

**Nota técnica:** Firestore `writeBatch` es atómico para el set de la orden + update del mantenimiento (2 ops, dentro del límite de 500). El `siguienteNumeroOrden()` consume un counter en su propia tx ANTES del batch — si el batch falla, el número queda como hueco numérico (consistente con SPRINT-133 / SPRINT-2ba57e4).

---

## SPRINT-133-QA — Validación funcional: eliminación atómica de técnico/operaria con órdenes activas

**Tipo:** QA humana **no bloqueante** (registro de pendiente, no impide cierre del sprint).
**Estado:** PENDIENTE VALIDACIÓN HUMANA
**Origen:** SPRINT-133 (pasada 4 del 2026-05-11) envolvió `handleConfirmarEliminar` en `writeBatch` con chunking. Cazadores 7/7 PASS + typecheck + lint OK + reviewer APPROVED + regression_guardian PASS. PERO el sprint pide validación manual del flujo de eliminación con simulación de fallo a mitad — el coordinator no puede ejercitar UI real ni network throttling.

**Casos a validar manualmente (Jorge en su Mac, en entorno de prueba o producción con cuidado):**

1. **Caso primary — eliminar técnico con 2-3 órdenes activas:**
   - Crear un técnico de prueba (ej: "Test Técnico SPRINT-133") en `/admin/personal`.
   - Asignarle 2-3 órdenes activas (crearlas desde `/admin/ordenes` o reasignar existentes).
   - Ir a `/admin/personal` → click "Eliminar" en el técnico de prueba.
   - El modal de transferencia debe aparecer pidiendo técnico destino.
   - Elegir otro técnico real (ej: Aury) y confirmar.
   - **Resultado esperado:** toast verde "Técnico eliminado. N orden(es) transferida(s) a Aury". Verificar en `/admin/ordenes` que las 2-3 órdenes ahora muestran a Aury como técnico. Verificar en Firestore Console que `personal/<id de prueba>` ya NO existe.

2. **Caso secondary — eliminar operaria con técnicos asignados:**
   - Crear operaria de prueba en `/admin/personal`.
   - Asignar 1-2 técnicos a esa operaria (desde el perfil de cada técnico, campo "Operaria").
   - Crear 1-2 órdenes a esos técnicos.
   - Ir a `/admin/personal` → click "Eliminar" en la operaria de prueba.
   - Modal de transferencia → elegir otra operaria real (ej: Wilainy) → confirmar.
   - **Resultado esperado:** toast verde "Operaria eliminada. N técnico(s) y M orden(es) transferidos a Wilainy". Verificar:
     - Los técnicos ahora muestran a Wilainy en su perfil.
     - Las órdenes muestran a Wilainy.
     - El doc de la operaria de prueba ya NO existe en `personal/`.

3. **Caso terciario — atomicidad (simular fallo a mitad):**
   - Crear técnico de prueba con 2-3 órdenes activas.
   - Abrir DevTools → Network tab → setear "Offline" o throttling agresivo.
   - Click "Eliminar" → confirmar.
   - **Resultado esperado:** el toast de error debe aparecer ("Error al eliminar") y verificar en Firestore Console:
     - Si el batch alcanzó a ejecutar: o **TODAS** las órdenes están transferidas Y el personal está borrado, o **NINGUNA** está transferida Y el personal sigue existiendo. NUNCA estado parcial.
   - El test antiguo (pre-SPRINT-133) habría dejado las primeras N órdenes transferidas y el resto + el delete personal sin ejecutar.

4. **Caso colateral — eliminar admin/secretaria sin dependencias:**
   - Verificar que la eliminación de un admin (no el último) o secretaria sin órdenes asignadas sigue funcionando con un solo `deleteDoc` (no se rompió).

**Si todos pasan:** Jorge edita esta sección con `OK: jorge YYYY-MM-DD HH:MM — QA validado` y la archivamos.

**Si algún caso falla:** capturar consola del browser + Firestore Console (estado de docs afectados) y reportar a Cowork. Posible regresión del fix.

**Nota técnica:** Firestore `writeBatch` es atómico en el límite de 500 operaciones por batch. Si llegamos a >500, hay chunking secuencial con atomicidad parcial documentada en código y aceptada por el spec del sprint.

---

## SPRINT-132-QA — Validación funcional: CREATE de orden con técnico que tiene operariaId

**Tipo:** QA humana **no bloqueante** (registro de pendiente, no impide cierre del sprint).
**Estado:** PENDIENTE VALIDACIÓN HUMANA
**Origen:** SPRINT-132 (commit `43a2087`, 2026-05-11) corrigió 12 sitios de READ + 4 de WRITE upstream con vector P-006 (`find(p.id === tecnicoId)` post-c4be345 retornaba undefined). Cazadores 7/7 PASS, build OK, lint OK, deploy verificado. PERO el sprint pide validación manual del flujo CREATE — el coordinator no puede ejecutar UI real.

**Caso concreto a validar (idealmente Jorge en su Mac o en producción):**

1. **Caso primary — derivación de operaria al crear orden:**
   - Verificar que el técnico **Aury Mon** tenga **Wilainy** asignada como `operariaId` en su perfil (en `/admin/personal`, editar Aury Mon y confirmar el campo "Operaria" en el bloque de Grupos).
   - Si Aury NO tiene operaria asignada → primero asignar Wilainy desde la UI de Personal.
   - Ir a `/admin/ordenes` → "Nueva orden".
   - Seleccionar un cliente existente.
   - En el selector de técnico, elegir **Aury Mon**.
   - Llenar resto de campos mínimos (equipo, dirección, fecha).
   - Guardar la orden.
   - **Resultado esperado:** la orden creada debe mostrar **Operaria: Wilainy** desde el inicio (NO `—`, NO vacío). Verificar en la vista de la orden recién creada y en la tabla de órdenes.
   - **Si falla:** capturar pantalla + console del browser + reportar a Cowork. Esto sería regresión del fix.

2. **Caso secondary — edit de orden post-fix:**
   - Abrir la orden de Aury Mon recién creada.
   - Cambiar el técnico a otro que tenga distinta operariaId.
   - **Resultado esperado:** banner amber "Esta orden pasará al grupo de {nueva operaria}" debe aparecer.
   - Guardar. Verificar que la orden ahora muestra la nueva operaria.

3. **Caso terciario — reasignación drag&drop en mapa:**
   - Ir a `/admin/mapa` (Mapa de rutas).
   - Drag&drop de un pin de orden a otro técnico (en la lista de técnicos del sidebar derecho).
   - Confirmar la reasignación en el modal.
   - **Resultado esperado:** la orden queda con `tecnicoId == auth.uid` del nuevo técnico (verificable porque el nuevo técnico puede ejecutar acciones en la orden, ej: "Iniciar chequeo"). Antes del fix, escribía `tecnicoId == personal.id` y rompía rules.

4. **Caso colateral — display de comisiones / cierre día / facturas:**
   - Abrir `/admin/comisiones` agrupado por técnico: verificar que cada técnico muestra su color asignado (no el default `#0f3460`) para órdenes nuevas.
   - Abrir `/admin/cierre-dia`: idem.
   - Abrir una factura con items asignados a técnico: el avatar/nombre debe aparecer correcto.

**Si todos pasan:** Jorge edita esta sección con `OK: jorge YYYY-MM-DD HH:MM — QA validado` y la archivamos.

**Si algún caso falla:** reportar a Cowork con captura + console error. Cowork abrirá SPRINT-132-FIX o investigará caso específico.

---

## SPRINT-131-QA — Validación visual: cards de orden en iPad portrait

**Tipo:** QA humana **no bloqueante** (registro de pendiente, no impide cierre del sprint).
**Estado:** PENDIENTE VALIDACIÓN HUMANA
**Origen:** SPRINT-131 cerró el código (cambio `md:flex-row` → `lg:flex-row` en `OrdenCard.tsx:68`) + cazadores 7/7 PASS + build OK + lint del archivo limpio. El coordinator no puede ejecutar QA visual con DevTools real; queda registrado acá.

**Casos a validar manualmente (Wilainy / Yohana / Mariela en iPad real, o Jorge con DevTools responsive):**

1. **iPad portrait (~810×1080)** en `/admin/ordenes` (Vista Lista):
   - Abrir cualquier card de orden con fase activa (idealmente OS-0049 de Aury Mon en Diagnóstico).
   - El layout debe ser COLUMN: foto arriba, info del cliente al medio, stepper+botones abajo.
   - El botón "Cancelar" debe estar 100% visible (no recortado a "✗ Car…").
   - "Cómo llegar" y el botón papelera (Eliminar) también deben quedar visibles.
   - El stepper de 8 fases debe verse completo (puede wrapear a varias filas dentro de su contenedor).

2. **Desktop (≥1024px, ej. 1280px o 1440px)**:
   - El layout debe ser HORIZONTAL idéntico al actual: foto izquierda, info al medio, stepper+botones a la derecha en una sola fila.
   - Verificar que NO haya regresión visual (densidad similar a la de hoy).

3. **Tablet landscape (~1024×768)**:
   - Como 1024 cae justo en el breakpoint `lg:`, validar que se vea bien (debería activarse el layout horizontal). Si queda apretado, está OK siempre que el botón Cancelar sea clickeable.

4. **Mobile (<768px)**:
   - Sigue layout COLUMN, sin regresión.

**Si algún caso falla:** reportar a Cowork con captura. Cowork agregará SPRINT-131-FIX (probablemente `overflow-x-auto` + `min-w-0` como fallback documentado en el sprint).

**Si todos pasan:** Jorge (o quien valide) edita esta sección con `OK: jorge YYYY-MM-DD HH:MM — QA visual OK` y la podemos archivar.

---

## SPRINT-130-QA — Validación visual del botón "Re-sincronizar operaria"

**Tipo:** QA humana **no bloqueante** (registro de pendiente, no impide cierre del sprint).
**Estado:** PENDIENTE VALIDACIÓN HUMANA
**Origen:** SPRINT-130 cerró el código + cazadores 7/7 PASS + typecheck + build, pero la sub-regla CLAUDE.md "cleanup en componentes de wizard requiere QA manual" se interpreta extensivamente para feature nueva en `OrdenEditForm.tsx` (lista crítica del archivist). El coordinator NO puede ejecutar QA visual; registra acá lo que el humano debe verificar.

**Casos a validar manualmente (cuando Jorge o cualquier humano abra la app post-deploy):**

1. **Caso primario — Aury Mon / Wilainy** (el bug original que motivó el sprint):
   - Abrir `/admin/ordenes` → buscar una orden de Aury Mon que aparezca sin operaria.
   - Hacer click en "Editar" en el modal de detalle.
   - En la sección Programación, debajo del dropdown de Técnico, debe aparecer un banner amber con texto tipo "Esta orden no tiene operaria asignada. El técnico hoy reporta a Wilainy." y un botón púrpura "Re-sincronizar operaria".
   - Click en el botón → confirm dialog → aceptar.
   - Toast verde "Operaria sincronizada: Wilainy". El doc en Firestore debe quedar con `operariaNombre: "Wilainy"` y un registro de auditoría `campo: 'operariaId'` con detalle "Asignó operaria...".

2. **Estado "sincronizada":** abrir cualquier orden cuya operaria YA coincide con la del técnico. El botón debe aparecer disabled emerald con texto "Sincronizada" + tooltip.

3. **Estado "sin operaria":** abrir una orden de un técnico sin operaria asignada en Personal. El botón debe aparecer disabled gris con texto "Sin operaria" + mensaje amber "Asigná operaria al técnico en Personal primero.".

4. **Estado oculto:** abrir una orden sin técnico asignado. NO debe aparecer el botón.

5. **No regresión:** confirmar que el dropdown de Técnico, los avisos "Grupo: X" / "Esta orden pasará al grupo de X" siguen funcionando como antes (cambio NO afectó el flujo derivativo del create/edit normal).

**Si algún caso falla:** reportar a Cowork con captura. Cowork agregará SPRINT-130-FIX a la cola con detalle.

**Si todos pasan:** Jorge edita esta sección con `OK: jorge YYYY-MM-DD HH:MM — QA visual OK` y la podemos archivar.

---

## SPRINT-115 fase write — SUPERADO por SPRINT-118 (re-migración masiva acotada a 5 empleados)

Conservado en histórico. El alcance original (3 notis de Yohana) queda absorbido por el OK más amplio abajo.

---

## SPRINT-118 — Re-migración masiva notis legacy + fix email Wilainy en Auth — DESBLOQUEADO

**OK:** jorge 2026-05-08 (vía conversación Cowork tras auditoría con `scripts/auditoria-notis-legacy-todos.ts` + `scripts/auditoria-emails-personal-vs-usuarios.ts`).

**Movido a COLA_AUTONOMA.md como PENDIENTE el 2026-05-08 por coordinator (procesa bloqueos). desbloqueadoPor: jorge 2026-05-08.**

Conservado acá para histórico. NO procesar desde acá — la entrada activa está en `COLA_AUTONOMA.md`.

### Fase 1 — Re-migración de notis legacy (5 empleados, ~44 docs)

**Scope autorizado** (acotado por uid, NO masivo a toda la colección):

| Empleado | uid | personalDocId | Notis Caso A |
|---|---|---|---|
| Yohana Operaria | `HGkVoYpGKzL4JJI7FnTpHjdsM972` | `zFhokrDoPH9lD63ZxKAY` | 3 (de diagnóstico previo) |
| Wilainy Operaria | `KT9LaszokWNmLCEIe8YOvNKc9rF3` | `j944265Su9Hyw29YQTj8` | 14 |
| Jorge (admin) | `dN2wxlTrLUMAff1gE2K4Q8IXi2m2` | `63ZMIT2LouKFLpBCQLUk` | 9 |
| misterservicerd (admin) | `kAKPMRLe8aaAJxCrvyc8YeMoxRG3` | `GqJfIoRgP4GJTAActUKy` | 9 |
| Maria Teresa (coord) | `HgakSUkclXSyxmBeLm3GkayFOK63` | `NXFORv7bqeksSg980icg` | 9 |

**IDs específicos de docs Caso A** (output exacto del script `auditoria-notis-legacy-todos.ts` ejecutado el 2026-05-08):

- **Yohana** (3): `F9BV32k4JEoEOk97K4xc`, `TVwtOtmNlzW334IUIUdF`, `VWjdYBRmKgU8rGPlbJAv` (de diagnóstico anterior — el script general los cuenta como ok porque encuentra match con personalDocId, pero Yohana NO los ve en su campanita).
- **Wilainy** (14): `2tPkAmQymtZgMLRRQfTr`, `451UPKpR2vAmsCpsoFNv`, `8WdJHYbEYdZ4wUc4eQnE`, `BgAsQHZMPEfa3LL8ffyV`, `DpQh90B38dmVjSEJVxFv`, `ERtDuPDxeUXph8b8cSNv`, `FMnk6RpFQyxiYRiKZQln`, `JHa0TPJpGVH3OpzPPlV1`, `PFRnT9GuahrydO8g8Hhz`, `Q2Z0pBdjwo6vyK04koPZ`, `SV5DhnuxPwEOCwBwNt2t`, `vKdH6Q9dLRRYQZFUolNY`, `vfbmwla7698GcANVUShS`, `zWWMGk1UFV75sAjaOoVu`.
- **Jorge** (9): `5CZ6039fqvtRyGpiNseM`, `cWDqvmuXpFJptULZ3eOD`, `fjW4YYIq74MtaneORrCD`, `gzSt5SBjTJBRmDmB1rUq`, `lFOU7YDdREy6Rauyyp0q`, `xBUxbB10ocEH2kjLADIl`, `zisaxTDaX1vGmj6Cq9mu`, `3hV65FcsI4HJ3Q0nc4Dv`, `o5yco816RhNGwquDv8P1`.
- **misterservicerd** (9): `4WEMXrqqrAZyoxd7CfQs`, `RXpcWGzERPpfnhc8IwcR`, `WMansj9afOAJcFJbTvuH`, `eFKbcOHszof28K3NVL9s`, `k8dH5RIfMKeBx3QDHagB`, `uRyZuUceQPnSgPBqNgtV`, `xpZLRggHAA8goPfJ1Vhf`, `SZe4ymcOeFWDgH9WFZDj`, `T477a42VXV0oguzrZcTh`.
- **Maria Teresa** (9): `DUZFo0j9pXuKL6oRYPZn`, `DVnPHlYFH838E0xbOVWt`, `LZKL5vbYCoUY4eueQOmW`, `Oyz2NElDajHl2jDOlnD9`, `jU1r9gmKH1oDBQPSMeXG`, `pEwGvpvP0Fo8BUhf2Npc`, `zv8qZ3oq97AXsaPKOCai`, `XqrPkWoGtK65EGrf6yx0`, `rrtigrKrsHyJgNKrprTX`.

**Acción autorizada al builder:**

1. Generalizar `scripts/re-migrar-notificaciones-yohana.ts` → nuevo script `scripts/re-migrar-notificaciones-masivo.ts`.
2. Scope hardcodeado a los 5 uids listados arriba (NO masivo a toda la colección).
3. Para cada doc de la lista de IDs autorizados:
   - `update` que setea `userId = <uid correspondiente>`.
   - Idempotencia: si `userId` ya es ese valor, skip.
4. NO tocar `destinatarioId` (la lectura dual del service ya lo soporta).
5. NO tocar otros campos (leida, leidaEn, tipo, titulo, descripcion).
6. Logear cada doc tocado con shape antes/después en stdout.
7. DRY-RUN por default; `--apply` explícito requerido.
8. Después de ejecución real, escribir entrada en `auditoria_admin` con `accion: 'remigracion_notificaciones_masivo'`, `actorUid`, `docsAfectados: [44 ids]`, `empleadosAfectados: [5 uids]`.

### Fase 2 — Fix email Wilainy en Firebase Auth

**Email correcto confirmado por Jorge:** `Nwilainy@gmail.com` (con N mayúscula).

**Estado actual:**
- `personal/{j944265Su9Hyw29YQTj8}.email` = `Nwilainy@gmail.com` ✓ (ya correcto, no tocar).
- `usuarios/{KT9LaszokWNmLCEIe8YOvNKc9rF3}.email` = `apnbrito0318@gmail.com` (incorrecto).
- Firebase Auth `users/{KT9LaszokWNmLCEIe8YOvNKc9rF3}.email` = `apnbrito0318@gmail.com` (incorrecto).

**Acción autorizada al builder:**

1. Crear `scripts/fix-email-wilainy.ts` con Admin SDK.
2. Operaciones:
   - `admin.auth().updateUser(uid, { email: 'Nwilainy@gmail.com' })`.
   - `usuarios/{uid}.email` setear a `Nwilainy@gmail.com`.
3. NO tocar contraseña, NO crear nuevo user, NO eliminar el viejo.
4. Audit log en `auditoria_admin`.
5. **Wilainy debe tener acceso a la casilla `Nwilainy@gmail.com` para resets de contraseña futuros**. Jorge confirmó este punto.
6. DRY-RUN por default; `--apply` explícito requerido.

### Restricciones globales

- Cada fase tiene script propio. Builder los entrega ambos en el mismo sprint.
- Coordinator NO ejecuta `--apply` autónomo. Jorge corre dry-run primero, después decide si aplicar.
- Después de ejecución real, validación humana:
  - Yohana, Wilainy, Maria Teresa hacen hard refresh y reportan que ven sus notificaciones nuevas.
  - Jorge intenta cambiar contraseña de Wilainy desde GestionUsuarios y confirma que ya no tira "no existe usuario".
- Postmortem obligatorio (sub-regla CLAUDE.md "cada bug → cazador" + "5+ empleados afectados"). Builder genera `docs/postmortems/2026-05-08-notis-legacy-multiples-empleados.md`.
- Considerar agregar P-XXX nuevo al catálogo: "notificaciones legacy con userId/destinatarioId apuntando a personalDocId en lugar de auth.uid". Cazador difícil porque es bug de datos, no de código — pero el cazador puede ser un script de health-check periódico (ej: `npm run audit:notis-legacy` que corre la auditoría general y avisa si aparecen nuevos casos).

### NO autorizado (requiere OK separado)

- Migrar notificaciones de OTROS usuarios fuera de los 5 listados.
- Tocar `firestore.rules` (si encuentra rule gap durante el fix, escalar a Jorge).
- Borrar notis o cambiar campos no listados.
- Hacer cambio de email para usuarios distintos a Wilainy.

---

## SPRINT-128 — DESBLOQUEADO 2026-05-10 (OK: jorge vía Cowork — ruta R2)

**Movido a "Histórico de desbloqueos" abajo el 2026-05-10 por coordinator (procesa bloqueos, pasada 7). Aplicado en el commit del sprint. Conservado acá como stub para forensia.**

OK humano: `jorge 2026-05-10 vía Cowork` ("puedes corregir las reglas tu por favor"). Ruta elegida: R2 (alinear rule a granular).

Acción aplicada: `firestore.rules:369` cambió de `allow delete: if esAdminOCoord();` a `allow delete: if isAuth() && userData().permisos.ordenesEliminar == true;` (usando el helper `userData()` ya definido en línea 62 del archivo). `npm run deploy:rules` ejecutado el mismo día (lock `29247a9...`). Matriz #14 RESUELTO. Spec original íntegro preservado en el histórico de la entrada SPRINT-128 en `COLA_AUTONOMA.md` y en la sección "Histórico de desbloqueos" abajo.

---

## SPRINT-117c — DESBLOQUEADO 2026-05-09 (OK selectivo: 5 de 6 sub-sprints)

**Movido a `COLA_AUTONOMA.md` como PENDIENTE el 2026-05-09 por coordinator (procesa bloqueos). desbloqueadoPor: jorge 2026-05-09.**

Conservado acá para histórico. NO procesar desde acá — las entradas activas (117c1, 117c2, 117c3, 117c4, 117c6) están en `COLA_AUTONOMA.md`. SPRINT-117c5 marcado RECHAZADO con motivo abajo.

<details>
<summary>Spec original + decisión humana (preservada para forensia)</summary>

**Bloqueado originalmente:** coordinator 2026-05-08 (cierre de SPRINT-117b). Espera revisión de la propuesta documentada en `docs/sprints/PROPUESTA_IA_2026-05-08.md`.

**Resumen 60 segundos:**
- 6 sub-sprints 117c1..c6, cada uno con touch-list de 1-3 archivos máximo, plan de rollback y riesgo bajo.
- Reduce sidebar admin de 44 a ~32 ítems, operaria de 17 a ~10, secretaria de 13 a ~8.
- Sin tocar identificadores internos. Sin tocar `TecnicoVista`. Sin tocar `firestore.rules`.
- 4 preguntas abiertas en §6 de la propuesta — opcionales (hay defaults razonables).

**OK selectivo: jorge 2026-05-09 | sub-sprints aprobados: 117c1, 117c2, 117c3, 117c4, 117c6**
**RECHAZADO: jorge 2026-05-09 | sub-sprint: 117c5**

**Motivo del descarte de 117c5:** ese sub-sprint ocultaba ítems del sidebar basándose en el rol (operaria/secretaria). Eso pisa el sistema de permisos individuales que Jorge ya maneja desde el módulo de Usuarios — donde se da o quita acceso a cada módulo persona por persona según su función. Reorganizar el sidebar es OK porque solo cambia agrupación visual de los ítems a los que el empleado YA tiene acceso. Pero ocultar por rol introduce una segunda capa de gating que choca con la fuente de verdad existente (`usuarios/{uid}.permisos.*`).

**Defaults aceptados de las preguntas abiertas (§6 de la propuesta):**
1. Métricas del Mes como pestaña dentro de Rendimiento → sprint propio futuro (NO en 117c).
2. Etiqueta "Bandeja de entrada" → OK.
3. Mapa de Rutas para operaria → no aplica (gating sigue siendo el de Usuarios, no el del rol).
4. Catálogo legacy (`/admin/productos`) en sidebar admin → ocultar en 117c1, eliminar del routing en sprint propio futuro.

**Recordatorio explícito al builder:** TODO ítem del sidebar debe seguir respetando los permisos individuales que vienen de `usuarios/{uid}.permisos.*`. La reorganización SOLO agrupa y renombra etiquetas. NO agrega lógica de "este ítem se oculta si rol === X". Si un empleado tiene permiso para un módulo, lo ve. Si no, no lo ve. Esto ya funciona así hoy y no se cambia.

**Restricciones reiteradas:** archivist obligatorio PRE-CHANGE en cada sub-sprint, regression_guardian antes de commit, QA visual con Aury/Wilainy/Yohana después de cada deploy.

</details>

---

## SPRINT-112-QA — QA manual de la matriz de permisos (sub-sprint humano)

**Origen:** SPRINT-112 fase documental procesada autónoma 2026-05-10. La matriz `docs/MATRIZ_PERMISOS.md` declara 27 flujos × 6 roles = **162 celdas**. Cada celda ≠ ✗ requiere validación con un usuario real del rol correspondiente.

**Por qué BLOQUEADO:** requiere humano. El coordinator no puede autenticar como cada rol en producción ni operar la UI físicamente.

**Esfuerzo:** ~2 horas con accesos por rol y un setup de pruebas controlado.

**Riesgo de no hacerlo:** los gaps detectados en la sección B (eliminar orden #14 inconsistente UI vs rule, ver eliminadas #15 no testeada, secretaria + trabajo realizado #8 sin verificar) quedan latentes. Probabilidad de bug en producción si una operaria intenta eliminar: alta (sin diagnóstico la operaria intenta y "no pasa nada").

**Cómo desbloquear:**

1. Jorge agenda 2h con Yohana (operaria) + Aury (técnico) + Wilainy (operaria) + secretaria activa.
2. Para cada celda ≠ ✗ de la tabla principal: intentar la acción, anotar resultado en una columna nueva del doc `QA_RESULT` con valores: `OK` / `permission-denied` / `no-aparece-UI` / `error-otro`.
3. Si aparecen inconsistencias UI ↔ rule (UI deja, rule rechaza): abrir sprint propio por celda fallida.
4. Marcar este sub-sprint COMPLETADO en `EJECUCION_AUTONOMA.md` con timestamp + nombre del operador humano.

**Comando de desbloqueo:** N/A. Es trabajo humano puro. Cuando esté hecho, Jorge le dice a Cowork "QA matriz hecho" y Cowork mueve a histórico.

---

## Histórico de desbloqueos

- **SPRINT-115 fase write (re-migración Yohana):** desbloqueado por jorge 2026-05-08, movido a `COLA_AUTONOMA.md` por coordinator 2026-05-08 (cuarta pasada). Re-pausado por jorge mismo día (ver entrada activa arriba). Conservado para histórico.
- **SPRINT-118 (re-migración masiva 5 empleados + fix email Wilainy):** desbloqueado por jorge 2026-05-08, movido a `COLA_AUTONOMA.md` por coordinator 2026-05-08 (`procesa bloqueos`). Restricción del sprint conservada: el coordinator entrega scripts en DRY-RUN; Jorge ejecuta dry-run y `--apply` manualmente.
- **SPRINT-117c (reorganización IA del sidebar):** desbloqueado por jorge 2026-05-09 con OK selectivo (5 de 6 sub-sprints). 117c1, 117c2, 117c3, 117c4, 117c6 movidos a `COLA_AUTONOMA.md` como PENDIENTE. 117c5 marcado RECHAZADO con motivo (chocaba con sistema de permisos individuales). Coordinator procesa uno por uno con QA visual humana entre cada deploy — restricción explícita del spec original.
- **SPRINT-135a-UI (countdown público + input período en wizard cierre):** desbloqueado por jorge 2026-05-11 18:25 con `scope: ambos` (autoriza tanto endpoint público `api/garantia/[token].ts` como wizard de cierre `CierreServicioWizard.tsx`). Movido a `COLA_AUTONOMA.md` como PENDIENTE el 2026-05-11 por coordinator (`procesa bloqueos`, pasada 7). Spec íntegro preservado en bloque colapsado arriba para forensia.
- **SPRINT-149 (completar migración `operariaId` a `auth.uid`):** desbloqueado por jorge 2026-05-12 vía "ambos en orden, 149 primero". Movido a `COLA_AUTONOMA.md` como PENDIENTE el 2026-05-12 por coordinator (pasada 12). Restricciones del sprint conservadas: archivist PRE-CHANGE obligatorio, reviewer obligatorio (riesgo financiero — nómina), regression_guardian obligatorio. `--apply` del script de migración NO se ejecuta autónomo — queda en `BLOQUEOS.md` como entrada nueva una vez el coordinator termine el fix de código. Spec íntegro preservado en bloque colapsado arriba para forensia.
- **SPRINT-128 (alinear rule `ordenes_servicio.delete` al granular `ordenesEliminar`):** desbloqueado por jorge 2026-05-10 vía Cowork ("puedes corregir las reglas tu por favor"). Procesado por coordinator el mismo día (`procesa bloqueos`, pasada 7) — ruta R2 ejecutada en un solo commit con archivist PRE-CHANGE auto, regression_guardian PASS, reviewer APPROVED con foco rules, deploy de rules ejecutado (lock `29247a9ac037fdc9a7398db716a15c31521a905e7438e8b857d95b12440561c6`, deployedAt `2026-05-10T23:03:57.139Z`), matriz `docs/MATRIZ_PERMISOS.md` #14 marcado RESUELTO. Cambio de 1 línea funcional + 9 líneas de comentario explicativo en `firestore.rules:369`. Sin commit follow-up (todo en un commit). Sin sprints colaterales abiertos. Spec original (R1 vs R2, criterios de aceptación detallados, riesgos R2) preservado a continuación para forensia:

<details>
<summary>Spec original SPRINT-128 (preservado para forensia)</summary>

**Bloqueado originalmente por:** coordinator 2026-05-10 (autónomo `trabaja`, pasada 6). Builder evaluó R1 vs R2 y concluyó que R1 era no-op (default `false` ya, heredado de `TODO_FALSE`, ver `src/types/index.ts:1267` `PERMISOS_DEFAULT_OPERARIA` sin override) y el verdadero fix era R2.

**Hallazgo colateral durante auditoría:** la matriz `docs/MATRIZ_PERMISOS.md` línea 61 + 92 decía erróneamente "default operaria `ordenesEliminar=true`". Corregido en commit del bloqueo (pasada 6). Información correcta: default es `false`; la inconsistencia solo se manifiesta si admin activa el granular persona-por-persona en el modal.

**Por qué R2 (no R1):**
- R1 (cambiar default a `false`) era no-op — ya era `false`.
- R2 (ampliar la rule a `puede('ordenesEliminar')`) alinea con la regla declarada de Jorge: "los permisos se controlan desde Usuarios y Permisos". Sin R2 el checkbox `ordenesEliminar` del modal era engañoso para roles operaria/secretaria: si Jorge lo activaba, la operaria veía el botón pero la rule rechazaba.

**Acción autorizada (aplicada):**
1. Editar `firestore.rules` línea 369: reemplazar `allow delete: if esAdminOCoord();` por `allow delete: if isAuth() && userData().permisos.ordenesEliminar == true;` (la versión final usa el helper `userData()` ya definido en línea 62, más conciso que reescribir el `get(/databases/...)` literal).
2. Ejecutar `npm run deploy:rules` ANTES de commitear (sub-regla P-005 lock).
3. Validación humana NO requerida inmediatamente — el delete sigue siendo soft (recuperable vía `eliminada=true`), reviewer ya validó la rule, y por defecto operarias tienen `false`. Validación natural: cuando Jorge active el permiso para alguien por primera vez, comprobar que esa persona puede borrar.
4. Reviewer obligatorio con foco en rules (sub-regla "reviewer obligatorio cuando sprint toca firestore.rules").
5. Update `firestore.rules.deployed.lock` automáticamente vía `deploy:rules`.
6. Actualizar `docs/MATRIZ_PERMISOS.md` sección "Inconsistencias detectadas" marcando #14 como RESUELTO con ruta R2.
7. Cazadores 7/7 PASS al cerrar (8/8 si se cuenta P-008 de datos, pero P-008 es on-demand fuera de pre-commit).

**Riesgo de R2 (preservado para postmortem futuro si aplica):**
- La rule pasa de validación por rol (estática, conocida) a validación por permiso granular (lookup de `usuarios/{uid}`). Es +1 `get()` por delete request, costo aceptable (además ya estaba implícito en `esAdminOCoord` que también consulta `userData()`).
- Si un admin se equivoca y le da `ordenesEliminar=true` a una operaria que no debería, esa operaria podrá borrar órdenes. Mitigación: el delete es soft-delete via `eliminada=true` según la nota del rule en línea 367-368 — recuperable.
- Postmortem leído antes del deploy: `docs/postmortems/2026-05-07-iniciar-chequeo-rules-sin-deploy.md` (sub-regla P-005). Lección aplicada: `npm run deploy:rules` ejecutado ANTES del commit, lock actualizado.

**Restricción explícita honrada:** NO se hicieron cambios adicionales al `firestore.rules` en el mismo commit. Solo la línea 369 + comentarios explicativos arriba. Las inconsistencias #15 (papelera operaria) y #8 (secretaria + trabajo realizado) siguen abiertas en `BLOQUEOS.md` SPRINT-112-QA como QA humano puro.

</details>

---

## SPRINT-VERCEL-PLAN-DECISION — Vercel Hobby vs Pro (3 crons WhatsApp)

**Tipo:** Decisión operativa + posible billing.
**Estado:** BLOQUEADO 2026-05-19 — esperando OK Jorge antes de SPRINT-WA-7.
**Prioridad:** 🟡 MEDIA (no bloquea WA-5, WA-3, WA-4 ni WA-6 — solo WA-7 crons).

#### Por qué se escaló

D9 original (SPRINT-WA-0 OK Jorge 2026-05-19) dijo "Pro 3 crons separados". Posterior verificación operativa: Vercel está en **Hobby plan**. Hobby permite hasta **2 crons** (Pro hasta 40). WA-7 necesita 3 crons (sync-plantillas, recordatorios-mantenimiento, garantias-por-vencer).

Adicionalmente, Hobby tiene **timeout 10s** por serverless function. WA-2 ya redujo MAX_INTENTOS_META de 5 a 3 para encajar en ese budget (~9s worst-case). Pro elevaría a 60s.

#### Opciones

- **(A) Upgrade a Pro** ($20/mes). Permite 3 crons separados + timeout 60s + suficiente headroom para WA-6 bot IA (latencia Anthropic 1-5s × turnos).
- **(B) Quedarse en Hobby** + consolidar a 2 crons (un endpoint que internamente corre mantenimiento + garantía + nps secuencialmente, otro endpoint sync-plantillas). Pierde aislamiento de fallos entre los 3 jobs y forza a respetar el 10s total para los 3 combinados.

#### Recomendación

(A) Pro. Costo $20/mes vs riesgo de timeout en cron consolidado + limitación futura para WA-6 bot.

#### Cómo desbloquear

Jorge edita esta entrada con `OK: jorge YYYY-MM-DD HH:MM upgrade Pro` o `OK: jorge YYYY-MM-DD HH:MM consolidar 2 crons`. Coordinator entonces actualiza decisión D9 en MODULO_WHATSAPP.md y procede con WA-7.

**OK Jorge:** _pendiente_

---

## SPRINT-WA-2-FOLLOWUP-RATE-LIMITS-CONFIG — Crear doc `config/rate_limits.whatsapp_send`

**Tipo:** Operacional (config Firestore). NO toca código.
**Estado:** ABIERTO 2026-05-19 — opcional, sin OK Jorge requerido.
**Prioridad:** 🟢 BAJA — el endpoint funciona con defaults hardcoded mientras el doc no exista.

#### Por qué existe este sprint

SPRINT-WA-2 implementó rate limit en `api/whatsapp/send.ts` que cuenta envíos por uid y día. El cap se lee de `config/rate_limits.whatsapp_send.{rol}` con fallback a defaults hardcoded:

- administrador: 500/día
- coordinadora: 500/día
- secretaria: 300/día
- operaria: 300/día
- default (rol desconocido): 100/día

Si el doc `config/rate_limits` NO tiene sub-key `whatsapp_send`, los defaults aplican. Sin acción inmediata.

#### Para personalizar caps

Jorge edita doc `config/rate_limits` desde Firestore Console agregando:

```json
{
  "whatsapp_send": {
    "administrador": 1000,
    "coordinadora": 800,
    "secretaria": 500,
    "operaria": 500,
    "default": 50
  }
}
```

Los valores aplican en el próximo POST (no requiere redeploy). UI admin para editar puede agregarse en un sprint futuro si se necesita ajuste frecuente.

---

## SPRINT-WA-BILLING-VERIFY — Verificación operativa de billing/quality vía Graph API + handler errores + P-019

**Tipo:** Operacional + endurecimiento defensivo. NO toca features visibles.
**Estado:** ✅ COMPLETADO 2026-05-19 — commit hash al final de esta pasada.
**Prioridad:** 🟡 MEDIA — defensa preventiva del módulo WhatsApp recién deployado.

#### Resumen de implementación

5 archivos nuevos + 6 modificados:
- `api/_lib/manejarErrorMeta.ts` — helper centralizado que parsea códigos error Meta (131056/131057/131031/131048/132000/132001/131047/131051/131026), persiste en `whatsapp_errores_meta` con `mensaje` truncado a 500 chars y `detalles` JSON-stringificado capeado a 1000 chars (mitigación PII), notifica admins activos con dedupe transaccional por `(codigo, día RD)` para evitar spam en incidentes recurrentes.
- `scripts/verificar-billing-whatsapp.ts` — script local sin Firebase Admin. Consulta Graph API por phone_number_ids + WABA + plantillas. Imprime tabla + veredicto stdout + escribe `docs/sprints/REPORTE_BILLING_WA_<fecha>.md`. NUNCA persiste tokens.
- `scripts/invariantes/check-billing-errors-no-silenciados.ts` — cazador P-019 (17 cazadores activos). Tag `// @safe-meta-catch: <razón ≥10 chars>` para allowlist por línea.
- `api/whatsapp/send.ts` modificado: integra `manejarErrorMeta` en path fallo Meta + 2 tags safe-meta-catch.
- `api/whatsapp/webhook.ts` modificado: integra `manejarErrorMeta` en status callback failed + 2 tags safe-meta-catch.
- `firestore.rules` modificado: rules nuevas `whatsapp_errores_meta` (read `esAdmin()` — endurecido tras security audit) + `whatsapp_errores_meta_dedupe` (read admin, write false — Admin SDK only). **Deployadas** sha `3520281ac2fbdf5552fe1d42856aceff9938226bfa515470bfa46d832222be1e` 2026-05-19T23:18:16Z.
- `src/types/index.ts`: 2 tipos nuevos en `TipoNotificacion` (`whatsapp_billing_error` + `whatsapp_meta_error`).
- `docs/MODULO_WHATSAPP.md` + `docs/PATRONES_REGRESION.md` + `scripts/invariantes/run-all.ts`.

**Validadores:** archivist PRE-CHANGE OK, tester typecheck/cazadores 17/17 PASS, regression_guardian GO, reviewer CHANGES_NEEDED (3 items: códigos críticos faltantes, TipoNotificacion union, cap admins) → 2 críticos fixeados, cap admins deferido como deuda menor por improbabilidad operativa, security RISKS_FOUND (1 ALTA + 3 MEDIAS + 2 BAJAS) → 4 críticos fixeados (dedupe transaccional, truncado PII, read=esAdmin, cazador exige razón ≥10 chars).

**Acción manual de Jorge POST-deploy:**

```bash
vercel env pull .env.local
export $(grep -v '^#' .env.local | xargs)
npx tsx scripts/verificar-billing-whatsapp.ts
```

Esperado: tabla con quality_rating, messaging_limit_tier, code_verification_status para ambos números + estado WABA + plantillas. Veredicto OK si quality !== RED + account_review !== REJECTED.

**BANDERAS A LEVANTAR (si aplican):**
- quality_rating YELLOW o RED → flag para revisar volumen + opt-outs.
- messaging_limit_tier TIER_250 o menor → flag para considerar upgrade tier.
- Cualquier plantilla en PAUSED o REJECTED → revisar contenido + reenviar.

---

## SPRINT-WA-NOTIF-CREATE-RULE-FIX — Hallazgo lateral: rule `notificaciones create` permite spoof de userId

**Tipo:** Hardening de rules. NO toca features visibles.
**Estado:** ABIERTO 2026-05-19 — hallazgo lateral del security audit SPRINT-WA-BILLING-VERIFY.
**Prioridad:** 🟡 MEDIA — riesgo de spoof inter-staff (operaria crea notif fake con userId de admin).

#### Hallazgo

`firestore.rules` actual permite `notificaciones create: if esStaff()` sin validar que `request.resource.data.userId == request.auth.uid`. Eso significa que cualquier staff autenticado puede crear una notificación con `userId` de cualquier otro usuario.

#### Por qué es ahora

El audit del SPRINT-WA-BILLING-VERIFY lo cazó como hallazgo lateral. No es regresión nueva del sprint — preexiste — pero el sprint nuevo lo evidencia porque el helper `manejarErrorMeta` crea notif vía Admin SDK (que bypassa rules), demostrando que el patrón "sistema crea notif para otro user" es legítimo via Admin SDK pero NO debería permitirse desde cliente.

#### Fix propuesto (1 línea)

```javascript
match /notificaciones/{notifId} {
  allow create: if esStaff()
    && request.resource.data.userId == request.auth.uid;  // <-- agregar
  ...
}
```

Notif sistema (manejarErrorMeta, crearNotificacion server-side) seguirán vía Admin SDK que bypassa la rule.

#### Cómo desbloquear

1. Jorge edita esta entrada con `OK: jorge YYYY-MM-DD HH:MM hardening notif create`.
2. Coordinator procesa con builder → reviewer + security → `npm run deploy:rules` → commit + push.
3. **CUIDADO**: si algún caller cliente legítimo crea notif para otros usuarios sin pasar por Admin SDK, este cambio lo rompe. Auditar `src/services/notificaciones.service.ts` y todos los call sites de `crearNotificacion` antes de mergear. Si hay casos legítimos, mantener `esStaff()` pero agregar nueva rule alternativa.

**OK Jorge:** _pendiente_

---

## SPRINT-PORTAL-1 — Portal cliente con CTA "Solicitar nuevo servicio"

**Tipo:** UX portal público + rule nueva sobre `solicitudes` + endpoint write público sin auth.
**Estado:** BLOQUEADO 2026-05-19 — escalado por coordinator autónomo (sesión 4) desde `COLA_AUTONOMA.md:1758`. Spec original ahí preservada para forensia.
**Prioridad:** 🟡 MEDIA — UX self-service, multiplica el valor del link enviado por WhatsApp. Cliente que clickea link `/garantia/:token` hoy solo ve garantía; con esto puede agendar otro servicio sin pasar por operaria.

#### Por qué se escaló

CLAUDE.md exige OK explícito de Jorge para:
- Cambios a `firestore.rules` (este sprint agrega rule pública para `solicitudes/{id}` create).
- Endpoints / writes públicos sin auth (el form del portal escribe a `solicitudes` desde un cliente no autenticado, validado solo por token).

El sprint también requiere:
- Rate-limit por token (1 solicitud/hora) — debe implementarse en rule (no se puede confiar en client-side).
- Auditoría de que el token sigue válido en el momento del write.

#### Touch-list expandido (audited)

**Archivos a modificar/crear (4):**

1. `src/pages/public/PortalGarantia.tsx` (o el componente real que renderiza `/garantia/:token` — auditar con grep) — agregar sección expandible "¿Necesita otro servicio?" con form (tipo equipo, marca/modelo, falla, zona, fecha preferida, franja horaria, teléfono). Después de submit: confirmación "Hemos recibido su solicitud...".

2. `src/services/solicitudes.service.ts` — nueva función `crearSolicitudDesdePortalGarantia(data, garantiaToken)`:
   - Valida token con read a `clientes` (ya hace algo similar el resto del portal).
   - Persiste a `solicitudes` con `origen: 'portal_cliente_garantia'`, `garantiaTokenOrigen: token`, `creadaEn: serverTimestamp()`.
   - Trigger fan-out de notif (puede ser fire-and-forget si rule no lo permite directo).

3. `src/services/notificaciones.service.ts` (sin modificar, usar) — emitir tipo nuevo `'solicitud_nueva_portal'` a coordinadora + operaria principal.

4. `src/types/index.ts` — agregar `'solicitud_nueva_portal'` a `TipoNotificacion` (P-010 exige call site emisor literal).

5. `firestore.rules` — rule nueva en `solicitudes`:
   ```javascript
   match /solicitudes/{id} {
     allow read: if esStaffOficina();
     // Existente: create desde admin/staff
     allow create: if esStaff() && ...existing-checks;
     // NUEVA: create público desde portal garantía (gateado por origen literal + shape)
     allow create: if request.resource.data.origen == 'portal_cliente_garantia'
       && request.resource.data.garantiaTokenOrigen is string
       && request.resource.data.garantiaTokenOrigen.size() > 20
       && request.resource.data.tipoEquipo is string
       && request.resource.data.descripcionFalla is string
       && request.resource.data.descripcionFalla.size() >= 10
       && request.resource.data.descripcionFalla.size() <= 500
       && request.resource.data.creadaEn == request.time;
     // NOTA: rate-limit NO se puede implementar en rule (no hay query-en-condición).
     // El client lo hace cliente-side + el WAF de Vercel/Firebase lo limita externamente.
     // Defense-in-depth real: revisar logs Firebase si volumen sospechoso.
   }
   ```

#### Decisiones de negocio pendientes (Jorge confirma antes de OK)

- **D1:** ¿Rate-limit por token (1/hora) es enforced solo client-side o se acepta esa limitación? Alternativas:
  - (A) Solo client-side (el spec sugiere esto). Riesgo: atacante salta el client-side y spamea. Mitigación: rule solo permite create con shape válido + token válido. WAF de Firebase limita ~10/seg burst.
  - (B) Implementar Cloud Function que valide rate-limit server-side (introduce nueva dependencia + costo).
  - **Recomendado (A)** porque el riesgo es bajo (solo crea solicitudes, no hace daño persistente) y el costo de (B) es alto.

- **D2:** ¿Notif a `coordinadora.uid + operaria.uid` específico (hardcoded) o fan-out a `where rol in ['coordinadora','operaria']`? Recomendado: fan-out (alineado con patrón canónico de SPRINT-177).

- **D3:** ¿Confirmación por WhatsApp template al cliente? Spec menciona "plantilla 5 en sprint dedicado" — fuera de scope acá. Cliente solo ve "Hemos recibido su solicitud..." en la UI.

#### Criterios de éxito

- [ ] Sección "¿Necesita otro servicio?" visible debajo de detalles garantía.
- [ ] Form completo con validaciones (tipo, falla min 10 chars, zona, fecha >=mañana).
- [ ] Submit OK → doc en `solicitudes` con shape correcto.
- [ ] Coordinadora + operaria reciben notif `'solicitud_nueva_portal'`.
- [ ] Token expirado/inválido → form bloqueado.
- [ ] Mobile responsive.
- [ ] Cazadores 17+1=18 PASS (si se agrega cazador nuevo) o 17/17 si no.
- [ ] Rules deployadas con `npm run deploy:rules` antes de cerrar.

#### Tiempo realista

**4-6 horas:**
- archivist PRE-CHANGE: 15 min.
- builder (UI + service + types + rule): 2-3 h.
- tester + regression_guardian: 30 min.
- reviewer + security obligatorios: 1-1.5 h.
- Deploy rules + verificación post-deploy: 30 min.

#### Cómo desbloquear

1. Jorge responde D1 + D2 + D3 inline.
2. Jorge agrega `OK: jorge YYYY-MM-DD HH:MM portal solicitud`.
3. Coordinator procesa con flujo completo: archivist → builder → tester → regression_guardian → reviewer → security → npm run deploy:rules → commit + push → devops.

**OK Jorge:** _pendiente_

---
