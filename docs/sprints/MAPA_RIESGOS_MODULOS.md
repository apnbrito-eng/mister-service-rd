# Mapa de riesgos por módulo

> Índice de zonas de riesgo conocidas — qué cuidar antes de tocar cada módulo.
>
> **Sub-regla obligatoria (CLAUDE.md):** todo agente (builder, coordinator,
> archivist, auditor_contable, regression_guardian, reviewer) lee la sección
> del módulo afectado en este mapa ANTES de tocarlo. Complementa
> `archivist PRE-CHANGE` (pasado) + `touch-list expandido` (presente). El
> mapa apunta a "qué se sabe del módulo HOY" — no reemplaza el grep ni
> la lectura del código.
>
> **Mantenido por agente `memoria`** (modo MANTENER-MAPA — ver
> `.claude/agents/memoria.md`). Cualquier descubrimiento nuevo durante un
> sprint debe sumarse al módulo correspondiente. NO duplicar contenido de
> CLAUDE.md / PATRONES_REGRESION / postmortems — enlazar.
>
> **Última actualización:** 2026-05-24 (SPRINT-AGENTES-2-MEMORIA-DIRIGE,
> commit pendiente).

---

## Cómo se lee este mapa

Cada módulo tiene 5 zonas:

1. **Archivos clave** — qué tocar.
2. **Patrones P-XXX que aplican** — qué cazadores son relevantes (link al cazador).
3. **Gotchas vivos** — citas a CLAUDE.md o postmortems donde aprendimos algo.
4. **Decisiones de Jorge** — reglas de negocio firmes que NO se rompen sin OK.
5. **Antes de tocar** — checklist específico para este módulo.

---

## Módulo: Órdenes (orden lifecycle)

### Archivos clave

- `src/types/index.ts` — `OrdenServicio`, `Pago`, `CierreServicio`, `Auditoria`, `HistorialFase`.
- `src/services/ordenes.service.ts` — CRUD + helpers (`confirmarPagoOrden`, `suscribirPagosPendientes`, `marcarVisitaFallida`, etc.).
- `src/pages/Ordenes.tsx` (~1,600 líneas, monolítico intencional — NO refactor opportunista).
- `src/pages/OrdenDetalle.tsx`, `src/pages/AgendaDia.tsx` — vistas críticas.
- `src/components/ordenes/` — modales y subcomponentes.
- `src/utils/index.ts::parseOrden` — DEBE leer cada campo del tipo (gotcha CLAUDE.md).
- `src/utils/index.ts::crearRegistroAuditoria`, `faseLabel`, `faseColor`, `getAlertasFromOrdenes`.

### Patrones P-XXX que aplican

- **P-001** — escrituras gateadas por `auth.uid` deben usar `currentUser.uid`, NO `userProfile.id`. Cazador: `check-userprofile-id-misuse.ts`.
- **P-003** — mutaciones cross-collection (orden + audit + comision) en `runTransaction`. Cazador: `check-cross-collection-tx.ts`.
- **P-009** — campo nuevo en `OrdenServicio` requiere actualizar `parseOrden`. Cazador: `check-parser-campos-faltantes.ts`.
- **P-011** — `updateDoc(ordenes_servicio, {...flag terminal...})` debe sincronizar `fase`, `estadoSimple`, `estado`, `historialFases`. Cazador: `check-fase-sin-sincronizar-en-update-orden.ts`.
- **P-015** — `orderBy('<campo>')` sobre `ordenes_servicio` requiere que el campo se persista en TODOS los write paths. Cazador: `check-firestore-orderby-campo-no-persistido.ts`.
- **P-022** — número de orden solo vía `siguienteNumeroOrden()` de `contadores.service`. Cazador: `check-numeros-documento-client-side.ts`.

### Gotchas vivos

