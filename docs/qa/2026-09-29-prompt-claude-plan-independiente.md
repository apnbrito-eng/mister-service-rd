# Prompt para Claude — plan independiente de Mister Service

Actúa como arquitecto de software, analista de procesos de servicio técnico, diseñador de experiencia y auditor de integridad de datos. Necesito un análisis profundo y un plan independiente de mejora para mi aplicación Mister Service RD y su web pública. Quiero contrastar tu propuesta con otra, no que confirmes una solución predeterminada.

## Encargo y límites

Estamos recopilando problemas mediante capturas de la aplicación Android en un Samsung. **Ahora quiero planificación, no implementación.** No edites código de producción, no publiques, no envíes WhatsApp, no crees operaciones reales ni apliques descuentos. Si tienes acceso al repositorio, lee sus instrucciones y examina los flujos en modo de lectura. Si no lo tienes, distingue claramente requisitos, hipótesis y aspectos por verificar. No inventes integraciones, auditorías realizadas ni resultados de pruebas.

Analiza dependencias y causas compartidas antes de proponer mejoras aisladas. Conserva los datos e historial existentes. No confundas rediseño de pantalla con funcionamiento completo. No necesito código en tu respuesta.

## Negocio y decisiones confirmadas

Reparamos y mantenemos lavadoras, neveras, estufas, hornos, secadoras y aires acondicionados. Atendemos a domicilio y en taller, buscamos piezas con suplidores y hacemos seguimientos de clientes que posponen reparaciones.

Hay dos equipos de atención. Cada equipo tiene operaria líder que coordina lo técnico y secretaria que atiende clientes y crea citas. Pueden cubrirse temporalmente. Los técnicos son coordinados por las operarias. El cliente existente conserva su equipo; el nuevo va al equipo con menos clientes en espera y órdenes activas. Define cómo medir carga sin duplicar casos y gestionar ausencias/empates.

WhatsApp central empresarial confirmado: +1 849 564 6767, integrado al software. La asignación es interna en el Inbox. También queremos poder abrir WhatsApp externo desde una ficha. Preparar un mensaje o abrir un chat no debe enviar mensajes automáticamente.

El sistema emite **Conduces de Garantía**. La factura fiscal se hace en otro software gubernamental y queda fuera del alcance. No tratar emisión, cobro y verificación de pago como el mismo evento.

## Observaciones y necesidades por módulo

### Navegación y asistente en pantalla

Al abrir IA desde botón flotante no se puede salir correctamente: minimizar, X y Atrás nativo fallan; algunos toques abren selector de módulos detrás. Necesitamos flecha pequeña, clara y funcional, cierre/minimización y Atrás Android; volver al lugar anterior sin perder conversación. Revisar teclado y pantalla completa. Transiciones al abrir/cerrar fichas son bruscas. Queremos movimiento suave, menú lateral izquierdo desplegable y controles legibles sin tablas cortadas en móvil.

### Clientes, órdenes y atención

Crear cliente sin obligar a crear orden; luego crearla desde su ficha. Editar ubicación conservando dirección escrita. Dos opciones de contacto: WhatsApp externo e Inbox empresarial. Buscar órdenes por número, nombre, teléfono, equipo y detalle de falla. Ficha, chat y orden deben acceder al mismo expediente. Estudiar qué cambios de estado se pueden automatizar por eventos reales, con responsable y trazabilidad.

### Cotizaciones y precios

Conservar cotizaciones independientes y ligadas a órdenes. Integrar diagnóstico y presupuesto del técnico, revisión de oficina, aceptación del cliente y autorización de trabajo. Revisar catálogo de precios y preservar precios históricos. Evitar órdenes/documentos duplicados; cotización externa aceptada debe poder continuar a un servicio vinculado.

### Piezas, inventario y taller

Pendiente de pieza debe vincular orden y equipo, descripción y foto. Separar autorización, pedido y llegada; al llegar avisar al equipo para coordinar instalación. Si faltan otras piezas, conservar pendientes. Directorio de suplidores y preparación de consulta con fotos por WhatsApp de empresa. Número de compras distinto del central aún no decidido. Inventario conectado a compras, reservas, uso, devolución y costo por orden sin doble contabilización.

