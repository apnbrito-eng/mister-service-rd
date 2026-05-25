# 🔍 Auditoría de software — Mister Service RD (2026-05-24)

> **Qué es esto:** revisión módulo por módulo del flujo y la lógica (con foco en contabilidad), pedida por Jorge. Hecha por Cowork con 4 auditorías de código en paralelo + smoke-check en vivo en producción. **Solo lectura — no se arregló nada.** Los arreglos de dinero NO se aplican sin que Jorge los vea primero; los que tocan reglas/datos van a `BLOQUEOS.md`.
>
> **Cómo leerlo:** ordenado por severidad. Cada hallazgo trae `archivo:línea`, qué está mal y el arreglo sugerido. Al final, lo que está **sólido** (verificado OK) para no perder tiempo ahí.

**Smoke-check en vivo (producción, cuenta admin):** Estado de Resultado, Comisiones, Inventario, Pagos Pendientes, Órdenes — todos **cargan sin errores** y los números en pantalla cuadran (ITBIS 18% correcto). No hay crashes de runtime. Los hallazgos de abajo son de lógica, se ven leyendo el código.

---

## 🔴 CRÍTICO

### 1. Las subidas de archivo/foto/firma en formularios públicos SIEMPRE fallan → la solicitud nunca se crea
`src/services/solicitudes.service.ts:137` + `storage.rules:62-64`
Un formulario público (`/f/:slug`) que tenga un campo de **foto, archivo o firma** sube a una ruta de Storage (`solicitudes/{id}/{campoId}/...`) que **ninguna regla pública permite**; cae al comodín que exige login. Como el envío espera la subida antes de crear la solicitud, **todo el envío revienta** ("Error al enviar") y el lead se pierde.
*Impacto real:* solo afecta a formularios con campos de subida (los de solo texto envían bien).
*Arreglo:* agregar una regla pública para `solicitudes/...` (limitada por tipo y tamaño, como ya existe para fotos de equipo públicas) **o** mandar esas subidas a la ruta pública existente. **Toca `storage.rules` → requiere tu OK + `deploy:storage-rules` (va a BLOQUEOS).**

---

## 🟠 ALTO — Contabilidad

### 2. La comisión se calcula distinto según por dónde se cierre la orden (con vs sin ITBIS)
`src/utils/comisiones.ts` (`registrarComisionPorOrden` ~L923 vs `registrarComisionPorFactura`/`calcularDesgloseFactura` ~L56/L788)
Un camino usa `precioFinal` (que **incluye ITBIS**) como base; el otro usa la ganancia neta (subtotal sin ITBIS − piezas). La misma orden paga **~18% más de comisión** si se cierra por un camino que por el otro.
*Arreglo:* usar siempre la base sin ITBIS (`desglosarTotalConITBIS(precioFinal).subtotal`).

### 3. La página y el CSV de Comisiones no restan el descuento por garantía
`src/pages/Comisiones.tsx:110,134,145`
La nómina sí descuenta `descuentoPorGarantia` al pagar (`nomina.service.ts:166-169`), pero la pantalla/exportación de Comisiones suma solo `comisionMonto`. El total que ves **sobrestima** lo que realmente se paga cuando hubo descuento por garantía.
*Arreglo:* netear `comisionMonto + (descuentoPorGarantia?.monto ?? 0)` igual que nómina.

### 4. El cierre de liquidación de nómina no es atómico → riesgo de pagar comisiones dos veces
`src/services/nomina.service.ts:403-428`
Marcar comisiones como "liquidadas" y aplicar cuotas de préstamo corre en `Promise.all` con el error silenciado. Si falla a mitad, la liquidación igual se marca "cerrada" → esas comisiones pueden volver a aparecer y pagarse en la próxima quincena.
*Arreglo:* envolver en transacción, o no cerrar la liquidación si algo falló.

---

## 🟠 ALTO — Flujo

