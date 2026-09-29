# Plan maestro de mejora — Mister Service

29 de septiembre de 2026 · Para revisión de Jorge

## 1. Objetivo y alcance

Que el software permita seguir cada cliente, trabajo y movimiento de dinero de principio a fin, con una interfaz clara en web y Samsung. Reúne las observaciones enviadas por Jorge y el contraste acotado del código registrado en [el expediente de hallazgos](2026-09-29-alcance-correcciones-movil.md).

**Estado: planificación.** Este documento no certifica que los problemas estén corregidos ni autoriza nuevos despliegues, envíos o descuentos. Los cambios locales iniciados antes de la aclaración de alcance permanecen conservados y requieren revisión. La auditoría realizada es parcial; cada etapa empezará comprobando el comportamiento actual y las rutas alternativas del sistema.

## 2. Prioridades y orden de ejecución propuesto

| Etapa | Resultado esperado | Dependencia / condición de salida |
|---|---|---|
| 0. Inventario y reglas | Mapa de módulos, fuentes, relaciones y reglas de negocio; separar publicado, cambios locales y pendientes | Casos y fuentes identificados; decisiones financieras pendientes documentadas |
| 1. Bloqueos de uso | Salir de IA, navegar sin golpes, buscar órdenes, registrar cliente sin orden | Pruebas web y Samsung físico; conservación de conversación y datos |
| 2. Flujo del servicio | Cliente → solicitud → orden → diagnóstico → cotización → ejecución → cierre técnico | Vínculos exactos, responsables y transiciones verificadas; ramas piezas/taller/chequeo cubiertas |
| 3. Control del dinero | Cobros, conduces, gastos, bancos, comisiones, garantías, avances, préstamos y nómina conciliados | Sin duplicados ni cierres financieros incompletos; revisión independiente |
| 4. Personal y atención | Personal, accesos, asistencia, equipos y seguimiento organizados | Permisos por rol, historial y traspasos comprobados |
| 5. Informes coherentes | Cierre diario, resultados, KPIs y resumen mensual con cifras rastreables | Mismo período y definición producen los mismos totales entre módulos |
| 6. Captación y conocimiento | Marketing, web, formularios, calendarios y asistente conectados al servicio | Solicitudes atribuibles, mensajes revisables, presupuesto y traspaso humano comprobados |
| 7. Entrega | Recorrido completo, revisión visual y APK candidata | Validación integral antes de publicación e instalación final |

La investigación de riesgos de dinero comienza en la etapa 0. No se espera al rediseño para identificar errores, pero tampoco se cambian fórmulas sin reglas y pruebas. La construcción posterior se organizará en entregas pequeñas verificables; no habrá una modificación masiva sin comprobar cada tramo.

## 3. Reglas comunes para toda la aplicación

- Cliente, empleado, equipo, orden, pago y documento deben relacionarse por identificadores estables; evitar coincidencias de nombres como vínculo.
- Registrar una operación una sola vez. Los demás módulos consultan ese registro y permiten abrirlo.
- Diferenciar estado del trabajo, aceptación del cliente, cobro, verificación del pago, emisión/envío del conduce y pago de nómina.
- Automatizar transiciones por hechos verificables. Llegada de una pieza genera aviso; no confirma por sí sola una visita. Terminar un trabajo no significa que esté cobrado.
- Guardar actor, fecha, motivo y respaldo de ajustes. Conservar valores históricos aunque cambie el equipo, sueldo o porcentaje actual.
- Filtros de fecha consistentes con horario de República Dominicana; explicar si se filtra por fecha del servicio, pago, confirmación o emisión.
- Información faltante se muestra como pendiente o sin datos. Cada total debe abrir su detalle y señalar cobertura parcial.
- Acceso por rol en interfaz y servidor. Unificar pantallas no amplía permisos.

## 4. Plan por área

### A. Navegación, IA y experiencia móvil — prioridad inmediata

**Problema:** el asistente atrapa al usuario; cerrar/minimizar/Atrás no resuelven la salida y algunos toques alcanzan controles de la pantalla inferior. Hay transiciones bruscas y controles/tablas recortados.