- **parseOrden / parseFactura must read every field** — CLAUDE.md convención #3. Si agregás un campo al tipo, grep `parseOrden(` y verificá.
- **Closure has two shapes** — el nuevo wizard (`equipoFunciona`, `clienteSatisfecho`, etc.) y el legacy (`piezasRetiradas`, `checklist`, etc.). Read both, write new.
- **Spanish identifiers** — `clienteNombre`, `fechaCita`, `fase`, `tecnicoId`. Nunca traducir.
- **`tecnicoId` y `operariaId` son `auth.uid`**, no `personal.id`. Ver `docs/CAMPOS_CROSS_COLLECTION.md`.
- **Postmortems relevantes:**
  - `2026-05-07-iniciar-chequeo-rules-sin-deploy.md` — fix de rules sin deploy rompió "Iniciar chequeo" 24h.
  - `2026-05-07-iniciar-chequeo-permission-denied.md` — variante P-002 con `!=`.
  - `2026-05-18-banner-descuento-orderby-fechacierre.md` (P-015) — `orderBy('fechaCierre')` rompió banner descuento.

### Decisiones de Jorge

- **Sprint follow-up `SPRINT-PAGOS-FIX-COTIZACIONES-NUMERO-TRANSACCIONAL`** (descubierto en AGENTES-1) — migrar `Cotizaciones.tsx:314` a `siguienteNumeroCotizacion()` para evitar duplicados en QT-####.
- Wizard de cierre tiene 2 paths divergentes: técnico marca "solo chequeo" → `tipoCierre='solo_chequeo'` + `precioChequeo`; o chequeo normal → `equipoFunciona/clienteSatisfecho/revisoConexiones/fotoCierre`.

### Antes de tocar

1. Leer `parseOrden` en `src/utils/index.ts`. Si agregás campo, agregalo al parser.
2. Si tocás un dropdown que asigna técnico/operaria, usar `t.uid`/`p.uid`, NO `t.id`/`p.id` (P-006).
3. Si tocás una mutación que escribe en otra colección además de `ordenes_servicio` (típicamente `auditoria_admin`, `comisiones`, `notificaciones`), envolvé en `runTransaction`.
4. Si tocás escrituras de `fase`, sincronizá `estadoSimple`, `estado`, `historialFases` en la misma update.

---

## Módulo: Pagos

### Archivos clave

- `src/services/ordenes.service.ts::confirmarPagoOrden` (L1266+) y `suscribirPagosPendientes` (L1351+).
- `src/components/ordenes/RegistrarPagoModal.tsx` — operaria registra pago (camino principal).
- `src/pages/PagosPendientes.tsx` — María/admin/coord confirma pagos.
- `src/components/facturacion-pendiente/ProcesarFacturacionModal.tsx::handleGenerar` (~L398) — **GATE CRÍTICO**: bloquea emisión de conduce si `pagosPrevios.filter(p => p.verificado === false).length > 0`.
- `src/pages/AgendaDia.tsx::handleCerrarChequeo` (~L144) — escribe pago al cerrar chequeo "solo chequeo".
- `src/types/index.ts::PagoOrden` — shape `{id, metodo, monto, fecha, verificado?, verificadoPorId?, verificadoPorNombre?, verificadoAt?, registradoPor*, recibidoPor*, banco*, referencia?, notas?}`.

### Patrones P-XXX que aplican

- **P-001** — `currentUser.uid` en `verificadoPorId` / `registradoPorId`, NO `userProfile.id`.
- **P-003** — pago + audit en `runTransaction`. Ya respetado.
- **P-023** — `ProcesarFacturacionModal` DEBE mantener el filtro `verificado===false` + `pagosSinVerificar` + `toast.error`. Cazador: `check-gate-conduce-pago-verificado.ts`. **No-allowlist**: cualquier cambio requiere OK de Jorge.

### Gotchas vivos

- **Pagos legacy** (pre-SPRINT-151) tienen `verificado=undefined` y NO se bloquean por el gate (retrocompat asumida). Solo `verificado===false` explícito bloquea.
- **`montoPagado` denormalizado** — debe recalcularse cuando muta `pagos[]`. RegistrarPagoModal lo hace; ProcesarFacturacionModal (camino de pago nuevo en el wizard) NO lo hace — hallazgo BAJA del informe AGENTES-1.
- **El array `pagos[]` es source-of-truth.** SPRINT-PAGOS-CONFIRMA-MARIA fase B-2 está BLOQUEADO esperando OK de Jorge para elegir entre 3 opciones de migración a subcolección.
- **`EnviarFacturacionButton` se habilita con `montoPagado > 0`, NO con `verificado`.** El gating por `verificado` está exclusivamente en `ProcesarFacturacionModal`. No confundir al refactorizar.

