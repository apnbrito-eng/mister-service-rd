# Dashboard: "Ingresos del Mes" e "Ingresos vs Gastos" pasan a caja real

Fecha: 2026-09-30 (revisión final aplicada el mismo día)
Ejecutor: Claude Code (ownership acotado por Jorge)
Ownership exclusivo: `src/pages/Dashboard.tsx`, `src/utils/cajaDashboard.ts` (nuevo),
`tests/integraciones/dashboard-caja.test.ts` (nuevo), este documento.

## Revisión final — correcciones aplicadas antes de compilar

Jorge reportó 4 puntos a corregir sobre la primera iteración. Todos
resueltos dentro del mismo ownership:

1. **Los `useMemo` de `cajaMes`/`cajaPeriodo` ya no desactivan
   `react-hooks/exhaustive-deps`**. Se introdujo un ancla RD estable
   `anchorRD` derivada de `hoyRD` (`YYYY-MM-DD` en día RD) — un `useState`
   con un `setInterval` de 60s recomputa `hoyRD` con `diaCobroRD(new Date())`
   y sólo cambia la referencia cuando el día RD cambia (medianoche RD).
   Los memos dependen de `[cobrosCrudos, anchorRD]` / `[cobrosCrudos, periodoVentas, anchorRD]`
   sin comentarios `eslint-disable`. Efecto: al cruzar medianoche RD, el
   Dashboard recalcula el rango sin esperar el próximo snapshot.
2. **Gastos ya no usa "fecha ausente → hoy" ni "monto 0 silencioso"**.
   Se agregó `resumenGastosDashboard` en `cajaDashboard.ts` que:
   - Usa el MISMO `rangoRD` que los cobros (mismo día RD, sin fugas TZ).
   - Valida `fecha` con `fechaFinanciera` (misma política que el
     proyector de cobros: sin ISO válido → incidencia).
   - Valida `monto` como número finito positivo → incidencia si no.
   - Emite `IncidenciaGasto` con `{ gastoId, descripcion, motivo }` para
     todo doc que no pase la validación.
   Se agregó estado `gastosCrudos` alimentado desde el snapshot existente
   de `gastos` (mismo listener, sin abrir uno nuevo). El estado parseado
   `gastos: Gasto[]` se retiró porque ya no se usaba tras el cambio.
3. **"Balance provisional" + detalle expandible** cuando caja o gastos
   tienen incidencias (o algún listener falló). El label "Balance"
   cambia a "Balance provisional" sólo entonces, y se muestra un
   `<details>` compacto (colapsado por defecto) con hasta 10 incidencias
   por lado, cada una linkeada al doc afectado
   (`/admin/ordenes/{ordenId}` para cobros, `/admin/gastos` para
   gastos). En estado normal no aparece nada extra. Además:
   - KPI "Ingresos del Mes" pasó a titularse **"Cobros confirmados"**
     (semántica clara: es caja verificada, no ingreso documental).
   - La barra "Ingresos" del gráfico pasó a etiquetarse **"Cobros
     confirmados"**.
   - El subtítulo documental de "Balance Pendiente" cambió de
     "facturas emitidas o vencidas" a **"conduces emitidos o vencidos"**
     (nomenclatura interna que Jorge usa).
   - KPI "Conduces Emitidos" (documental separado) intacto.
4. **Errores de listener no quedan como 0 confiable**. Se agregó el
   error-callback de `onSnapshot` para los DOS listeners que alimentan
   los indicadores nuevos (`ordenes_servicio` y `gastos`); ningún otro
   listener se modificó. Al fallar, se levanta `cajaError` / `gastosError`
   y la UI muestra "cobertura incompleta" en el KPI, la barra y la
   sección expandible. Además, `checkLoaded()` ahora se dispara UNA sola
   vez por listener (guard `ordenesReady` / `gastosReady`), no en cada
   snapshot posterior — antes cada update incrementaba `loadedCount` sin
   efecto pero contra el semantic contract del spinner de carga.

### Cobertura de tests agregada (23 casos nuevos, total 48)

- `resumenGastosDashboard` con gastos válidos, fecha inválida (5
  variantes), monto inválido (7 variantes: `null`, `undefined`, `'cero'`,
  `0`, `-1`, `NaN`, `Infinity`), gastos fuera del período RD (no suman
  ni son incidencia), borde de medianoche RD (`03:59:59Z` vs
  `04:00:00Z`), mezcla válido+inválido, suma en centavos (0.1+0.2 = 0.3
  exacto), lote vacío, ausencia de descripción, y **source-check**: el
  mismo `rangoRD` para cobros y gastos en los 4 períodos.