### 5. "Reagendar" puede revivir órdenes ya cerradas o canceladas
`src/components/ordenes/ReagendarModal.tsx:78-90`
Setea `fase:'agendado'`/`estado:'activo'` sin verificar la fase actual. Si se usa sobre una orden `cerrado`/`cancelado`, borra el estado terminal y deja datos de cierre/cancelación huérfanos → posible doble cobro/comisión.
*Arreglo:* rechazar si la orden está en `cerrado`/`cancelado`.

### 6. La venta desde Cotización descuenta inventario sin transacción y permite stock negativo
`src/pages/Cotizaciones.tsx:103-130`
Lee el stock y lo escribe con `writeBatch` (no transacción): dos ventas a la vez de la misma pieza se pisan (doble venta no descontada). Y nunca frena el negativo: persiste stock por debajo de 0, solo deja una nota.
*Arreglo:* usar `runTransaction` / `increment(-cantidad)` y avisar antes de quedar negativo.

### 7. El campo de ubicación GPS en formularios dinámicos nunca se guarda
`src/components/public/CampoFormulario.tsx:23-24,54-58` + `src/pages/public/FormularioPublico.tsx:170`
Las coordenadas de un campo de ubicación se leen con una clave fija `'ubicacion'` en vez del `campo.id` real (los campos personalizados usan UUID), así que el dato se descarta en silencio. En direcciones, las coords tampoco se envían.
*Arreglo:* enviar las coords por `onChange` y leerlas por `campo.id`.

---

## 🟡 MEDIO

- **Estado de Resultado subcuenta comisiones y puede inflar ventas netas** — `EstadoResultado.tsx:53,84`. No resta `descuentoPorGarantia`; y cuando falta `subtotal` usa `total` (con ITBIS) como base, inflando ventas netas de facturas viejas. *Arreglo:* netear descuento y computar `total/1.18` si falta subtotal.
- **Cierre "solo chequeo" desde OrdenDetalle queda incompleto** — `OrdenDetalle.tsx:538-552`. No setea `tipoCierre`/`precioFinal`/`fechaCierre` (a diferencia de `AgendaDia.tsx`). Resultado: el descuento por chequeo previo no aplica y no se envía a facturación. *Arreglo:* alinear el payload con el de AgendaDia.
- **Cierre por wizard deja `estado` desincronizado** — `CierreServicioWizard.tsx:428-451`. Setea `fase`/`estadoSimple` pero no `estado`. Conviene igualar el patrón de los otros cierres. (Matiz: parte es decisión de modelo — `trabajo_realizado` sigue "activo" hasta facturar.)
- **Ponche no valida salida-sin-entrada ni entrada doble** — `Ponche.tsx` + `ponches.service.ts:110-126`. Los lookups del día usan `limit(1)` sin `orderBy`, así que con 2 entradas el cálculo de horas es no determinístico. *Arreglo:* validar en `crearPonche` + agregar `orderBy('timestamp')`.
- **Editar un empleado "existing" no propaga rol/permisos a `usuarios/`** — `GestionUsuarios.tsx:190-211`. El alta nueva sí crea ambos docs; la edición de cuentas sin `uid` real deja deriva entre `personal` y `usuarios`.
- **Préstamos: la última cuota puede dejar céntimos de saldo residual** — `prestamos.service.ts:87` + `nomina.service.ts:223`. Redondeo de `montoCuota`. Bajo impacto. *Arreglo:* clamp final del saldo.
- **Anti-duplicado de citas públicas depende de un índice compuesto** — `formularioAgendar.service.ts:336-352`. Si falta el índice, el error se traga y se permiten citas duplicadas. *Arreglo:* confirmar el índice o filtrar en cliente.
- **Contador de no-leídos puede sub-reportar** — `whatsappInbox.service.ts:262`. `marcarLeida` escribe `noLeidos:0` no-transaccional; un mensaje que llega justo en ese momento puede perder el badge (el mensaje no se pierde).
- **`EnviarFacturacionButton` no exige pago verificado** — `EnviarFacturacionButton.tsx:31`. Solo pide `montoPagado>0`. El candado real (verificado) está bien en `ProcesarFacturacionModal`. Es defensa-en-profundidad, no un hueco abierto.

