# Auditoría pre-integración CRM — Mister Service RD

**Fecha:** 2026-05-20
**Autor:** Cowork (a pedido de Jorge)
**Objetivo:** Revisar todo el código y cazar discrepancias/fallas ANTES de emitir el sprint del CRM/inbox integrado. Que la integración se construya sobre base sólida.
**Método:** Herramientas propias del repo (cazadores, typecheck, lint, schema-drift, métricas) + revisión semántica con 3 subagentes (rules vs código, módulo WhatsApp, flujo de pagos/ciclo de orden).

---

## Resumen ejecutivo

La base del código está **sana en lo automático**: los 18 cazadores anti-regresión pasan con 0 hits, el typecheck está limpio, y la sincronización del ciclo de orden (fase/estado/historialFases) está correcta en los archivos revisados.

PERO la revisión semántica encontró **2 hallazgos críticos que invalidan sprints ya redactados**, y varios medios/bajos. El más importante:

> **El sprint SPRINT-WA-CHAT-1 que redacté ayer asume un modelo de datos que NO existe. El módulo WhatsApp YA tiene `whatsapp_conversaciones` (particionado por `wa_id`), `whatsapp_mensajes_inbox` + `whatsapp_mensajes_outbox`, denormalización hecha, Y rules ya escritas. Construir el sprint como estaba habría duplicado todo y la migración correría sobre una colección inexistente.**

Esto es el mismo antiprecedente del portal de reagendamiento (casi reconstruí infra existente). Bien que se cazó AHORA, antes de procesar el sprint.

**Veredicto:** NO procesar los sprints WA-CHAT ni PAGOS-CONFIRMA-MARIA como están. Hay que corregirlos contra la realidad del código (lo hago en este mismo pase). Lo trivial ya lo arreglé.

---

## Resultados de las herramientas automáticas

| Check | Resultado |
|---|---|
| `npm run check:regression` (18 cazadores P-001..P-019) | ✅ 0 hits, todos pasan (773ms) |
| `npx tsc --noEmit` (typecheck, 204 archivos) | ✅ Limpio, exit 0 |
| `npm run lint` (src/ real) | ⚠️ 2 errores triviales + 23 warnings (ya arreglados los errores) |
| `npm run lint` (repo completo) | ❌ 10,896 problemas — PERO 10,800+ son de artefactos de build sin gitignore |
| `npm run audit:schema-drift` | ℹ️ Drift alto pero esperado (datos de prueba pre-producción) |
| `npm run metricas` | ℹ️ MTBF 1.3d, MTTR 306min, recurrencia 28.6%, 10 postmortems, 18 cazadores, allowlist 35 |

---

## Hallazgos por severidad

### CRÍTICO

**C1 — Sprints WA-CHAT construidos sobre modelo de datos imaginario.**
El módulo WhatsApp real (verificado en `api/whatsapp/webhook.ts` y `api/whatsapp/send.ts`):
- Mensaje entrante → `whatsapp_mensajes_inbox/{wamid}` (campos: `wamid`, `phoneNumberId`, `wa_id`, `from`, `tipo`, `contenido`, `timestampMeta`, `timestampRecibido`, `conversacionId`).
- Mensaje saliente → `whatsapp_mensajes_outbox/{tempId}` (campos: `wamid`, `wa_id`, `tipo`, `texto`, `estado`, `creadoPor`, `conversacionId`).
- **YA hace merge a `whatsapp_conversaciones/{wa_id}`** con denormalización: preview, `noLeidos`, ventana 24h, sticky phone, `ultimoPhoneNumberId`, `ultimoMensajeEntrante/Saliente{}`, `bot.habilitado`.
- **Rules YA existen** (`firestore.rules:686-844`) para `whatsapp_conversaciones`, `_mensajes_inbox`, `_mensajes_outbox`, `_plantillas`, `_config`, `_errores_meta`, `_recordatorios_enviados`. Modelo: writes server-side (Admin SDK, `allow write: if false`), reads para staff oficina, update parcial UI-seguro (marcar leído, asignación anti-robo, toggle bot).