Taller: Todos por defecto; recibido, diagnóstico, trabajándose, listo y descartado/no reparable; conservar entrega e historial. Abrir orden y chat empresarial desde el equipo.

### Mantenimiento, solo chequeo y calendario público

Mantenimiento de cliente registrado: próximo, hoy, vencido; aviso interno y plantilla para contactar. Antelación por definir. No crear orden antes del acuerdo por mera llegada de fecha.

Solo chequeo: cliente decidió diagnosticar y posponer reparación. Necesitamos seguimiento, responsable, recordatorios, contacto, ofertas revisadas y resultados. Mantener aprobación/revisión del reporte técnico. Medir frecuencia por técnico para investigar posibles irregularidades, sin considerar proporción alta prueba de fraude.

Calendario público propio por técnico con enlace para captar solicitudes. Atribuir origen al técnico, distinguirlo del asignado final y definir disponibilidad, confirmación y cobertura de ausencias.

### Cobros, conduces y garantías

Clarificar servicios sin pagar frente a pagos registrados aún sin confirmar. Incluir anticipos, parciales, efectivo por rendir y transferencias verificadas. Revisar recorrido técnico→oficina→conduce→envío→garantía reclamable→evaluación. Emisión no equivale a envío exitoso.

Conduces: mostrar cobros y documentos de respaldo según Hoy, año o rango. Bancos: abrir cada cuenta con historial completo por defecto; filtro opcional Desde/Hasta, estado y fechas de pago y confirmación. No presentar registros internos como integración bancaria automática probada.

### Comisiones, nómina, avances y préstamos

Máxima prioridad de exactitud. Comisión desglosada por servicio, base, piezas, porcentaje, reparto y ajustes. Garantías con revisión, justificación y descuento aplicado una sola vez. La regla del10% de piezas que aparece actualmente debe validarse; no asumir nueva autorización de política.

Avance y préstamo son conceptos distintos: préstamo se recupera en cuotas a lo largo del tiempo. Interconectar con nómina, comisiones y caja/bancos; conservar saldo e historial. Evitar doble descuento. Probar cuota final, neto insuficiente, pago externo, cancelación, reintento y fallo parcial.

Nómina intuitiva: fechas completas en lugar de códigos Q1/Q2; detalle sueldo/comisión/bonos/descuentos/neto, borrador y revisión separados de pago efectivo. No cambiar períodos o fórmulas sin comprobar reglas.

### Personal, usuarios, permisos y ponches

Unificar navegación en Personal con empleados/equipos, accesos/permisos y asistencia/ponches. Ficha integral con vínculos a trabajo, desempeño y movimientos económicos según rol. Mi ponche directo para empleado. Corregir/jus­tificar asistencia con historial, y aplicar ajustes aprobados una sola vez. Ponche faltante es incidencia por revisar, no ausencia confirmada automática. Conservar historia ante baja, cambio de equipo, sueldo o porcentaje.

### Finanzas e informes

Gastos e ingresos interconectados con órdenes, piezas, pagos y nómina. Cierre diario como resumen financiero y operativo: órdenes concretas, solo chequeos, cobros, gastos y anomalías.

Estado de Resultados por mes/año/rango, con gráficos y comparación; distinguir resultado económico y caja. Rendimiento/KPIs y reporte avanzado deben compartir definiciones y mostrar detalles. Añadir satisfacción con técnico, atención/secretaria/operaria y empresa, comentario libre, número de respuestas y atribución correcta.

Métricas del Mes debe resumir todo el negocio: finanzas, servicios, clientes, marketing, asistencia, nómina y desempeño, no solo bonos. Proyecciones separadas de cifras reales; datos ausentes no equivalen a cero. Todos los totales deben permitir abrir el respaldo.

### Marketing, feedback y conocimiento

