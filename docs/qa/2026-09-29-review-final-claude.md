# Revisión final independiente (Claude, solo lectura) — candidata 29/09

Alcance: CierreDia/caja, nómina, Estado de Resultado, cotización→conduce, comisiones y garantías, sobre el árbol local actual. No se cambió código ni se ejecutaron pruebas nuevas; los escenarios son reproducibles con emulador y datos ficticios. "Confirmado" = comprobado leyendo el código en la línea citada. "Hipótesis" = depende de datos o prácticas que no vi.

## Bloqueantes de candidata (confirmados)

### B1. Cotización rechazada, borrador o borrada deja la orden sin poder emitir conduce, sin salida
- `src/pages/Cotizaciones.tsx:262-270`: crear una cotización con `ordenId` escribe `orden.cotizacionId` en el acto, en estado `borrador`, sin comprobar si la orden ya tenía otra cotización o ya está facturada.
- `src/utils/cotizacionConduce.ts:2-7` exige `estado === 'aceptada'`. `ProcesarFacturacionModal.tsx:252-254` (carga) y `:760-764` (transacción) lo aplican a `orden.cotizacionId`.
- No existe ninguna ruta para desvincular (`grep cotizacionId: deleteField|null` vacío). `handleChangeEstado` (`Cotizaciones.tsx:305-312`) permite pasarla a `rechazada`, y `handleDelete` (`:314-325`) la borra sin tocar la orden.
- Caso: una orden con cotización que el cliente rechaza, pero el técnico hace otro trabajo o solo chequeo. La orden queda bloqueada para siempre ("La cotización debe estar aceptada…" o "…ya no existe").
- Caso 2: una orden con cotización A aceptada; alguien crea la cotización B para la misma orden. `orden.cotizacionId` pasa a B (borrador), la conduce se bloquea y A queda aceptada y huérfana.
- Prueba necesaria: una orden con cotización vinculada en `rechazada`, otra con la cotización borrada y otra con una segunda cotización. El conduce se debe poder emitir (o la cotización se debe poder desvincular con auditoría). Crear o borrar una cotización sobre una orden facturada o que ya tiene otra debe rechazarse.

### B2. Pagos antiguos sin `verificado` bloquean la conduce y no hay dónde confirmarlos
- `src/utils/cotizacionConduce.ts:16` rechaza `p.verificado !== true`, así que también `undefined`. El test `tests/integraciones/cotizacionConduce.test.ts:31` fija ese comportamiento.
- Pero `ProcesarFacturacionModal.tsx:417-421` declara compatibilidad: los pagos antiguos sin el campo no se bloquean y solo se filtra `=== false`. La comprobación previa pasa y la transacción falla con un mensaje genérico.
- `src/services/ordenes.service.ts:1387` (Pagos pendientes) solo lista `verificado === false`, de modo que un pago con `undefined` no aparece en ninguna bandeja para confirmarlo. En CierreDia y Bancos sale como incidencia "Verificación desconocida" y se excluye.
- Caso: una orden con `pagos: [{ id, monto: 1000 }]` (sin `verificado`) en Facturación pendiente no puede emitir conduce, y ningún rol puede corregirlo desde la app.
- Decisión necesaria: considerar esos pagos como verificados (compatibilidad), o listarlos en Pagos pendientes para confirmarlos. Hoy el código hace las dos cosas contradictorias a la vez.

### B3. La comisión usa el porcentaje por defecto para técnicos con Auth (casi todos los nuevos)
- `src/utils/comisiones.ts:993` (`registrarComisionPorOrden`) y `:251` (`obtenerTecnicoParaComision`) hacen `getDoc(doc(db, 'personal', tecnicoId))`. Desde c4be345, `tecnicoId` es `auth.uid` (CLAUDE.md, P-006), y el alta crea `personal/{auto-id}` (P-004). El documento no existe con ese ID, así que se usa `COMISION_DEFAULT_FALLBACK` (`:234-240`).
- Nómina sí resuelve por `personalUid`, así que la comisión queda mal calculada desde su origen y la nómina la paga tal cual.
- Caso: `personal/p1 { uid: 'u1', comisionPorcentaje: 40 }`, orden con `tecnicoId: 'u1'`. La comisión se registra con el porcentaje por defecto, no con el 40 %.
- Prueba: la misma y `nivel: senior/junior`. Resolver por `where('uid','==',tecnicoId)` con respaldo al ID del documento, y abortar si hay ambigüedad.

