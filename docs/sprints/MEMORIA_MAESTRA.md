# 🧠 MEMORIA MAESTRA — Mister Service RD

> **Qué es esto:** la foto SIEMPRE actual de en qué andamos. Pendiente, en curso, hecho reciente, y las decisiones de Jorge que no se olvidan. **Es lo PRIMERO que se lee al abrir cualquier conversación** (Cowork o Claude Code) y lo ÚLTIMO que se actualiza al cerrar.
>
> **Cómo usarlo (Jorge):** al abrir una conversación nueva, escribí **"ponte al día"**. Claude lee este archivo y queda cargado con todo. Vos podés abrirlo cuando quieras para ver el estado: está en `docs/sprints/MEMORIA_MAESTRA.md`.
>
> **Quién lo mantiene:** el agente **`memoria`** (`.claude/agents/memoria.md`). El coordinator lo actualiza al cerrar cada pasada; Cowork lo actualiza al cerrar cada conversación. Este archivo es un ÍNDICE corto — el detalle vive en los archivos enlazados abajo.

**Última actualización:** 2026-05-30 por coordinator autónomo (`trabaja`, pasada 53) — **NO-OP, 0 commits de código, 1 sprint ESCALADO a BLOQUEOS.** `SPRINT-DISENO-CIERRE-COMPLETO` (único PENDIENTE en cola al tope) ⊘ ESCALADO por discrepancia técnica load-bearing: la spec afirma `brand-800: #0f3460` semánticamente idéntico, pero `tailwind.config.js` define `brand-800 = #283B5A` (azul desaturado distinto al `#0f3460` actual que es `primary.DEFAULT`). El find&replace literal cambiaría visualmente el azul de toda la marca en 101 archivos — incompatible con el propio criterio del sprint ("visualmente NADA cambia"). 3 opciones en `BLOQUEOS.md` (A migrar a brand / B unificar tokens a `primary` sin cambio visual / C saltear FASE A). Recomendación coordinator: opción B. Resto de la cola ya estaba COMPLETADO o awaiting QA Jorge (DINERO-2, REPORTING-1, GARANTIA Fase A, WA-FIX-PLANTILLAS, WIZARD-FASES-FREEZE, DISENO-TECNICO-FASE-1). Anterior: 2026-05-30 por Cowork — **`SPRINT-DISENO-CIERRE-COMPLETO` agregado al TOPE de la cola** (4 fases secuenciales autónomas que cierran los 12 items pendientes del roadmap del diseñador `docs/AUDITORIA_DISENO_SENIOR_2026-05-29.md`). Jorge eligió "todo el front-end del software" + "un sprint grande que termina todo". Estructura: FASE A fundamentos invisibles (colores hardcoded → tokens brand, sin emojis, escala tipográfica, sin gradientes saturados) → FASE B accesibilidad táctil del técnico (botones 48px, sin text-[10px]) → FASE C Dashboard reducido a 3 secciones (Hoy/Pipeline/Plata) + skeletons + microcopy dominicano → FASE D HomePage con testimonios + CTA dominicano + empty states. [NO CERRAR sin QA Jorge final ~10 min recorriendo 6 pantallas]. Para procesar: Jorge corre `trabaja` cuando termine la QA de los 2 sprints pendientes (WIZARD-FASES-FREEZE + DISENO-TECNICO-FASE-1). Anterior: 2026-05-30 por coordinator autónomo (`trabaja`, pasada 52). **2 sprints procesados, ambos en producción awaiting QA Jorge.** (1) **SPRINT-WIZARD-FASES-FREEZE** hash `a02a047` — diagnóstico del coordinator: el `window.confirm()` del handler de avance de fase en `FaseStepper.tsx` se cuelga indefinidamente bajo Playwright sin `page.on('dialog')` handler (artefacto del QA automatizado de Cowork con `.playwright-mcp/`). Fix: reemplazado por Modal propio consistente con el modal de retroceso ya existente. 4 consumidores verificados sin regresión. Cuando Jorge confirme en navegador real → DINERO-2 puede retomar QA visual. (2) **SPRINT-DISENO-TECNICO-FASE-1** hash `4c21dc9` — reordena JSX en `TecnicoVista.tsx`: saludo al header, ganancias abajo del listado, etiqueta "PRÓXIMA CITA", tabs al final, mapa colapsado. 11 handlers intactos. Sub-regla "cleanup en TecnicoVista requiere QA flujo X validado" cumplida (los handlers no se tocaron). Cazadores 25/25 PASS, build 4.50s. Cola limpia tras estos 2 — sin más procesables. Anterior: 2026-05-30 Cowork — intentó QA visual DINERO-2 directo desde Chrome, cazó bug del wizard, encoló SPRINT-WIZARD-FASES-FREEZE.

