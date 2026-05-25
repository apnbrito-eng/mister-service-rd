# 🧠 MEMORIA MAESTRA — Mister Service RD

> **Qué es esto:** la foto SIEMPRE actual de en qué andamos. Pendiente, en curso, hecho reciente, y las decisiones de Jorge que no se olvidan. **Es lo PRIMERO que se lee al abrir cualquier conversación** (Cowork o Claude Code) y lo ÚLTIMO que se actualiza al cerrar.
>
> **Cómo usarlo (Jorge):** al abrir una conversación nueva, escribí **"ponte al día"**. Claude lee este archivo y queda cargado con todo. Vos podés abrirlo cuando quieras para ver el estado: está en `docs/sprints/MEMORIA_MAESTRA.md`.
>
> **Quién lo mantiene:** el agente **`memoria`** (`.claude/agents/memoria.md`). El coordinator lo actualiza al cerrar cada pasada; Cowork lo actualiza al cerrar cada conversación. Este archivo es un ÍNDICE corto — el detalle vive en los archivos enlazados abajo.

**Última actualización:** 2026-05-25 por Cowork — auditoría de FLUJO Y DEPENDENCIAS de todo el software (`docs/sprints/AUDITORIA_FLUJO_DEPENDENCIAS_2026-05-25.md`) + 9 sprints ordenados por dependencia encolados + 5 escalados a decisión de Jorge. (Anterior: coordinator pasada 50 cerró `SPRINT-WA-FIX-PLANTILLAS-PARAMS` hash `0ab73c5`.)

---

## ⏳ PENDIENTE AHORA

### En la cola autónoma (Jorge corre `trabaja` en Claude Code) — en orden

**⭐ BLOQUE FLUJO-DEPENDENCIAS (al tope, ordenado por dependencia).** Sale de `AUDITORIA_FLUJO_DEPENDENCIAS_2026-05-25.md`. Causa raíz del "bucle": una orden puede nacer sin cliente real (mantenimiento = `clienteId:''`). Orden de proceso:
  1. **AGENDA-1-MANTENIMIENTO-ATA-CLIENTE** (dolor de Jorge: agendar mantenimiento exige cliente real + tecnicoId=uid). [NO CERRAR sin QA Jorge]
  2. **AGENDA-2-CALENDARIO-MUESTRA-CITAS** (citas + mantenimientos visibles en calendario/agenda, solo lectura).
  3. **AGENDA-3-HONRAR-TECNICO-ASIGNADO** (no descartar el técnico que el cliente eligió en la cita web).
  4. **AGENDA-4-UNIFICAR-FORMS-PUBLICOS** (CitaPublica = esquema de FormularioAgendarPublico).
  5. **AGENDA-5-PROXIMO-MANTENIMIENTO-AL-CERRAR** (depende de AGENDA-1).
  6. **NUCLEO-CREAR-ORDEN-CENTRAL** (cimiento: `crearOrden()` que exige cliente; si es muy grande → ESCALAR). [NO CERRAR sin QA Jorge]
  7. **DINERO-1-QT-ATOMICO** (número de cotización atómico — reemplaza el viejo follow-up SPRINT-PAGOS-FIX-COTIZACIONES).
  8. **DINERO-2-MONTOPAGADO-RECALC** (recalcular monto/estado de pago al cobrar en conduce). [NO CERRAR sin QA Jorge]
  9. **REPORTING-1-KPI-HELPERS** (centralizar KPIs dinero/nómina; restar anulaciones).

  **FUERA de la cola (decisión de Jorge, en `BLOQUEOS.md`):** base de comisión (dos cálculos, ~18% dif), gate de aprobación + rule R4, descuento de stock al cerrar, standby→inventario, factura+pago→fase cerrado.

  **Follow-up suelto:** SPRINT-WA-AUTORESPUESTA-SIN-HEADER (toca `api/` → ESCALA).

### En BLOQUEOS esperando QA o OK de Jorge

