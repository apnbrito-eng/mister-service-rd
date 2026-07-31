# Extracción: Automatizaciones por etapa de Kommo → Mister Service

**Fecha:** 2026-05-21
**Autor:** Cowork (vía Playwright sobre Kommo logueado)
**Objetivo:** Extraer las automatizaciones reales que Jorge tiene en Kommo (no las genéricas) y diseñar el motor equivalente para Mister Service, mapeado a las fases de `OrdenServicio`.

---

## 1. Las automatizaciones REALES de Kommo (lo que está configurado de verdad)

Hay ~25 salesbots configurados. Casi todos se disparan con uno de dos triggers de pipeline:

- **"Creado en la etapa del embudo"** (cuando un lead se crea en una etapa).
- **"Movido a una etapa del embudo"** (cuando un lead se mueve a una etapa).
- Algunos: **"Movido o creado en una etapa"** (ambos).

Inventario por arquetipo:

**Arquetipo A — Bots "Mover" (routing/asignación):** `trolo mover`, `Mover mon`, `Mover yunior`, `Mover juan Pablo`, `Mover Diorky 829-363-7779`, `Mover yoniel 809-641-6576`, `mover Arjelis 829-827-7296`, `Robinson albert`, `iosbot mover`. Trigger: "Creado en la etapa". Función: al entrar el lead a una etapa, lo enrutan/asignan (cada técnico tiene su bot que lo manda a su sub-flujo).

**Arquetipo B — Bots "WhatsApp" (mensajería en etapa):** `Whatsapp tecnicos Yoniel`, `Whatsapp tecnicos`, `Bot whatsapp citas` (67% conversión), `9601 Bot Whatsapp`, `Bot de bienvenida`, `Bot de entrada`, `7880 bot`, `Bot 7474`, `iosbot dm a whatsap` (97% conversión, 404 lanzados). Trigger: "Movido/Creado en etapa". Función: al entrar a una etapa, mandan un mensaje WhatsApp (bienvenida, confirmación de cita, etc.).

**Arquetipo C — Bot NPS (encuesta post-servicio):** "Cuando las conversaciones se marcan como cerradas, el Salesbot le envía al cliente un mensaje personalizado solicitando una evaluación del servicio en una escala de 10 puntos." Trigger: conversación cerrada. Función: encuesta de satisfacción automática.

**Conclusión del patrón:** Kommo automatiza con **3 cosas**: (1) enrutar/asignar al entrar a una etapa, (2) mandar WhatsApp al entrar a una etapa, (3) encuestar al cerrar. NADA más complejo. Los 25 bots son básicamente la misma receta repetida por técnico/canal — por eso es un desorden (genera los 6,553 sin responder que vimos). Mister Service NO debe copiar 25 bots: debe tener **un motor único** con 4-6 reglas hardcodeadas.

---

## 2. Mapeo a las fases de `OrdenServicio` de Mister Service

Fases actuales: `nuevo_lead → en_gestion → en_diagnostico → en_cotizacion → aprobado → agendado → trabajo_realizado → cerrado` (o `cancelado`).

Automatizaciones recomendadas (las que de verdad mueven la aguja, equivalentes a lo que Kommo hace pero ordenado):

| # | Disparador (fase / evento) | Acción | Plantilla / efecto | Equivale en Kommo a |
|---|---|---|---|---|
| 1 | Orden creada (`nuevo_lead`) | Notificar a operaria + (opcional) asignar | Notificación interna | Arquetipo A (Mover/routing) |
| 2 | Orden → `agendado` | Enviar WhatsApp al cliente | Plantilla `cita_confirmada` (+ botón portal `/cliente/{token}`) | Arquetipo B (Bot whatsapp citas) |
| 3 | Conduce emitido (`cerrado` + facturada) | Enviar WhatsApp al cliente | Plantilla `conduce_emitido` | Arquetipo B |
| 4 | Orden → `cerrado` (servicio hecho) | Encuesta de satisfacción a las 2-4h | Mensaje NPS (1-10) | Arquetipo C (Bot NPS) |
| 5 | Cron: mantenimiento cumple frecuencia | Enviar WhatsApp | Plantilla `recordatorio_mantenimiento` | (cron, no en Kommo) |
| 6 | Cron: garantía por vencer (X días) | Enviar WhatsApp | Plantilla `garantia_por_vencer` | (cron, no en Kommo) |

Notas:
- Las #2, #3, #5, #6 ya están parcialmente cubiertas por los sprints WA pendientes en BLOQUEOS (WA-3/4 disparan plantilla por evento; WA-6/7 son los crons). Este motor las unifica bajo una sola arquitectura.
- La #4 (encuesta NPS) es NUEVA y de alto valor — Kommo la tiene y Mister Service no. Patrón: al cerrar, agendar (cron/delay) un mensaje de satisfacción.
- La #1 (routing) en Mister Service ya existe parcialmente (operaria asigna técnico) — no hace falta un bot, basta la notificación.

