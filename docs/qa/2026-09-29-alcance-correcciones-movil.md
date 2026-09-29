# Correcciones solicitadas durante la revisión del Samsung

Fecha: 29/09/2026. Fuente: solicitudes y capturas de Jorge en este chat. Este documento registra alcance, no certifica implementación ni publicación.

- **Clientes/Inbox:** crear cliente sin orden obligatoria; orden opcional desde cliente; WhatsApp externo y empresa; editar coordenadas sin perder dirección; transiciones de ida y vuelta suaves.
- **Piezas:** vínculo explícito con orden y equipo, detalle y foto; autorización diferenciada de llegada; aviso interno al llegar para coordinar instalación; conservar historial y pendientes parciales; catálogo de suplidores y preparación de consulta por WhatsApp. Línea de compras pendiente de respuesta; ningún envío real autorizado en esta revisión.
- **Taller:** filtro Todos inicial; recibido, diagnóstico, trabajándose, listo y descartado/no reparable. Conservar entrega y espera de piezas históricas. Accesos a orden y chat empresarial. Corregir tabla móvil cortada. No identificar órdenes por coincidencia de nombre.
- **Mantenimiento:** cliente registrado, ficha y chat empresarial, próximos/hoy/vencidos, aviso interno por fecha para envío humano de plantilla. No crear orden ni enviar mensaje automáticamente. Antelación adicional consultada; implementación inicial al día programado.
- **IA:** minimizar y cerrar funcionales, flecha discreta con área táctil suficiente; investigar toque que abre selector del módulo detrás. Atrás nativo Android debe cerrar IA abierta y volver a la pantalla subyacente conservando conversación, sin salir de la aplicación. Verificación física pendiente tras nueva compilación.

## Condiciones de cierre

PRECHANGE y touch-list por unidad; builder, tester, regression_guardian y revisión independiente. Probar 375/1440 y reduced-motion. Cambios locales no equivalen a APK instalada. La versión instalada previamente es 1.0.17; estas correcciones posteriores requieren una candidata nueva y pruebas físicas. Conservar todos los cambios previos y pendientes de seguridad/GPS del informe de Claude.

## Corrección de alcance de Jorge — 29/09/2026

Jorge aclaró expresamente que las capturas son insumos para formular un plan de mejora, no para implementar cada observación inmediatamente. Se detuvo la implementación y se conservaron los cambios locales existentes sin publicar ni revertir. Ninguna propuesta de este documento autoriza por sí sola nuevas modificaciones de producción.

## Solo chequeo: situación y propuesta por revisar

El módulo actual (`src/pages/SugerenciasChequeo.tsx`) muestra sugerencias pendientes de aprobación/rechazo de oficina para que el técnico pueda cerrar como solo chequeo. El WhatsApp existente en esa página se dirige al técnico. No equivale a una cartera de clientes que pospusieron la reparación.

Proponer dos vistas dentro del módulo, conservando la aprobación actual:

1. **Por revisar:** sugerencias del técnico, diagnóstico, motivo, evidencia y decisión de oficina.
2. **Seguimiento al cliente:** casos confirmados como solo chequeo cuya reparación quedó pendiente. Responsable, motivo por el que se pospuso, último contacto, próxima fecha de contacto y resultado. Acceso a orden, ficha y WhatsApp de empresa; plantilla/oferta revisada por una persona antes de enviarla. Descuentos y ofertas requieren reglas comerciales definidas; no inventar importes ni alterar precios.

Estados de seguimiento propuestos: por contactar, contactado, espera decisión, reparación aceptada, no interesado. Mantenerlos separados de fases de orden, facturación y cobros. Aceptación debe enlazar al flujo real de reparación, sin duplicar órdenes ni perder el chequeo previo. Recordatorio por fecha asignada y responsable, con historial y sin avisos duplicados. Respetar que un cliente no quiera más seguimiento.

Indicadores por técnico: número y proporción de solo chequeo sobre sus visitas, motivos, periodos comparables, conversiones a reparación y resultados de revisión. Una tasa alta señala casos que ameritan comprobación; no demuestra fraude ni debe generar sanciones automáticas. Revisión humana de evidencia y contexto antes de concluir.

Pendientes para acordar: periodicidad de seguimiento, responsable, reglas de ofertas, tratamiento al aceptar reparación y criterios de revisión por técnico.

## Búsqueda de órdenes

Solicitado: un campo que encuentre número de orden, nombre, teléfono y detalle de equipo/falla. Conservar filtros y permisos actuales; ignorar tildes y separadores de teléfono. Código inspeccionado sólo buscaba nombre/número. Cualquier cambio posterior debe ser mínimo, sin refactorizar el monolito.

## Estado al detener implementación