**Solución propuesta:** flecha pequeña y reconocible con área táctil cómoda; cerrar, minimizar y Atrás nativo con comportamiento consistente; regreso al módulo y posición anteriores, conservando conversación. Revisar pantalla completa, teclado, reapertura, capas y foco. Menú lateral izquierdo desplegable y accesos móviles comprensibles. Animaciones breves y suaves, respetando reducción de movimiento.

**Aceptación:** abrir y salir repetidamente en Samsung, sin cambiar accidentalmente de módulo, perder texto o cerrar la aplicación; formularios y tablas utilizables sin botones ocultos.

### B. Clientes, Inbox y órdenes

- Ficha editable con dirección escrita y ubicación; guardar una no debe borrar la otra.
- Dos acciones claras: WhatsApp externo y WhatsApp de la empresa dentro del Inbox. Abrir conversación/preparar mensaje no equivale a enviarlo.
- Registrar cliente sin crear orden; crear orden posteriormente desde su ficha, sin duplicar cliente.
- Buscar orden por número, nombre, teléfono, equipo y detalle de falla; tolerar tildes y formato del teléfono, conservando filtros y permisos.
- Equipo responsable persistente: operaria líder y secretaria, con cobertura temporal identificada. Nuevos clientes al equipo con menor carga de clientes en espera y órdenes activas; definir cómo evitar contar dos veces la misma solicitud y cómo resolver empates.

**Aceptación:** desde cliente, orden o Inbox se llega al mismo expediente; cambiar equipo seleccionado o abrir chat conserva datos y responsable.

### C. Trabajo técnico, cotizaciones y precios

- Mapear transiciones y responsabilidades: solicitud, gestión, cita, diagnóstico, cotización, aceptación, trabajo realizado y cierre administrativo.
- Conservar cotización independiente y cotización ligada a orden. Preparar borrador desde diagnóstico, revisar precios y enlazar documentos en ambos sentidos.
- Separar aprobación interna de precio y aceptación del cliente. Definir el evento que habilita reparación.
- Catálogo de precios coherente con formularios y cotizaciones; conservar el precio/versiones aceptados en servicios históricos.
- No aplicar etapas ficticias a casos como mantenimiento, trabajo no reparable o solo chequeo.

**Aceptación:** una cotización aceptada se refleja en la orden correcta, con importe y evidencia; no crea órdenes duplicadas ni altera trabajos anteriores.

### D. Piezas, suplidores, inventario y taller

- Pieza vinculada a orden/equipo, con descripción, referencia y foto; separar búsqueda, autorización, pedido, llegada y utilización.
- Aviso a responsable cuando llega, con acción para coordinar instalación. Mantener pendientes otras piezas del mismo trabajo.
- Directorio de suplidores y preparación de consulta con foto/detalle por WhatsApp; selección de destinatario y revisión del envío.
- Inventario: entrada, reserva, consumo, devolución y costo vinculados a la operación correspondiente. Evitar cobrar o contabilizar la misma pieza dos veces.
- Taller: Todos por defecto; recibido, diagnóstico, trabajándose, listo y descartado/no reparable; preservar entregados e historial. Abrir orden y chat desde cada equipo.

**Aceptación:** recorrer una pieza desde solicitud hasta instalación y devolución, si aplica; orden, existencias y costos permanecen conciliados.

### E. Mantenimientos, solo chequeo y calendarios públicos

- Mantenimiento ligado a cliente/equipo: próximos, hoy y vencidos; aviso interno y preparación de plantilla, orden posterior al acuerdo.
- Solo chequeo: conservar revisión técnica y añadir seguimiento comercial con responsable, fecha y resultado; acceso a orden y chat. Ofertas sujetas a reglas por definir.
- Analizar frecuencia de chequeos por técnico con contexto y evidencia; una proporción alta no prueba fraude.
- Calendario compartible por técnico con atribución de captación; distinguir quien consiguió al cliente de quien hará la visita. Propuesta: oficina confirma disponibilidad y asignación.

**Aceptación:** cada pendiente tiene responsable y siguiente acción; no se duplican recordatorios, citas ni órdenes.

### F. Cobros, bancos y conduces de garantía