---

## 3. Diseño del sprint: motor de automatización hardcodeado

**Principio (de la auditoría):** NO construir un editor visual tipo Kommo. Hardcodear las 4-6 reglas reales en código, porque son pocas y estables. Editor visual = sobre-ingeniería.

**Approach técnico recomendado:**

- **Disparadores por cambio de fase:** Mister Service ya escribe `historialFases` y sincroniza `fase`/`estadoSimple` en los updates de orden. El motor se engancha ahí: una función `dispararAutomatizacionesFase(orden, faseAnterior, faseNueva)` que se llama en TODOS los paths que cambian fase (auditar con grep `historialFases` / `fase:` en updates). Evalúa una tabla de reglas y ejecuta las acciones (enviar plantilla vía `api/whatsapp/send`, crear notificación, agendar encuesta).
- **Disparadores por tiempo (crons):** Vercel cron (o Firebase scheduled function) para #5 y #6 + la encuesta #4 con delay. OJO: el plan Vercel quedó en Hobby (memoria `project_whatsapp_cloud_api_modo_desarrollo`) — Hobby limita crons a 1/día. Si se necesitan crons más finos, decisión de upgrade (ya está como D9 en BLOQUEOS WA).
- **Tabla de reglas:** un array tipado `REGLAS_AUTOMATIZACION` (en `src/config/automatizaciones.ts` o similar) con `{ trigger: { tipo: 'fase'|'cron'|'evento', desde?, hacia? }, accion: { tipo: 'plantilla'|'notificacion'|'encuesta', plantilla?, delayMin? } }`. Fácil de leer/auditar, sin UI.
- **Idempotencia:** cada disparo debe registrar que ya ocurrió (ej: `orden.automatizacionesDisparadas: string[]`) para no mandar la plantilla 2 veces si la fase se re-escribe. Patrón P-017 (idempotencia WhatsApp) ya existe en el repo.
- **Toggle por orden/cliente:** respetar `bot.habilitado` de la conversación (del inbox) — si la operaria pausó el bot para ese cliente, las automatizaciones de mensajería NO se disparan. Conecta con SPRINT-INBOX-4.

**Por qué iría a BLOQUEOS:** toca `api/whatsapp/send` (endpoint público) + posible cron nuevo + se engancha en los paths de cambio de fase (código crítico de órdenes). Requiere tu OK.

**Touch-list tentativo (a auditar antes de redactar el sprint formal):**
1. `src/config/automatizaciones.ts` (NUEVO) — la tabla de reglas.
2. `src/services/automatizaciones.service.ts` (NUEVO) — `dispararAutomatizacionesFase()` + idempotencia + respeto a `bot.habilitado`.
3. Enganche en TODOS los updates de fase de orden (grep `historialFases`) — auditar consumidores (regla CLAUDE.md touch-list expandido).
4. `api/whatsapp/send.ts` — reutilizar (no modificar salvo necesidad).
5. `src/types/index.ts` — `automatizacionesDisparadas?: string[]` en `OrdenServicio`.
6. (Cron #4/#5/#6) — endpoint `api/cron/automatizaciones.ts` + config Vercel.
7. `firestore.rules` — si se agrega campo `automatizacionesDisparadas`, validar inmutabilidad/append.

**Criterio de éxito:**
- Cambiar una orden a `agendado` dispara `cita_confirmada` UNA sola vez (idempotente).
- Si `bot.habilitado=false` para ese cliente, NO se dispara mensajería.
- Encuesta NPS se envía X horas después de `cerrado`.
- Cazadores PASS, typecheck PASS, rules deployadas.

---

## 4. Qué NO copiar de Kommo (confirmado)

- Los 25 salesbots individuales (1 por técnico/canal) — desorden, genera inbox abandonado.
- El editor visual de automatizaciones — sobre-ingeniería.
- El concepto de "mover lead entre pipelines" — Mister Service usa fases en una orden, no pipelines por técnico.

## 5. Próximo paso

Cuando Claude Code esté libre (no corriendo `trabaja`/`procesa bloqueos`), puedo:
1. Auditar los consumidores reales de cambio de fase (grep) para precisar el touch-list.
2. Escribir el sprint formal `SPRINT-MOTOR-AUTOMATIZACION` en BLOQUEOS.md para tu OK.

La encuesta NPS (#4) es el módulo más nuevo y de mayor valor que Mister Service no tiene hoy.