- Clientes/Inbox: cambios locales iniciados; pruebas parciales aprobadas, últimos ajustes de interacción pendientes de validación. No publicados.
- Mantenimiento: cambios locales iniciados en avisos, fechas y UI; pruebas parciales, revisión final pendiente. No publicados ni cron activado.
- IA: causa de botones comprobada en ensayo local (panel abierto conserva atributo inert); manejo nativo de Atrás no cierra IA. Corrección pendiente.
- Piezas: auditoría y propuesta documentadas; sin implementación nueva.
- Taller: lectura parcial y requisitos registrados; sin implementación nueva.
- Solo chequeo: sólo lectura y propuesta en este plan.
- Samsung: última comprobación USB sin dispositivo conectado; no nueva APK instalada en esta pasada.

## Calendarios públicos — planificación, no implementación

Solicitud de Jorge: revisar si cada técnico puede tener enlace propio para captar clientes y recibir las solicitudes asociadas.

Lectura comprobada del código local: Calendarios.tsx permite asignar calendario a una persona activa, configurar días/horas y copiar /cita/{id}. CitaPublica.tsx comunica que la cita requiere confirmación. El backend local guarda calendarioId y asignadoId/asignadoNombre en citas_por_confirmar; no prueba asignación automática de una orden al técnico. Citas.tsx no consume asignadoId directamente en las referencias inspeccionadas. No se verificó despliegue ni se creó calendario real.

Propuesta: enlace por técnico con atribución de origen, solicitud visible para oficina y técnico referido, validación de disponibilidad y confirmación de oficina antes de crear/asignar la orden. Evitar citas solapadas, mantener empresa como titular de la atención y resolver personal.id frente a auth.uid. Diferenciar captación (quién trajo cliente) de técnico asignado a visita, pues puede haber sustitución. Por decidir con Jorge: confirmación de oficina o reserva directa; disponibilidad real, cobertura de ausencias y relación con equipo responsable existente.

## Estado exacto de pruebas al detener

Tester informa fallo visual al pulsar regreso Clientes: una capa intercepta eventos. Última corrección declarativa de inert posterior no validada. No declarar cerrado. Búsqueda Órdenes tiene únicamente PRECHANGE, cero cambios de código. IA conserva diagnóstico sin implementación nueva. Ninguno de estos estados autoriza publicación.

## Cotizaciones — contraste de integración (solo lectura)

Jorge pide conservar cotizaciones externas sin orden y verificar continuidad con diagnóstico/presupuesto técnico. No autorización para implementar en esta pasada.

Hechos del código local:
- Cotizaciones.tsx:294–347 admite cotización independiente; cuando se genera desde orden guarda ordenId en cotización y cotizacionId en orden en un batch.
- OrdenDetalle.tsx:1582–1619 ofrece Generar cotización en fases en_cotizacion/aprobado; pasa cliente/equipo/técnico. Abrir cotización vinculada navega al listado general, no a esa cotización específica.
- Cotizaciones.tsx:214–230 precarga identidad, pero items comienza vacío; no incorpora automáticamente el precio sugerido ni el diagnóstico en el documento comercial.
- TecnicoVista.tsx:465–514 guarda precioSugerido y avanza diagnóstico a en_cotizacion; después notifica a oficina. Este paso no crea el documento cotizaciones.
- OrdenDetalle.tsx:167–205 aprueba precio en la orden y avanza fase a aprobado.
- Cotizaciones.tsx:376–379 cambia estado del documento cotización; ese handler no actualiza aprobación/precio/fase de orden. Por tanto integración parcial, no flujo único sincronizado comprobado.

Propuesta para el plan: distinguir cotización independiente y cotización de orden; abrir documento exacto desde orden y viceversa; preparar borrador desde diagnóstico/datos técnicos sin duplicación, con desglose revisado por oficina; separar aprobación interna del precio y aceptación comercial del cliente; definir qué evento habilita reparación y cómo conservar versiones/rechazos; convertir una externa aceptada a orden vinculada cuando corresponda, sin crear duplicados. Conservar controles de facturación, impuestos, comisiones y descuentos de chequeo. Probar extremo a extremo con datos ficticios antes de afirmar integración. No se verificó el comportamiento de la versión publicada.

## Pagos pendientes de confirmación — contraste de flujo (solo lectura)

El módulo no representa servicios sin pagar. PagosPendientes.tsx usa suscribirPagosPendientes; ordenes.service.ts:1354–1400 recorre órdenes no eliminadas y selecciona pagos existentes con verificado === false. Una orden sin pagos no aparece. El código no filtra exclusivamente citas terminadas ni chequeos: el criterio es verificación del pago registrado.