---

## 🟢 BAJO / limpieza

- **OrdenDetailModal solo muestra el cierre con formato nuevo** — `OrdenDetailModal.tsx:976-1019`. Órdenes viejas (formato legacy) salen en blanco *en ese modal*; `OrdenResumenLectura` sí las cubre, así que el dato no se pierde.
- **`esOrdenMia` usa `userProfile.id` con fallback difuso por nombre** — `TecnicoVista.tsx:301-316`. Dos técnicos con el mismo primer nombre podrían verse órdenes ajenas (solo filtro UI, no escribe). *Arreglo:* comparar contra `currentUser.uid`.
- **Función muerta `marcarAvanceDescontado`** — `avances.service.ts:115-125`. Sin callers; si un futuro builder la usa, rompe la atomicidad. *Arreglo:* borrarla o documentar.
- **Stand-by de piezas es solo informativo** — `Standby.tsx`. No mueve inventario ni escribe `movimientos_piezas` (la pestaña Historial siempre sale vacía en producción).
- **`RegistrarPagoModal` permite sobrepago sin tope** — `RegistrarPagoModal.tsx:492-496`. Avisa pero acepta `montoPagado>total`. El modal de facturación sí topa — inconsistencia entre ambos.

---

## ⚪ Nota (NO es bug activo)

- **Webhook de WhatsApp: `export const config bodyParser` es inerte en `@vercel/node`** — `api/whatsapp/webhook.ts:53-57`. Parece frágil, PERO en la práctica el webhook **sí recibe mensajes** (lo confirmamos esta semana al arreglar `stripUndefinedDeep`), así que el read del body raw funciona en producción. No es un bug activo; solo código que da una falsa sensación de configuración.

---

## ✅ Verificado OK (sólido — no perder tiempo aquí)

- Contadores OS/QT/FAC son transaccionales; no hay generación de números en el cliente.
- `montoPagado` se recalcula desde la suma real de pagos en transacción (al registrar y al eliminar).
- `confirmarPagoOrden` es atómico + idempotente; el candado de conduce por pago no verificado está bien en `ProcesarFacturacionModal` (~L398).
- Desglose de ITBIS y comisión proporcional usan redondeo correcto (`Math.round(...*100)/100`).
- Normalización de teléfono RD consistente; todos los writes de clientes pasan por el guard con `telefonoNormalizado` y strip de `undefined`.
- HMAC del webhook con `timingSafeEqual`, idempotencia por `wamid`/`tempId`, ventana 24h por epoch (sin bug de zona horaria), opt-out fail-closed, y el media-proxy con chequeo de pertenencia — todo revisado y correcto.
- Las transiciones de fase en AgendaDia / OrdenDetalle (chequeo) / ProcesarFacturacionModal sí sincronizan `fase`+`estadoSimple`+`estado`+`historial`+`auditoría`.

---

## Recomendación de orden para arreglar

1. **CRÍTICO #1** (formularios públicos no envían con foto/firma) — primero, toca `storage.rules` → necesita tu OK.
2. **ALTO contabilidad #2, #3, #4** — los más sensibles (comisiones/nómina). Cada arreglo de dinero se te muestra antes de aplicar.
3. **ALTO flujo #5, #6, #7** — revivir órdenes, stock negativo, GPS perdido.
4. **MEDIO/BAJO** — agrupar en sprints de limpieza.

> Estos hallazgos alimentan el bloque **AGENTES** ya en la cola: el `auditor_contable` (FASE 1) los convierte en cazadores permanentes, y el `MAPA_RIESGOS_MODULOS` (FASE 2) se siembra con ellos.