- **SPRINT-WA-FIX-PLANTILLAS-PARAMS** — código commiteado + pusheado (hash `0ab73c5` 2026-05-25 pasada 50). Frontend-only; deploy automático (job Vercel `Yr0nTylm03jpzaalsPhd`). **QA Jorge:** desde el inbox, mandar cada una de las 4 plantillas a un número de prueba y confirmar ✓✓ (entregado) + banner branded correcto (no ⚠️). Hallazgo lateral documentado como follow-up: `SPRINT-WA-AUTORESPUESTA-SIN-HEADER`.
- **SPRINT-GARANTIA-FLUJO-COMPLETO** — ⏸ código FASE A commiteado + pusheado (hash `59c5fb0` 2026-05-25 pasada 49). Aplica las reglas de Jorge: técnico original conserva su comisión, descuento del 10% sobre piezas al cerrar la orden de garantía (no al confirmar cita), cazador P-024 anti-reintroducción del patrón viejo. **NO marcado COMPLETADO** — Jorge debe correr 4 casos QA (mismo técnico cubre / otro técnico cubre / sin piezas / sin comisión original). Plan QA + deuda fase B en `BLOQUEOS.md`. Deuda fase B: botón "Abrir garantía" desde orden/ficha, gate "solo oficina no técnicos", capturar si el cliente paga, notifs al reabrir, regla "mismo técnico que cubre no gana comisión adicional".

### Esperando acción manual de Jorge (Cowork NO puede hacerlas)

- ~~**DRY-RUN del script de migración B-2**~~ **[HECHO 2026-05-25 por Jorge]** — corrió DRY-RUN (16 órdenes, 18 pagos) + `--apply`: subcolección poblada (16 órdenes migradas, 18 pagos escritos, arrays `orden.pagos` intactos = source-of-truth). <500 → aplicado autónomo según spec. **B-3 (cut-over + endurecer rules) sigue esperando QA de Jorge.**
- **QA SPRINT-GARANTIA Fase A** en producción/staging — 4 casos detallados en `BLOQUEOS.md`. Hash `59c5fb0`.
- **QA SPRINT-FIX-LEADS-FORMULARIO-PUBLICO** — enviar un formulario público real con foto + firma + PDF y verificar que llega como solicitud. Hash `01df699`. Storage rules ya deployadas.
- **Smoke test en producción** — selector de número con números reales, trazabilidad (quién envió + nombre del agente), respuestas rápidas con "/", y el inbox (fotos, ficha cliente, form a la izquierda).
- **Crear 2da/3ra WABA en Meta** + cargar `phone_number_id` + token en Vercel env + allowlist → desbloquea `SPRINT-WA-NUMERO-RESPALDO-MANUAL-FASE-2`.

---

## 🔧 EN CURSO

Nada activo en construcción ahora mismo. SPRINT-GARANTIA Fase A está commiteada + pusheada esperando QA Jorge para cerrar COMPLETADO.

---

## ✅ HECHO RECIENTE (últimos hitos)