- Separar cuentas por cobrar, pagos registrados por verificar y pagos confirmados. Incluir anticipos, pagos parciales, chequeos y devoluciones.
- Conduce de Garantía como nombre visible; la facturación fiscal permanece en el sistema externo indicado por Jorge.
- Revisión de oficina antes de emitir; distinguir pendiente, emitido, enviado y fallo de envío. Enlazar garantía y evaluación del servicio.
- Bancos: abrir cuenta con historial completo y filtro Desde/Hasta opcional; importe, referencia, cliente, orden, estado y fechas de pago/verificación.
- Resúmenes del período basados en movimientos reales, con documentos de respaldo. Emisión de conduce no vuelve a registrar un ingreso.

**Aceptación:** un abono y su saldo se ven igual en orden, banco, cierre e informes; confirmar dos veces el mismo pago no aumenta el cobro.

### G. Comisiones, garantías, avances, préstamos y nómina — control crítico

- Comisión explicable por orden: base, costos de piezas, porcentaje, técnicos participantes, ajustes y neto. Revisar todos los caminos de cálculo.
- Garantías pendientes con evidencia y decisión; ajuste único ligado al servicio original. El 10% encontrado en código es una regla actual por validar, no una nueva política confirmada.
- Avances separados de préstamos. Préstamos con cuotas, fecha de inicio, saldo e historial; cada recuperación enlazada a nómina o abono externo.
- Evitar descontar deuda de comisión y nuevamente del neto. Validar neto insuficiente, última cuota, reprogramación y corrección de períodos cerrados.
- Nómina con fechas legibles en lugar de Q1/Q2; conservar los cortes reales hasta confirmar cualquier cambio. Mostrar sueldo, comisiones, bonos, descuentos y neto, con respaldo.
- Separar preparar, revisar/cerrar y registrar pago. No permitir cierre exitoso si falló aplicar una cuota o comisión; reintentar sin duplicar operaciones.

**Aceptación:** escenarios de pago parcial, doble clic, dos usuarios simultáneos y fallo de conexión mantienen saldos consistentes. Una nómina cerrada conserva sus valores y cualquier corrección deja rastro.

### H. Personal, permisos y ponches

- Una entrada Personal con Empleados y equipos, Asistencia y ponches, Accesos y permisos.
- Ficha integral con vínculos a agenda, órdenes, desempeño, nómina, comisiones y deudas; cada sección según permisos.
- Mi ponche como acceso directo del empleado. Distinguir incidencia de asistencia, justificación, aprobación y aplicación a nómina.
- Baja laboral, suspensión de acceso y reasignación con efectos explícitos e historial conservado.

**Aceptación:** cuenta y empleado correctamente vinculados; un ponche faltante no genera automáticamente una ausencia confirmada ni descuento; no se exponen datos financieros a roles sin permiso.

### I. Cierre diario, resultados, rendimiento e informes

| Pantalla | Función propuesta |
|---|---|
| Cierre del día | Trabajo del día, cobros/salidas, documentos, chequeos y anomalías con listas de respaldo |
| Estado de Resultados | Ingresos, costos, gastos y resultado por mes/año/rango; caja diferenciada de resultado |
| Rendimiento / KPIs | Indicadores operativos por equipo/persona, definición y detalle consultables |
| Reporte avanzado | Comparaciones, tendencias y calidad del servicio con número de evaluaciones |
| Métricas del Mes | Resumen integral financiero, operativo, comercial y de personal |

Unificar las fuentes y fórmulas compartidas. Revisar fechas, históricos salariales, costos duplicados, pérdida bruta recortada a cero y atribución por nombres identificados en las lecturas. Mostrar proyecciones separadas de resultados reales; comparar períodos equivalentes. Gráficos legibles y cifras navegables.

**Aceptación:** mismo período/concepto arroja el mismo total entre pantallas; diferencias legítimas tienen explicación. No inventar evaluaciones, fechas ni métricas históricas.

### J. Feedback, marketing y seguimiento

