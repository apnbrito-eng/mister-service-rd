# Revisión independiente de correcciones B2/B3/B4/R1 y duplicados de nómina (Claude, solo lectura)

Alcance: `src/utils/comisiones.ts` (`obtenerTecnicoParaComision`, `registrarComisionPorOrden`, `registrarComisionesPorItems`), `src/utils/comisionesDuplicadasNomina.ts`, `src/services/conciliarDuplicadosComision.service.ts`, `src/components/ConciliarDuplicadosComision.tsx`, `src/services/ordenes.service.ts` (`confirmarPagoOrden`, `conciliarIdentidadFechaPago`, bandeja) y los tres documentos QA. No se revisó B1, R2 ni R3 (en edición). Sin cambios de código ni datos.

## Pruebas ejecutadas
En copia aislada con vitest 3.2.7: `conciliar-duplicados-comision`, `comisiones-duplicadas-nomina`, `nomina-cierre-atomico`, `nomina-cierre-parcial`, `comision-devengo-invariante`, `pagos-conciliacion` y `cazador-nomina-cierre`: **60/60**. `factura-manual-intencion` no corrió en mi entorno por falta de `react-test-renderer` (dependencia del entorno, no fallo del test). No corrí el emulador.

## Bloqueante

### C1. Un duplicado "pendiente + liquidado" bloquea para siempre la nómina del empleado
- El detector (`comisionesDuplicadasNomina.ts:11,15`) marca el grupo si al menos un registro está pendiente, y `nomina.service.ts:248-251` deja al empleado `bloqueado`. El test `comisiones-duplicadas-nomina.test.ts:13` lo confirma.
- La única salida, `resolverDuplicadosComision`, exige que todos los registros del grupo estén pendientes (`conciliarDuplicadosComision.service.ts:41`) y rechaza el grupo si alguno está liquidado (test `conciliar-duplicados-comision.test.ts:40-42`). La interfaz solo dice "las comisiones liquidadas requieren revisión del historial" (`ConciliarDuplicadosComision.tsx:9`), sin ninguna acción.
- Es justo el caso típico del duplicado antiguo por carrera: una copia ya se pagó en una quincena anterior y la otra sigue pendiente. Desde la app no se puede anular la pendiente, así que ese técnico no puede cobrar ninguna quincena siguiente sin tocar la base de datos a mano.
- Corrección mínima propuesta, sin tocar el historial: permitir `conservarId` = la comisión liquidada **solo si** su `liquidacionId` apunta a una liquidación cuyo empleado está cerrado e incluye ese ID (misma evidencia que ya usa `nomina.service.ts` para `comisionesYaLiquidadas`), y anular únicamente las pendientes. Seguirían rechazados dos liquidados distintos, o una liquidada sin evidencia.
- Prueba: A liquidada en L1 (empleado cerrado con A en `comisionesIds`) más B pendiente de la misma orden y persona. Conciliar conservando A anula B, deja A intacta y registra la auditoría. Después, "Actualizar comisiones" desbloquea al empleado. Conservar B, o A sin evidencia, se rechaza.

## Riesgo alto (confirmado; aceptar explícitamente o corregir antes de operar)

### C2. "Conciliar ID" puede convertir una copia duplicada de un pago en un segundo cobro
- En `ordenes.service.ts:1448-1480`, cuando dos pagos comparten `id` (el caso antiguo de doble clic, que la bandeja marca como duplicado), la reparación solo ofrece dar un ID nuevo a la copia elegida. No existe la opción "esta copia es un duplicado del mismo cobro, excluirla".
- Tras reparar, la copia deja de tener incidencias y `confirmarPagoOrden` (`:1299-1333`) la puede confirmar. Desde ese momento suma en caja, en bancos y en la conduce como si fuera un cobro distinto.
- El motivo obligatorio mitiga el riesgo, pero la herramienta solo ofrece el camino que duplica. Propuesta: para el caso "ID repetido con mismo monto, método y fecha", añadir una acción auditada de "marcar como copia duplicada" (sin borrar, excluida de las sumas), o bloquear la reparación de ID en ese caso hasta revisión.
- Prueba: una orden con dos pagos `{id:'p1', monto:1000, metodo:'efectivo', fecha:X}` iguales. Hoy se puede reparar uno, confirmar los dos y la caja suma 2000. Debe haber una forma de resolverlo sin pasar a 2000.

## Revisado sin bloqueantes
- **B3** (`comisiones.ts:174-190`): resuelve por ID del documento y por `uid`; si hay ausencia o ambigüedad, bloquea. Respeta el 40 % aunque `uid` sea distinto del ID del documento. Mantiene los valores por defecto de nivel solo para una persona existente sin porcentaje. La transacción vuelve a comprobar identidad y porcentaje.
- **B4** (`comisiones.ts:589-690`): ID canónico `orden_{id}` con relectura en transacción. Cualquier comisión previa de la orden (también las antiguas) impide crear otra. Dos usuarios convergen en una sola.
- **R1**: la cotización aporta costo solo si está `aceptada`. Un conduce activo tiene prioridad y se excluyen los anulados y los de solo chequeo.
- **Conduce desde orden**: `registrarComisionesPorItems` solo refleja devengos existentes; no crea ni recalcula (`:417-420`, `reflejarDevengosOrden`). No hay doble comisión entre el cierre de la orden y el conduce.
- **Conduce manual**: conduce y comisiones en una sola transacción con IDs `manual_{factura}_{persona}`. Un reintento con el conduce ya creado no duplica, y los cambios en ítems o total se rechazan.
- **Conciliación de duplicados** (caso todo pendiente): relectura con huella, administrador activo, anulación sin borrar, auditoría en la misma transacción y rechazo si el grupo cambió.
- **B2**: la bandeja incluye `verificado !== true`. La confirmación exige permiso releído, sin incidencias, es idempotente y deja auditoría en la misma transacción. La comprobación previa del conduce ya coincide con la transacción.

## Límites ya documentados por Codex (no los cuento como nuevos)
- Las comisiones antiguas se buscan fuera de la transacción: un escritor antiguo todavía activo podría insertar otra con ID aleatorio. Requiere despliegue coordinado.
- La recuperación del conduce manual no persiste si se reinicia el navegador.
- Emulador pendiente en el sublote de conciliación y en la reparación de pagos.