RegistrarPagoModal.tsx:141–157 guarda pagos nuevos con verificado:false; asocia banco/referencia o receptor de efectivo y notifica a oficina. confirmarPagoOrden (ordenes.service.ts:1266) marca pago verificado, actor/fecha y auditoría en transacción, sin registrar un segundo cobro ni cambiar por sí solo fase de orden. PagosPendientes deriva órdenes con crmGestion al componente de gestión; ese camino requiere auditoría separada para confirmar paridad. CierreServicioWizard.tsx:519–536 lleva trabajo a trabajo_realizado; en ese archivo no se identificó registro de pago. Finalizar trabajo y cobrar son acciones distintas.

Para el plan: separar claramente saldos por cobrar (chequeo/reparación no pagados o parciales), pagos registrados por verificar, y pagos confirmados. Enlazar orden, cliente, técnico, concepto, importe exigible, registrado, verificado y saldo para evitar que «Todo al día» se interprete como ausencia de deudas. Probar chequeo sinpago, reparación sinpago, anticipo/parcial, efectivo pendiente de entrega, transferencia pendiente de verificar y duplicidad de confirmación; no asumir que trabajo realizado significa cobrado. Conservar auditoría/permisos y revisar flujo CRM además del legado. Ninguna modificación de código ni pago real efectuado.

## Conduces, garantía y evaluación — contraste de flujo (solo lectura)

Solicitud: estudiar recorrido completo técnico→oficina→conduce enviado→garantía reclamable→evaluación de cliente, con comentarios libres y valoración de empresa/equipo/técnico.

Código local observado: CierreServicioWizard registra trabajo_realizado. EnviarFacturacionButton marca enviadaAFacturacion y avisa admin/coordinadoras; habilitación actual requiere montoPagado>0, no equivale por sí sola a trabajo concluido. FacturacionPendiente filtra enviadaAFacturacion=true, !facturada y !eliminada. Por tanto no entran automáticamente todas las órdenes culminadas. ProcesarFacturacionModal valida pagos sin verificar, genera documento y garantía cuando se configura duración, cierra fase; ofrece acción abrir WhatsApp con mensaje/enlace. Emisión no prueba entrega al cliente y este CTA usa WhatsApp externo. GarantiaCliente tiene consulta y formulario de reclamo. PortalCliente muestra evaluación sólo cerrado y habilitado; EvaluacionServicio local incluye puntualidad/trato/claridad/calidad (1–5), comentario opcional hasta500 caracteres. Feedback administrativo existente aún se orienta a NPS (0–10/promotor/pasivo/detractor), por lo que falta contrastar compatibilidad completa entre evaluación nueva y tablero. No afirmar valoraciones separadas de empresa/equipo/técnico ya implementadas ni publicación.

Plan: definir responsable de revisión y emisión por permiso; conectar expediente diagnóstico/evidencia/cierre/pagos al conduce; distinguir listo para revisar, emitido, enviado y entrega fallida con evidencia de envío. Enlace de garantía y evaluación accesibles al cliente; reclamo con responsable y seguimiento. Acordar dimensiones de evaluación empresa, atención/oficina y técnico, comentario libre opcional y atención humana de experiencias negativas. Probar recorrido íntegro con datos ficticios, cobro parcial, solo chequeo y garantía sin duplicar documentos/pagos/avisos. Mantener aprobación financiera y cobertura/duración de garantía explícitas. Solo documentación, sin implementación.

## Conduces de Garantía — nombre y resumen por período

Decisión explícita de Jorge: este software emite Conduces de Garantía; facturación fiscal/comprobantes se gestiona en otro software y queda fuera de este alcance. Corregir textos visibles que aún dicen facturas/facturación donde se refieren al conduce; no renombrar colecciones ni alterar datos por esa decisión visual.

Solicitud: Hoy, año completo o rango personalizado deben mostrar dinero cobrado en ese período y conduces que lo respaldan. Lectura Facturas.tsx:124–154: estadísticas calculadas sobre facturas completas y yearSelected, independientes de facturasFiltradas; total anual suma total de documentos estado pagada por fechaPago. Esto no demuestra cobros reales de cada período cuando hay anticipos o pagos parciales.

Plan propuesto: período compartido por resumen y detalle, cobros por fecha del pago individual, abonos contados una sola vez y vinculados a orden/conduce; distinguir importe emitido, cobrado registrado, cobrado confirmado y saldo. Evitar sumar total de documento y sus pagos a la vez. Mostrar anticipos sin conduce como pendientes de documentar, no excluirlos silenciosamente ni fabricar documentos. Definir neto/devoluciones y fecha usada explícitamente; ejemplo: conduce emitido en enero con abono en febrero debe mostrar sólo ese abono en cobros de febrero y permitir abrir el conduce original. Resumen y evidencia deben reconciliar. Solo planificación, sin implementación.

## Cierre del día — resumen financiero y operativo detallado