### Decisiones de Jorge

- **Separación de funciones:** operaria registra pago (verificado=false), María/admin/coord confirma (verificado=true). El permiso `pagosVerificar` gobierna la confirmación. NO se mezcla.
- **Plan de 3 fases de SPRINT-PAGOS** (`OK: jorge 2026-05-21 10:30 opcion 1`): B-1 helper + página (DONE), B-2 migración array→subcolección (BLOQUEADO 2026-05-24 pasada 47 por ambigüedad técnica), B-3 rules + cut-over (futuro tras QA B-2).
- **NO eliminar pagos verificados** sin permiso `pagosVerificar` (M2 fase A).

### Antes de tocar

1. Si tocás `ProcesarFacturacionModal::handleGenerar` y el cambio afecta el bloque "pagosSinVerificar / toast.error", **ESCALAR a BLOQUEOS** — no auto-fixear el gate del conduce.
2. Si agregás un writer del array `pagos[]`, recalculá `montoPagado` en el mismo update.
3. `confirmarPagoOrden` y `suscribirPagosPendientes` son el path canónico para confirmar. NO escribir `verificado=true` desde otro callsite sin coordinar.
4. Reviewer obligatorio para cualquier touch sobre dinero.

---

## Módulo: Facturación (Conduces de Garantía)

### Archivos clave

- `src/pages/Facturas.tsx` — tabla principal, render de comisión denormalizada.
- `src/pages/FacturacionPendiente.tsx` — órdenes listas para emitir conduce.
- `src/components/facturacion-pendiente/ProcesarFacturacionModal.tsx` — wizard de emisión.
- `src/components/facturas/FacturaCrearModal.tsx` — alta manual de factura.
- `src/components/ordenes/EnviarFacturacionButton.tsx` — gate UI por `montoPagado > 0`.
- `src/services/contadores.service.ts::siguienteNumeroFactura()` — única fuente legítima de CG-#####.
- `src/utils/comisiones.ts` — helpers `registrarComisionPorFactura`, `registrarComisionesPorItems`, `registrarComisionPorOrden`.

### Patrones P-XXX que aplican

- **P-003** — emisión de conduce mueve datos a múltiples colecciones (factura + orden + comisiones + audit) → `runTransaction` obligatorio. Ya respetado por SPRINT-155 (ProcesarFacturacionModal) y SPRINT-157 (FacturaCrearModal).
- **P-009** — campo nuevo en `Factura` requiere actualizar `parseFactura`.
- **P-021** — caller de `registrarComisionPorFactura`/`registrarComisionesPorItems` DEBE denormalizar a `comisionTecnicoMonto/Nombre/Id` post-llamada. Cazador: `check-comision-sin-denormalizacion.ts`.
- **P-022** — número de conduce solo vía `siguienteNumeroFactura()`.
- **P-023** — gate del conduce con `verificado===false` (compartido con módulo Pagos).

### Gotchas vivos

- **Conduces NO son facturas DGII.** Prefijo `CG-`. La facturación fiscal real se hace en otro software autorizado. CLAUDE.md sección Business semantics.
- **Comisiones se persisten en `comisiones` + `auditoria` PERO NO actualizan el doc factura.** El caller denormaliza. Gotcha CLAUDE.md → ahora cazador P-021.
- **`tiempoGarantiaDias`** se preselecciona en 60 por default (SPRINT-154).
- **`notaConduce`** tiene max 500 chars (SPRINT-151) y el parser lo preserva (SPRINT-153-FIX P-009).
- **El número de conduce se genera DENTRO del runTransaction** que crea la factura — atómico por construcción.

### Decisiones de Jorge

