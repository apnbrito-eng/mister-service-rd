# Revisión Claude — nómina parcial, garantía y exceso de descuentos

## Cambios implementados (puntos1,2,5)

- Nómina mantiene un único documento y estado por empleado `listo`, `bloqueado`, `cerrado`. Una comisión pendiente sin fecha bloquea solo a su dueño identificado unívocamente por UID/documento personal. Dueño desconocido/ambiguo queda en lista global de conciliación.
- Cierre procesa empleados listos y sus movimientos en una transacción; bloqueados y ya cerrados no se descuentan. Borradores antiguos se revisan contra fechas reales y período antes de cerrar; fecha ausente/fuera de período bloquea al afectado. Cierre global espera todos los empleados y conciliaciones globales.
- Recalcular empleado bloqueado conserva sueldo, bono, avances, préstamos, ajustes manuales, asistencia e historial del borrador; relee sus comisiones y actualiza solo ese componente. No se recalcula pagado/cerrado. Comisión corregida con fecha fuera del período queda referenciada y pendiente de resolver en el período correspondiente; nunca se paga en la quincena equivocada.
- Actualizar conciliaciones resueltas elimina pendientes solo con anulación o liquidación con identificador de origen. Dueño corregido puede vincularse a empleado abierto unívoco; si ya está cerrado/pagado queda para revisión manual. No se reabren importes pagados ni se adivina asignación.
- Pago exige empleado cerrado (o cierre global legacy); reintento conserva primer pago. Ad hoc y asistencia no modifican bloqueados/cerrados/pagados. API asistencia omite dichos empleados sin consumir su revisión aprobada.
- UI/CSV muestran estado y conciliaciones, separados importes estimados/no pagables. Botones de recalcular y refrescar conciliación; no ofrecen recalcular un pago legacy registrado.
- P&L suma comisión base más ajuste de garantía firmado, igual que nómina. Asistencia de empleados cerrados cuenta incluso mientras otra parte de la nómina siga abierta.
- Neto muestra diferencia real sin truncar a cero en generación/ad hoc/asistencia. Cierre verifica desglose y sumas de avances, cuotas, ad hoc y asistencia dentro de la transacción; si exceden devengado aborta todas las escrituras. Igualdad exacta permite neto cero.

## Verificaciones

- Pruebas dirigidas: circuito generar2empleados → cerrar/pagar válido → conciliar/recalcular otro → cerrar final sin tocar primer pago; legado sin fecha/fuera de período; UID/docId ambiguo y huérfana sin UID; pendientes fuera período; exceso de cuatro fuentes aborta sin escrituras; igualdad exacta; ajuste garantía P&L=nómina.
- APIasistencia: agente de pruebas ejecutó emulador4/4 con empleado cerrado/bloqueado/pagadolegacy/listo y neto negativo, sin modificar producciónAPI fuera de este ownership.
- Conserva reglas y políticas. No datos reales, despliegue o Git.

## Archivos de este trabajo

`src/services/nomina.service.ts`, `src/services/estadoResultado.service.ts`, `src/types/index.ts`, `src/pages/Nomina.tsx`, `api/asistencia.ts`; pruebas `nomina-cierre-atomico.test.ts`, `nomina-asistencia.test.ts`, nueva `nomina-cierre-parcial.test.ts`, fixture rules `nomina-cierre-atomico.rules.test.ts`. Pruebas APIasistencia y cazador P030 coordinados por otros agentes.

## Pendientes de revisión manual

Huérfana que posteriormente se atribuya a empleado ya pagado/cerrado mantiene alerta; requiere decisión administrativa sobre su liquidación adicional, no altera pagos originales. Race al generar dos documentos de misma quincena permanece fuera de este alcance. El cierre conserva límite400 referencias por transacción.

## Evidencia final
34/34 pruebas dirigidas pasan; TypeScript web/API y lint dirigidos limpios. Emulador nómina4/4 pasa con reglas reales, incluido ciclo cierreparcial→recalcularafectado→cierrefinal sin segunda cuota. APIasistencia4/4 pasa según agente encargado. Tests agregados sobre el cierre previo, no reemplazan validación de todos los módulos.