- **2026-05-25 (pasada 50, `trabaja`)** — 1 sprint COMPLETADO:
  - `SPRINT-WA-FIX-PLANTILLAS-PARAMS` COMPLETADO hash `0ab73c5`. Arregla las 4 plantillas WhatsApp desfasadas del rediseño Meta ~15 may 2026 (error #132000 en `recordatorio` + variables/slots equivocados en las otras 3 + faltaba header IMAGE). Solo FRONTEND — `send.ts` ya soportaba `headerImageUrl` desde SPRINT-WA-2-HEADER-IMAGE. Archivos: `src/config/plantillasWhatsApp.ts` (tipo `PlantillaCatalogo` con `imagenEncabezadoUrl?`, union `AutopopularDe` +4 fuentes nuevas, 2 helpers nuevos `formatearFechaCitaDia`/`formatearFechaCitaHora`, las 4 plantillas reescritas según `PLANTILLAS_META_SPEC_2026-05-25.md`), `src/services/whatsapp.service.ts` (`PlantillaArgs` con `headerImageUrl?`, `enviarPlantilla` acepta nuevo param posicional, patrón strip-undefined), `src/components/inbox/SelectorPlantillas.tsx` (reenvía URL). 24/24 cazadores PASS. Build 4.36s. Pre-commit hook PASS. Push `ae1a6a6..0ab73c5`. Deploy job `Yr0nTylm03jpzaalsPhd` PENDING. QA Jorge envío real pendiente. Hallazgo lateral documentado follow-up `SPRINT-WA-AUTORESPUESTA-SIN-HEADER`.
- **2026-05-25 (pasada 49, `trabaja` autorizaciones explícitas Jorge)** — 2 sprints procesados:
  - `SPRINT-FIX-LEADS-FORMULARIO-PUBLICO` COMPLETADO hash `01df699` (Jorge OK opción A + deploy auto + incluir-gps=si). Archivos: `storage.rules` (match nuevo `solicitudes-publico/**` whitelist `image/*` + `application/pdf` < 10MB, REGLA DE ORO preservada — comodín `{allPaths=**}` y `fotos-equipos-publico` intactos), `src/services/solicitudes.service.ts` (path migra a `solicitudes-publico/...`), `src/pages/public/FormularioPublico.tsx` (fix lateral GPS hallazgo #7 — busca por `campo.tipo === 'ubicacion'` con cascada a clave literal, type guard refinado). Deploy ejecutado `npm run deploy:storage-rules` sha `accf5550...` 12:24:57Z. P-013 lock actualizado. 23/23 cazadores PASS.
  - `SPRINT-GARANTIA-FLUJO-COMPLETO` FASE A hash `59c5fb0` (Jorge OK FASE A; NO cerrado COMPLETADO hasta QA). Aplica reglas Jorge: técnico original conserva comisión, 10% costo piezas al cerrar orden garantía (no anulación 100%). NUEVO helper `aplicarDescuentoGarantiaPorPiezas` (calcula `-(piezas × 0.10)`, busca comisión por ordenId+tecnicoId, NO toca `estaAnulada`). Helper invocado en `CierreServicioWizard` post-cierre cuando orden `esGarantia=true` + piezas. `Citas.tsx::onAfterCreate` reemplazado bloque anulación-100% por solo snapshot factura + audit `garantia_reabierta`. UI `Comisiones.tsx` columnas "Desc. garantía" + "Neto" + CSV + panel totales con sub-línea bruto/desc. Banner modal "Cambio de técnico" reformulado (10% piezas vs 100% comisión). NUEVO cazador P-024 + entrada `PATRONES_REGRESION.md` + registrado en `run-all.ts` (24/24 PASS). Deuda fase B documentada en `BLOQUEOS.md`: botón "abrir garantía", gate "solo oficina", capturar cliente paga, notifs, regla "mismo técnico no gana comisión adicional".
- **2026-05-25 (pasada 48, `trabaja`)** — `SPRINT-PAGOS-CONFIRMA-MARIA-FASE-B-2` COMPLETADO commit `d4d6498` (opción B aprobada por Jorge `OK: jorge 2026-05-25 01:04`). Helper común `obtenerPagosDeOrden(orden)` en `ordenes.service.ts` + 4 lectores migrados (OrdenDetailModal x2, OrdenDetalle x3, RegistrarPagoModal pagosPrevios, ProcesarFacturacionModal pagosPrevios). Gate del conduce (P-023 NO-ALLOWLIST) intacto. 2 callsites raw data con tag `@safe-pagos-raw`. NUEVO `scripts/migrar-pagos-array-a-subcoleccion.ts` (dry-run default, idempotente, guard >500, audit log). Writers W2-W5 NO se tocaron. 23/23 cazadores PASS.
- **2026-05-24 (pasada 47, `trabaja`)** — Bloque AGENTES procesado completo: (a) `SPRINT-AGENTES-1-AUDITORIA-CONTABLE` commit `d938135` — agente `auditor_contable` + 3 cazadores P-021/P-022/P-023 (subió de 20→23) + informe `AUDITORIA_CONTABLE_2026-05-24.md` con 1 hallazgo crítico (Cotizaciones.tsx número no-transaccional, sprint follow-up). (b) `SPRINT-AGENTES-2-MEMORIA-DIRIGE` commit `df68a42` — `MAPA_RIESGOS_MODULOS.md` (11 módulos) + modo MANTENER-MAPA en agente memoria + sub-regla CLAUDE.md. (c) `SPRINT-AGENTES-3-PARALELIZAR` commit `30abe53` — coordinator paraleliza verificación + auditorías de módulos disjuntos. SPRINT-PAGOS-FASE-B-2 escalado a BLOQUEOS por ambigüedad técnica (NO se tocó código de pagos).
- **2026-05-24** — Auditoría de software completa (Cowork): informe en `docs/sprints/AUDITORIA_SOFTWARE_2026-05-24.md` (1 crítico, 6 altos, varios medios). Se creó el sistema de **memoria viva** (`MEMORIA_MAESTRA.md` + agente `memoria`, commit `dad8ca8`), el bloque **AGENTES** en la cola, el agente **`guardian_logica`**, y el sprint de **garantía**.
- **2026-05-24** — `SPRINT-WA-SEGURIDAD-CONFIG-RULES` COMPLETADO (commit `e9aa3ef`). Se cerró un hueco de permisos: los 3 docs de config de WhatsApp (`whatsapp_envio`, `whatsapp_numeros`, `whatsapp_respuestas_rapidas`) ahora son escribibles SOLO por admin. Verificado con emulator (Java Temurin 25, 22 tests OK) + rules deployadas. 20 cazadores OK.
- **2026-05-24** — **QA de PAGOS-FASE-B-1 aprobada** (Jorge + Cowork verificaron en producción): se confirmó el pago de prueba de OS-0059 → salió de pendientes → desbloquea la emisión del conduce. Por eso B-2 ya está en la cola.
- **2026-05-23** — `SPRINT-WA-TRAZABILIDAD-Y-RESPUESTAS-RAPIDAS` (commit `d7b320b`): trazabilidad de quién envía cada mensaje + nombre del agente al cliente + respuestas rápidas tipo WhatsApp Business.
- **2026-05-23** — `SPRINT-WA-INBOX-UX-QUICKWINS` (commit `3eff5eb`): número real + código en el selector, último servicio en el panel del cliente, botones de copiar, plantillas accesibles con la ventana abierta.
- **2026-05-22** — `SPRINT-WA-NUMERO-RESPALDO-MANUAL` Fase 1 + arreglo del bug `stripUndefinedDeep` (mensajes de WhatsApp que no se reflejaban en el CRM) + arreglo del script `deploy:storage-rules`.

> El detalle completo de cada día está en `docs/sprints/DIARIO_<fecha>.md`.

---

## 📌 DECISIONES DE JORGE QUE NO SE OLVIDAN

- **Garantía (reglas confirmadas en entrevista 2026-05-24, FASE A aplicada en hash `59c5fb0` 2026-05-25 — awaiting QA Jorge):** cuando un trabajo falla y se cubre la garantía, se reabre la orden (hoy crea una orden ligada; base ya existe de SPRINT-135a). Reglas: (1) al **técnico original** se le descuenta el **10% del costo de las PIEZAS** de la re-reparación, siempre que haya gasto en piezas — APLICADO Fase A; (2) el original **conserva su comisión** (el 10% reemplaza el viejo "pierde toda la comisión") — APLICADO Fase A; (3) si **otro** técnico cubre la garantía de un compañero, ese **sí gana comisión** (flujo estándar al facturar); si el **mismo** técnico la cubre, **no gana** comisión por la garantía — PENDIENTE Fase B (hoy si se factura la orden de garantía con el mismo técnico el flujo estándar le paga comisión, falta lógica de skip); (4) el **cliente paga según el caso** (gratis o parcial, lo decide quien reabre) — PENDIENTE Fase B; (5) **reabren: secretaria, operaria, coordinadora, admin — los técnicos NO** — PENDIENTE Fase B (botón "abrir garantía" + gate); (6) el plazo sale del **conduce de garantía** (60 días por defecto) — YA EXISTÍA via `utils/garantia.ts`. Detalle técnico en `SPRINT-GARANTIA-FLUJO-COMPLETO` (cola) + informe `AUDITORIA_SOFTWARE_2026-05-24.md` + plan QA en `BLOQUEOS.md`. Cazador P-024 activo bloqueando reintroducción del patrón viejo (`monto: -comisionMonto*` + `estaAnulada: true`).
- **Buzón de seguimiento (nurture) — regla anti-bloqueo:** a un cliente que NO quiere agendar se le manda **UN solo recordatorio automático**, nada más automático. Después, todo es **manual por lotes** que selecciona el admin/coordinador (para no disparar bloqueos de Meta). WhatsApp Flows se ven más adelante.
- **PAGOS por fases con QA entre cada una.** B-1 ya pasó QA → B-2 habilitada. B-3 (toca reglas) espera nueva QA de Jorge antes de procesarse.
- **Cowork NO hace solo:** crear WABA / cuentas, pagos, OAuth, integraciones nuevas, migraciones >500 docs, ni tocar reglas de Firestore sin OK. Eso se escala a `BLOQUEOS.md`.
- **Comunicación:** español latino/dominicano, breve, sin jerga. Decir siempre si un comando va en la **Terminal de la Mac** o en **Claude Code**.
- **Números WhatsApp:** `1226992440486630` = +1 829-471-6265 (Principal) · `1151997541323577` = +1 849-564-6767 (Respaldo).

---

## 🔮 PROYECTOS FUTUROS (necesitan diseño antes de cola)

- **IA Coordinadora de Citas** — agente de WhatsApp que agende solo, transcriba audios del cliente, y el buzón de seguimiento con la regla anti-bloqueo. Visión + preguntas de diseño en `docs/sprints/PROPUESTA_IA_COORDINADORA_CITAS.md`. **No construir sin sesión de diseño.**
- **Meta Pixel + API de Conversiones** — medir `Lead` (clic WhatsApp + formulario de cita) y `Purchase` (orden facturada) para que las campañas de Meta optimicen. Cuenta `180693964677323`. Detalle + notas en `docs/sprints/PROPUESTA_META_PIXEL.md`. **Jorge lo quiere para más adelante.** NO autónomo (integración con tercero + endpoint + token → tu OK + BLOQUEOS). Gatillo: "vamos con el pixel".

---

## 🗂️ DÓNDE VIVE TODO (índice de la fuente viva)

| Si querés saber… | Mirá aquí |
|---|---|
| Qué hay pendiente en la cola | `docs/sprints/COLA_AUTONOMA.md` (el tope) |
| Qué espera OK de Jorge | `docs/sprints/BLOQUEOS.md` |
| Qué hizo el coordinator cada día | `docs/sprints/DIARIO_<fecha>.md` |
| Log detallado de ejecución autónoma | `docs/sprints/EJECUCION_AUTONOMA.md` |
| Reglas del proyecto + gotchas | `CLAUDE.md` |
| Contexto general para Cowork | `COWORK_CONTEXTO.md` |
| Bugs catalogados (cazadores) | `docs/PATRONES_REGRESION.md` |
| Análisis de bugs de producción | `docs/postmortems/*.md` |

---

> **Recordatorio para quien edite este archivo:** mantenelo CORTO. Esto es un índice del estado, no una copia de todo. Si una sección crece mucho, movela al archivo fuente que corresponde y dejá solo el enlace. Tachar (`~~...~~`) en vez de borrar cuando algo se completa y querés preservar el rastro por unos días.