- **Conduce emitido cierra la orden** (`fase='cerrado'`, SPRINT-161). El historial preserva la trazabilidad.
- **El conduce muestra trazabilidad de pagos**: si la operaria registró cobro en el wizard, el pago queda en el array de la orden.
- **Modal Emitir conduce tiene 2 pasos:** items + (opcional) pago nuevo.

### Antes de tocar

1. Si tocás `handleGenerar` de cualquier modal de emisión, verificá P-023 + P-003 + P-021 (cazadores corren en pre-commit).
2. Si tocás campos de `Factura`, actualizá `parseFactura` en `src/utils/index.ts`.
3. Si tocás la lógica de comisiones, verificá denormalización + cazador P-021 PASS.
4. **NUNCA generar número de conduce client-side** — siempre `siguienteNumeroFactura()`.

---

## Módulo: Comisiones

### Archivos clave

- `src/utils/comisiones.ts` — helpers `registrarComisionPorFactura` (L692), `registrarComisionesPorItems` (L414), `registrarComisionPorOrden` (L875).
- `src/pages/Comisiones.tsx` — listado, filtros.
- `src/components/ordenes/FaseStepper.tsx`, `src/components/ordenes/OrdenesTablero.tsx` — callers de `registrarComisionPorOrden`.
- `src/components/facturacion-pendiente/ProcesarFacturacionModal.tsx` y `src/components/facturas/FacturaCrearModal.tsx` — callers de `registrarComisionPorFactura/registrarComisionesPorItems`.

### Patrones P-XXX que aplican

- **P-003** — escribe a `comisiones` + `auditoria_admin` → `runTransaction`. Ya respetado.
- **P-021** — denormalización a doc factura post-llamada. Cazador activo.

### Gotchas vivos

- **% de comisión lee de `Personal.comisionPorcentaje`**, NO hardcoded. CLAUDE.md convención #7.
- **ITBIS 18% es referencia INTERNA** para calcular ganancia neta y comisión técnico. NO declaración fiscal.
- **`registrarComisionPorFactura` delega a `registrarComisionesPorItems`** desde SPRINT-XX (commit en `utils/comisiones.ts:720`) — un único path canónico.
- **Quincenas RD:** día 30→14 = Q1 (paga 15); día 15→29 = Q2 (paga 30). `utils/comisiones.ts`.

### Decisiones de Jorge

- Si un técnico tiene `%` distinto al default, se persiste en su doc Personal. NUNCA preguntar al admin "qué % usar" — leer del doc.

### Antes de tocar

1. NO hardcodear % (ITBIS, comisión). Leer de configFiscal / Personal.
2. Si modificás `registrarComision*`, verificá que callers denormalicen post-llamada (P-021 los caza).

---

## Módulo: Nómina / Préstamos / Avances / Gastos

### Archivos clave

- `src/services/nomina.service.ts`, `src/pages/Nomina.tsx`.
- `src/services/prestamos.service.ts`, `src/pages/Prestamos.tsx`.
- `src/services/avances.service.ts`, `src/pages/Avances.tsx`.
- `src/pages/Gastos.tsx`.

### Patrones P-XXX que aplican

- **P-003** — nómina toca `personal` + `prestamos` + `avances` + `auditoria` simultáneamente → `runTransaction`.

### Gotchas vivos

- **Sueldo base es MENSUAL**, dividido /2 por quincena. CLAUDE.md Business semantics.
- **Quincenas día 30→14 y 15→29** (regla RD, no calendario gregoriano puro).

### Antes de tocar

1. Verificar que el cálculo divide /2 por quincena.
2. Verificar que descontá préstamos + avances de la quincena correspondiente.

---

## Módulo: Bancos

### Archivos clave

- `src/services/bancos.service.ts`, `src/pages/Bancos.tsx`.

### Gotchas vivos

- **Bancos reales configurados:**
  - Popular (Fixman SRL).
  - BHD, Banreservas, Santa Cruz, Scotiabank (Jorge L. Brito).
- Cualquier nuevo banco se carga via UI, NO hardcoded.

