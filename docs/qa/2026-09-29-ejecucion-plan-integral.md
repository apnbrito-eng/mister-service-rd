# Ejecución integral — continuación 29/09/2026

## 1. Objetivo
Completar las mejoras solicitadas por Jorge y preparar recorridos de prueba integrales. Usuario autorizó continuar coordinando con Claude y Claude Code. Sin publicación, mensajes externos a clientes ni cambios de datos reales.

## 2. Supuestos y límites
Fecha de comisión representa devengo al terminar trabajo, no cobro. Documentos internos son conduces. No cambiar fórmulas salariales ni reglas comerciales pendientes por inferencia. Probar localmente no certifica producción o Samsung.

## 3. Plan y estado
| Área | Estado verificable | Siguiente condición |
|---|---|---|
| IA salida y búsqueda | Implementado lotes previos, pruebas locales | Samsung con APK correcta |
| Comisiones/nómina | Seis correcciones previas; tardías en ejecución | H1/H2/H3 y recuperación sin doble liquidación |
| Cobros/conduces/gastos/cierre | Cuatro defectos auditados, implementación en ejecución | Misma caja por fecha real y escrituras atómicas |
| Piezas/suplidores/taller | Pendiente completar flujo | Orden y contacto vinculados, avisos y fotos |
| Mantenimiento/chequeos | Implementación parcial histórica por verificar | Seguimiento y avisos con registro de contacto |
| Cotizaciones/calendarios | Pendiente contraste completo | Independientes/vinculadas sin duplicación |
| Personal/accesos/ponches | Parcial histórico | Matriz permisos e integración nómina |
| Informes/feedback | Pendiente consolidación | Fuentes y períodos trazables |
| Marketing/web/formularios/IA/conocimiento | Implementaciones previas parciales | Recorridos integrales y límites operativos |
| Inventario/precios | Pendiente contraste | Enlaces con servicio y costos |
| Entrega | No publicada | Pruebas, revisión Claude, compatibilidad y candidato |

## 4. Riesgos
Preservar checkout previo extenso; cambios por ownership. No migraciones masivas, no falsear períodos, no quitar bloqueos sin vía de resolución. SDK cliente no soporta consultas transaccionales; descubrimiento no equivale a excluir inserciones.

## 5. Criterios
Casos reproducidos antes de corregir; prueba pertinente, revisión independiente, checkpoint local por lote. Dos usuarios/reintentos no duplican dinero. Fechas desconocidas son incidencias visibles. Cerrar/pagar empleado no permite recalcular su historial.

## 6. Ejecución
PRECHANGE nómina y cobros completados. H1/H2 reproducidos con pruebas de caracterización antes de producción. Builders independientes: nómina y cobros. Claude Code contrastó diseño; observaciones se evalúan, no se copian automáticamente.

## 7. Revisión
Pendiente cierre de los lotes en ejecución. El plan integral no está terminado.

## Auditoría externa de métricas (Claude Cowork, solo lectura)
Reporta cinco carencias a contrastar antes de construir: evaluaciónServicio por categorías guardada en endpoint pero Feedback solo lee NPS; falta agregado por responsables IDs; Rendimiento atribuye dinero por clienteNombre y técnicoNombre y no acota todos los importes al período; MetricasMensuales inventa fechaCobro actual y omite descuento garantía; resumen mensual solo nómina/bonos sin caja/gastos/asistencia/calidad. Fuentes propuestas: proyección caja compartida, evaluacionServicio y órdenes IDs. No ejecutó pruebas ni consultó datos reales. Preservar NPS, tasa respuesta y seguimiento existentes. No tratar calificación general como evaluación individual de secretaria si no se preguntó esa dimensión.

## Segunda revisión y evidencia de avance
- Nómina: recuperación de atrasadas, generación única y cierre por empleado implementados; 37 pruebas funcionales, 2 de detector y 5 de emulador informadas por builder. Revisión interna sin bloqueo nuevo. Claude Code encontró dos casos adicionales a resolver: cuotas omitidas cuando devengo cambia de cero a positivo y nuevas comisiones sin propietario no visibles en actualización del borrador.
- Se rechaza la observación de que sustituir fechaCobro por Timestamp.now sea solo una diferencia de serialización: modifica el devengo y debe exigir nueva revisión. La consulta completa de comisiones queda como deuda de rendimiento medible; no se adoptan cifras de tráfico no medidas.
- Caja: corregida sobrescritura de cuentas con mismo nombre, UID auditado, cierre guardado separado del estado actual y entrega posterior por pago. 8 pruebas focales + 4 de emulador. Revisor pidió corregir respuesta antigua al cambiar fecha y texto contradictorio; corrección en marcha.
- Taller/piezas: 21 pruebas focales + 4 emulador informadas. Revisor detectó estado legacy completado, retorno a standby con pieza ya llegada e identidad editable inconsistente; corrección en marcha.
- Guardián de regresiones se detuvo por P005/P013 conocidos. No emitió aprobación semántica; revisión estática independiente continuó y publicación sigue bloqueada.

## Integraciones restantes — contraste Claude Cowork
Hallazgos reportados para reproducir: Citas pierde asignadoId/equipoId/responsableAtencionId del calendario al parsear; crear orden omite calendarioId. Conversión directa de cotización puede duplicar conduce respecto de ProcesarFacturacionModal y omite garantía/costos; no asumir nueva comisión pues devengo ocurre al terminar trabajo. Cotización rechazada se precarga como si válida. Solicitudes convierte claves fijas sin clienteId ni ubicación; requiere mapeo explícito de campos y vínculo cliente. Lectura raíz confirmó la conversión directa por batch y el payload sin clienteId; demás detalles siguen sujetos a pruebas.

## Reparto directo autorizado por Jorge
29/09/2026: el usuario pide carga pesada de programación también en Claude y Claude Code terminal; reemplaza la restricción anterior de segunda opinión para estos bloques.
- Codex: finanzas, conduces/inventario, mantenimiento/chequeos, métricas, coordinación y verificación integral.
- Claude Cowork: Standby/suplidores, componentes/servicios nuevos para directorio y preparar solicitud de pieza sin enviar WhatsApp; no editar reglas ni tipos centrales. Encargo enviado en chat del proyecto y recepción visible.
- Claude Code CLI: Citas/useOrdenCreateForm/Solicitudes/solicitudes.service, origen calendario/autor y conversión canónica de solicitud. Proceso iniciado en terminal, registro privado local en .codex/artifacts/mister-service/2026-09-29/claude-terminal. Todavía no es entrega.
No publicación ni datos reales. Cada uno devuelve archivos/pruebas/límites; Codex contrasta antes de integrar.