Discrepancias del sprint WA-CHAT-1 vs realidad:
- La migración lee `whatsapp_mensajes` → **esa colección no existe** (correría sobre 0 docs).
- El type `WhatsAppConversacion` que especifiqué (`telefono`, `numeroNegocio`, `ultimoMensajeAt/Texto/Direccion`, `noLeidosCount`, `botActivo`) NO coincide con el doc real (`wa_id`, `noLeidos`, `bot.habilitado`, `ultimoMensajeEntrante/Saliente{}`).
- La rule "nueva" que pedí ya existe → la habría duplicado.
- El doc id real es `wa_id` (no `numeroNegocio_telefono`). La decisión D4 de multi-número exige re-escribir webhook+send, no solo "integrar llamadas".

**Acción:** reescribir WA-CHAT-1 a "construir UI inbox sobre el modelo backend existente" (no crear modelo). Los sprints útiles pasan a ser: tipos frontend del inbox, página `/admin/inbox` que lee `whatsapp_conversaciones`, vista de conversación que lee `_inbox`+`_outbox`, toggle bot (escribe `bot.habilitado` parcial con auth.uid), shortcut plantillas, acceso a órdenes. La capa de datos + rules ya está.

**C2 — Separación de funciones de pago es 100% client-side (rule no la enforce).**
`firestore.rules:351`: `allow update: if esStaffOficina()` da carta blanca total sobre `ordenes_servicio`. NO hay inmutabilidad de `pagos[]`/`montoPagado`/`verificado`. Hoy cualquier operaria con rol oficina puede escribir `verificado: true` directo vía SDK. La regla de negocio de Jorge (solo María confirma) NO se puede garantizar solo con UI.

**C3 — El gate del conduce no cubre pagos pre-existentes.**
`ProcesarFacturacionModal.tsx:384-389`: la validación `if(!pagoVerificado)` SOLO corre cuando `montoPagoNuevo > 0`. Si la orden tiene pagos previos sin verificar y María no registra monto nuevo, el conduce se emite igual. La decisión D3 ("nada se factura sin confirmación") NO se cumple para pagos previos.

### ALTO

**A1 — Approach `pagoConfirmadoPorCoordUid` top-level NO es viable.**
Los pagos viven en `pagos[]` dentro de la orden. Un campo escalar top-level no distingue cuál pago se confirmó ni soporta abonos parciales con confirmadores distintos. Y la rule de oficina (línea 351) no inspecciona el array → un campo inmutable no impide que la operaria edite `pagos[].verificado`. **Solución correcta:** mover pagos a subcolección `ordenes_servicio/{id}/pagos/{pagoId}` (rule granular por pago) O validar el array en rules (frágil/costoso). Esto cambia el diseño del SPRINT-PAGOS-CONFIRMA-MARIA.

**A2 — Checkbox "Pago verificado" sin gate de permiso.**
`ProcesarFacturacionModal.tsx:1305-1316`: cualquiera con acceso a facturación lo tilda. Es el único punto que hoy escribe `verificado:true`.

### MEDIO

**M1 — `EnviarFacturacionButton.tsx` / `FacturacionPendiente.tsx`:** la lógica de "qué órdenes se pueden facturar" no filtra por confirmación de pago. No contemplado en el sprint de pagos.

**M2 — `RegistrarPagoModal.tsx::handleEliminarPago`:** una operaria puede borrar un pago ya confirmado, sin gate. Hueco de la separación de funciones.

**M3 — `campanasMarketing.service.ts:392`:** el audit log escribe `actorUid: agente.id`, que puede ser el doc-id de `personal/` (no `auth.uid`) para usuarios cargados vía fallback. El actor del registro queda incorrecto/spoofable. Patrón P-001 latente (la rule solo exige `isAuth()`, así que pasa pero registra mal).

**M4 — Cotizaciones.tsx (~315-340):** el create de cotización no incluye `tecnicoId`, pero la rama técnico de la rule (`firestore.rules:415`) exige `tecnicoId == auth.uid`. La rama es inalcanzable (rule muerta) — alinear payload o eliminar la rama.

