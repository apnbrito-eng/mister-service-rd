# Contexto del sistema — Mister Service RD

_Generado automáticamente desde `docs/mapa/MAPA_MENTAL.yaml` — última actualización: 2026-05-26._

Software de gestión para taller de reparación de electrodomésticos en República Dominicana

> **Para los demás agentes:** este es el mapa del sistema. Si vas a tocar un módulo, consultá la sección "Impacto de cambios" al final para saber qué otros módulos dependen de él.

## Áreas del sistema (10)

- **ORDENES**: Ciclo de vida de la orden de servicio — el corazón del sistema
- **AGENDAMIENTO**: Calendarios, citas y mantenimientos preventivos
- **CLIENTES**: CRM del cliente final que paga la reparación
- **DINERO**: Cotizaciones, facturas, pagos, comisiones, nómina, gastos
- **INVENTARIO**: Productos, piezas, equipos en el taller, movimientos de stock
- **PERSONAL_RRHH**: Empleados, usuarios, roles, ponches, cierres de día
- **WHATSAPP_CRM**: Inbox de WhatsApp, plantillas HSM, conversaciones y errores Meta
- **FORMULARIOS_PUBLICOS**: Formularios públicos sin login, solicitudes que generan leads
- **REPORTING**: Dashboards y métricas — lee de todo, no escribe
- **SISTEMA**: Cross-cutting: auditoría, notificaciones, rate limits, configuración

## Módulos (29 total)

### ordenes_servicio
- **Área:** ordenes · **Criticidad:** alta
- **Qué hace:** Orden de servicio: crea, asigna, transiciona fases (nuevo_lead → cerrado), cierra con wizard. Spine del sistema.
- **Responsable humano:** Coordinadora de servicio
- **Depende de:** clientes, personal, calendarios
- **Expone a:** cotizaciones, facturas, pagos, comisiones, garantias, citas_por_confirmar, mantenimiento, avances, standby_piezas, equipos_taller
- **Colecciones Firestore:** ordenes_servicio
- **Notas:** parseOrden() en utils/index.ts es la lectura común. Hoy 3 caminos de creación (useOrdenCreateForm, Mantenimiento, solicitudes); sprint NUCLEO-CREAR-ORDEN-CENTRAL unifica.

### avances
- **Área:** ordenes · **Criticidad:** media
- **Qué hace:** Registro de avances/piezas usadas durante la reparación
- **Depende de:** ordenes_servicio
- **Colecciones Firestore:** avances, movimientos_piezas

### calendarios
- **Área:** agendamiento · **Criticidad:** media
- **Qué hace:** Calendarios públicos por técnico (slots configurables, URL pública /cita/:calendarId)
- **Depende de:** personal
- **Expone a:** citas_por_confirmar
- **Colecciones Firestore:** calendarios

### citas_por_confirmar
- **Área:** agendamiento · **Criticidad:** alta
- **Qué hace:** Citas solicitadas (web pública o admin) pendientes de confirmar y volverse orden
- **Depende de:** clientes, personal, calendarios
- **Expone a:** ordenes_servicio
- **Colecciones Firestore:** citas_por_confirmar
- **Notas:** Tras AGENDA-2 (e4f92bf) visibles en calendario/agenda con estilo tentativo. Tras AGENDA-3 (f9697b9) se honra el asignadoId al confirmar.

### mantenimiento
- **Área:** agendamiento · **Criticidad:** media
- **Qué hace:** Mantenimientos preventivos programados para clientes recurrentes
- **Depende de:** clientes, personal
- **Expone a:** ordenes_servicio
- **Colecciones Firestore:** mantenimiento
- **Notas:** Tras AGENDA-1 (132d9b5) atado a cliente real (typeahead + telefono normalizado, tecnicoId=uid). Tras AGENDA-5 (8f6a72b) se ofrece programar al cerrar orden.

### clientes
- **Área:** clientes · **Criticidad:** alta
- **Qué hace:** CRM del cliente final. Teléfono normalizado (RD: 10 dígitos sin código país).
- **Responsable humano:** Secretaria / coordinadora
- **Expone a:** ordenes_servicio, citas_por_confirmar, mantenimiento, cotizaciones, facturas, garantias, whatsapp_inbox, solicitudes
- **Colecciones Firestore:** clientes
- **Notas:** Helpers canónicos: buscarClientePorTelefono, buscarOCrearCliente. Anti-duplicado por telefonoNormalizado.