Solicitud de Jorge: pequeño estado de resultados diario, órdenes cerradas identificables, solo chequeos con detalle, dinero y anomalías para revisión. Sigue solo planificación.

Lectura CierreDia.tsx:93–156: ya cuenta órdenes cerrado/trabajo_realizado y soloChequeo; cobros suman pagos verificados por fecha de pago; transferencias por banco siguen ese criterio. Efectivo legado usa precios de órdenes cerradas (no los pagos individuales), mientras RendicionEfectivo recibe todas las órdenes. Alertas se calculan sobre todas las órdenes, no exclusivamente fecha seleccionada. Pantalla lista órdenes activas, pero las cifras de cerradas/chequeos no tienen lista equivalente identificable. No calcula gastos/costos ni utilidad en este archivo. El cierre guarda totales y IDs activos, no un desglose completo e inmutable de movimientos de respaldo. Son hallazgos estáticos, sin operación de cierre ni datos reales modificados.

Plan: resumen operativo (trabajos realizados, cierre administrativo, solo chequeo, cancelaciones y pendientes) con apertura de cada orden, cliente, técnico, motivo y seguimiento. Resumen financiero por fecha RD con cobros registrados/confirmados, efectivo recibido/pendiente rendir, transferencias, abonos, devoluciones y saldos pendientes. Unificar fuente de pagos y no duplicar ingresos entre órdenes/conduces/caja. Separar flujo de caja (cobros menos salidas) de resultado del servicio (ingresos atribuibles menos costos/gastos); no llamar utilidad a caja disponible. Definir reconocimiento de costos, piezas y comisiones antes de implementar resultado estimado.

Anomalías propuestas: pago pendiente de verificar, diferencia efectivo, trabajo realizado sin revisión/conduce, cobro sin vínculo, saldo sin seguimiento y chequeos pendientes de gestión. Casos para revisión humana con evidencia y responsable; no pruebas de fraude por sí mismos. Mostrar pendientes heredados identificados aparte de eventos del día. Cerrar día debe conservar detalle que respalda cifras, actor/fecha, pendientes aceptados y trazabilidad de correcciones posteriores; evitar duplicar cierres. Renombrar texto visible Facturas emitidas a Conduces emitidos. Todo pendiente de aprobación de plan y QA contable antes de construcción.

## Gastos e Ingresos — integración transversal solicitada

Jorge pide organizar todos los módulos contables y conectarlos entre sí y con operación/órdenes. Es requisito general del plan, no autorización para reanudar implementación.

Contraste acotado: Gastos.tsx:55–97 lee pagos confirmados de órdenes y gastos de colección gastos para mes/semanas. Alta manual de gasto:105–113 guarda fecha/categoría/descripción/monto/método; no guarda ordenId ni referencia al documento origen. Por tanto ya existe conexión de ingresos con órdenes, pero el formulario de gasto inspeccionado no permite atribuir directamente una pieza/costo a un servicio. No se ha auditado aún toda la cadena de nómina/bancos/comisiones; no afirmar desconexión global sin esa revisión.

Plan maestro: mapear origen único de cada cobro/gasto, vínculo a orden/conduce/proveedor/técnico cuando aplique, actor, fecha y comprobante. Gastos generales deben seguir siendo posibles sin orden. Revisar repuestos, inventario, comisiones, nómina, anticipos/préstamos, bancos, caja, anulaciones/devoluciones para evitar duplicación o clasificación incorrecta. Estados de trabajo, cobro, verificación y documento permanecen diferenciados aunque conectados. Reportes diario/porperíodo deben usar mismas reglas de fecha y conciliación, con acceso desde cada total a sus movimientos fuente. Registrar pago una sola vez; confirmación no crea otro ingreso; emitir conduce no crea segundo cobro; costo pieza no sumarse otra vez al registrarse gasto/compra. Flujo de caja y resultado económico deben quedar etiquetados por separado. Definir responsable y evento que actualiza cada módulo, y probar recorrido íntegro con datos ficticios antes de implementar o publicar.

## Bancos — historial por cuenta y período opcional

Solicitud confirmada: abrir banco/cuenta y consultar historial completo por defecto; filtro Desde/Hasta opcional para consultar transferencias del período y las confirmadas. No imponer rango inicial. Mostrar importes y detalle de respaldo según selección. Mantener separación entre cuentas del mismo banco.

Lectura: Bancos.tsx ofrece catálogo y acciones crear/editar/activar/eliminar, sin vista de movimientos identificada. RegistrarPagoModal.tsx:130–137 ya guarda bancoId/bancoNombre y referencia en pagos por transferencia/tarjeta. Usar identidad de cuenta, no agrupar sólo por nombre comercial; conservar pagos históricos aunque cuenta se desactive.