---

## ⏳ PENDIENTE AHORA

### En la cola autónoma (Jorge corre `trabaja` en Claude Code) — en orden

**🟠 AL TOPE — sprint nuevo encolado por Cowork (2026-05-30):**

- **`SPRINT-DISENO-CIERRE-COMPLETO`** — ⊘ ESCALADO 2026-05-30 pasada 53 a `BLOQUEOS.md`. Discrepancia técnica detectada por touch-list expandido: la spec afirma `brand-800: #0f3460` semánticamente idéntico, pero `tailwind.config.js` define `brand-800 = #283B5A` (no `#0f3460` — ese es `primary.DEFAULT`). El find&replace literal cambiaría visualmente el azul de toda la marca en 101 archivos — incompatible con el criterio "visualmente NADA cambia" del propio sprint. Esperando decisión de Jorge entre 3 opciones (A migrar a brand-* / B unificar tokens a `primary` sin cambio visual / C saltear FASE A y procesar B/C/D). Recomendación coordinator: opción B. Para desbloquear: agregar `OK: jorge YYYY-MM-DD HH:MM opcion=A|B|C` en `BLOQUEOS.md` y disparar `procesa bloqueos`.

**🟡 EN PRODUCCIÓN AWAITING QA JORGE (pasada 52, 2026-05-30):**

- **`SPRINT-WIZARD-FASES-FREEZE`** hash `a02a047` — fix aplicado: `window.confirm` → Modal propio. Causa raíz: Playwright sin handler de dialog (no era bug del producto para usuarios reales). QA Jorge: avanzar fase desde modal de orden → debe abrir modal de confirmación rápido sin congelar.
- **`SPRINT-DISENO-TECNICO-FASE-1`** hash `4c21dc9` — jerarquía visual de `/tecnico` reordenada: saludo al header, ganancias abajo, "PRÓXIMA CITA" antes de primera cita activa, tabs al final, mapa colapsado. 11 handlers intactos. QA Jorge: abrir `/tecnico` desde celular, recorrer checklist sección 6 del spec `docs/specs/REDISENO_TECNICO_MOVIL_2026-05-29.md`.