### garantias
- **Área:** clientes · **Criticidad:** media
- **Qué hace:** Garantías de servicio. Reapertura aplica descuento 10% sobre piezas al técnico original.
- **Depende de:** ordenes_servicio, facturas, clientes
- **Expone a:** comisiones
- **Colecciones Firestore:** facturas
- **Notas:** Fase A (59c5fb0) awaiting QA Jorge. Cazador P-024 protege regla nueva (no reintroducir anulación 100%).

### cotizaciones
- **Área:** dinero · **Criticidad:** alta
- **Qué hace:** Cotizaciones (QT-####) previas a la aprobación; al aprobar pueden generar factura.
- **Depende de:** clientes, ordenes_servicio, productos
- **Expone a:** facturas
- **Colecciones Firestore:** cotizaciones, precios_servicios
- **Notas:** Tras DINERO-1 (bec87b3) el número QT es atómico via contadores.service.ts.

### facturas
- **Área:** dinero · **Criticidad:** alta
- **Qué hace:** Facturas y conduces (FAC-####, CG-####). Emisión bloqueada si hay pago sin verificar.
- **Depende de:** cotizaciones, ordenes_servicio, clientes
- **Expone a:** pagos, comisiones, garantias
- **Colecciones Firestore:** facturas
- **Notas:** ProcesarFacturacionModal: gate del conduce vs pago verificado (cazador P-023). Tras DINERO-2 (b4fc23c) recalcula montoPagado/estadoPago al cobrar.

### pagos
- **Área:** dinero · **Criticidad:** alta
- **Qué hace:** Pagos del cliente. Hoy viven en array orden.pagos; subcolección /pagos espejo post B-2.
- **Depende de:** ordenes_servicio
- **Expone a:** facturas, comisiones
- **Colecciones Firestore:** ordenes_servicio
- **Notas:** B-2 (d4d6498) migró 16 órdenes a subcolección espejo. B-3 (cut-over + endurecer rules) espera QA Jorge. Helper: obtenerPagosDeOrden(orden).

### comisiones
- **Área:** dinero · **Criticidad:** alta
- **Qué hace:** Comisión del técnico por orden cerrada. Garantía aplica descuento 10% sobre piezas.
- **Depende de:** ordenes_servicio, facturas, personal
- **Expone a:** nomina
- **Colecciones Firestore:** comisiones
- **Notas:** Dos bases de cálculo divergentes (~18% diferencia) pendientes decisión Jorge. P-021 obliga denormalización a factura.

### nomina
- **Área:** dinero · **Criticidad:** media
- **Qué hace:** Liquidación mensual de nómina con bonos por tier (operaria, secretaria) y descuentos de préstamos.
- **Depende de:** comisiones, personal
- **Colecciones Firestore:** liquidaciones_nomina
- **Notas:** Reglas de bonos duplicadas hoy entre Nomina.tsx y Dashboard.tsx (REPORTING-1 las centralizó en utils/kpis.ts).

### gastos
- **Área:** dinero · **Criticidad:** baja
- **Qué hace:** Gastos operativos del taller (no piezas).
- **Expone a:** reportes
- **Colecciones Firestore:** gastos

### productos
- **Área:** inventario · **Criticidad:** media
- **Qué hace:** Catálogo de productos/piezas con stock y costo. Dos colecciones (productos + piezas_inventario) — deuda histórica a consolidar.
- **Expone a:** cotizaciones
- **Colecciones Firestore:** productos, piezas_inventario, movimientos_inventario
- **Notas:** Solo la conversión cotización→factura descuenta stock. PiezaFormModal del cierre NO descuenta — decisión Jorge pendiente.

### standby_piezas
- **Área:** inventario · **Criticidad:** media
- **Qué hace:** Piezas en espera de llegada para una orden
- **Depende de:** ordenes_servicio
- **Colecciones Firestore:** standby_piezas
- **Notas:** No reconcilia con inventario al llegar — decisión Jorge pendiente.

### equipos_taller
- **Área:** inventario · **Criticidad:** baja
- **Qué hace:** Equipos físicamente en el taller (en reparación o en espera)
- **Depende de:** ordenes_servicio
- **Colecciones Firestore:** equipos_taller

### personal
- **Área:** personal_rrhh · **Criticidad:** alta
- **Qué hace:** Empleados del taller: técnicos, secretarias, coordinadoras, operarias, administradores
- **Responsable humano:** Jorge / admin
- **Expone a:** ordenes_servicio, comisiones, nomina, calendarios, mantenimiento, ponches, cierres_dia, whatsapp_inbox
- **Colecciones Firestore:** personal, usuarios
- **Rutas API:** /api/admin/crear-usuario
- **Integraciones externas:** firebase_auth
- **Notas:** Alta crea AMBOS docs (personal/{autoId} + usuarios/{uid}) — invariante P-004. Los dropdowns guardan uid, no doc id — invariante P-006.

### ponches
- **Área:** personal_rrhh · **Criticidad:** baja
- **Qué hace:** Registro de entrada/salida del personal (control de asistencia)
- **Depende de:** personal
- **Expone a:** nomina, cierres_dia
- **Colecciones Firestore:** ponches

### cierres_dia
- **Área:** personal_rrhh · **Criticidad:** baja
- **Qué hace:** Cierre diario operativo del taller
- **Depende de:** personal, ponches
- **Expone a:** reportes
- **Colecciones Firestore:** cierres_dia

### whatsapp_inbox
- **Área:** whatsapp_crm · **Criticidad:** alta
- **Qué hace:** Inbox de conversaciones de WhatsApp con clientes. Webhook entrante + send saliente + outbox idempotente.
- **Depende de:** clientes, personal, plantillas_whatsapp
- **Expone a:** ordenes_servicio
- **Colecciones Firestore:** whatsapp_conversaciones, whatsapp_mensajes_inbox, whatsapp_mensajes_outbox, whatsapp_config, whatsapp_errores_meta
- **Rutas API:** /api/whatsapp/send, /api/whatsapp/webhook, /api/whatsapp/media-proxy
- **Integraciones externas:** meta_whatsapp
- **Notas:** Ventana 24h, idempotency por tempId (P-017), HMAC SHA-256 en webhook (P-016). Tras WA-FIX-PLANTILLAS (0ab73c5) catálogo alineado con Meta.

### plantillas_whatsapp
- **Área:** whatsapp_crm · **Criticidad:** alta
- **Qué hace:** Catálogo de plantillas HSM aprobadas en Meta (4 con imagen branded). Vive en código, no en Firestore.
- **Expone a:** whatsapp_inbox
- **Integraciones externas:** meta_whatsapp
- **Notas:** src/config/plantillasWhatsApp.ts. Imágenes en public/plantillas/. Spec autoritativa en docs/sprints/PLANTILLAS_META_SPEC_2026-05-25.md.

### conversaciones_ia
- **Área:** whatsapp_crm · **Criticidad:** media
- **Qué hace:** Conversaciones del agente IA con clientes (opt-in por conversación)
- **Depende de:** whatsapp_inbox
- **Colecciones Firestore:** conversaciones_ia
- **Integraciones externas:** anthropic_api

### formularios
- **Área:** formularios_publicos · **Criticidad:** media
- **Qué hace:** Definiciones de formularios dinámicos (admin construye, público los llena en /f/:slug)
- **Expone a:** solicitudes
- **Colecciones Firestore:** formularios

### solicitudes
- **Área:** formularios_publicos · **Criticidad:** alta
- **Qué hace:** Submissions de formularios públicos. Generan lead/cliente/orden.
- **Depende de:** formularios, clientes
- **Expone a:** ordenes_servicio
- **Colecciones Firestore:** solicitudes_servicio
- **Integraciones externas:** firebase_storage
- **Notas:** Tras FIX-LEADS (01df699) subidas (foto/firma/PDF) van a Storage solicitudes-publico/** con whitelist contentType y size <10MB.

### reportes
- **Área:** reporting · **Criticidad:** media
- **Qué hace:** Dashboards y métricas: ingresos, conduces emitidos, rendimiento técnicos, proyección de nómina. Dashboard operativo del día + Reporte avanzado para análisis comparativos.
- **Depende de:** ordenes_servicio, facturas, pagos, comisiones, personal, productos, gastos
- **Colecciones Firestore:** recordatorios_diarios
- **Notas:** Tras REPORTING-1 (a4e64db) los KPIs viven en src/utils/kpis.ts (helpers compartidos). Resta anulaciones de la base de ingresos. Tras DISENO-I Fase 3 (5ca35d2, 2026-06-03) el Dashboard quedó con KPIs operativos del día solamente; los 4 widgets analíticos (Rendimiento por Técnico, Reparaciones por Tipo, Anuladas semana, Nómina proyectada del mes) se movieron a /admin/reporte-avanzado — gate admin+coord. Link a 1 clic desde Dashboard + sidebar Finanzas.

### notificaciones
- **Área:** sistema · **Criticidad:** media
- **Qué hace:** Notificaciones internas a empleados (orden asignada, pieza llegó, etc.)
- **Depende de:** personal
- **Colecciones Firestore:** notificaciones
- **Notas:** Rule gatea por userId == auth.uid. Cazador P-007.

### auditoria
- **Área:** sistema · **Criticidad:** media
- **Qué hace:** Audit log de acciones administrativas sensibles (WhatsApp send, alta de usuarios, etc.)
- **Colecciones Firestore:** auditoria_admin, app_check_audit, whatsapp_errores_meta_dedupe

### rate_limits
- **Área:** sistema · **Criticidad:** baja
- **Qué hace:** Contadores diarios por usuario para limitar abuso (WhatsApp send, AI chat, etc.)
- **Colecciones Firestore:** rate_limits

### configuracion
- **Área:** sistema · **Criticidad:** alta
- **Qué hace:** Documentos de configuración global (GPS, WhatsApp envío, rate limits, contadores)
- **Expone a:** whatsapp_inbox, cotizaciones, facturas
- **Colecciones Firestore:** config
- **Notas:** Contadores OS/QT/CG/FAC viven acá. Cazador P-022.

## Integraciones externas

- **meta_whatsapp** (alta): Meta Graph API (WhatsApp Business Cloud). Mensajes entrantes (webhook con HMAC) y salientes (send con idempotency). _WABA 1884486412326904. 2 phone_number_id activos. Tokens y números en Vercel env._
- **firebase_auth** (alta): Firebase Authentication (login admin + ID tokens para endpoints api/*)
- **firebase_firestore** (alta): Firestore (base de datos principal). Reglas versionadas en firestore.rules + lock.
- **firebase_storage** (alta): Firebase Storage (fotos de cierre, firmas, archivos públicos). Reglas en storage.rules + lock.
- **firebase_app_check** (media): App Check (defensa contra abuso desde clientes no genuinos)
- **vercel** (alta): Hosting del SPA + serverless functions en api/*. Deploy automático en push a main.
- **anthropic_api** (media): Claude API para el agente IA conversacional (opt-in por conversación)
- **gps_vans** (media): Tracking GPS de vehículos del taller (Wialon / Samsara / Traccar / Fleet Complete / API personalizada — configurable en config_gps/sistema) _Acceso directo desde browser tiene CORS — usar el proxy /api/gps/ubicacion._

## Impacto de cambios (si tocás X, revisá Y)

- Si tocás **calendarios**, verificá: ordenes_servicio, citas_por_confirmar
- Si tocás **clientes**, verificá: ordenes_servicio, citas_por_confirmar, mantenimiento, garantias, cotizaciones, facturas, whatsapp_inbox, solicitudes
- Si tocás **comisiones**, verificá: nomina, reportes
- Si tocás **cotizaciones**, verificá: facturas
- Si tocás **facturas**, verificá: garantias, comisiones, reportes
- Si tocás **formularios**, verificá: solicitudes
- Si tocás **gastos**, verificá: reportes
- Si tocás **ordenes_servicio**, verificá: avances, garantias, cotizaciones, facturas, pagos, comisiones, standby_piezas, equipos_taller, reportes
- Si tocás **pagos**, verificá: reportes
- Si tocás **personal**, verificá: ordenes_servicio, calendarios, citas_por_confirmar, mantenimiento, comisiones, nomina, ponches, cierres_dia, whatsapp_inbox, reportes, notificaciones
- Si tocás **plantillas_whatsapp**, verificá: whatsapp_inbox
- Si tocás **ponches**, verificá: cierres_dia
- Si tocás **productos**, verificá: cotizaciones, reportes
- Si tocás **whatsapp_inbox**, verificá: conversaciones_ia
