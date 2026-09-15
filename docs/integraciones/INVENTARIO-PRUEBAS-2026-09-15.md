# Inventario de revisión — 15/09/2026

Inventario estático: no equivale a pruebas completas por rol. Las referencias de escritura pueden estar dentro de funciones que no se ejecutan al abrir.

| Pantalla | Suscripciones mencionadas | Escrituras mencionadas | Estado |
|---|---:|---:|---|
| Admin404 | 0 | 0 | Recorrido pendiente |
| AdminPonches | 2 | 0 | Recorrido pendiente |
| AgendaDia | 4 | 2 | Lectura admin comprobada; sin acción final |
| AsistenteIA | 0 | 0 | Lectura admin comprobada; sin acción final |
| AsistenteIAHistorial | 1 | 0 | Recorrido pendiente |
| Avances | 1 | 0 | Recorrido pendiente |
| Bancos | 0 | 0 | Recorrido pendiente |
| Calendario | 3 | 0 | Recorrido pendiente |
| Calendarios | 1 | 4 | Recorrido pendiente |
| CierreDia | 2 | 2 | Recorrido pendiente |
| CitaPublica | 0 | 1 | Recorrido pendiente |
| Citas | 2 | 6 | Recorrido pendiente |
| Clientes | 1 | 2 | Recorrido pendiente |
| Comisiones | 1 | 0 | Recorrido pendiente |
| Configuracion | 0 | 1 | Recorrido pendiente |
| ConfiguracionMarketing | 0 | 0 | Recorrido pendiente |
| ConfiguracionWeb | 0 | 1 | Recorrido pendiente |
| ConocimientoEquipo | 0 | 0 | Lectura admin comprobada; sin acción final |
| Cotizaciones | 2 | 9 | Recorrido pendiente |
| Dashboard | 8 | 0 | Recorrido pendiente |
| EmpresasAliadas | 0 | 0 | Recorrido pendiente |
| EquiposTaller | 1 | 3 | Lectura admin comprobada; sin acción final |
| EstadoResultado | 0 | 0 | Recorrido pendiente |
| FacturacionPendiente | 4 | 0 | Lectura admin comprobada; sin acción final |
| Facturas | 5 | 6 | Recorrido pendiente |
| Feedback | 1 | 0 | Recorrido pendiente |
| FormularioEditor | 0 | 0 | Recorrido pendiente |
| Formularios | 0 | 0 | Recorrido pendiente |
| Gastos | 2 | 2 | Recorrido pendiente |
| GestionUsuarios | 1 | 9 | Recorrido pendiente |
| HistorialAnuladas | 1 | 2 | Recorrido pendiente |
| Inbox | 0 | 0 | Recorrido pendiente |
| InboxConversacion | 2 | 0 | Recorrido pendiente |
| Inventario | 1 | 4 | Recorrido pendiente |
| Login | 0 | 0 | Recorrido pendiente |
| Mantenimiento | 2 | 3 | Recorrido pendiente |
| MapaRutas | 1 | 2 | Recorrido pendiente |
| MarketingIntegrado | 0 | 0 | Recorrido pendiente |
| MetricasMensuales | 3 | 0 | Recorrido pendiente |
| Nomina | 2 | 0 | Recorrido pendiente |
| Notificaciones | 1 | 0 | Recorrido pendiente |
| OrdenDetalle | 2 | 6 | Recorrido pendiente |
| Ordenes | 3 | 3 | Lectura admin comprobada; sin acción final |
| PagosPendientes | 0 | 0 | Lectura admin comprobada; sin acción final |
| PersonalPage | 2 | 15 | Recorrido pendiente |
| Ponche | 0 | 0 | Recorrido pendiente |
| PreciosServicios | 1 | 3 | Recorrido pendiente |
| Prestamos | 1 | 0 | Recorrido pendiente |
| Rendimiento | 3 | 0 | Recorrido pendiente |
| ReporteAvanzado | 4 | 0 | Recorrido pendiente |
| Reprogramaciones | 0 | 0 | Recorrido pendiente |
| Solicitudes | 0 | 0 | Lectura admin comprobada; sin acción final |
| Standby | 3 | 4 | Recorrido pendiente |
| SugerenciasChequeo | 2 | 0 | Recorrido pendiente |
| TecnicoVista | 3 | 4 | Recorrido pendiente |
| TrackingCliente | 1 | 0 | Recorrido pendiente |
| AgendarPage | 0 | 0 | Recorrido pendiente |
| FormularioPublico | 0 | 0 | Recorrido pendiente |
| GarantiaCliente | 0 | 0 | Recorrido pendiente |
| HomePage | 0 | 0 | Recorrido pendiente |
| PortalCliente | 0 | 0 | Recorrido pendiente |
| ServicioDetalle | 0 | 0 | Recorrido pendiente |
| ServiciosPage | 0 | 0 | Recorrido pendiente |

Pendientes: recorridos completos por roles; cancelación/garantía; diagnóstico/cierre/piezas/pago/conduce con datos aislados; carga de documentos en navegador; seguimiento WhatsApp e Instagram/Messenger. No se emitieron conduces ni mensajes durante la revisión.

### Ampliación — cierre y garantía

73 pruebas automatizadas aprobadas. Diez nuevas cubren reglas de cálculo de garantía, margen/comisión y rangos de quincena; dos recorren todos los días de 2024 y 2026. Se corrigieron el inicio de Q1 en marzo, inclusión del último milisegundo y fechas inválidas. Las cinco cuentas QA pasan verificación de existencia/rol/espejos/Auth en lectura. No equivale a E2E por rol.

Pendiente prioritario: automatizar ajuste por garantía con autorización de servidor, historial por evento e idempotencia; actualmente el técnico no puede escribir comisiones y el modelo permite un solo ajuste. El cierre ahora advierte el pendiente, sin ampliar permisos. Sesión disponible solo administrador, por lo que diagnóstico/foto/firma/cierre técnico siguen pendientes de prueba UI.

### Continuación — revisión de ajustes en la pantalla Comisiones

La incompatibilidad de permisos se atiende con una revisión administrativa integrada: el cierre técnico deja el aviso, y administración/coordinación revisa y confirma el descuento tras validar piezas. No se añadieron permisos ni endpoint con privilegios. La aplicación y su auditoría son transaccionales, con historial por orden y total compatible con nómina. Repeticiones no duplican; importes cambiados y comisiones liquidadas/ambiguas se detienen para revisión.

96 pruebas automatizadas aprobadas (23 nuevas: cálculo/historial, transacción con Firestore simulado, revisión/confirmación/cancelación React). Compilación e invariantes aprobados. No es prueba de reglas en emulador ni cierre completo como técnico; no se hicieron movimientos financieros reales. La lista administrativa examina como máximo 100 garantías, con advertencia de parcialidad.
