# Contexto del sistema — Mister Service RD

_Generado automáticamente desde `docs/mapa/MAPA_MENTAL.yaml` — última actualización: 2026-09-29._

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

## Módulos (38 total)

### bancos
- **Área:** dinero · **Criticidad:** alta
- **Qué hace:** Catálogo de cuentas y proyección de cobros por cuenta, con período opcional y conciliación de incidencias
- **Depende de:** ordenes_servicio
- **Colecciones Firestore:** bancos, ordenes_servicio
- **Notas:** Actualización local 2026-09-29. Historial lee sólo ordenes_servicio.pagos crudos por bancoId; nunca suma el espejo ni inventa fechas. Confirmados, pendientes e incidencias separados. Admin/coordinadora con bancosGestionar. No conecta al banco real ni ejecuta migración al abrir.

### ordenes_servicio
- **Área:** ordenes · **Criticidad:** alta
- **Qué hace:** Orden de servicio: crea, asigna, transiciona fases (nuevo_lead → cerrado), cierra con wizard. Spine del sistema.
- **Responsable humano:** Coordinadora de servicio
- **Depende de:** clientes, personal, calendarios
- **Expone a:** cotizaciones, facturas, pagos, comisiones, garantias, citas_por_confirmar, mantenimiento, avances, standby_piezas, equipos_taller
- **Colecciones Firestore:** ordenes_servicio
- **Notas:** parseOrden() en utils/index.ts es la lectura común. Hoy 3 caminos de creación (useOrdenCreateForm, Mantenimiento, solicitudes); sprint NUCLEO-CREAR-ORDEN-CENTRAL unifica.

### avances
- **Área:** personal_rrhh · **Criticidad:** media
- **Qué hace:** Adelantos de dinero a empleados; descuento vinculado a la nómina
- **Depende de:** personal
- **Expone a:** nomina
- **Colecciones Firestore:** avances
- **Notas:** Corrección del mapa: avances corresponde a dinero adelantado, según avances.service.ts; piezas usadas se registran aparte.

### calendarios
- **Área:** agendamiento · **Criticidad:** media
- **Qué hace:** Calendarios públicos por técnico (slots configurables, URL pública /cita/:calendarId)
- **Depende de:** personal
- **Expone a:** citas_por_confirmar
- **Colecciones Firestore:** calendarios
- **Notas:** Candidata local: calendario público asignado a técnico, solicitud conservada hasta confirmación por oficina. Identidad por UID, sin inferir por nombre.

### citas_por_confirmar
- **Área:** agendamiento · **Criticidad:** alta
- **Qué hace:** Citas solicitadas (web pública o admin) pendientes de confirmar y volverse orden
- **Depende de:** clientes, personal, calendarios
- **Expone a:** ordenes_servicio
- **Colecciones Firestore:** citas_por_confirmar
- **Notas:** Candidata local P042: token por intento y propietario, commit orden+vínculo valida cita vigente, liberación condicional. Callback de garantía fallido conserva formulario/vínculo, sin éxito falso. Reuso exige origen, cliente y orden activa. Sin vencimiento automático.

### mantenimiento
- **Área:** agendamiento · **Criticidad:** media
- **Qué hace:** Mantenimientos preventivos programados para clientes recurrentes
- **Depende de:** clientes, personal
- **Expone a:** ordenes_servicio
- **Colecciones Firestore:** mantenimiento
- **Notas:** Candidata local P039: ocurrencia de mantenimiento idempotente, cliente real, responsable activo y alertas internas. Acceso al chat existente, sin envío externo automático.

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
- **Qué hace:** Cotizaciones QT externas o vinculadas a una orden; aceptación y conversión a conduce trazables.
- **Depende de:** clientes, ordenes_servicio, productos
- **Expone a:** facturas
- **Colecciones Firestore:** cotizaciones, precios_servicios
- **Notas:** Candidata local P038: conversión idempotente y vínculo transaccional con orden/conduce; costos de comisión sólo utilizan cotización aceptada, nunca borrador/rechazada. Numeración centralizada.

### facturas
- **Área:** dinero · **Criticidad:** alta
- **Qué hace:** Conduces de Garantía (CG): documentos operativos; facturación fiscal ocurre fuera de este sistema.
- **Depende de:** cotizaciones, ordenes_servicio, clientes
- **Expone a:** pagos, comisiones, garantias
- **Colecciones Firestore:** facturas
- **Notas:** Candidata local: vínculo cotización/orden/conduce transaccional y único. Pagos y stock conservan sus validaciones; emisión de una orden no recalcula ni duplica devengos del cierre.

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
- **Notas:** Candidata local P041: resolver técnico único por UID/docID, devengo de cierre con ID estable y transacción. Conduce de orden refleja devengos existentes con ajuste firmado de garantía, excluyendo anuladas. Manual persiste conduce y comisiones juntos; intención de reintento dura mientras el modal está abierto.