- Los tests validan el CONTRATO externo, no la implementación interna
  del helper.

## Hallazgo (Codex)

En producción el Dashboard mostraba "Ingresos del Mes RD$9,300 · 3 conduces
pagados" y el gráfico "Ingresos vs Gastos RD$9,300" tomándolos del estado
`pagada` de la colección `facturas` (`Dashboard.tsx:376` — helper
`ingresosFacturasPagadas`). Los módulos financieros nuevos —
`Facturas.tsx`, `Gastos.tsx`, `EstadoResultado.service.ts`,
`ReporteAvanzado.tsx`, `Rendimiento.tsx`, `seguimientoMarketing.ts`,
`CierreDia.tsx`, `metricasNegocio.ts`— obtienen el cobro desde `pagos[]`
de órdenes por fecha del pago vía `proyectarCobrosCaja`
(`src/utils/movimientosCobros.ts`). Fuentes distintas → cifras distintas
para el mismo mes. Requisito de Jorge: fuente compartida.

## Decisión

- **Unificar fuente**: Dashboard ahora lee caja desde el mismo proyector
  compartido (`proyectarCobrosCaja(..., undefined, desde, hasta)`), con
  rango en día RD (UTC-4) y sin proyectar futuros (`hasta = hoy RD`).
- **Conservar "Conduces Emitidos"** como indicador documental distinto
  (no se convierte devengo en caja, no se suman conduce + pagos).
- **Conservar "Balance Pendiente"** como indicador documental (facturas
  `emitida`/`vencida`), sin ampliar alcance. Se agregó subtítulo
  aclaratorio: *"Documental — facturas emitidas o vencidas sin pago
  registrado."*
- **Mostrar incidencias / saldo provisional sin ocultarlas**: la KPI
  "Ingresos del Mes" y la barra de "Ingresos vs Gastos" incluyen línea
  auxiliar con `+RD$X pendiente · N incidencias` cuando aplica.
- **Conteo correcto**: subtítulo pasa de "N conduces pagados" a "N pagos
  confirmados" (unidad real del proyector).

## Cobertura honesta — evidencia cruda preservada

`parseOrden` (`src/utils/index.ts:715`, bloque `pagos:` líneas 894–916)
normaliza `pagos[]` y **sustituye** datos faltantes:

- `fecha` ausente → `new Date()` (hoy)
- `monto` inválido → `0`
- `id` ausente → id sintético `pago_<random>`
- `metodo` desconocido → `'efectivo'`

Feeder normalizado ⇒ el proyector nunca observaría "fecha ausente",
"monto inválido", "id ausente" ni "método inválido", y las incidencias
requeridas por Jorge quedarían silenciosas.

**Solución dentro del ownership, sin nuevo listener**: el `onSnapshot`
existente sobre `ordenes_servicio` en `Dashboard.tsx` ahora, en el mismo
callback, genera dos arreglos a partir del mismo snapshot:

- `ordenesRaw: OrdenServicio[]` — parseado (feed de todos los otros KPIs
  y gráficos operativos).
- `cobrosCrudos: OrdenCobrosCruda[]` — `{ id, datos: d.data() }` sin
  transformar (feed exclusivo del proyector de caja).

No hay listener nuevo. No se duplican consultas (mismo snapshot, dos
mapeos in-memory). Patrón idéntico al que ya usa `Facturas.tsx:100` y al
que documenta `CLAUDE.md`.

## Helper nuevo: `src/utils/cajaDashboard.ts`

- `rangoRD(periodo, ahora): { desde, hasta }` — `YYYY-MM-DD` RD, con
  aritmética UTC pura sobre el día RD (independiente del TZ del proceso
  para que los tests corran igual en runner CI en UTC y en máquina RD).
- `resumenCajaDashboard(ordenes, periodo, ahora)` — delega en
  `proyectarCobrosCaja` con `bancoId=undefined` (todos los métodos:
  efectivo + banco) y expone `totalConfirmado`, `totalPendiente`,
  `pagosConfirmados`, `pagosPendientes`, `incidencias`, `movimientos`,
  `desde`, `hasta`.