Plan propuesto: listado por cuenta de pagos registrados, estado confirmado/por verificar, fecha del pago y fecha de verificación, cliente/orden/conduce/referencia/monto y actor de confirmación. Totales y número de movimientos según filtros; abrir origen sin duplicar ingreso. Historial completo accesible con paginación, sin recorte silencioso. Aclarar criterio temporal: transferido/registrado durante período no equivale a confirmado durante período; ofrecer selección explícita de fecha de pago o confirmación y etiquetas coherentes. La frase de Jorge permite ambos, no atribuir elección definitiva aún. Sin conexión bancaria automática comprobada: historial se basa en registros del software, no constituye extracto bancario ni saldo disponible. Corregir tabla móvil cortada. Ningún cambio de código.

## Estado de Resultados — integración, períodos y comparativas

Solicitud confirmada: conectado con actividad diaria/documentos/costos y otros módulos, seleccionable por mes o Desde/Hasta, gráficos comparativos y proyección. Continúa exclusivamente el plan.

Contraste estático EstadoResultado.tsx:43–138: calcula por mes, compara mes anterior; lee documentos de facturas (conduces) por fechaEmision, excluye anuladas; costoPiezas de esos documentos; gastos por fecha; comisiones por fechaCobro; sueldos del personal actualmente activo y bonos/asistencia desde liquidaciones. No es cálculo de cobros confirmados. Hay integración parcial existente, no fuentes aisladas por completo. Riesgos concretos para auditoría contable: Math.max(0, ventasNetas-costoPiezas) impide reflejar pérdida bruta; sueldo histórico se deriva de personal actual; gasto categoría repuestos puede duplicar costoPiezas si mismo movimiento se registra en ambos; fecha comisión faltante cae a hoy. No se ha demostrado duplicación en datos reales ni validado todos importes de captura.

Propuesta: selección común Hoy/mes/año/rango, gráficos ingreso/costo/gasto/resultado y evolución; comparar período anterior de duración equivalente o mismo período año previo, con fechas visibles y tratamiento explícito de períodos incompletos. Acceso de cada cifra al detalle origen. Distinguir resultado económico de cobros/caja y aplicar reglas coherentes sin sumar dos veces documentos y pagos. Nómina por período respaldada por liquidaciones/historial, no asumir mes completo en rango parcial. Mostrar pérdidas reales sin recorte a cero y datos incompletos como pendientes, no ceros. Proyección separada y etiquetada como estimación, con método/supuestos y datos disponibles, nunca como ingreso realizado. Mantener nombre Conduces de Garantía, fiscal externo. Ninguna edición de código ni operación financiera.

## Reporte avanzado — valoración del cliente por técnico y atención

Solicitud de Jorge: incorporar feedback del cliente sobre técnico y secretaria/operaria/equipo de atención, junto al rendimiento operativo. Solo plan.

Lectura ReporteAvanzado.tsx:122–137: porcentaje actual es órdenes trabajo_realizado/cerrado dividido entre órdenes atribuidas al técnico; no es satisfacción. No se encontraron referencias feedback/evaluacion en esa página. EvaluacionServicio existente pregunta puntualidad, trato, claridad y calidad de trabajo, sin separar explícitamente destinatario técnico/oficina/empresa; no atribuir una respuesta general a una secretaria individual.

Propuesta: secciones separadas rendimiento operativo y experiencia del cliente. Filtros fecha, técnico, equipo de atención y persona cuando la evaluación lo permita; promedio por dimensión, cantidad de respuestas, cobertura (respuestas/servicios elegibles), evolución y comparación equivalente. Comentarios libres vinculados a orden con permisos adecuados y seguimiento responsable ante insatisfacción. Capturar identidad histórica del técnico/equipo que atendió ese servicio y transferencias relevantes, no asignar la calificación al responsable actual por defecto ni por nombre ambiguo. Evaluación de empresa separada de personal. Mostrar sin evaluaciones cuando no hay respuestas, no cero; muestras pequeñas claramente indicadas. No inferir culpabilidad o fraude a partir de puntuación. Definir encuesta/atribución antes de construir gráficos, no fabricar métricas retroactivas. No código modificado.

## Nómina — períodos legibles y desglose

Jorge pide nómina intuitiva y detallada; Q1/Q2 y códigos YYYY-MM-Qn son confusos. Solo planificación.

Contraste rangoQuincena en src/utils/comisiones.ts:184–207: Q2 septiembre2026 corresponde15–29septiembre, no16–30. Q1 abarca30 del mes anterior hasta14 actual (excepción febrero documentada). No cambiar cortes ni cálculos para mejorar etiquetas. Mostrar fechas calculadas del período y fecha de pago separada, verificada contra configuración/política antes de presentarla como comprometida.