- Evaluación por servicio con dimensiones de técnico, atención y empresa, más comentario libre; atribución histórica a quienes atendieron.
- Conectar experiencias negativas con seguimiento responsable y reportes; distinguir falta de respuestas de valoración cero.
- Marketing organizado en campañas/origen, seguimientos, reactivación y resultados; vincular consulta, cliente, orden y cobro cuando haya evidencia.
- Plantillas preparadas para revisión humana, preferencias de contacto y control de repetición entre mantenimiento, chequeos y campañas.
- Medir inversión, consultas, citas y servicios/cobros atribuibles; costo publicitario registrado una sola vez.

**Aceptación:** se puede explicar qué resultado produjo una campaña sin asumir que clic equivale a venta; historial de contacto compartido evita insistencias duplicadas.

### K. Web pública, formularios, conocimiento y asistente

- Prototipo web/móvil limpio inspirado en composición y movimiento de Samsung: lavadora, estufa, nevera y aire integrados al fondo, con animación sutil y botones disponibles desde el inicio.
- Elección Reparación/Mantenimiento y equipo; imagen cambia sin perder datos. WhatsApp con símbolo reconocible y destino central confirmado +1 849 564 6767.
- Formularios conectados al mismo cliente/solicitud y equipo responsable, con protección gradual contra abuso sin bloquear navegación normal.
- Asistente de servicio breve y natural, con identificación discreta de IA; preguntas de una en una sobre servicio, equipo, falla, foto y ubicación. No bloquear conversación por datos faltantes; completar requisitos antes de gestionar visita.
- Fuera del horario humano confirmado (lunes–viernes 8:00–18:00; sábado 8:00–16:00), y activación administrativa diurna. Filtra y recoge datos; no confirma precios/citas. Pasa a humano al terminar o cuando se solicite y se pausa al tomarlo una persona.
- Límites aceptados como punto de partida:15 respuestas por cliente/24h, US$5 diarios y US$50 mensuales, aviso al80%. Administración puede ampliar presupuesto con registro; protección contra abuso permanece. Verificar coste real y definir cómputo antes de implementar.
- Conocimiento con fuente, versión, vigencia y revisión humana; mejoras propuestas a partir de conversaciones, sin cambiar automáticamente reglas, permisos ni presupuestos.

**Aceptación:** demostración aprobable en web/móvil y pruebas ficticias de traspaso, presupuesto agotado, duplicados y contexto por cliente. No mezclar conocimiento privado entre clientes.

## 5. Decisiones que faltan antes de construir las partes dependientes

1. Reglas exactas de comisión, garantías, bonos, avances, insuficiencia de neto y fechas de nómina. Documentar las existentes y contrastarlas con Jorge.
2. Línea de WhatsApp para suplidores: central o compras; contactos y plantillas habilitadas.
3. Antelación del mantenimiento y periodicidad del seguimiento comercial; quién lo recibe y cuándo escala.
4. Calendario por técnico: confirmación de oficina o reserva directa, disponibilidad y sustituciones.
5. Reglas de descuentos/ofertas y cómo retomar reparación después de un chequeo.
6. Fechas y criterios financieros: pago frente a confirmación, emisión frente a reconocimiento del resultado; tratamiento de anticipos, devoluciones y costos.

Estas decisiones no impiden preparar navegación, casos de prueba y prototipos. No se inventarán políticas monetarias para cerrar pendientes.

## 6. Verificación y entrega

Para cada etapa: situación actual → propuesta visual/funcional → implementación acotada tras revisión del plan → pruebas → revisión independiente → registro de pendientes.

Recorridos obligatorios con datos ficticios:

1. Cliente nuevo sin orden → chat → reparación → cotización → aceptación → pieza → visita → cierre → cobro → conduce → garantía/evaluación.
2. Mantenimiento programado y cliente de solo chequeo que vuelve, sin duplicar cliente ni cobros.
3. Servicio descartado, cancelación, devolución y garantía posterior al pago de comisión.
4. Préstamo de varias cuotas + avance + comisión + asistencia; nómina con reintento/fallo parcial y pago registrado.
5. Comparación de totales entre bancos, cierre, gastos, resultados y mes; abrir todos los respaldos.
6. Roles administrativos, operaria, secretaria y técnico; web, móvil y Samsung físico, incluido Atrás del sistema y teclado.

No realizar mensajes a clientes/proveedores, descuentos, cierres ni movimientos reales como prueba. No confundir pruebas de navegador con prueba física ni compilación con aprobación funcional. Revisar cambios locales previos antes de reutilizarlos. La entrega debe indicar qué está implementado, probado, publicado e instalado y qué sigue pendiente.