### nomina
- **Área:** dinero · **Criticidad:** alta
- **Qué hace:** Nómina quincenal por empleado con comisiones, bonos, asistencia, avances y cuotas
- **Depende de:** comisiones, personal, avances, prestamos_empleados, ponches
- **Colecciones Firestore:** liquidaciones_nomina, comisiones, avances, prestamos_empleados, personal, ordenes_servicio
- **Notas:** Candidata local: cierre transaccional, neto negativo bloqueado, incidencias por fecha o devengos duplicados requieren conciliación. Estado de Resultado lee snapshots cerrados por fin del período; sueldo actual es referencia/proyección.

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
- **Depende de:** ordenes_servicio, suplidores
- **Colecciones Firestore:** standby_piezas
- **Notas:** Candidata local: piezas vinculadas a orden y llegada con aviso para coordinar instalación. Reactivación humana revalida revisión del padre y piezas; no descontar inventario por inferencia.

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
- **Qué hace:** Asistente interno del personal con permisos por rol; incorpora conocimientos aprobados. Borradores de WhatsApp revisados por un humano, sin envío automático.
- **Depende de:** whatsapp_inbox, conocimiento_equipo
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
- **Notas:** Candidata local: solicitud→cliente/orden se convierte con validación transaccional y reuso trazable. Cliente existente se verifica; identidad y asignación explícitas. Adjuntos conservan permisos de Storage.

### reportes
- **Área:** reporting · **Criticidad:** media
- **Qué hace:** Dashboards y métricas: ingresos, conduces emitidos, rendimiento técnicos, proyección de nómina. Dashboard operativo del día + Reporte avanzado para análisis comparativos.
- **Depende de:** ordenes_servicio, facturas, pagos, comisiones, personal, productos, gastos, caja, nomina, ponches
- **Colecciones Firestore:** recordatorios_diarios
- **Notas:** Candidata local: período mensual/rango RD, fuentes identificables y faltantes visibles. Caja por fecha del pago separada de conduces emitidos. Resultado usa nóminas cerradas cuyo período termina en rango, sin prorrateo ni doble comisión; pérdidas visibles. Calidad del servicio y NPS no equivalen a calificación individual de secretaria.

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

### conocimiento_equipo
- **Área:** sistema · **Criticidad:** media
- **Qué hace:** Aportes de procedimientos del personal, revisión admin/coordinación y referencias aprobadas para IA.
- **Depende de:** personal
- **Expone a:** conversaciones_ia
- **Colecciones Firestore:** conocimiento_equipo
- **Rutas API:** /api/ai/conocimiento
- **Notas:** Acceso por API autenticada; cliente Firestore bloqueado por defecto. Pendientes no alimentan IA.

### marketing_meta
- **Área:** reporting · **Criticidad:** media
- **Qué hace:** Panel de campañas Meta Ads de Mister Service; lectura de inversión e interacción.
- **Depende de:** personal
- **Rutas API:** /api/marketing/resumen
- **Integraciones externas:** meta_ads
- **Notas:** Lectura de anuncios sin escritura; atribución operativa se consulta en seguimiento_marketing y no implica causalidad.

### movimientos_piezas
- **Área:** inventario · **Criticidad:** alta
- **Qué hace:** Consumo y movimientos de piezas de reparación
- **Depende de:** ordenes_servicio, productos
- **Colecciones Firestore:** movimientos_piezas
- **Notas:** Colección existente; no confundir con avances de dinero a empleados.

### prestamos_empleados
- **Área:** personal_rrhh · **Criticidad:** alta
- **Qué hace:** Préstamos a empleados con cuotas y saldo a recuperar
- **Depende de:** personal
- **Colecciones Firestore:** prestamos_empleados
- **Notas:** Nómina relee cuotas y saldos en transacción. Distintos de adelantos; la candidata no publica permisos.

### caja
- **Área:** dinero · **Criticidad:** alta
- **Qué hace:** Proyección canónica de cobros confirmados, pendientes e incidencias
- **Depende de:** pagos, bancos
- **Colecciones Firestore:** ordenes_servicio
- **Notas:** movimientosCobros.ts proyecta documentos RAW y fecha financiera RD desde orden.pagos. No es una nueva colección ni suma espejos; no inventa fechas, métodos o importes faltantes.