### Antes de tocar

1. Si agregás validación de banco, leer del doc Firestore, no hardcodear lista.

---

## Módulo: Cotizaciones

### Archivos clave

- `src/pages/Cotizaciones.tsx`.

### Patrones P-XXX que aplican

- **P-022** — número de cotización solo vía `siguienteNumeroCotizacion()`. **HALLAZGO ACTIVO:** `Cotizaciones.tsx:314` usa helper deprecated no-transaccional (sprint follow-up: SPRINT-PAGOS-FIX-COTIZACIONES-NUMERO-TRANSACCIONAL). Ver `docs/sprints/AUDITORIA_CONTABLE_2026-05-24.md`.

### Antes de tocar

1. Migrar el callsite a `siguienteNumeroCotizacion` ANTES de cualquier feature nueva en cotizaciones.

---

## Módulo: Contadores

### Archivos clave

- `src/services/contadores.service.ts` — `siguienteNumeroOrden`, `siguienteNumeroCotizacion`, `siguienteNumeroFactura`.

### Patrones P-XXX que aplican

- **P-022** — único origen legítimo de números. Allowlist por archivo.

### Gotchas vivos

- **Counters DEBEN usar transactions** (CLAUDE.md convención #2). Cualquier alternativa rompe atomicidad.
- **Contadores legacy en `config/contadores`**: `ultimaOrden`, `ultimaCotizacion`, `ultimaFactura` (el último mantiene el nombre histórico aunque el prefijo es CG-).

### Antes de tocar

1. **NUNCA bypassear `contadores.service`.** Si necesitás un prefijo nuevo, agregá un helper en este archivo.

---

## Módulo: Clientes

### Archivos clave

- `src/services/clientes.service.ts`, `src/pages/Clientes.tsx`.
- `src/utils/index.ts::normalizarTelefono`.

### Patrones P-XXX que aplican

- **P-014** — addDoc/setDoc a `clientes` requiere guard `telefonoNormalizado`. Cazador: `check-cliente-create-sin-dedup.ts`.

### Gotchas vivos

- **Phone normalization RD:** strip non-digits, drop leading `1` if 11 digits, take last 10. WhatsApp prepends `1` again.
- **Soft-delete** vía `eliminado=true` (NO borrar docs).

### Antes de tocar

1. Cualquier write a `clientes` debe pasar por el helper que guarda `telefonoNormalizado` (P-014 enforce).

---

## Módulo: Técnicos / Personal / Usuarios

### Archivos clave

- `src/pages/PersonalPage.tsx` (refactor en SPRINT-142* dividido en subcomponentes).
- `src/pages/GestionUsuarios.tsx`.
- `src/services/personal.service.ts` (si existe; lookups vía Firestore directo).

### Patrones P-XXX que aplican

- **P-004** — alta de empleado crea AMBOS docs (`personal/{id}` + `usuarios/{uid}`). Cazador: `check-alta-empleado-doble-doc.ts`.
- **P-006** — dropdowns que asignan empleado usan `t.uid`/`p.uid`, NO `t.id`/`p.id`. Cazador: `check-tecnicoid-personal-id-misuse.ts`.
- **P-007** — `crearNotificacion({ userId: <X>.id })` con `personal.id` falla. Cazador: `check-crearnotificacion-userid-shape.ts`.

### Gotchas vivos

- **`userProfile.id` NO siempre es `auth.uid`** (gotcha CLAUDE.md). Usar `currentUser.uid` en escrituras gateadas por rule.
- **`tecnicoId`, `operariaId`, `responsableId` guardan `auth.uid`**, NO doc id de `personal`.

### Antes de tocar

1. Verificar P-004, P-006, P-007 si tocás onboarding o asignación.

---

## Módulo: WhatsApp / Inbox

### Archivos clave

- `api/whatsapp/webhook.ts`, `api/whatsapp/send.ts`, `api/whatsapp/media-proxy.ts`.
- `api/_lib/whatsappWebhook.ts`, `api/_lib/whatsappSend.ts`, `api/_lib/manejarErrorMeta.ts`, `api/_lib/iaTools.ts`.
- `src/services/whatsapp.service.ts`, `src/services/whatsappInbox.service.ts`, `src/services/whatsappRespuestasRapidas.service.ts`, `src/services/configWhatsappEnvio.service.ts`.
- `src/pages/Inbox.tsx`, `src/pages/InboxConversacion.tsx`.
- `src/components/inbox/*` (MensajeBubble, CardCliente, SelectorPlantillas, PanelCliente360, etc.).

### Patrones P-XXX que aplican

- **P-016** — webhook con HMAC SHA-256 + raw body + timingSafeEqual.
- **P-017** — webhook/send con idempotency (runTransaction + tx.get o tempId pre-Meta).
- **P-018** — send `texto_libre` con validación ventana 24h.
- **P-019** — catches con respuesta al cliente DEBEN loggear/persistir/notificar.
- **P-020** — helpers de limpieza recursiva con guard FieldValue/Date/Timestamp.

### Gotchas vivos

- **`@vercel/node` ignora `export const config`**. Body parsing manual.
- **Webhook entrante NECESITA raw body** para HMAC.
- **WhatsApp es manual** (no Business API automation desde el código).
- **2 phone_number_id activos:** `1226992440486630` (+1 829-471-6265 Principal), `1151997541323577` (+1 849-564-6767 Respaldo). Mismo WABA / token.
- **Allowlist defense-in-depth:** `META_PHONE_NUMBER_IDS_ALLOWLIST` en env.
- **stripUndefinedDeep** debe preservar FieldValue/Date/Timestamp (P-020 enforce).

### Decisiones de Jorge

- **Respuestas rápidas** son admin-only (rule `config/whatsapp_respuestas_rapidas` write esAdmin).
- **Nombre del agente al cliente** flag default ON (`config/whatsapp_envio.nombreAgenteAlClienteActivo`).
- **Plantillas:** `cita_confirmada`, `conduce_emitido`, `recordatorio_mantenimiento`, `garantia_por_vencer` — config en `src/config/plantillasWhatsApp.ts`.

### Antes de tocar

1. NO bypassear HMAC / idempotency / ventana 24h.
2. Cualquier helper recursivo nuevo en `api/_lib/` o `src/services/` debe respetar P-020.
3. NO hacer dual-write desde send (un mensaje = un POST a Meta).
4. Catches en `api/whatsapp/*.ts` DEBEN tener `manejarErrorMeta` o equivalente.

---

## Módulo: Storage (Firebase Storage)

### Archivos clave

- `src/services/storage.service.ts`.
- `api/whatsapp/media-proxy.ts` (sube WhatsApp media a `whatsapp-media/{wa_id}/`).
- `storage.rules` (versionado desde SPRINT-138).

### Patrones P-XXX que aplican

- **P-013** — `storage.rules` modificado pero no deployado a producción. Cazador: `check-storage-rules-pendientes-deploy.ts`.

### Gotchas vivos

- **`storage.rules` se deploya con `npm run deploy:storage-rules`.**
- **Cazador P-013 está en WARN cold-start** hasta que Jorge corra el deploy manual.

### Antes de tocar

1. Cualquier cambio a `storage.rules` requiere ejecutar `npm run deploy:storage-rules` antes de cerrar sprint.

---

## Cómo sumar zonas / módulos nuevos

Si un sprint descubre un módulo no listado o una zona de riesgo nueva en un módulo existente:

1. **Builder o auditor_contable** documenta el hallazgo en el sprint actual.
2. **Coordinator** invoca al agente `memoria` en modo MANTENER-MAPA al cerrar el sprint con instrucciones: "agregá <zona> al módulo <X>".
3. `memoria` edita esta tabla siguiendo el formato existente. NO duplicar contenido — enlazar a CLAUDE.md / PATRONES_REGRESION / postmortems.

Si el hallazgo es un patrón **nuevo de cazador** (P-XXX), va al `archivist` (modo POSTMORTEM → propone P-XXX) y al `builder` (implementa el cazador), NO solamente al mapa.