## 7. Siguiente paso concreto

Revisar este plan con Jorge y resolver las reglas que bloquean cálculo financiero. Preparar mapa de relaciones y ejemplos visuales de navegación/ficha/IA. El primer lote de construcción propuesto, cuando se retome, es salida de IA, navegación móvil y alta/búsqueda de clientes y órdenes; la auditoría financiera será el primer frente de investigación.

## 8. Análisis de causas y decisiones de diseño

### Hipótesis de causa raíz que hay que contrastar

1. **Relaciones incompletas:** varias pantallas existen, pero una transición no garantiza continuidad del expediente. Ejemplo observado: cotización aceptada y aprobación de precio en orden tienen caminos separados. Revisar contratos entre módulos antes de sumar botones.
2. **Definiciones distintas de la misma cifra:** período de creación, cierre, pago y verificación se mezclan. Ejemplo observado: KPIs de completadas fuera del filtro principal. Definir primero qué pregunta responde cada indicador.
3. **Operaciones financieras parcialmente aplicadas:** el cierre de nómina puede continuar tras un error de cuota. Diseñar recuperación de fallos y una comprobación de integridad; no basta con deshabilitar doble clic.
4. **Identidad e historia frágiles:** cruces por nombre y valores actuales usados para históricos pueden distorsionar atribución. Revisar IDs, vigencias y registros huérfanos antes de cualquier migración.
5. **Navegación fragmentada:** crear empleado y gestionar acceso exige saltos; tarjetas informativas no permiten actuar. Agrupar por trabajo del usuario, manteniendo controles de permisos.
6. **Interacción móvil no validada de extremo a extremo:** capas/foco/navegación nativa pueden diferir del navegador. La salida de IA debe probarse con teclado, gestos y botón físico en la candidata final.

Estas hipótesis se apoyan en lecturas concretas, pero su extensión al resto de la aplicación aún requiere auditoría.

### Arquitectura funcional propuesta

Organizar la navegación en Atención, Servicios, Finanzas, Personal, Crecimiento y Administración, conservando accesos rápidos por rol. No implica fusionar todas las colecciones ni reescribir el sistema. Las pantallas actuarán como vistas de registros compartidos: cliente, solicitud, orden, cotización, movimiento de pago, conduce, pieza, empleado y liquidación.

Cada enlace entre módulos deberá especificar: evento que lo dispara, registro origen, responsable, permisos, resultado esperado, comportamiento al repetir, fallos posibles y procedimiento de corrección. Distinguir automáticamente creado, preparado para revisión y realmente confirmado.

### Alternativas y criterio de selección

- **Reescritura completa:** exige volver a validar todo y dificulta preservar historia; no propuesta como punto de partida.
- **Rediseño visual aislado:** mejora apariencia, pero deja fallos de cálculo y continuidad; insuficiente para este alcance.
- **Integración gradual con fuentes compartidas y pruebas por recorrido:** propuesta preferida. Reutiliza módulos que funcionan y sustituye conexiones débiles de forma verificable.

Antes de modificar datos históricos: inventario de inconsistencias, propuesta de correspondencias, simulación sin escritura y respaldo recuperable. Una migración con ambigüedad requiere resolución explícita, no emparejar nombres automáticamente.

### Riesgos que pueden detener una entrega

Cálculo financiero inconsistente; permisos que exponen o permiten cambiar datos ajenos; historial alterado; mensajes involuntarios; navegación sin salida; duplicación de pagos/órdenes/cuotas; reportes sin respaldo. Si aparece alguno, el lote queda pendiente de corregir y probar, aunque su interfaz esté terminada.

### Comparación independiente con Claude

Comparar propuestas con la misma matriz: cobertura de requisitos, causas explicadas, dependencias, protección de dinero e historia, facilidad por rol, viabilidad incremental, casos de prueba y decisiones pendientes. Identificar coincidencias y desacuerdos con evidencia. No escoger por extensión o presentación del documento. Claude debe recibir primero el prompt de contexto, sin necesitar adoptar este diseño como conclusión.