**⭐ BLOQUE FLUJO-DEPENDENCIAS — estado post pasada 51 (2026-05-25 nocturno).** De la auditoría `AUDITORIA_FLUJO_DEPENDENCIAS_2026-05-25.md`. Causa raíz: una orden podía nacer sin cliente real. **Estado actual:**

  1. ~~**AGENDA-1-MANTENIMIENTO-ATA-CLIENTE**~~ ✅ **VERIFICADO 2026-05-29** por `/qa` de gstack (QA estático de código): typeahead exige cliente real (Mantenimiento.tsx:459-507 + :217-223 `buscarOCrearCliente`), orden hereda `clienteId` (:310-315 + guard :276-282), ficha cliente la lista (Clientes.tsx:172-186). **+ NUEVO cazador P-025** (hash `b065e4a`) bloquea reintroducción de `clienteId: ''` en writes de `mantenimiento`/`ordenes_servicio`. 24/24 cazadores PASS.
  2. **AGENDA-2-CALENDARIO-MUESTRA-CITAS** ✅ COMPLETADO hash `e4f92bf`.
  3. **AGENDA-3-HONRAR-TECNICO-ASIGNADO** ✅ COMPLETADO hash `f9697b9`.
  4. **AGENDA-4-UNIFICAR-FORMS-PUBLICOS** ✅ COMPLETADO hash `fba51a4`.
  5. **AGENDA-5-PROXIMO-MANTENIMIENTO-AL-CERRAR** ✅ COMPLETADO hash `8f6a72b`.
  6. **NUCLEO-CREAR-ORDEN-CENTRAL** ⊘ ESCALADO a BLOQUEOS (cimiento sensible + [NO CERRAR sin QA]; plan 3 fases + decisión A/B/C en BLOQUEOS.md).
  7. **DINERO-1-QT-ATOMICO** ✅ COMPLETADO hash `bec87b3`.
  8. **DINERO-2-MONTOPAGADO-RECALC** 🟡 hash `b4fc23c` — **QA estático ✅ por `/qa-only` 2026-05-29** (recalc dentro de runTransaction, guard idempotencia por `pago.id`, suma con cascada precioFinal/Aprobado/Sugerido, estado mismo helper que RegistrarPagoModal, gate P-023 intacto). **QA visual ⏸ BLOQUEADO 2026-05-30 por bug del wizard** (clic "En Cotización" congela navegador — ver SPRINT-WIZARD-FASES-FREEZE al tope). Cuando el wizard funcione, Cowork retoma: avanzar OS-0057 → cotizar RD$1500 → registrar pago parcial RD$500 → emitir conduce cobrando saldo RD$1000 → verificar orden pasa a "Pagado". Observación menor (deuda): `calcularEstadoPago` está duplicado en RegistrarPagoModal y ProcesarFacturacionModal; extraer a `utils/pagos.ts` cuando aparezca 3er caller.
  9. **REPORTING-1-KPI-HELPERS** 🟡 hash `a4e64db` — **QA estático ✅ por `/qa-only` 2026-05-29** (3 helpers en `src/utils/kpis.ts`: `ingresosFacturasPagadas` filtra `estado==='pagada'`, `conducesEmitidosMonto/Count` filtran `estado!=='anulada'` defense-in-depth, Dashboard usa los 3 + filter inline "Conduces hoy" también excluye anuladas, rangos `>=desde, <=hasta`). **Falta validación visual Jorge:** comparar KPI "Conduces emitidos del mes" antes/después si hay anuladas históricas en el mes.

  **FUERA de la cola (decisión de Jorge, en `BLOQUEOS.md`):** base de comisión (dos cálculos, ~18% dif), gate de aprobación + rule R4, descuento de stock al cerrar, standby→inventario, factura+pago→fase cerrado.

  **Follow-up suelto:** SPRINT-WA-AUTORESPUESTA-SIN-HEADER (toca `api/` → ESCALA).

### En BLOQUEOS esperando QA o OK de Jorge

- **Pasada 51 nocturno (3 sprints awaiting QA):**
  - ~~**SPRINT-AGENDA-1**~~ ✅ **CERRADO 2026-05-29** por `/qa` de gstack (auditoría estática) + cazador P-025 vivo. NO necesita QA manual.
  - **SPRINT-DINERO-2** hash `b4fc23c` — **QA estático ✅ 2026-05-29.** Falta validación visual Jorge: emitir conduce cobrando saldo dentro del wizard, verificar que la orden muestra "Pagado" en agenda/listado (no "Pendiente"+monto viejo). Plan en `BLOQUEOS.md`.
  - **SPRINT-REPORTING-1** hash `a4e64db` — **QA estático ✅ 2026-05-29.** Falta validación visual Jorge: comparar KPI "Conduces emitidos del mes" en Dashboard antes/después si hay anuladas en el mes. Debe bajar por el monto de las anuladas. Plan en `BLOQUEOS.md`.
