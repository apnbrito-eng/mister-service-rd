# Auditoría financiera y portal — 09/10/2026

Objetivo: contrastar §4 de CLAUDE-PLAN-INTEGRAL-2026-10-08.md con el código presente. Responsable: Codex. Revisión estática, sin datos ni pagos ni despliegue. Base HEAD a5495b86457aed0b4c27ad7948c0616d6dbbefe3, más cambios concurrentes de esta sesión; no constituye certificación de producción. Evidencia: rutas y líneas siguientes, a releer antes de implementar.

## Comisión por trabajo

✅ Verificado: src/utils/comisionCobro.ts:7–20 exige precioFinal positivo, pagos identificados únicos y suma de abonos verificados suficiente. :46–53 y :71–84 exigen fase cerrado/trabajo_realizado y conservan registros históricos; nomina.service.ts:390,424 revalida cobro al cerrar. Hay protección de cobro total a nivel de orden.

❓ No verificado como regla completa: cada trabajo terminado independientemente. La comprobación usa fase global de orden, no todos los estados de una lista de trabajos.

✅ Verificado: src/utils/comisiones.ts:595–635 genera una comisión canónica `orden_<id>` por orden real, obtiene porcentaje actual de personal al devengar y lo revalida en transacción. :133 usa ficha o defaults8/10 si falta. No implementa snapshot al CREAR cada trabajo. :369–384 separa ítems solo para conduce manual; una orden real refleja devengos existentes. No equivale a múltiples técnicos por trabajo dentro de una orden.

✅ Verificado: cálculo :38–59 resta piezas del subtotal sin ITBIS, con piso cero; proporcional :274–290 distribuye ganancia global por monto de ítems. Esto no demuestra costo individual materiales/piezas asignado a cada reparación. Base fiscal/pérdidas requieren conservar decisiones previas sin reinterpretarlas.

⏳ Pendiente (Claude): modelo de trabajo con ID estable, técnico UID, importe/costo asignado, porcentaje snapshot al alta y estado terminado; nuevos trabajos únicamente. Mantener orden global, releer todos los trabajos + pagos al liberar y hacer devengo idempotente por trabajo. No recalcular históricos. La comisión de venta independiente no está definida.

## Garantías y devoluciones

✅ Verificado: src/utils/comisiones.ts:842–893 aplica regla anterior de descuento 10% de piezas, incluso si el técnico original atiende; :894–916 busca comisión por orden+UID y rechaza varias coincidencias. src/utils/ajusteGarantia.ts:16 rechaza comisión liquidada/anulada. No implementa la decisión de transferencia de comisión ORIGINAL del trabajo ni descuento próxima quincena de una comisión pagada.

✅ Verificado: ProcesarFacturacionModal.tsx:520–523 usa porcentaje fiscal común sin condición esGarantia visible en ese cálculo. Falta adecuar conduces de garantía a desglose/total sin impuestos en generación, guardado y representación. No extender a otras facturas.

⏳ Pendiente (Claude): movimiento vinculado por trabajo/comisión original, reversión completa original y abono mismo importe al otro técnico; ajuste próximo período si ya pagada. Transacción, auditoría e idempotencia. Devolución parcial, garantía repetida, cancelaciones y fecha de abono resolutor siguen sin decisión: bloquear estos supuestos y no inventar reglas. El cazador P-024 actual protege regla antigua de10% y deberá actualizarse junto con pruebas de la decisión fechada, sin bypass.

## Bono secretaria/operaria

✅ Verificado: nomina.service.ts:18–19 mantiene 70% y RD$5000; :198–215 calcula ratio reparaciones/chequeos por operaria. :217–225 secretaria atribuye por creadoPor===nombre y cuenta fase!=cancelado como completada. Ese conteo incluye trabajos pendientes. Rendimiento.tsx:3–10 documenta que preserva fórmula heredada; :54 restringe vista a admin/coordinadora.

⏳ Pendiente (Claude): meta mensual editable de ventas realmente cobradas por equipo, bono proporcional tope4000 por persona. Personal recibe porcentaje; endpoint debe filtrar montos/meta/cobros, no descargarlos y esconderlos en UI. No existe evidencia en esta lectura de endpoint de ese esquema aprobado. No aplicar nómina automática hasta resolver devolución, equipo/meta cambiados durante mes y cierre mensual. El cálculo heredado no representa aprobación nueva.

## Portal y evaluación

✅ Verificado: api/portal-cliente/[token].ts:230–255 construye respuesta explícita con estado, cliente, servicio, cita, tracking e historial; no devuelve todo el documento ni costos de piezas en ese objeto. Conservar revisión del shape cierre/historial en QA.

✅ Verificado: api/feedback/[token].ts:111–140 tiene evaluación versionada, valida token y fase cerrado en transacción, bloquea duplicación con feedback legacy o nueva evaluación. api/_lib/evaluacionServicio.ts:1–15 exige cuatro categorías de estrellas1–5 (puntualidad/trato/claridad/calidad). PortalCliente.tsx:723 monta EvaluacionServicio.

⏳ Pendiente (Claude): separar atención y técnico como grupos diferentes y vincular participantes reales de orden, con UID/snapshot de asignación estable. El registro actual :126–131 solo guarda categorías/comentario/fecha; no responsable atención ni técnico. No convertir estrellas en NPS ni usar encuesta para modificar bono aprobado.

## Secuencia segura de implementación

1. Modelo y snapshots de nuevos trabajos + pruebas puras y transacciones de liberación global.
2. Conduces garantía sin impuestos (regla completa) y ajustes solo escenarios decididos; casos abiertos permanecen pendientes.
3. Configuración mensual y cálculo de porcentaje de meta separados de cierre de nómina hasta decisiones abiertas.
4. Evaluación por ambos grupos con participantes estables, token y antiduplicado; pruebas de privacidad.
5. Datos sintéticos, regresión financiera y revisión independiente antes de publicar. Dot todavía no inicia QA por instrucción de Jorge.

Pruebas de esta auditoría: lectura/búsqueda dirigida de fuente; no ejecutó escenarios financieros ni modificó código de dinero. Siguiente paso: responsable Claude implementa en lote aislado; Codex revisa diferencias y reglas nuevas contra decisiones.

— Codex
