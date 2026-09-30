# Cotizaciones y conduces — 29/09/2026

## Cambio
Cotizaciones vinculadas abren la orden para preparar el conduce canónico. Las externas siguen disponibles para crear, editar y aceptar; para emitir se selecciona y confirma una orden real, vinculada mediante transacción. No se inventa reparación, pago o garantía desde la cotización.

La emisión canónica valida cotización aceptada/vínculo en la transacción que crea conduce, marca orden y marca cotización convertida. Dos emisiones de una orden compiten por el mismo documento. El botón de envío revalida pago/cotización y permiso.

El conduce refleja comisiones existentes por ordenId; no crea ni recalcula devengo. Si faltan se avisa revisar Comisiones. La consulta descubre documentos fuera de la transacción; no promete impedir inserción de comisión concurrente. Un snapshot posterior puede requerir conciliación, sin duplicar dinero.

Consumo de piezas: conduce persiste inventarioPendiente antes del intento. Servicio usa movimiento determinístico por conduce/línea y transacción stock + movimiento. Reintento no duplica salida; stock insuficiente conserva pendiente sin saldo negativo. Cotizaciones muestra aviso y acción de revisión/reintento. Documentos históricos sin marca NO se reprocesan (pueden tener salida legacy). No se modifican costos ni comisiones al consumir.

## PRECHANGE respetado
P003 atomicidad crosscolección, P017 fase terminal, P021 denormalización, P023 bloqueo pagos sin confirmar. Mantiene contador transaccional, garantía/costos del modal y protección facturada. P038 agrega cazador contra rutas alternas y nuevo devengo en emisión.

## Verificación
- npx tsc --noEmit limpio.
- 6 pruebas focales: aceptación/vínculo, dos reintentos serializados de consumo, stock insuficiente, cantidad histórica distinta.
- Concurrencia focal usa mock serializado. Además 3/3 pruebas reales en emulador Firestore: doble solicitud/reintento con salida única, stock insuficiente sin salida y técnico denegado. Log `/tmp/consumo-emulator.log`. No certifica producción.
- check:regression ejecuta sin error runtime; solo P005/P013 pendientes conocidos de reglas no desplegadas.

## Pendientes de revisión
Revisión independiente y emulador de emisión completa, validación móvil. Confirmar histórico sin consumos duplicados; no migración automática. Facturas incorpora lectura raw del pendiente y acción Registrar consumo, también para conduces sin cotización. Rules actuales locales permiten ledger staff oficina, no hubo cambio/deploy. Cotizaciones externas requieren orden para emitir, paso visible conservando cotización.

## Segunda revisión — bloqueos corregidos
- Lectura transaccional rechaza orden eliminada/cancelada y cualquier pago actual sin verificado:true (incluye verificación desconocida). Recalcula total/estado de orden y conduce incluso sin pago nuevo.
- Vincular cotización comprueba fase/estado real de cancelación.
- Denormalización suma comisión base + ajuste de garantía firmado; excluye estaAnulada y estadoLiquidacion anulada. Caso 1000 - 200 = 800 probado.
- TypeScript limpio; suite focal cotización 5/5 (más 3 anteriores consumo).
- Emulador real 3/3 adicional: pago no confirmado escrito entre lectura/commit aborta al reintentar; cancelación concurrente permanece cancelada y no emite; dos emisiones dejan un documento. `/tmp/conduce-estado-emulator.log`. Ensayo usa el mismo helper dentro de transacción real; no monta el modal React ni simula notificaciones externas.
- Última pasada global TypeScript encontró cambio concurrente ajeno: `src/utils/consultaSuplidor.ts:93` devuelve texto sin mensaje. Se informó al coordinador; pasada anterior limpia. Pago con verificación desconocida o importe null/string/NaN/negativo queda bloqueado, requiere conciliación.

## B1 vínculo exclusivo (29/09)
`vinculoCotizacion.service.ts` crea y modifica cotizaciones leyendo la orden dentro de transacción. Un borrador no reemplaza una cotización ya vinculada; orden emitida/cerrada/anulada y cotización convertida bloquean cambios. La tarjeta permite desvincular con motivo obligatorio y auditoría de UID/hora en ambos documentos. Rechazar no autoriza emitir; permite luego desvincular explícitamente para continuar solo chequeo. Eliminar cotización no emitida limpia ambos extremos en la misma transacción y conserva auditoría en orden. No crea comisiones.

4 pruebas focales PASS. 4 pruebas de emulador agregadas (dos creaciones concurrentes, overwrite, rechazo/desvincular, convertida); ejecución pendiente de puerto. Revisión estática independiente solicitada.

Verificación final B1: emulador Firestore real 4/4 PASS, incluida creación simultánea con un único vínculo; caja/cierre 4/4 PASS. Log local `/tmp/vinculos-caja-emulator.log`. Focales combinadas 15/15 PASS. No se probaron envíos WhatsApp ni datos reales.

### Carrera de formulario obsoleto
La edición captura `ordenIdAlEditar` al abrir y la transacción compara esa expectativa con el vínculo actual. Si otra persona desvincula mientras el formulario está abierto, guardar falla con «Recarga antes de guardar», incluso si el formulario no envía ordenId. El payload de una edición tampoco puede introducir un vínculo distinto: debe usarse la acción explícita. Prueba focal cubre desvincular B → guardar obsoleto A conservando ambos extremos vacíos y sin guardar notas antiguas.