- **SPRINT-NUCLEO-CREAR-ORDEN-CENTRAL** — ⊘ ESCALADO 2026-05-25 pasada 51. Plan 3 fases (helper crearOrden + migrar solicitudes.service + opcional migrar useOrdenCreateForm + cazador anti-bypass) + decisión A/B/C en `BLOQUEOS.md`. Para desbloquear: agregar `OK: jorge YYYY-MM-DD opcion=A|B|C`.
- **SPRINT-WA-FIX-PLANTILLAS-PARAMS** — código commiteado + pusheado (hash `0ab73c5` 2026-05-25 pasada 50). Frontend-only; deploy automático (job Vercel `Yr0nTylm03jpzaalsPhd`). **QA Jorge:** desde el inbox, mandar cada una de las 4 plantillas a un número de prueba y confirmar ✓✓ (entregado) + banner branded correcto (no ⚠️). Hallazgo lateral documentado como follow-up: `SPRINT-WA-AUTORESPUESTA-SIN-HEADER`.
- **SPRINT-GARANTIA-FLUJO-COMPLETO** — ⏸ código FASE A commiteado + pusheado (hash `59c5fb0` 2026-05-25 pasada 49). Aplica las reglas de Jorge: técnico original conserva su comisión, descuento del 10% sobre piezas al cerrar la orden de garantía (no al confirmar cita), cazador P-024 anti-reintroducción del patrón viejo. **NO marcado COMPLETADO** — Jorge debe correr 4 casos QA (mismo técnico cubre / otro técnico cubre / sin piezas / sin comisión original). Plan QA + deuda fase B en `BLOQUEOS.md`. Deuda fase B: botón "Abrir garantía" desde orden/ficha, gate "solo oficina no técnicos", capturar si el cliente paga, notifs al reabrir, regla "mismo técnico que cubre no gana comisión adicional".

### Esperando acción manual de Jorge (Cowork NO puede hacerlas)

- ~~**DRY-RUN del script de migración B-2**~~ **[HECHO 2026-05-25 por Jorge]** — corrió DRY-RUN (16 órdenes, 18 pagos) + `--apply`: subcolección poblada (16 órdenes migradas, 18 pagos escritos, arrays `orden.pagos` intactos = source-of-truth). <500 → aplicado autónomo según spec. **B-3 (cut-over + endurecer rules) sigue esperando QA de Jorge.**
- **QA SPRINT-GARANTIA Fase A** en producción/staging — 4 casos detallados en `BLOQUEOS.md`. Hash `59c5fb0`.
- ~~**QA SPRINT-FIX-LEADS-FORMULARIO-PUBLICO**~~ ✅ **CERRADO 2026-05-29** por `/qa-only` (storage.rules con whitelist `image/*` + `application/pdf` < 10MB intacta, REGLA DE ORO cumplida, `solicitudes.service.ts` migrada al path `solicitudes-publico/`, FormularioPublico.tsx GPS leído por `campo.tipo==='ubicacion'` con type guard refinado, deploy verificado por P-013 lock match sha `accf5550e87...`). NO necesita QA visual adicional.
- **Smoke test en producción** — selector de número con números reales, trazabilidad (quién envió + nombre del agente), respuestas rápidas con "/", y el inbox (fotos, ficha cliente, form a la izquierda).
- **Crear 2da/3ra WABA en Meta** + cargar `phone_number_id` + token en Vercel env + allowlist → desbloquea `SPRINT-WA-NUMERO-RESPALDO-MANUAL-FASE-2`.
- **Bug `/careful` de gstack (FASE A paquete integrado, 2026-05-29).** El hook PreToolUse:Bash busca `/bin/check-careful.sh` (ruta absoluta de sistema) que no existe → el hook falla con "non-blocking status" y `rm -rf` se ejecuta sin pedir confirmación. Verificado con prueba en `~/Desktop/prueba-gstack`. `/careful` se activa correctamente y Claude conoce los patrones, pero la red de seguridad automática del hook está rota. Opciones a evaluar: (a) `/gstack-upgrade` cuando salga versión nueva, (b) reportar al GitHub `garrytan/gstack` con el detalle del path, (c) saltear los cinturones y pasar directo a FASE B (`/qa` con navegador). Plan integrado: `docs/PLAN_INTEGRADO_GSTACK_2026-05-28.md`.

---

## 🔧 EN CURSO

Nada activo en construcción ahora mismo. Pasada 51 cerrada (nocturna). 3 sprints del bloque FLUJO-DEPENDENCIAS + SPRINT-GARANTIA Fase A + SPRINT-WA-FIX-PLANTILLAS commiteados/pusheados esperando QA Jorge.

---

## ✅ HECHO RECIENTE (últimos hitos)

