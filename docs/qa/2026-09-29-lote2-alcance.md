# Lote 2 — fuentes financieras y conciliación

## 1. Entendimiento del objetivo
Jorge autorizó continuar el plan el29/09. El objetivo es que los módulos expliquen cifras coherentes y rastreables. Este lote inicia la corrección y comparación de fuentes; no sustituye todavía todo el sistema contable.

## 2. Información faltante y supuestos
Se conserva comisión al terminar trabajo, independiente del cobro, y las fórmulas ya existentes. No se inventan salarios históricos, fechas faltantes, permisos nuevos ni descuentos. La caja se basa en pagos confirmados de ordenes_servicio.pagos; la subcolección pagos es espejo y no se suma. fechaCobro en comisiones es un nombre heredado para devengo.

## 3. Plan de trabajo
1. Auditar discrepancias e historia de los módulos (completado en lectura por auditor y archivist).
2. Corregir fechas de comisiones en nómina, listado y Estado de Resultados; mostrar los registros que requieren conciliación.
3. Añadir proyección compartida de cobros originales, con identificación del origen, incidencias y comparación.
4. Mostrar historial por banco, todo el historial por defecto, rango opcional y enlaces a órdenes. Lectura por roles existentes.
5. Pruebas, revisión independiente, resguardo y entrega local.

## 4. Casos límite y riesgos
- Fecha ausente, inválida, Date, Timestamp o ISO: ninguna se sustituye por hoy.
- Dos pagos legítimos iguales conservan sus IDs; un mismo ID repetido requiere revisión, no se suma silenciosamente.
- Banco renombrado o dos cuentas con igual nombre: agrupar por bancoId.
- Confirmación tardía: filtro por fecha del pago, conservar fecha de verificación separada.
- Datos antiguos sin ID o fecha: visibles como incidencias y excluidos del total validado.
- Un error de lectura no representa saldo cero.
- Orden eliminada, permiso revocado, rango invertido y último milisegundo del mes.

## 5. Criterios de calidad
Pruebas de funciones financieras y componentes, errores/permisos, suite general, tipos y build. Cifras con fuente explícita, acceso al origen e incidencias visibles. Sin duplicar la persistencia durante esta etapa.

## 6. Ejecución
Implementadas ambas líneas: fechas/comisiones/P&L y proyección/historial bancario. Retirada migración automática al abrir Bancos. Documentos de detalle: 2026-09-29-lote2-fechas-financieras.md y 2026-09-29-lote2-bancos.md. Sin migración ni modificación de datos reales, sin publicación.

## 7. Revisión final
Revisión independiente GO. Suite final107 archivos/507 pruebas aprobadas; tipos y compilación web/API aprobados; lint dirigido limpio; nuevos cazadores P032/P033 pasan. QA navegador390×844 y1440×900 con datos ficticios: selección de dos cuentas con mismo nombre mantiene separación; historial completo, rango invertido, limpieza de filtros e incidencias comprobados, sin desbordamiento. La edición de input date por fill del controlador no disparó React; verificada con edición nativa ArrowUp. La proyección es de lectura: no es libro inmutable migrado ni conexión al banco. Pendiente Samsung y producción. Nóminas ya generadas permanecen intactas, no se afirma reparación retroactiva.

## Hallazgos comprobados y seguimiento
| Hallazgo | Evidencia inicial | Tratamiento |
|---|---|---|
| Fecha comisión ausente puede romper o imputarse a hoy | estadoResultado.service:81; nomina.service:94; Comisiones:74 | Corregir este lote |
| orderBy oculta comisiones sin fecha | Comisiones:42 | Corregir este lote |
| Subtotal cero sustituido por total y fin de mes pierde999ms | estadoResultado.service:33,52 | Corregir con pruebas |
| Bancos solo catálogo | Bancos:58 | Historial derivado este lote |
| Conduce marcado pagado no registra pago en orden | Facturas:166–171, total anual:138 | Siguiente integración; no inventar pago histórico |
| Creación comisión query+addDoc permite carrera | utils/comisiones:978–1022 | Sprint de idempotencia y prueba concurrente |
| Generación nómina query+addDoc permite duplicados | nomina.service:55–70,279 | Sprint de idempotencia, preservar cierre lote1 |
| Cierre efectivo basado en precio, no caja confirmada | CierreDia:116–125 | Diferenciar expectativa y caja en siguiente integración |
| Cierre diario permite duplicados y mensaje exitoso parcial | CierreDia:163–197 | Corregir con operación compartida y ensayo |
| P&L usa sueldo actual para meses anteriores | estadoResultado.service:88–90 | Conciliación histórica, no adivinar sueldos |

Las líneas son las observadas al iniciar, pueden cambiar con las correcciones. Auditoría dirigida: no certifica todo el sistema. Las reglas pendientes P005/P013 continúan como límite de publicación.
