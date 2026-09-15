# Mister Service RD: flujo, integraciones y simplificación

Revisión de código del 15/09/2026. Copia de trabajo: rama integraciones-marketing-conocimiento-20260915, base e8f11cc más cambios locales de memoria. No es una certificación de todos los recorridos en producción. La carpeta original del escritorio conserva cambios ajenos; antes de integrar debe compararse con ella y con la versión publicada.

## Cómo está construido

La interfaz React organiza páginas, formularios, permisos visibles y suscripciones en tiempo real. Muchas operaciones leen y escriben directamente Firestore desde componentes y servicios. Las reglas de Firestore son por tanto parte esencial del backend: ocultar un botón no sustituye la autorización de datos. Firebase Auth identifica a la persona; personal y usuarios mantienen perfiles vinculados.

Las funciones API en Vercel realizan tareas privilegiadas: IA, Meta Ads, recepción/envío de WhatsApp, gestión de acceso y portales por token. El asistente actual usa herramientas de consulta sobre Firestore y Claude; su biblioteca puede conservarse al cambiar de proveedor, pero adaptar otro proveedor todavía requiere código y pruebas. No hay cambio de modelo implementado.

Referencias contrastadas: src/App.tsx, src/components/Sidebar.tsx, docs/mapa/MAPA_MENTAL.yaml, docs/MAPA_DEPENDENCIAS.md, firestore.rules, servicios de solicitudes/órdenes/precios/WhatsApp/campañas, endpoints de chat/conocimiento/marketing/webhook y páginas de precios/conocimiento. El mapa narrativo antiguo contiene capacidades que deben contrastarse con código; por ejemplo no asumir que la IA puede crear recordatorios porque figuren allí.

## Flujo principal que debe guiar el producto

Captación (anuncio, web, llamada o WhatsApp) → identificación del cliente y origen → solicitud → revisión y orden → agenda y asignación → visita y diagnóstico → cotización y aprobación → reparación/piezas → cierre → pago y verificación → conduce/garantía → seguimiento y próximo mantenimiento.

No todos los pasos están automatizados ni enlazados de extremo a extremo. Una orden debe ser el punto de unión de conversación, cliente, técnico, precio, piezas, pago, garantía y origen comercial. Las pantallas especializadas pueden seguir existiendo como vistas del mismo expediente.

## Propuesta de navegación: siete áreas de trabajo

| Área | Funciones que conserva | Simplificación propuesta |
|---|---|---|
| Mi día | Dashboard, tareas pendientes, notificaciones, acceso al ponche | Inicio por rol con siguiente acción y alertas que abren el registro concreto. |
| Atención y clientes | WhatsApp, clientes, solicitudes, citas por confirmar, seguimiento, empresas aliadas | Conversación y ficha del cliente juntas; aprobación de solicitudes desde la misma bandeja. |
| Servicios | Órdenes, agenda diaria, calendario, rutas, reprogramaciones, chequeos, espera de piezas, taller, mantenimiento, anuladas | Lista, agenda y mapa como vistas; pendientes como filtros; taller y garantías accesibles desde la orden. |
| Caja y administración | Cotizaciones, pagos, conduces pendientes y emitidos, cierre del día, bancos, gastos, préstamos, estado de resultados | Pasos conectados por orden; autorizaciones independientes para registrar y verificar. No convertir conduces en facturas fiscales. |
| Equipo | Personal, usuarios, permisos, ponches, comisiones, nómina y rendimiento | Una ficha de empleado con pestañas y sincronización de ambos perfiles. |
| Marketing | Anuncios, campañas de reactivación, resultados, satisfacción/NPS, formularios y web | Separar campañas de seguimiento y adquisición; ajustes de canales en configuración. Métricas vinculadas a órdenes cobradas cuando exista atribución verificable. |
| Recursos | Tarifario, inventario, documentos y conocimiento del equipo | Consulta de precios de venta para operarias/secretarias; edición y costos protegidos por permisos. |

Configuración permanece como acceso secundario. La IA debe estar disponible desde cualquier área, con historial dentro del asistente; no requiere otro grupo principal. Reportes se ubican en su área y se resumen en Mi día. Calendarios públicos y formularios conservan sus enlaces actuales aunque cambie el menú.

Esta propuesta agrupa entradas, no elimina capacidades ni colecciones. Debe conservarse cada ruta existente o redirigirse a su nueva vista. El técnico mantiene su interfaz móvil centrada en órdenes asignadas.

## Problemas comprobados y mejoras prioritarias