**M5 — `OrdenDetailModal.tsx` / `OrdenDetalle.tsx`:** muestran pagos pero sin badge confirmado/pendiente. Gap UI (el sprint sí lo contempla).

### BAJO / higiene

**B1 — [ARREGLADO]** `dist-lazy/` y `vite.config.ts.timestamp-*.mjs` no estaban en `.gitignore` → contaminaban el lint (10,800 errores falsos) y podían commitearse. Agregados a `.gitignore` en este pase. (Jorge puede `rm -rf dist-lazy/` para limpiar el working tree; no lo borro yo por política.)

**B2 — [ARREGLADO]** 2 directivas `eslint-disable no-console` sin uso en `notificaciones.service.ts:27,34`. Removidas (el `console.warn` se mantiene).

**B3 —** 23 warnings de lint en src/ (imports sin usar en gps/formularios/empresasAliadas services, `any` en google.d.ts y FormularioPublico). No bloquean; limpieza opcional.

**B4 —** Query dual legacy `destinatarioId` en `notificaciones.service.ts:67` sigue viva (deuda B2 marcada RESUELTA pero la query persiste como red de seguridad). No es hueco, la rule gatea por `userId`.

**B5 —** Cap de 50 `contactosMarketing` en `clientes` solo validado UI-side (`campanasMarketing.service.ts:303-309`), no en rules. Defense-in-depth pendiente.

---

## Lo que está BIEN (no requiere acción)

- Cazadores anti-regresión: 0 hits. Sistema de defensa intacto.
- Typecheck limpio.
- Sincronización fase/estadoSimple/historialFases correcta (`OrdenDetalle.tsx:166-199,516-544`, `ProcesarFacturacionModal.tsx:757+` SPRINT-161).
- `RegistrarPagoModal` usa `currentUser?.uid` correctamente (no cae en gotcha P-001).
- Órdenes con R4 endurecida, inmutabilidad de aprobación/asignación con `.get(,null)`.
- Campañas con snapshot inmutable + `creadaPor==uid`. Counters, ponches, conversaciones_ia correctamente gateados.
- Rules de WhatsApp CRM ya escritas y bien diseñadas (server-side writes, update parcial UI-seguro).
- Normalización de teléfono consistente entre webhook y clientes (RD 10 dígitos).

---

## Plan de acción (qué hago vs qué va a tu OK)

**Ya aplicado en este pase (trivial/seguro):**
- B1 (.gitignore), B2 (eslint-disable).

**Corrijo los sprints en BLOQUEOS.md (sin procesar, solo redacción correcta):**
- Reescribo SPRINT-WA-CHAT-1 → "tipos frontend + UI inbox sobre modelo existente" (no crear modelo ni migración).
- Ajusto WA-CHAT-2..8 para que lean el shape real (`wa_id`, `noLeidos`, `bot.habilitado`).
- Corrijo SPRINT-PAGOS-CONFIRMA-MARIA: subcolección `pagos/{pagoId}` para rule granular (A1), gate conduce para pagos previos (C3), gate del checkbox (A2), gate de `handleEliminarPago` (M2), filtro de facturación por confirmación (M1).

**Sprints nuevos chicos sugeridos (a tu OK, NO los escribo sin que confirmes):**
- Fix M3 (campanasMarketing actorUid → currentUser.uid) — code-only, podría ir a COLA.
- Fix M4 (rama técnico muerta en rule cotizaciones) — toca rules, BLOQUEOS.

---

## Conclusión

El código está sólido en lo automático, pero la integración del CRM tenía 2 minas que esta auditoría desactivó antes de explotar: (C1) el modelo WhatsApp ya existía y los sprints lo iban a duplicar, y (C2) la separación de pagos no estaba enforced en rules. Ambas se corrigen reescribiendo los sprints contra la realidad — lo cual hago ahora. Después de eso, los sprints quedan listos para tu OK y procesamiento seguro.
