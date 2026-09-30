# Estado de Resultado — rangos y fuentes operativas

## Criterio acordado con coordinator

El informe es operativo: conduces emitidos por fecha de emisión, gastos registrados por fecha, caja por fecha del pago y costos de empleados cerrados cuya nómina termina en el rango. No equivale a devengo contable exacto ni a factura fiscal. Los límites pueden cortar quincenas: se incluye el snapshot entero por fin de período, sin prorrateo.

- `cargarDataMes` conserva firma pública y delega al rango RD.
- Comisión devengada del período mantiene `comisionMonto + descuentoPorGarantia.monto` (signed), excluyendo anuladas; se presenta informativa. No se vuelve a sumar al costo que ya contiene comisiones del snapshot cerrado, incluso atrasadas.
- Nómina registrada suma sueldo + comisiones + bono − asistencia de snapshots cerrados. Avances y préstamos no reducen ese costo. Salarios actuales solo referencia mensual, no usados para reconstruir el pasado.
- Empleados/períodos duplicados, importes inválidos, nóminas abiertas/sin desglose y períodos faltantes indican incompleto. Sin nóminas no se muestra costo cero como conclusión fiable.
- Cobertura esperada corresponde al generador `rangoQuincena`: Q1 termina14; Q2 termina29 o28 en febrero no bisiesto. Los días de pago15/30 no se confunden con periodoFin.
- Gastos y documentos se leen crudos para admitir Timestamp/ISO; los registros sin fecha o importes válidos quedan en incidencias. Subtotal cero sigue siendo válido; ausencia de subtotal no se sustituye silenciosamente por total.
- Caja reutiliza `proyectarCobrosCaja` y conserva anomalías/dobleID/pagos pendientes separados.

## Interfaz

Mes o rango desde/hasta; comparación mensual contra mes previo y rango contra intervalo inmediatamente anterior de duración equivalente. Gráfico de barras con cifras, texto y signos accesibles: importe neto documentado, costo piezas, gastos, caja y resultado solo si ambas coberturas son completas. Descarga CSV incluye advertencias de incompletitud y distingue comisiones informativas.

Gate admin/coordinadora antes de cualquier lectura. Rango inválido, error de lectura y respuesta obsoleta no dejan exportar datos anteriores.

## Verificación

- Pruebas previas de pérdida/fechas y nómina parcial:24/24.
- Nuevas de rango:5/5 (snapshot vs salario actual, no doblecomisión ni deducción préstamo/avance, gastos ISO, caja separada, faltantes/abiertos, duplicados y comparación RD).
- Nuevas UI:3/3 (gate antes consultas, errores/exportación, rango inválido sin consultas).
- P040 protege salarioactual/doblecomisión; P031/P032 conservados.
- Fixtures previas se actualizaron con fechas RAW reales: anteriormente mocks fingían filtradoTimestamp y entregaban documentos sin fecha.

## Límites

Consulta completa de colecciones existentes, sin nuevos índices ni paginación. No demuestra que estén cargados todos los gastos del negocio; gráficos dependen de fuentes registradas. No sustituye revisión contable ni inventa datos faltantes. No se migraron registros ni publicaron reglas/código. Prueba visual en navegador y revisión independiente corresponden a integración.

## Correcciones de revisión independiente

- Conduces con importes ausentes, negativos, subtotal superior al total o suma subtotal/referencia interna incoherente se excluyen y aparecen como incidencias. Se admite tolerancia de un centavo por redondeo. Costos superiores a ventas siguen mostrando pérdidas; no se sustituyen datos legacy desconocidos por cero.
- Tarjeta, gráfica y fila final comparten cobertura: nómina/bonos completos, sin incidencias ni comisiones sin fecha. La fila conserva el resultado parcial rotulado, pero suprime porcentajes comparativos cuando falta cobertura en cualquiera de los dos períodos.
- CSV identifica inicio y fin RD reales en nombre y contenido; incluye criterio de selección y cobertura. Celdas entrecomilladas conservan textos con comas.
- Verificación actualizada: 36/36 pruebas focales en cinco archivos, incluidos documentos inválidos, pérdidas válidas, cobertura UI y exportación de rango entre meses. Lint de los dos archivos productivos limpio. Typecheck global bloqueado por edición concurrente en Solicitudes.tsx:193 (buscarClientePorTelefono sin definición); no se modificó ese módulo.