1. **Conversión no atómica de solicitud a orden.** convertirAOrden, en src/services/solicitudes.service.ts, crea la orden con addDoc y actualiza la solicitud después. Un fallo intermedio o repetición puede dejar una orden sin enlace o duplicar la conversión. Propuesta: operación idempotente/transaccional, estado comprobado y referencia estable; prueba de doble clic, dos sesiones y reintento tras fallo. No se modificó aún.
2. **Autorización repartida.** Sidebar mezcla roles y permisos; rutas usan PermisoRoute, RolRoute o protección general; los datos dependen de reglas y APIs. Crear matriz de acción/rol/recurso y probar acceso directo además de botones. La revisión de la IA no equivale a una auditoría completa de Firestore.
3. **Lecturas para contadores.** Sidebar mantiene una suscripción completa a órdenes para varios pendientes. Aunque ya agrupa tres contadores en un listener, el tamaño inicial y el trabajo en cliente crecen con los registros. Medir y sustituir por consultas de pendientes o agregados mantenidos de forma consistente; no inventar cifras de ahorro.
4. **Fuente de archivos incompleta.** PreciosServicios consulta registros estructurados; ConocimientoEquipo acepta texto. No se encontró en estas rutas una ingesta general de documentos para la IA. Subir un archivo adjunto no lo hace automáticamente consultable. Falta inventario de los importadores existentes y trazabilidad archivo → registros antes de afirmar cobertura de todos los formatos.
5. **Anuncios con alcance concreto.** api/marketing/resumen.ts consulta una cuenta fija, últimos 30 días y hasta 100 resultados, indicando parcialidad. No administra campañas ni consolida por sí solo todos los negocios mencionados. Ampliar cuentas requiere aislamiento por negocio y autorización verificada, más paginación y atribución.
6. **WhatsApp no equivale a asistente autónomo.** El webhook valida firma y deduplica recepción; el código deja claro que no procesa allí la lógica del bot. El borrador asistido requiere revisión. Falta verificar recorridos reales de seguimiento, respuesta y derivación antes de prometer automatización completa.
7. **Pantallas y acceso al tarifario.** La IA permite consulta de precios al personal habilitado; el menú de Precios de Servicios aún se orienta a administración. Crear vista de consulta de venta accesible sin permisos de edición para no depender exclusivamente de la IA.
8. **Carga inicial.** La compilación avisa de paquetes grandes (el principal supera 1 MB sin comprimir). Medir en móvil y dividir dependencias pesadas antes de rediseños visuales extensos.

## Memoria del negocio: diseño y estado real

Tres fuentes diferentes: datos vivos (precios/inventario/órdenes), documentos/procedimientos aprobados y señales de preguntas frecuentes. Los datos vivos prevalecen para importes y estados. La frecuencia sirve para detectar necesidades, no valida hechos ni actualiza precios.

Cambios locales realizados: respuestas de precios más breves, mayoreo solo solicitado, aclaración antes de reparación general; temas de nuevas consultas clasificados con vocabulario cerrado de equipo/marca/servicio, sin copiar mensajes ni nombres; deduplicación por conversación/tema; listado de temas para administración/coordinación y preparación de aporte para revisión; selección de referencias aprobadas relevantes en vez de las primeras doce.

Limitaciones explícitas: la clasificación inicial reconoce un conjunto limitado de equipos/servicios y no agrupa semánticamente cualquier pregunta. No se importaron conversaciones antiguas. No hay entrenamiento automático del modelo, nueva ingesta PDF/Excel ni memoria personal de preferencias. Las conversaciones ya guardadas son distintas de los conocimientos aprobados. Los temas no se inyectan como hechos en respuestas.

Siguiente fase documental: cargar archivo con origen/fecha/versión → extraer texto/tablas → mostrar errores y duplicados → confirmar precios antes de incorporarlos → buscar fragmentos con referencia al documento → retirar versiones obsoletas. Separar lectura y aprobación por rol. Registrar correcciones de respuesta con motivo y responsable; agregar evaluaciones para comparar proveedores usando las mismas fuentes.

## Secuencia recomendada

1. Terminar pruebas de memoria/precios en dominio de pruebas, verificar permisos con operaria y secretaria y guardar ejemplos de acierto/error.
2. Crear Mi día y navegación agrupada conservando rutas, permisos y acciones; probar que cada función anterior sigue accesible por su rol.
3. Centralizar conversión/creación de órdenes y enlazar bandeja con expediente para evitar doble captura.
4. Completar ingesta de documentos con revisión, fuente y versionado; probar documento actualizado, precio contradictorio y archivo ilegible.
5. Integrar seguimiento con estados de orden y permisos de envío. Probar sin mandar comunicaciones reales a clientes.
6. Consolidar resultados comerciales y luego evaluar cambio de modelo con el mismo conjunto de preguntas.

Criterio de aceptación: una secretaria puede pasar de consulta a precio, solicitud, agenda y seguimiento sin volver a introducir cliente/equipo; un técnico completa su visita móvil; administración verifica pago y conduce; los datos no cambian al navegar entre vistas. Probar estos recorridos con sesiones reales separadas y escenarios controlados, sin cobros ni mensajes reales de prueba.

Los cambios de memoria y la propuesta de navegación no están publicados en la web principal. No se ha rediseñado todavía el menú. La publicación debe partir de una versión revisada y de la comparación con trabajo concurrente.