### B4. Una comisión duplicada por carrera se paga dos veces
- `src/utils/comisiones.ts:982-1021`: comprueba si existe con `getDocs(where ordenId)` y luego hace `addDoc` fuera de transacción. Dos disparadores (`FaseStepper.tsx:131` y `OrdenesTablero.tsx:162`), o doble clic o dos usuarios, crean dos comisiones pendientes.
- `nomina.service.ts:133-136` incluye todas las pendientes (ahora también atrasadas) y el cierre las liquida las dos.
- Ya estaba documentado como pendiente ("sprint de idempotencia"). Lo marco bloqueante porque ahora la nómina incorpora atrasos automáticamente y aumenta la probabilidad de pagar el duplicado.
- Prueba: dos llamadas concurrentes a `registrarComisionPorOrden` sobre la misma orden deben dar una sola comisión (ID determinista `orden_{ordenId}` más `tx.create`).

## Riesgos importantes (confirmados, no bloquean si se aceptan explícitamente)

- **R1. La comisión descuenta piezas de una cotización no aceptada.** `comisiones.ts:142-152`: si todavía no hay conduce, el costo de piezas se toma de `orden.cotizacionId` sin mirar su estado. Una cotización `borrador` o `rechazada` reduce la base del técnico. Prueba: una cotización rechazada con piezas de 3.000; la comisión al pasar a trabajo realizado debe ignorarla.
- **R2. "Día cerrado correctamente" aunque ya existía otro cierre.** `cierreDia.service.ts:62-69` devuelve el cierre existente (o el histórico) sin error, y `CierreDia.tsx:211-213` muestra éxito. Si otro usuario cerró antes con otras cifras, el segundo cree haber guardado las suyas. Prueba: dos cierres del mismo día con datos distintos; el segundo debe avisar "ya estaba cerrado por X a las HH:MM" y mostrar el guardado.
- **R3. Días calculados con dos criterios en CierreDia.** Caja y gastos usan el día RD (`resumenOperativoDia` y `proyectarCobrosCaja` con UTC-4), pero `facturasHoy` usa `isSameDay` en la hora local del dispositivo (`CierreDia.tsx` en el `useMemo` de `facturasHoy`) y `fechaSel` usa `format(new Date())` local. En un equipo que no esté en hora RD, los conduces del día y la caja no coinciden. En el Samsung y la Mac configurados en RD no se manifiesta.

## Revisado sin defectos bloqueantes
- Conduce desde orden (`ProcesarFacturacionModal.tsx:755-797`): relee la orden y la cotización en la transacción, es idempotente con `facturada`, marca la cotización `convertida` y refleja comisiones sin crearlas.
- Registrar pago (`RegistrarPagoModal.tsx:110-183`): `pagoId` generado antes de la transacción, sin duplicado por doble clic.
- Entrega de efectivo (`cierreDia.service.ts:24-51`): transacción, por pago, sin éxito parcial.
- Nómina: cierre por empleado, atrasos (`nomina.service.ts:548-606`), rechazo de comisión ya liquidada en otra liquidación, descuentos mayores que el devengado bloqueados.
- Estado de Resultado: sin recorte a cero, nómina solo de liquidaciones cerradas, comisiones con ajuste de garantía, incidencias visibles.
- Ajuste de garantía (`ajusteGarantia.ts`, `comisiones.ts:1290-1380`): idempotente por orden reasignada; rechaza comisiones liquidadas.

## Hipótesis (verificar con datos)
- **H1.** Estado de Resultado resta `costoPiezas` de los conduces y además los gastos de categoría `repuestos` (`estadoResultado.service.ts:74-85`). Si la oficina registra la compra de la pieza como gasto de repuestos, el costo se cuenta dos veces. Depende de la práctica real. Hay que confirmarlo con Jorge o separar la categoría.

## Pruebas
No ejecuté suites en esta revisión (solo lectura). Cada hallazgo trae su caso de prueba reproducible con emulador y datos ficticios.