Propuesta: selector por mes/año con opciones «Del 15 al 29 de septiembre de 2026» y rangos reales equivalentes; cabecera período y estado claro. Cambiar Generar liquidación por texto comprensible como Preparar nómina, explicando que calcula un borrador y no ejecuta pago. Por empleado: sueldo base, comisiones enlazadas a órdenes, bonos, avances/préstamos, ajustes de asistencia y otros descuentos, total neto y detalle de respaldo. Distinguir cálculo abierto, revisión/cierre y pago efectivamente registrado; no etiquetar cerrada como pagada automáticamente. Resumen número de empleados y total, historial consultable, acciones móviles claras. No modificar fórmulas, cortes, políticas ni transferir dinero en esta fase.

## Comisiones y garantías — prioridad financiera

Jorge señala cálculo de comisión y descuentos por garantías como foco de mayor riesgo de dinero. Revisar pendientes, justificación, responsable, aprobación y aplicación única, enlazados a orden original, garantía, técnico y nómina. No autoriza aplicar descuentos en esta fase.

Contraste estático: RevisionGarantias.tsx presenta revisión humana del 10% del costo de piezas; regla existente por validar, no política recién confirmada por Jorge. Consulta acotada a100 garantías con aviso de cobertura parcial. planificarAjusteGarantia en src/utils/ajusteGarantia.ts valida historial, evita repetir el mismo evento, rechaza importes modificados tras aplicación y comisiones liquidadas/anuladas. Estas protecciones no constituyen auditoría completa de todos los caminos ni verificación de datos reales.

Plan: desglose reproducible de base, piezas, porcentaje, reparto entre técnicos, ajustes y neto; historial de reglas/porcentajes utilizados; garantías pendientes visibles con evidencia y aprobación. Probar duplicados, concurrencia, abonos, anulaciones, devolución, garantía posterior a nómina cerrada y correcciones sin alterar silenciosamente períodos liquidados. Ningún cálculo cambiado ni descuento aplicado.

## Avances y préstamos a empleados — distinción e integración

Confirmación de Jorge: préstamo es deuda a recuperar mediante cuotas a lo largo del tiempo y debe distinguirse del avance. Ambos son prioridad de control y deben conectarse con nómina, comisiones y contabilidad. Mantener conceptos separados en textos, saldos e historial; falta confirmar política exacta de recuperación de avances.

Contraste estático: existen servicios y colecciones separados para avances y prestamos_empleados. nomina.service.ts incorpora avances de la quincena y cuotas previstas de préstamos; preparar nómina no persiste esas cuotas. Al cerrar marca avances mediante transacción y aplica cuotas con vínculo a liquidación; hay prevención de repetición por préstamo/liquidación. Riesgo concreto: llamada aplicarCuota captura errores con console.error y permite continuar flujo de cierre; revisar consistencia ante fallo parcial antes de dar integración por validada. No se han operado cierres ni comprobado saldos reales.

Plan: ficha de empleado con monto entregado, evidencia de desembolso, calendario de cuotas, descuentos efectivamente aplicados, saldo e historial vinculado a cada nómina. Mostrar comisión generada y deducciones separadas para evitar descontar la misma deuda de comisión y nuevamente del neto. Validar cuota final, insuficiencia de neto, inicio de descuentos, reprogramaciones, pagos externos, cancelaciones y reintentos; registrar decisiones y autorizaciones. Cierre no debe declararse completo si queda aplicación financiera fallida sin resolver. Conciliar desembolso/recuperación con caja o banco y evitar contabilizar dos veces el mismo movimiento. Son requisitos y riesgos para auditoría, no cambios ejecutados.

## Personal — ficha integrada y organización comprensible

Jorge solicita revisar Personal para hacerlo fácil y conectado con los demás módulos, permitiendo entender la situación de los empleados. Solo plan, sin cambios operativos.

Contraste acotado: PersonalPage.tsx gestiona sueldo base, porcentaje de comisión, rol, cuenta de acceso y asignación de técnicos a operaria. GruposOperariaTecnico.tsx muestra grupos como tarjetas informativas sin acciones; no representa en ese componente la pareja operaria-secretaria acordada. Existen referencias a órdenes activas y reasignación en la gestión de personal: no afirmar que esté aislado. El aviso de siete personas sin acceso procede de la captura, no de consulta actual de cuentas.

