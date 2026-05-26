# 🧭 AUDITORÍA DE FLUJO Y DEPENDENCIAS — Mister Service RD

> **📸 Snapshot histórico (no se actualiza).** Esta auditoría es una foto del 2026-05-25 que motivó el bloque FLUJO-DEPENDENCIAS de sprints. NO sigue siendo fuente — el mapa actual del sistema vive en `docs/mapa/MAPA_MENTAL.yaml` (regenerable con `npm run mapa`). Las próximas auditorías leerán el YAML actual y producirán su propio snapshot fechado. Esto queda como referencia forense del problema que se cortó.
>
> **2026-05-25 · Cowork.** Esta auditoría es DISTINTA a las anteriores. Las pasadas previas cazaban fallas sueltas (whack-a-mole). Esta mira el software **como un sistema completo**: qué módulo depende de cuál, qué debería estar conectado y no lo está, y en qué ORDEN hay que arreglarlo para que no quede un bucle de "tapo un hueco, sale otro".
>
> **Método:** 4 agentes en paralelo leyeron el código (solo lectura) por cluster: Agendamiento · Órdenes+Clientes · Dinero · Inventario/Personal/Dashboard. Esto es la síntesis.

---

## 1. Resumen en 60 segundos (para Jorge)

**La raíz de casi todo:** en este software **una orden puede nacer sin un cliente real amarrado.** Mantenimiento es el caso más claro y el que tú señalaste: cuando programás un mantenimiento, se guarda con el cliente **vacío** (literal: `clienteId: ''`), y la orden que genera hereda ese vacío. Esa orden queda "huérfana": no aparece en el histórico del cliente, no dispara el descuento de chequeo previo, no se cuenta bien en reportes, y en el mapa de rutas no tiene dirección.

De esa única raíz cuelgan muchos síntomas que parecen bugs separados pero **son el mismo problema**. Por eso sentís el bucle.

**Lo demás que encontramos, en orden de gravedad:**

1. **Agendamiento desconectado del calendario.** Las citas por confirmar y los mantenimientos **no se ven en la agenda ni en el calendario del técnico** — viven en una bandeja aparte. El calendario solo lee órdenes ya confirmadas.
2. **El técnico que el cliente elige en la cita web se pierde.** El calendario público dice "Agendando con María" pero al confirmar, esa asignación se descarta.
3. **Dos formularios públicos distintos** escriben a la misma bandeja con datos diferentes (uno guarda el tipo de equipo, el otro no).
4. **Dinero:** se puede **facturar/emitir conduce sin que el precio esté aprobado**, y la **comisión se calcula de dos maneras distintas** según qué pase primero (una infla ~18% porque no descuenta el ITBIS). Gana el cálculo del evento que corra primero.
5. **Inventario:** hay **tres sistemas de "piezas" que no se hablan entre sí.** Cuando el técnico instala una pieza al cerrar, **el stock no se descuenta** (salvo que haya pasado por una cotización del catálogo).
6. **Reportes:** el Dashboard calcula "Ingresos del mes" y la nómina con reglas **copiadas** que pueden no coincidir con los módulos reales.

**La solución (y por qué rompe el bucle):** se arregla por NIVELES de dependencia. Primero el cimiento (toda orden DEBE tener cliente real). Ese solo arreglo destraba la mitad de los síntomas. Después conectamos el agendamiento al calendario. Después hacemos el dinero coherente. Después conectamos el inventario. Y al final, los reportes. **No se salta de nivel.**

---

## 2. Mapa de dependencias — cómo es HOY vs cómo debería ser

**Cómo debería fluir (cadena ideal):**

```
CLIENTE ──► CITA/MANTENIMIENTO ──► ORDEN ──► COTIZACIÓN ──► (aprobación) ──► FACTURA/CONDUCE ──► PAGO ──► COMISIÓN ──► NÓMINA
   │                │                  │           │                              │              │          │
   └────────────────┴──────────────── todo apunta a clienteId / ordenId ─────────┴──────────────┴──────────┘
                                       INVENTARIO descuenta stock atado a la orden
                                       DASHBOARD lee de las fuentes reales
```

**Cómo es hoy (lo que está roto, marcado con ✗):**

