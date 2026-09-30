# Métricas integradas — 29/09/2026

## Alcance implementado

- `metricasNegocio.ts`: identidades inequívocas entre ID de Personal y UID, sin nombres; rango de mes RD; cierre desde fecha registrada/historial, nunca updatedAt; comisión con ajuste firmado de garantía; proyección de caja reutilizada RAW; evaluación del servicio 1–5.
- Métricas Mensuales: salarios expresamente proyectados con configuración actual; comisiones sin fecha visibles como incidencias; totales incluyen ajustes y excluyen anuladas; cobros y gastos con comparación al mes anterior; jornadas con entrada identificable desde ponches, sin inferir ausencias o descuentos. Accesos a fuentes.
- Rendimiento: atribución por IDs, cobros confirmados por fecha de pago, filtro de responsable por ID. Cierre por fecha verificable. Sin identidad y sin fecha visibles; homónimos mantienen claves distintas.
- Reporte Avanzado: filtro mensual/rango RD, cobros RAW por orden/identidad, calidad del servicio y enlaces. Proyección salarial visible solo en selección mensual para no sumar salario mensual a un intervalo libre.
- Feedback: conserva NPS, comparación y seguimiento; muestra categorías reales de evaluación, cantidad, comentarios, enlaces a orden, agrupación por técnico/responsable. Se explica que la encuesta evalúa servicio, no califica individualmente secretaria. Tasa de respuesta calculada sobre órdenes cerradas del mes que tienen respuesta (NPS o evaluación), no división entre dos cohortes distintas.
- Todas las páginas guardan acceso admin/coordinadora antes de listeners; estado de carga por conjunto de fuentes únicas, errores explícitos. No escrituras nuevas ni cambios de permisos.

## PRE-CHANGE respetado

P-006: resolver IDs/UID únicos antes de agrupar. P-032: no fechas actuales inventadas. P-033/P-035: no documento pagado como cobro; se consume `proyectarCobrosCaja`. P-037 detecta regresión de nombres, updatedAt, fechas inventadas y estado documental en las cuatro páginas.

## Verificación

- Pruebas focales `metricas-negocio.test.ts`: 6/6, homónimos/alias ambiguos, límites RD, fecha ausente, cierre, ajuste firmado y pagos parciales/pendientes, evaluación/NPS.
- `npx tsc --noEmit`: limpio en primera y segunda pasada; repetir al integrar trabajo concurrente.
- ESLint de cinco archivos: limpio tras correcciones de dependencias.
- `check:regression`: P037 pasa. P005/P013 preexistentes por reglas sin publicar; no se modifican ni despliegan. Falso positivo P006 documentado en línea de agrupación canónica.

## Límites explícitos

- Esta entrega no valida UI en navegador ni despliegue; requiere revisión independiente y prueba integrada.
- Asistencia cuenta jornadas con entrada registradas: no estima faltas, atrasos o descuentos desde datos incompletos.
- Proyección usa salarios/reglas actuales, no reconstruye liquidaciones históricas ni establece derecho a bono. No cambia nómina.
- Comparaciones de cobros/gastos son cifras del mes previo; no incluye nuevos gráficos de tendencias ni marketing, inventario o flujo completo de conversión.
- Reportes siguen consultando colecciones completas existentes (salvo ponches por mes); no incorpora agregados de servidor/paginación.
- Opiniones antiguas con nombres sin IDs quedan sin atribución. No se migra ni infiere identidad.
- Filtros mensuales se mantienen en Feedback y Métricas; rango libre en Avanzado/Rendimiento. API y formularios de encuesta sin cambios.

## Segunda revisión: cuatro correcciones

1. Fecha: mes inválido/vacío no llega a `format` ni a `toISOString`; se muestra aviso y control para corregir. Proyección RAW devuelve rango inválido sin lanzar. Pruebas de render de Feedback, Métricas, Reporte y Rendimiento.
2. Secretaría: escritor actual `useOrdenCreateForm.ts:798` guarda nombre en `creadoPor`. No se halló un ID persistido de creador en ese flujo. Se mantienen órdenes no atribuibles como cobertura incompleta: bono, total y comparación salarial dejan de presentar cero/total como fiable. No se infiere por homónimos ni se modifica escritor en este slice.
3. Cierres: cohorte por fecha real de cierre, excluyendo eliminadas y respetando responsable seleccionado, aunque la creación de la orden haya ocurrido antes del período.
4. Proyección: Avanzado y Mensuales incluyen comisiones devengadas del período pendientes, liquidadas y legacy sin estado, y excluyen anuladas. No se confunde esta cifra con comisiones pendientes de pagar. Avanzado usa la misma población de salarios activos que Mensuales.

Nuevas pruebas: `metricas-ui-validacion.test.ts` (render de entradas inválidas y coherencia de ambas proyecciones con legacy+liquidada+anulada), y pruebas de cobertura/cohorte en helper.