### suplidores
- **Área:** inventario · **Criticidad:** alta
- **Qué hace:** Directorio de suplidores activos/inactivos y preparación de consultas de piezas por WhatsApp
- **Depende de:** whatsapp_inbox
- **Colecciones Firestore:** suplidores, whatsapp_conversaciones
- **Notas:** suplidores.service.ts y Standby vinculan búsqueda de pieza/foto y suplidor. Envío usa flujo existente y permisos; no envío automático agregado.

### seguimiento_chequeo
- **Área:** clientes · **Criticidad:** alta
- **Qué hace:** Seguimiento de órdenes de solo chequeo con responsable, próxima gestión y avisos
- **Depende de:** ordenes_servicio, personal
- **Colecciones Firestore:** ordenes_servicio, notificaciones, personal, usuarios
- **Notas:** seguimientoChequeo.service.ts guarda gestión y aviso transaccionales. Conteos por técnico señalan revisión, no prueban fraude.

### seguimiento_marketing
- **Área:** reporting · **Criticidad:** alta
- **Qué hace:** Consultas, reactivaciones y cobros atribuibles con incidencias visibles
- **Depende de:** ordenes_servicio, caja, whatsapp_inbox
- **Colecciones Firestore:** ordenes_servicio, whatsapp_conversaciones, campanas_marketing
- **Notas:** Cohorte de órdenes del período y pagos del mismo período, basada en proyección canónica RAW. Atribución a anuncio no implica causalidad. Ambigüedad y fechas ausentes se muestran; no sumar vistas por origen/anuncio. Lectura puntual completa tiene límite de escala.

## Integraciones externas

- **meta_whatsapp** (alta): Meta Graph API (WhatsApp Business Cloud). Mensajes entrantes (webhook con HMAC) y salientes (send con idempotency). _WABA 1884486412326904. 2 phone_number_id activos. Tokens y números en Vercel env._
- **firebase_auth** (alta): Firebase Authentication (login admin + ID tokens para endpoints api/*)
- **firebase_firestore** (alta): Firestore (base de datos principal). Reglas versionadas en firestore.rules + lock.
- **firebase_storage** (alta): Firebase Storage (fotos de cierre, firmas, archivos públicos). Reglas en storage.rules + lock.
- **firebase_app_check** (media): App Check (defensa contra abuso desde clientes no genuinos)
- **vercel** (alta): Hosting del SPA + serverless functions en api/*. Deploy automático en push a main.
- **anthropic_api** (media): Claude API para el agente IA conversacional (opt-in por conversación)
- **gps_vans** (media): Tracking GPS de vehículos del taller (Wialon / Samsara / Traccar / Fleet Complete / API personalizada — configurable en config_gps/sistema) _Acceso directo desde browser tiene CORS — usar el proxy /api/gps/ubicacion._
- **meta_ads** (media): Consulta Marketing API de la cuenta Mister Service con credencial de servidor.

## Impacto de cambios (si tocás X, revisá Y)

- Si tocás **avances**, verificá: nomina
- Si tocás **bancos**, verificá: caja
- Si tocás **caja**, verificá: reportes, seguimiento_marketing
- Si tocás **calendarios**, verificá: ordenes_servicio, citas_por_confirmar
- Si tocás **clientes**, verificá: ordenes_servicio, citas_por_confirmar, mantenimiento, garantias, cotizaciones, facturas, whatsapp_inbox, solicitudes
- Si tocás **comisiones**, verificá: nomina, reportes
- Si tocás **conocimiento_equipo**, verificá: conversaciones_ia
- Si tocás **cotizaciones**, verificá: facturas
- Si tocás **facturas**, verificá: garantias, comisiones, reportes
- Si tocás **formularios**, verificá: solicitudes
- Si tocás **gastos**, verificá: reportes
- Si tocás **nomina**, verificá: reportes
- Si tocás **ordenes_servicio**, verificá: bancos, garantias, cotizaciones, facturas, pagos, comisiones, standby_piezas, equipos_taller, reportes, movimientos_piezas, seguimiento_chequeo, seguimiento_marketing
- Si tocás **pagos**, verificá: reportes, caja
- Si tocás **personal**, verificá: ordenes_servicio, avances, calendarios, citas_por_confirmar, mantenimiento, comisiones, nomina, ponches, cierres_dia, whatsapp_inbox, reportes, notificaciones, conocimiento_equipo, marketing_meta, prestamos_empleados, seguimiento_chequeo
- Si tocás **plantillas_whatsapp**, verificá: whatsapp_inbox
- Si tocás **ponches**, verificá: nomina, cierres_dia, reportes
- Si tocás **prestamos_empleados**, verificá: nomina
- Si tocás **productos**, verificá: cotizaciones, reportes, movimientos_piezas
- Si tocás **suplidores**, verificá: standby_piezas
- Si tocás **whatsapp_inbox**, verificá: conversaciones_ia, suplidores, seguimiento_marketing