| Conexión esperada | Estado real | Dónde |
|---|---|---|
| Mantenimiento → Cliente | ✗ `clienteId: ''` hardcodeado | `Mantenimiento.tsx:60` |
| Mantenimiento → Orden con cliente | ✗ la orden hereda cliente vacío | `Mantenimiento.tsx:96` |
| Cita/Mantenimiento → Calendario/Agenda | ✗ el calendario NO los lee | `AgendaDia.tsx:81`, `Calendario.tsx:24` |
| Cita web → técnico asignado | ✗ `asignadoId` se descarta al confirmar | `useOrdenCreateForm` ignora `asignadoId` |
| Técnico → identidad (uid) | ✗ mantenimiento/calendarios usan `personal.id` no `uid` | `Mantenimiento.tsx:225`, `Calendarios.tsx:307` |
| Cierre de orden → próximo mantenimiento | ✗ no existe; la lista se llena 100% a mano | (no hay path) |
| Cotización aprobada → Factura | ✗ se factura sin aprobación | `ProcesarFacturacionModal:371`, `FacturacionPendiente.tsx:210` |
| Comisión (base única) | ✗ dos bases distintas (~18% de diferencia) | `comisiones.ts:54` vs `:923` |
| Pago en conduce → montoPagado/estadoPago | ✗ quedan viejos (stale) | `ProcesarFacturacionModal:827` |
| Pieza instalada al cerrar → descuenta stock | ✗ no toca inventario | `PiezaFormModal.tsx`, `piezas.service.ts:75` |
| Standby (pieza que llegó) → inventario | ✗ no reconcilia stock | `Standby.tsx:149` |
| Factura+Pago → fase 'cerrado' | ✗ nunca avanza solo | (gotcha vivo `CAMPOS_CROSS_COLLECTION.md:128`) |
| Número de cotización (QT) atómico | ✗ se genera en memoria (duplica) | `Cotizaciones.tsx:314` |

**Lo que SÍ está bien (no tocar):** orden→cliente cuando se crea por el flujo normal (`useOrdenCreateForm` guarda `clienteId` real + estados sincronizados); contadores OS/FAC/CG atómicos; alta de empleado crea ambos docs (`personal` + `usuarios`); gate del conduce vs pago verificado; cazadores P-001..P-024.

---

## 3. Eslabones rotos por cluster (detalle técnico)

### 3.1 Agendamiento (el dolor que señaló Jorge)

- **Mantenimiento nunca se ata a un cliente.** `Mantenimiento.tsx:60` escribe `clienteId: ''`; el modal (`:190-193`) solo pide nombre como texto libre, sin teléfono ni buscador de clientes. Debería usar el typeahead de clientes (como `useOrdenCreateForm`).
- **La orden de mantenimiento hereda el cliente vacío** (`Mantenimiento.tsx:96`): nace sin cliente, sin teléfono, sin dirección, sin GPS; no emite notificación `orden_asignada`.
- **Citas y mantenimientos son invisibles en el calendario.** `AgendaDia.tsx:81` y `Calendario.tsx:24` solo leen `ordenes_servicio`. Lo solicitado queda en `/admin/citas` sin vista temporal.
- **`asignadoId` del calendario público se descarta** al confirmar (la orden no pre-asigna ese técnico).
- **Dos formularios públicos divergentes:** `CitaPublica` (`/cita/:calendarId`) NO escribe `equipoTipo` ni `telefonoNormalizado`; `FormularioAgendarPublico` (`/agendar`) sí. Mismo destino (`citas_por_confirmar`), esquemas distintos → citas degradadas y anti-duplicado que no aplica.
- **`tecnicoId` inconsistente:** mantenimiento/calendarios usan `personal.id`; las órdenes y rules esperan `uid` (P-006). Un mantenimiento con técnico no matchea la agenda del técnico.

### 3.2 Órdenes + Clientes (núcleo)

- **3 caminos crean órdenes con integridad distinta:** `useOrdenCreateForm` (bien), `Mantenimiento.tsx:94` (cliente vacío + omite `estadoSimple`), `solicitudes.service.ts:91` (depende de que el caller pase `clienteId`).
- **`parseOrden` enmascara el fantasma:** `utils/index.ts:711` lee `clienteId: raw.clienteId || ''` sin warning → un puntero roto se ve sano en la UI (muestra el nombre denormalizado).
- **Teléfono no siempre normalizado en la orden** → `obtenerOrdenesActivasPorTelefono:1124` hace doble query (norm + crudo) como parche; el mismo cliente puede duplicarse o no encontrarse.
- **`fase`/`estado`/`estadoSimple`:** el camino canónico los sincroniza; `Mantenimiento.tsx:104` omite `estadoSimple` → queda fuera de queries `where('estadoSimple',...)`.
- **La fase nunca pasa a `cerrado` automáticamente** al pagar+facturar (gotcha vivo). Las órdenes terminadas quedan en `trabajo_realizado`.