- **2026-05-30 (pasada 52, `trabaja`)** — 2 sprints procesados, ambos commiteados + pusheados, awaiting QA Jorge:
  - `SPRINT-WIZARD-FASES-FREEZE` hash `a02a047` — diagnóstico: el `window.confirm()` del handler `handleClickFase` en `FaseStepper.tsx` se cuelga indefinidamente bajo Playwright sin `page.on('dialog')` handler instalado (Cowork hizo QA visual de DINERO-2 con `.playwright-mcp/` el 2026-05-30 → `document_idle waited 45000ms` = síntoma típico). En navegador real funcionaba. Fix: reemplazado `window.confirm` por Modal propio consistente con el modal de retroceso ya existente en el mismo componente. 4 consumidores verificados (OrdenDetailModal, OrdenDetalle, OrdenCard, TecnicoVista) — ninguno pasa `onCambioFase` → comportamiento idéntico para usuarios reales. Deuda follow-up identificada (NO scope): bug latente en `historialFases.map` reemplazando timestamps con `new Date()` cuando llegan como Firestore Timestamp.
  - `SPRINT-DISENO-TECNICO-FASE-1` hash `4c21dc9` — reordena JSX en `TecnicoVista.tsx`: saludo al header (1 línea con logo), card ganancias movida ABAJO del listado, etiqueta "PRÓXIMA CITA" antes de primera cita NO completada, tabs Hoy/Semana/Mes/Rango al final como filtro auxiliar, mapa colapsado (ya cumplía). 11 handlers críticos intactos (verificado por grep). Emojis preservados (Fase 4). Sub-regla CLAUDE.md "cleanup en TecnicoVista requiere QA flujo X validado" cumplida — handlers no se tocaron, solo se reorganizaron bloques JSX.
  - **25/25 cazadores PASS** en cada commit. Typecheck PASS. Lint clean. Build 4.32s + 4.50s. Pre-commit hooks PASS.
  - 0 sprints más procesables en la cola; resto ya está COMPLETADO o awaiting QA previa (DINERO-2, REPORTING-1, AGENDA-1, GARANTIA Fase A, WA-FIX-PLANTILLAS).
  - **Sub-regla CLAUDE.md observada:** ambos sprints marcados [NO CERRAR sin QA Jorge] → el coordinator NO marca COMPLETADO, los deja en estado "código en producción awaiting QA Jorge" con plan de QA explícito en COLA_AUTONOMA.md.
- **2026-05-29 (sesión Claude Code con gstack instalado)** — Cuatro sprints verificados por QA estático + 1 cazador nuevo:
  - **`/qa` AGENDA-1** (hash `132d9b5`, prod URL): 3/3 ✅ del flujo Mantenimiento → Orden → Ficha cliente. Detectó deuda anti-regresión → creó **cazador P-025** (`check-mantenimiento-clienteid-vacio.ts`, 204 líneas) detecta `clienteId: ''` en writes a `mantenimiento`/`ordenes_servicio`. Verificado: 0 falsos positivos en 238 archivos. Commits: `1c1717e` (fix mapa Mermaid `area_*` prefijo) + `b065e4a` (cazador + entrada PATRONES_REGRESION.md).
  - **`/qa-only` DINERO-2** (hash `b4fc23c`): ✅ recalc dentro de `runTransaction`, guard idempotencia por `pago.id`, suma con cascada `precioFinal/Aprobado/Sugerido`, estado igual a `RegistrarPagoModal`, gate P-023 intacto. Deuda menor: extraer `calcularEstadoPago` cuando aparezca 3er caller. **Mantiene flag [NO CERRAR sin QA Jorge]** — falta validación visual emitiendo conduce cobrando saldo.
  - **`/qa-only` REPORTING-1** (hash `a4e64db`): ✅ 3 helpers en `src/utils/kpis.ts` excluyen anuladas defense-in-depth, Dashboard los usa + filter inline "Conduces hoy" también. Sin observaciones. **Mantiene flag [NO CERRAR sin QA Jorge]** — falta comparar KPI Dashboard antes/después si hay anuladas históricas en el mes.
  - **`/qa-only` FIX-LEADS** (hash `01df699`): ✅ storage.rules con whitelist `image/*` + `application/pdf` < 10MB, REGLA DE ORO cumplida, path migrado a `solicitudes-publico/`, GPS leído por `campo.tipo==='ubicacion'` con type guard refinado, deploy verificado por P-013 lock match. Sin observaciones. **CERRADO definitivo** — no necesita QA visual adicional.
  - **24/24 cazadores PASS** (P-025 nuevo, sube de 23).
  - **Bug del hook de `/careful` SIGUE roto** (`PreToolUse:Bash hook error: /bin/check-careful.sh: No such file or directory`). No bloquea — Claude obedece patrones al nivel del modelo. Esperar `/gstack-upgrade` o reportar al repo.
  - Deuda no commiteada: `.gitignore` modificado por gstack (agregó `.gstack/`), untracked de screenshots/docs pasada 51.
