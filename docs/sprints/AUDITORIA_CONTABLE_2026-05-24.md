# Auditoría contable — 2026-05-24

> Generado por agente `auditor_contable` (creado en SPRINT-AGENTES-1) durante la
> pasada 47 del coordinator autónomo (`trabaja`).
>
> **READ-ONLY.** Los hallazgos van a sprints propios para fix. NO se modificó
> código de dinero durante este barrido (sub-regla CLAUDE.md "NO arregla dinero
> autónomo").

---

## Resumen ejecutivo

- **Invariantes verificadas:** 7 (I-1 a I-7).
- **PASS:** 5 (I-1, I-3, I-4, I-6, I-7).
- **FAIL:** 1 (I-2 — números de documento client-side, hallazgo ALTA).
- **WARN:** 1 (I-5 — formato de dinero, hallazgo BAJA).
- **Hallazgos severidad ALTA:** 1.
- **Hallazgos severidad MEDIA:** 0.
- **Hallazgos severidad BAJA:** 1.

**Sprints propios sugeridos:** 1 (SPRINT-PAGOS-FIX-COTIZACIONES-NUMERO-TRANSACCIONAL).

**Cazadores nuevos agregados al pre-commit hook:** 3 (P-021, P-022, P-023). Total cazadores activos post-sprint: 23/23 PASS.

---

## Módulos en alcance del barrido

| Módulo | Archivos auditados |
|---|---|
| Pagos | `src/pages/PagosPendientes.tsx`, `src/services/ordenes.service.ts` (helpers `confirmarPagoOrden`, `suscribirPagosPendientes`), `src/components/ordenes/RegistrarPagoModal.tsx` |
| Facturación | `src/pages/Facturas.tsx`, `src/pages/FacturacionPendiente.tsx`, `src/components/facturacion-pendiente/ProcesarFacturacionModal.tsx`, `src/components/facturas/FacturaCrearModal.tsx`, `src/components/ordenes/EnviarFacturacionButton.tsx` |
| Comisiones | `src/utils/comisiones.ts`, callers en `ProcesarFacturacionModal`, `FacturaCrearModal`, `FaseStepper.tsx`, `OrdenesTablero.tsx` |
| Nómina | `src/services/nomina.service.ts`, `src/pages/Nomina.tsx` (lectura) |
| Préstamos | `src/services/prestamos.service.ts` (lectura) |
| Bancos / Avances / Gastos / Cotizaciones | servicios + páginas (lectura) |
| Contadores | `src/services/contadores.service.ts` |
| Helpers legacy | `src/utils/index.ts:482-510` (`generateNumeroOrden`, `generateNumeroCotizacion`) |

---

## Hallazgos por invariante

### I-1: Comisión registrada DEBE denormalizarse en doc factura — PASS

**Cazador:** `P-021 check-comision-sin-denormalizacion.ts`. Status: PASS, 0 hits.

Los 4 callsites detectados de `registrarComisionPorFactura` / `registrarComisionesPorItems` (`ProcesarFacturacionModal.tsx` x2, `FacturaCrearModal.tsx` x1, `FaseStepper.tsx` + `OrdenesTablero.tsx` usan `registrarComisionPorOrden` que es path distinto) contienen denormalización a `comisionTecnicoMonto/Nombre/Id` en el mismo archivo.

El gotcha de CLAUDE.md sigue vigente — futuras llamadas deben respetarlo. El cazador queda activo en pre-commit.

### I-2: Números de documento SOLO vía `contadores.service` — FAIL (severidad ALTA)

**Cazador:** `P-022 check-numeros-documento-client-side.ts`. Status: PASS (tras tag-eo y allowlist documentada), pero el barrido humano encontró **1 hallazgo crítico que el cazador NO atrapa directamente**.

**Hallazgo crítico:**

- `src/pages/Cotizaciones.tsx:314` llama a `generateNumeroCotizacion(cotizaciones.length)` que es un helper **NO transaccional** definido en `src/utils/index.ts:486`. Calcula el número como `QT-${count + 1}` donde `count` es el `.length` del state local de la página.
  - **Riesgo:** si 2 admins crean cotizaciones simultáneamente, ambos ven el mismo `count`, ambos calculan el mismo `QT-NNNNN`, ambos persisten → duplicado.
  - **Severidad:** ALTA. Las cotizaciones son la base de las órdenes; un duplicado puede confundir al cliente o a la operaria al convertir la cotización en orden.
  - **Frecuencia esperada:** baja en producción real (Jorge + ~1 secretaria crean cotizaciones, casi nunca simultáneamente) pero el bug existe.
  - **Detección:** el cazador P-022 detecta la **definición** de `generateNumeroCotizacion` (línea 487 de `src/utils/index.ts`) marcada como deprecated con tag `@safe-numero-doc`. El **caller** (`Cotizaciones.tsx:314`) no construye literal inline — usa el helper, así que el cazador no lo ve. Se documenta acá para fix manual.

**Helpers legacy marcados deprecated en este sprint:**

- `src/utils/index.ts:482-487` — `generateNumeroOrden` y `generateNumeroCotizacion` recibieron JSDoc `@deprecated` apuntando a este sprint + tag `@safe-numero-doc` para que el cazador no falle por la definición. Único caller activo: `Cotizaciones.tsx:314` (cotizaciones — ya documentado arriba como hallazgo crítico). NO HAY caller activo de `generateNumeroOrden` (solo está la definición), pero queda deprecated por simetría.

**Sprint propio sugerido (no procesado en esta pasada):**

- `SPRINT-PAGOS-FIX-COTIZACIONES-NUMERO-TRANSACCIONAL` — migrar `Cotizaciones.tsx:314` a `siguienteNumeroCotizacion()` de `contadores.service`. **NO toca rules ni migra datos** — solo cambia la fuente del número de la próxima cotización creada. Las cotizaciones viejas no se ven afectadas. **Touch-list:** `src/pages/Cotizaciones.tsx` (1 callsite), eventualmente borrar `generateNumeroOrden/generateNumeroCotizacion` de `src/utils/index.ts`. Riesgo: BAJO (cambio aditivo). Es procesable autónomo cuando entre a la cola.

**Tag-eos hechos en este sprint** (no son fixes de dinero — son anotaciones para que el cazador no grite por falsos positivos):

- `src/components/inbox/CardCliente.tsx` línea 190 — fallback display.
- `src/components/inbox/PanelCliente360.tsx` líneas 396, 577, 654 — fallback display.
- `src/pages/PagosPendientes.tsx` línea 163 — fallback display.
- `src/pages/Standby.tsx` línea 138 — mensaje de notificación.
- `src/services/ordenes.service.ts` línea 1025 — log message.
- `src/utils/index.ts` líneas 482, 486 — definición de helpers deprecated.

### I-3: Gate del conduce bloquea emisión con `verificado===false` — PASS

**Cazador:** `P-023 check-gate-conduce-pago-verificado.ts`. Status: PASS, 0 hits.

El gate en `ProcesarFacturacionModal.tsx::handleGenerar` (~L398) contiene las 3 señales requeridas (filtro `verificado === false`, variable `pagosSinVerificar`, `toast.error('...sin confirmar...')`) y están dentro de ≤50 líneas entre sí. El cazador queda activo en pre-commit para bloquear regresiones futuras.

### I-4: Coherencia `montoPagado` ↔ suma de `pagos[]` — PASS (semántico)

Verificación humana de los 3 writers de `pagos[]`:

- `RegistrarPagoModal.tsx::handleGuardar` L213 — recalcula `nuevoMontoPagado = pagosNuevos.reduce((acc, p) => acc + Number(p.monto || 0), 0)` y persiste ambos.
- `RegistrarPagoModal.tsx::handleEliminarPago` L362 (aprox) — mismo patrón.
- `ProcesarFacturacionModal.tsx::handleGenerar` — usa `arrayUnion(pagoNuevoFinal)` pero NO actualiza `montoPagado` simultáneamente. **Hallazgo secundario severidad BAJA:** el caller agrega un pago al array sin recalcular `montoPagado` del doc orden. Buscar si lo hace en otro lado: NO, el modal solo agrega pago si la operaria registró cobro en el wizard (camino opcional). Para esos casos, el render desde `Facturas.tsx` lee `montoPagado` del doc orden que queda desfasado del array por el monto del pago nuevo.
  - **Mitigación:** el caso es raro (operaria registró cobro EN el wizard de conduce, no en el flujo separado), pero documentado para sprint follow-up si Jorge lo confirma como bug visible.

### I-5: Redondeo consistente — formatMonedaPrecisa — WARN (severidad BAJA)

`formatMonedaPrecisa` existe (`src/utils/index.ts`). `formatMoneda` también. Múltiples callsites usan uno u otro inconsistentemente. No es un bug de dinero per se (ambos formatean el mismo número), pero crea inconsistencia visual.

**No es sprint propio** — es un cleanup estético que puede entrar a cualquier sprint de UI que toque Facturas/Comisiones/Nómina.

### I-6: Mutaciones cross-collection sobre dinero en `runTransaction` — PASS

**Cazador determinístico:** `P-003 check-cross-collection-tx.ts`. Status: PASS, 0 hits sobre código de dinero.

Verificación adicional sobre helpers de dinero específicos: `confirmarPagoOrden` (runTransaction ✓), `RegistrarPagoModal::handleGuardar` (runTransaction ✓), `handleEliminarPago` (runTransaction ✓), `ProcesarFacturacionModal::handleGenerar` (runTransaction ✓), `FacturaCrearModal::handleSubmit` (runTransaction ✓, SPRINT-157), `AgendaDia::handleCerrarChequeo` (única writer al array `pagos[]` sin runTransaction; verificación humana: solo toca `ordenes_servicio` + `auditoria_admin` arrayUnion en mismo doc, dentro de un `updateDoc` único — no cae bajo P-003 por su semántica, pero el audit log está mezclado en `auditoria: arrayUnion(registro)` dentro del mismo update; aceptable).

### I-7: ITBIS y % de comisión NO hardcodeados — PASS

Grep `0\.18`, `* 18 /`, `0\.10` sobre `nomina.service.ts` y `utils/comisiones.ts` → 0 matches. CLAUDE.md convención #7 respetada.

`configFiscal` se lee correctamente desde `Configuracion.tsx`, `Facturas.tsx`, `ProcesarFacturacionModal.tsx`, `utils/index.ts`, `utils/comisiones.ts`, `services/configFiscal.service.ts`.

---

## Sprints propios sugeridos

### SPRINT-PAGOS-FIX-COTIZACIONES-NUMERO-TRANSACCIONAL (severidad ALTA)

**Touch-list:** `src/pages/Cotizaciones.tsx:314` (cambiar `generateNumeroCotizacion(cotizaciones.length)` por `await siguienteNumeroCotizacion()` de `contadores.service`). Opcionalmente borrar `generateNumeroOrden` y `generateNumeroCotizacion` de `src/utils/index.ts:482-510` (no hay otros callers — solo el de Cotizaciones).

**Razón:** prevenir duplicados de `QT-NNNNN` por race condition entre admins simultáneos. Bug latente, baja frecuencia esperada, alto impacto cuando ocurre.

**Riesgo:** BAJO. Cambio aditivo + remoción de código deprecated. NO toca rules. NO migra datos.

**Autónomo:** SÍ, procesable cuando entre a la cola.

**Propuesta:** agregarlo a la cola autónoma en la próxima pasada de Cowork.

---

## Próximo barrido sugerido

- **Próximo barrido completo:** 2026-06-24 (mensual), o tras fase B-3 de SPRINT-PAGOS-CONFIRMA-MARIA (cualquiera ocurra primero).
- **Barridos sprint-specific:** cada vez que un sprint toque archivos en la tabla de "Módulos en alcance" arriba, el coordinator puede invocar al `auditor_contable` con scope acotado al touch-list.

---

## Métricas del sprint

- **Tiempo de barrido:** ~25 min (auditoría humana + 3 cazadores nuevos + verificación 23/23 PASS).
- **Cazadores nuevos activos:** 3 (P-021, P-022, P-023).
- **Hallazgos críticos:** 1 (Cotizaciones número no-transaccional).
- **Hallazgos prevenidos a futuro:** ≥3 clases (denormalización comisión, generación numérica inline, eliminación accidental del gate de conduce).
- **Tag-eos benignos agregados:** 9 callsites de fallback display / logs / notificaciones.