### 3.3 Dinero (cotización → conduce → pago → comisión)

- **Se factura/emite conduce sin aprobación de precio.** `ProcesarFacturacionModal.handleGenerar:371` y `FacturacionPendiente.tsx:210` no leen `estadoAprobacion`. El gate de aprobación solo existe en `registrarComisionPorOrden` (`comisiones.ts:900`), que NO se usa en la emisión.
- **Doble vía de comisión con bases distintas:** path factura (`comisiones.ts:54`) usa base = subtotal sin ITBIS − piezas; path cierre (`comisiones.ts:923`) usa `precioFinal − piezas` SIN desglosar ITBIS → **infla ~18%**. Gana el evento que corra primero (idempotencia por `ordenId`).
- **`montoPagado`/`estadoPago` quedan viejos** al cobrar dentro del modal de conduce (`ProcesarFacturacionModal:827` hace `arrayUnion` pero no recalcula) → la orden muestra "Pendiente" con monto viejo aunque la factura salió pagada.
- **Número de cotización no atómico:** `Cotizaciones.tsx:314` usa `generateNumeroCotizacion(length)` → dos operarias en simultáneo generan QT duplicados. (OS/FAC/CG sí son atómicos.)
- **Denormalización de comisión:** los 2 callers de factura denormalizan bien (P-021); el cierre crea comisión sin factura asociada → puede mostrar "—" después.
- **Pagos array↔subcolección:** HOY sin descuadre (la subcolección es espejo pasivo; todos leen/escriben el array). Riesgo latente para B-3, no actual.

### 3.4 Inventario · Personal · Dashboard

- **Tres sistemas de piezas desconectados:** `piezas_inventario` (stock real), `cierreServicio.piezasUsadas` (texto libre del técnico), `standby_piezas` (texto libre). **Solo la conversión cotización→factura descuenta stock** (`Cotizaciones.tsx:99-136`, atando `ordenId` + costo). El cierre del técnico (`PiezaFormModal` → `piezas.service.ts:75`) registra pieza a mano, **sin `piezaInventarioId` y sin descontar stock**. Posible doble-descuento si una pieza del catálogo se cotiza Y se lista en `piezasUsadas`.
- **`standby_piezas` no reconcilia inventario** al llegar (`Standby.tsx:149` solo cambia estado); guarda cliente/técnico como strings, sin `ordenId` en el alta manual.
- **Personal: identidad OK** (alta crea ambos docs, dropdowns usan `uid`). **Riesgo latente:** un técnico sin `uid` igual puede asignarse a una orden → `permission-denied` silencioso al escribir el cierre; el dashboard lo enmascara con triple fallback.
- **Dashboard diverge de las fuentes:** "Ingresos del mes" (`Dashboard.tsx:363`) no resta anulaciones; `proyeccionNomina` (`:453`) **duplica** las reglas de bonos que viven en `Nomina.tsx` → si una cambia, la proyección miente; el match de órdenes del técnico puede doble-contar por nombre.

---

## 4. Causa raíz común

**No existe un único punto de entrada para crear órdenes que garantice integridad.** Hay 3 caminos divergentes. El "cimiento" del sistema (toda orden debe apuntar a un cliente real y nacer con sus estados sincronizados) no está enforced en código. Todo lo demás (histórico de cliente, descuentos, reportes, rutas, comisiones) asume ese cimiento y se rompe en silencio cuando falta.

El segundo patrón raíz: **módulos que producen datos "tentativos" (citas, mantenimientos, standby) sin conectarlos al flujo principal** — viven en bandejas aparte que ni el calendario ni el inventario leen.

---

## 5. Plan ordenado por dependencia (el roadmap anti-bucle)

> Se procesa de arriba hacia abajo. Cada nivel asume que el anterior está hecho. Esto es lo que evita el bucle.

**NIVEL 0 — Cimiento de datos (todo depende de esto):**
- **N0-1 · `crearOrden()` central que EXIGE cliente.** Un solo helper en `ordenes.service.ts` que: (a) rechaza `clienteId` vacío (resuelve/crea cliente por teléfono), (b) escribe SIEMPRE el quinteto `{fase, estado, estadoSimple, historialFases, clienteTelefono normalizado}`. Migrar los 3 caminos (`Mantenimiento`, `solicitudes.service`, `useOrdenCreateForm`) a usarlo. *Sensible (toca creación de órdenes), pero NO toca rules/pagos. Verificación pesada + QA de Jorge.*