Propuesta: ficha por empleado con resumen y accesos a equipo/responsable/cobertura temporal, órdenes y agenda, asistencia, nómina, comisiones, ajustes de garantía, avances, préstamos y evaluaciones de clientes. Mostrar pendientes concretos y abrir registros originales; no copiar saldos ni generar movimientos nuevos desde un resumen. Organigrama debe representar operaria líder + secretaria y técnicos coordinados, preservando historial de asignaciones. Separar ficha laboral, cuenta de acceso y permisos; aviso de acceso pendiente con acción clara, sin crear cuentas automáticamente. Información financiera y evaluaciones limitadas según rol. Cambios de sueldo, porcentaje, equipo o baja deben conservar vigencias e historial para no recalcular retrospectivamente nóminas ni borrar evidencia. Auditoría de relaciones por identificadores antes de implementar; no cambiar permisos ni datos en esta fase.

## Personal, accesos y ponches — unificación de navegación solicitada

Jorge pide reunir gestión de empleados, usuarios/permisos y ponches para simplificar el software. Refina la propuesta anterior: entrada común Personal con secciones Empleados y equipos, Asistencia y ponches, Accesos y permisos; ficha individual con enlaces a nómina y movimientos correspondientes. Evitar duplicar altas y obligar a saltar entre módulos para gestionar la misma persona.

La captura de Gestión de Accesos remite a Personal para crear cuentas; es evidencia de navegación fragmentada, no prueba de que todas las cuentas estén correctamente vinculadas. Auditar relación empleado/cuenta por identificadores y casos sin cuenta antes de consolidar interfaz. El texto visible excluye ayudantes del alta automática; contrastarlo con comportamiento actual y necesidades de ponche antes de mantener esa afirmación.

Unificar interfaz conservando controles de autorización independientes para datos laborales, asistencia, finanzas y permisos. Cada rol verá las secciones permitidas. Mantener acceso rápido a Mi ponche para el empleado sin exponer administración de personal. Suspensión de acceso, baja laboral y conservación del historial requieren acciones claras y trazables; reunir módulos no debe eliminar registros ni conceder permisos automáticamente. Registrar como cambio de arquitectura de navegación para revisar en el plan global; sin código ni permisos modificados.

## Reporte de Ponches — revisión e integración con Personal y nómina

Jorge pide revisar y optimizar este módulo e integrarlo al conjunto. Ubicarlo en Personal → Asistencia, con acceso desde ficha individual y Mi ponche. Mantener filtros de fecha y empleado, resumen claro de entradas/salidas, incidencias y registros incompletos; revisar legibilidad móvil y exportación del mismo período filtrado.

Lectura acotada de RevisionAsistencia.tsx: existe consulta por rango a /api/asistencia, revisión con motivo, estados y vínculo liquidacionId; la interfaz distingue aprobación de aplicación a nómina. No equivale a integración completa probada. Auditar extremo a extremo permisos, atribución empleado/cuenta, horarios, zona horaria, calendario, ausencias justificadas y correcciones. Ponche faltante debe presentarse como incidencia por revisar, sin asumir ausencia confirmada. Mantener registro original y trazabilidad de correcciones/actor/fecha. Cualquier descuento debe tener respaldo, aprobación y aplicación única a la nómina correcta; revisar duplicación con descuentos manuales, reintentos y períodos cerrados. Conectar disponibilidad con agenda/equipos cuando corresponda sin cancelar o reasignar citas por una ausencia de ponche. Requisito de plan; ninguna asistencia, nómina ni permiso modificados.

## Rendimiento / KPIs — coherencia de indicadores e integración

Jorge pide optimizar e interconectar este módulo. Integrar indicadores con órdenes, atención/Inbox, personal/equipos y reportes financieros según cada definición; alinear con Reporte avanzado para evitar cifras contradictorias. Plan únicamente.

Hallazgos estáticos Rendimiento.tsx: consulta órdenes, personal y documentos facturas. Período principal filtra createdAt de orden; Resp. Promedio mide intervalo nuevo_lead→en_gestion, no primera respuesta WhatsApp. Nuevos clientes se infiere de primeras órdenes, no altas de clientes. Completadas semana/mes usa updatedAt de cerrado fuera del filtro principal. Agrupa responsables/técnicos por nombre; monto por técnico enlaza documento a primera orden con número coincidente O nombre de cliente y suma documentos pagados sin filtro de período en ese bloque. Riesgos de atribución y coherencia temporal; no comprobación de importes reales.

Plan: definir fórmula, fuente y fecha de cada indicador; distinguir cohortes de órdenes creadas de eventos ocurridos en período. Vínculos exactos por IDs y atribución histórica. Cada cifra abre registros de respaldo; filtros comunes por rango, equipo y persona, comparativas equivalentes. Separar confirmación, ejecución, cobro y satisfacción; respuesta IA/humana diferenciadas si se incorpora Inbox. Datos insuficientes como sin datos y cantidad de muestras, no cero ficticio. Incluir calidad/garantías/solo chequeo y feedback ya solicitado sin duplicar cuadros de Reporte avanzado ni inferir fraude por métricas aisladas. Ninguna fórmula modificada.