Organizar campañas, origen de consultas, seguimientos, reactivación y resultados. Conectar consultas→citas→trabajos→cobros con evidencia, sin llamar venta a un clic. Plantillas revisables, historial común y preferencias/frecuencia de contacto. Evitar insistir desde varios módulos al mismo cliente. Gasto publicitario contabilizado una sola vez.

Conocimiento acumulado con fuentes, versiones, vigencia, permisos y aprobación humana. La IA puede proponer mejoras a partir de conversaciones; no cambiar por sí misma reglas o presupuesto. Feedback debe alimentar seguimiento y análisis del servicio.

### Web y asistente de servicio

Referencia visual: https://www.samsung.com/latin/ por composición, tipografía, jerarquía y movimiento, no para copiar teléfonos o marca. Web limpia y minimalista; escena integrada de borde a borde con lavadora, estufa, nevera y aire; movimiento sutil y fluido, botones disponibles sin esperar animación. Mostrar prototipo web/móvil antes de integración.

Elección principal Reparación/Mantenimiento, selección de equipo que cambia imagen lateral/formulario; en móvil composición adaptada. WhatsApp con símbolo y texto claro, preservando selección/datos.

Asistente breve y natural, con nombre de servicio e indicación discreta de IA. Preguntar de uno en uno tipo de servicio/equipo, falla, foto y ubicación; pedir amablemente, mantener datos faltantes pendientes. Para gestionar visita completar foto, detalle y ubicación según servicio. No confirmar citas ni precios autónomamente. Pasar a humano al completar o si lo piden antes; conservar equipo y pausar IA al tomarlo una persona.

Horario humano confirmado: lunes–viernes8–18 y sábado8–16. IA fuera de horario y activable de día por administración. Topes iniciales aceptados:15 respuestas por cliente/24h, US$5/día y US$50/mes, aviso80%; botón administrativo Ampliar presupuesto con registro y límites contra abuso aún activos. Precisar cómputo/coste antes de implementación. Protección en servidor, duplicados, validación de origen y límites; evitar fricción constante al cliente normal.

## Hallazgos preliminares del código, para contrastar si tienes acceso

No son auditoría completa ni prueba de daño real:

- Aceptar cotización y aprobar precio en orden siguen caminos parcialmente separados.
- Pagos pendientes lista pagos registrados sin verificar, no todos los servicios impagados.
- Cierre de nómina puede continuar después de capturar un error al aplicar una cuota.
- Algunos KPIs no siguen filtro temporal; atribuciones por nombre; respuesta promedio mide cambio de fase, no WhatsApp.
- Algunos históricos salariales se calculan usando personal activo actual.
- Resultado bruto contiene un recorte a cero que puede ocultar pérdida; posible doble cómputo de pieza/gasto debe investigarse.
- Panel IA abierto puede conservar inert y permitir interacción con pantalla inferior; Atrás nativo no contempla cierre de IA.

## Entrega que te pido

1. Resumen ejecutivo y mapa del flujo completo del negocio, incluidas excepciones.
2. Causas raíz e incertidumbres; separar hechos, requisitos y propuestas.
3. Matriz por módulo: problema, solución, dependencias, prioridad, datos/permisos afectados y prueba de aceptación.
4. Organización de navegación y fuentes compartidas que conecten módulos sin reescritura innecesaria.
5. Plan financiero específico contra duplicados, fallos parciales, alteración histórica y diferencias entre reportes.
6. Etapas implementables con entregables, condiciones para avanzar y riesgos; estimaciones solo con supuestos explícitos.
7. Casos de prueba integrales web/Samsung y por roles; recuperación de errores y resguardo de datos.
8. Decisiones comerciales que debo aclarar; formula solo preguntas realmente bloqueantes.
9. Alternativas y razones para preferir una. Señala contradicciones y mejoras que falten en mi planteamiento.
10. Tabla final para comparar tu propuesta con otra: cobertura, prioridades, dependencias, riesgos financieros, facilidad de uso, pruebas y decisiones pendientes.

Escribe en español claro. No des por terminada ninguna implementación. Necesito profundidad en conexiones y causas, no una lista de pantallas bonitas ni promesas genéricas de que todo estará integrado.