**NIVEL 1 — Agendamiento conectado (depende de N0):**
- **N1-1 · Mantenimiento atado a cliente real** (typeahead + teléfono + `buscarOCrearCliente` + `tecnicoId=uid`). *El dolor literal de Jorge. Frontend.*
- **N1-2 · Citas y mantenimientos visibles en Calendario/Agenda** (capa de eventos "tentativos", solo lectura). *Frontend.*
- **N1-3 · Honrar `asignadoId` del calendario público** al confirmar la cita. *Frontend.*
- **N1-4 · Unificar los 2 formularios públicos** (`CitaPublica` = esquema de `FormularioAgendarPublico`). *Frontend público, con cuidado.*
- **N1-5 · Ofrecer próximo mantenimiento al cerrar una orden** (alimentar `mantenimiento` desde el cierre). *Frontend.*

**NIVEL 2 — Dinero coherente (depende de N0 + orden bien formada):**
- **N2-1 · QT atómico** (`Cotizaciones.tsx:314` → `siguienteNumeroCotizacion()`). *Seguro, chico.*
- **N2-2 · Recalcular `montoPagado`/`estadoPago` al cobrar en el conduce.** *Bug de dinero, review + QA.*
- **N2-3 · Unificar base de comisión** (una sola vía, ITBIS desglosado consistente). *Cambia montos → DECISIÓN DE JORGE + auditor_contable + QA.*
- **N2-4 · Gate de aprobación antes de facturar** + rule R4. *Toca `firestore.rules` → ESCALAR a OK de Jorge.*
- **N2-5 · Cerrar lazo factura+pago → fase 'cerrado'.** *Toca ciclo de vida, review + QA.*

**NIVEL 3 — Inventario conectado (depende de orden + cotización):**
- **N3-1 · Unificar consumo de piezas en el cierre** (descuenta stock + `movimientos_inventario`, idempotente, atado a `ordenId`). *Cambia comportamiento de stock → DECISIÓN DE JORGE + QA.*
- **N3-2 · Reconciliar standby → inventario al llegar** + exigir `ordenId`. *Review + QA.*

**NIVEL 4 — Reportes fieles (depende de que todo lo de arriba cuadre):**
- **N4-1 · Centralizar definiciones de KPI dinero/nómina** en helpers compartidos (Dashboard, EstadoResultado, Nomina, MetricasMensuales).
- **N4-2 · Restar anulaciones** en la base de ingresos.

---

## 6. Qué necesita DECISIÓN de Jorge (no se toca solo)

Estos cambian dinero o reglas y, por política, esperan tu OK explícito (quedan en `BLOQUEOS.md`):

1. **N2-3 base de comisión:** hoy hay dos cálculos. ¿Cuál es el correcto? (Recomendado: base = precio SIN ITBIS − costo de piezas, una sola vía, en la emisión del conduce.)
2. **N2-4 gate de aprobación + rule R4:** ¿bloqueamos emitir conduce/factura si el precio no está aprobado por oficina? (Toca `firestore.rules`.)
3. **N3-1 descuento de stock al cerrar:** ¿el inventario debe descontarse automáticamente cuando el técnico instala una pieza? (Cambia cómo se maneja el stock; conviene pensar el dato histórico.)
4. **Heredado:** PAGOS B-3 (endurecer rules de subcolección) y 2da WABA Meta siguen esperando tu QA/acción.

---

## 7. Cómo se procesa esto sin volver al bucle

- Los sprints se encolan en **orden de dependencia** (NIVEL 0 → 4) en `COLA_AUTONOMA.md`.
- Cada sprint de dinero/órdenes lleva **reviewer + guardian_logica + auditor_contable** obligatorios y **NO se cierra como COMPLETADO sin tu QA** (igual que garantía).
- Lo que toca rules/pagos/inventario-stock se **ESCALA a `BLOQUEOS.md`** con tu decisión pendiente — no se hace de noche sin tu OK.
- Antes de cada sprint: `archivist` PRE-CHANGE + sección del módulo en `MAPA_RIESGOS_MODULOS.md` + touch-list expandido (quién más depende de lo que se toca). Esto es exactamente lo que evita "arreglar uno y romper otro".