## Métricas del Mes — resumen integral del negocio

Jorge solicita rendimiento mensual de todo el negocio: asistencia, gastos y demás detalle, no limitarlo a nómina/bonos. Lectura acotada de MetricasMensuales.tsx: suscribe órdenes, personal y comisiones; énfasis en proyección de nómina y bonos por rendimiento. Sueldos del mes y comparación previa utilizan personal activo actual, punto por auditar para históricos. No se verificó como tablero integral actual.

Plan: resumen ejecutivo mensual con secciones Finanzas (conduces emitidos, cobros confirmados, pendientes, costos, gastos y resultado), Operación (órdenes, terminadas, canceladas, reprogramadas, solo chequeos, garantías, piezas y taller), Clientes/Atención (altas, atención, tiempos y satisfacción) y Personal (asistencia, nómina, comisiones, bonos, avances y préstamos). Apertura de cada cifra a registros fuente, filtros mes/año y comparativas equivalentes; evolución gráfica y alertas accionables. Separar resultados reales de proyecciones y nómina proyectada de liquidada/pagada. No sumar cartera de préstamos como gasto ni confundir emisión con cobro; fórmulas y reconocimiento deberán validarse en auditoría global. Usar mismas definiciones que Estado de Resultados, Rendimiento, Reporte avanzado y cierre diario. Mes histórico debe conservar atribuciones y valores históricos; mes en curso etiquetado incompleto. Datos ausentes no deben aparecer como cero confirmado. Pendiente de diseño y auditoría, sin cambios de código.

## Marketing y seguimiento — estructura orientada a resultados del negocio

Jorge pide actualizar, optimizar y estructurar el módulo. Continúa recopilación de plan, sin campañas ni envíos autorizados en esta fase.

Contraste MarketingIntegrado.tsx: accesos a Inbox, Clientes y Conocimiento; consulta manual de resumen Meta con inversión, impresiones y clics, período visible últimos30días y aviso de parcialidad. La propia página indica atribución a órdenes/pagos pendiente e Instagram/Messenger pendientes de habilitación/pruebas. Lectura de código no confirma conexión Meta operativa ni resultados reales.

Propuesta para revisar: secciones Campañas y origen de consultas, Seguimientos pendientes, Reactivación y mantenimiento, Resultados. Conectar consulta→cliente→equipo responsable→cita→orden→cobro mediante identificadores y evidencia de origen; atribución desconocida explícita, no asumir que un clic produjo venta. Seguimientos con motivo, próxima fecha, responsable, historial y acceso a Inbox; integrar solo chequeo, cotizaciones pendientes y mantenimientos sin duplicar tareas ni mensajes entre módulos. Segmentación por servicio/equipo e historial cuando corresponda. Preparar campañas/plantillas y destinatarios revisables, respetar preferencias de contacto, exclusiones y frecuencia; envíos como acción explícita separada. Medir consultas, citas, servicios completados, cobros atribuibles y gasto por período con misma fuente contable, sin duplicar importación de gasto publicitario. Comparativas, moneda y cobertura visibles; retorno solo con atribución/costos suficientes. Conocimiento del equipo puede mantenerse como acceso auxiliar sin dominar estructura de marketing. Ninguna edición productiva ni envío realizado.

## Resto de módulos y reiteración de bloqueo del asistente

Jorge amplía revisión a Feedbacks, Página web, Formulario, Plantillas de marketing, Precios de servicio, Inventario, Conocimiento acumulado del negocio y Asistente IA/chat a pantalla completa. Reitera que al abrir IA desde botón no puede salir. Mantener fase de planificación; no inferir autorización de construcción.

Alcance propuesto de auditoría: Feedbacks enlazados a servicio, equipo y reportes; web/formulario enlazados a consulta/cliente y seguimiento sin duplicados; plantillas vinculadas a campañas/Inbox y revisión antes de envío; precios consistentes con cotizaciones/órdenes, conservando valores históricos; inventario conectado a piezas, compras, consumo/devolución por orden y costos; conocimiento con fuente, vigencia, revisión humana y permisos para su uso por asistente. Estos son puntos por verificar, no integraciones demostradas.

Prioridad de usabilidad: bloqueo de salida de IA ya registrado y reproducido localmente en revisión anterior. Criterios de aceptación futuros: flecha discreta y clara para volver, cerrar y minimizar funcionales, botón/gesto Atrás Android cierra primero asistente, retorno al módulo y posición anteriores, conversación conservada, ausencia de pulsaciones que atraviesen panel hacia selector de módulos; validar también pantalla completa, teclado abierto y reapertura en Samsung físico. No marcar corregido con esta documentación. Coordinar con expediente docs/qa/2026-09-29-ia-cierre-prechange.md y tareas previas, evitando duplicar incidencia.