- **2026-05-25 (pasada 51, `trabaja` nocturno)** — Bloque FLUJO-DEPENDENCIAS procesado: **8 sprints commiteados + pusheados**, 1 ESCALADO. **4 COMPLETADOS autónomos:**
  - `SPRINT-AGENDA-2` hash `e4f92bf` — calendario + AgendaDia muestran citas por confirmar + mantenimientos como capa tentativa (ámbar/púrpura, borde punteado), toggle "Mostrar tentativos".
  - `SPRINT-AGENDA-3` hash `f9697b9` — useOrdenCreateForm honra `asignadoId` del calendario público (precarga técnico al confirmar cita web).
  - `SPRINT-AGENDA-4` hash `fba51a4` — CitaPublica.tsx escribe `equipoTipo` + `equipoMarca` + `telefonoNormalizado` (alineado con FormularioAgendarPublico, anti-duplicado aplica a ambos paths).
  - `SPRINT-AGENDA-5` hash `8f6a72b` — CierreServicioWizard ofrece programar próximo mantenimiento al cerrar (toast con acción "Sí, programar"+3m).
  - `SPRINT-DINERO-1` hash `bec87b3` — Cotizaciones.tsx migrado a `siguienteNumeroCotizacion()` (transaccional), helper deprecated lanza en runtime. Cierra follow-up SPRINT-PAGOS-FIX-COTIZACIONES.
  - **3 [NO CERRAR sin QA Jorge]** en producción esperando QA:
    - `SPRINT-AGENDA-1` hash `132d9b5` — mantenimiento atado a cliente real (typeahead + buscarOCrearCliente + tecnicoId=uid + emite orden_asignada). Modal con mantenimientos pre-sprint bloquea botón Generar Orden.
    - `SPRINT-DINERO-2` hash `b4fc23c` — ProcesarFacturacionModal recalcula `montoPagado`/`estadoPago` al cobrar saldo dentro de la runTransaction existente. Idempotente. Gate P-023 intacto.
    - `SPRINT-REPORTING-1` hash `a4e64db` — `src/utils/kpis.ts` con 3 helpers compartidos (`ingresosFacturasPagadas`, `conducesEmitidosMonto`, `conducesEmitidosCount`). Dashboard migrado. `conducesEmitidosMonto` EXCLUYE `anulada` (cambio funcional).
  - **1 ESCALADO:** `SPRINT-NUCLEO-CREAR-ORDEN-CENTRAL` movido a BLOQUEOS con plan de 3 fases + decisión A/B/C (refactor de cimiento, [NO CERRAR sin QA], inseguro de noche).
  - **Cazadores 24/24 PASS en cada commit. Typecheck PASS. Lint clean.** 0 hits.
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
- **Comunicación (REGLA DURA, Jorge la repitió 2026-05-28: "anota eso siempre"):** **palabras simples SIEMPRE, sin jerga técnica.** Español latino/dominicano. Breve. Si tenés que usar un término técnico, traducilo entre paréntesis (ej: "Firestore rules (los permisos de la base de datos)"). Decir siempre si un comando va en la **Terminal de la Mac** o en **Claude Code**. Aplica a Cowork, al coordinator, y a CUALQUIER agente que le hable a Jorge directo. Si vas a explicar qué hace un agente o herramienta, hacelo como si fueras una persona del equipo diciéndole qué hace ("Sentate, contame qué problema querés resolver" en vez de "ejecuta una rutina de interrogación de requerimientos").
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