Se decidió helper propio del Dashboard en vez de exportar rangos
globales para no ampliar el alcance de `movimientosCobros.ts` (dominio
compartido con Facturas/Gastos/etc.) y mantener el cambio circunscrito a
`Dashboard.tsx` como pidió Jorge.

## Alcance NO tocado

- `firestore.rules` — no modificado. Reviewer manual no aplica.
- `pagos-legacy-conciliacion.rules.test.ts` — dominio del otro Claude.
- `api/**` — no modificado.
- Módulos de dinero real, endpoints de pago, colecciones legacy — no
  tocados.
- `parseOrden` — no modificado. Cambiar ese parser habría sido el
  arreglo más limpio pero excede el ownership.
- Otros KPIs (cotizaciones, órdenes activas, conduces emitidos, embudo,
  alertas, agenda, nómina, casos por técnico, alertas de inventario) —
  intactos.
- Gastos del gráfico — misma tabla y misma lectura que antes.

## Cambios concretos

- `src/utils/cajaDashboard.ts` (nuevo) — 78 líneas útiles, sin lógica de
  UI, sin acceso a Firestore.
- `src/pages/Dashboard.tsx`:
  - Import `resumenCajaDashboard`, `PeriodoCaja`, `OrdenCobrosCruda`;
    remover `ingresosFacturasPagadas` (ya no se usa aquí).
  - Estado `cobrosCrudos` alimentado en el snapshot existente.
  - Reemplazar `ingresosMes`/`facturasPagadasMes` por `cajaMes`.
  - Reemplazar `ingresosPeriodo` por `cajaPeriodo.totalConfirmado`.
  - Subtítulo KPI: "N pagos confirmados" (+ pendiente/incidencias
    inline si aplica).
  - Línea auxiliar en la barra Ingresos con pendiente/incidencias.
  - Subtítulo "Documental — …" en "Balance Pendiente".
- `tests/integraciones/dashboard-caja.test.ts` (nuevo) — 17 casos.

## Pruebas (todas en `tests/integraciones/dashboard-caja.test.ts`)

- `rangoRD` para `hoy`/`semana`/`mes`/`año` (lunes RD anclado, domingo
  retrocede 6 días).
- Abonos en fechas distintas de la misma orden se imputan a su fecha.
- Conduce marcado `pagada` sin `pagos[]` NO genera ingreso de caja.
- Pago no verificado va a pendiente (no confirmado).
- IDs duplicados dentro de la misma orden ⇒ 2 incidencias, 0 confirmed.
- Pago sin fecha válida (5 variantes: null, undefined, '', mes 13, texto)
  ⇒ incidencia "Fecha ausente…".
- Límite RD medianoche: `03:59:59Z` ≠ `04:00:00Z` (día RD distinto).
- Rango `hoy` aísla el día RD (excluye ayer y mañana).
- No proyecta ingresos futuros aunque el pago esté verificado.
- `montoPagado`/`total` denormalizados del doc no inflan el total.
- Orden eliminada con pago mantiene incidencia (sin sumar).
- Mezcla `efectivo` + `transferencia` + `tarjeta` + `link` con
  `bancoId=undefined` los suma todos.
- Períodos devuelven `desde`/`hasta` consistentes con `rangoRD` y
  `hasta ≤ hoy RD`.
- No suma el "espejo" documental (`montoPagado`/`total`) además de
  `pagos[]`.

## Comandos de verificación

```bash
npm run test:integraciones -- dashboard-caja
npm run typecheck:api          # api/ + scripts/ (no toca src/)
npx tsc --noEmit               # o el step src/ del build
npm run lint
```

## Límites del cambio

- Los tests corren la lógica pura del helper con un `ahora` fijo. No
  ejercen el componente React (Dashboard.tsx), solo el flujo de datos
  que el componente consume.
- No se cambia `parseOrden`. Si a futuro se quiere preservar evidencia
  cruda universalmente, ese es otro sprint (touch-list global).
- La numeración por método (efectivo vs banco) no se separa en el
  Dashboard — sigue mostrándose caja consolidada, alineado con la
  intención del KPI.

## Fallo esperado (reportar antes de agrandar alcance)

Si `npm run test:integraciones -- dashboard-caja` falla por drift del
proyector compartido (`proyectarCobrosCaja`), reportar a Jorge y NO
tocar ese archivo — es dominio compartido con Facturas/Gastos y editarlo
requiere coordinación con el otro Claude y con el módulo pagos-legacy.
