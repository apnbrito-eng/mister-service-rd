# CRM: implementación y validación — 16/09/2026

## Estado real
Implementación local en `work/mister-service-crm`, rama `integraciones-marketing-conocimiento-20260915`, base ae5a8cb. No publicada ni reglas desplegadas. La demo 127.0.0.1:5188 usa datos ficticios y no envía WhatsApp. No equivale a prueba con sesiones reales del personal. Los cambios aún no tienen un nuevo commit; se conservan en carpeta permanente del workspace.

## Implementado
- Gestión de una misma orden junto al chat: resumen, notas privadas/compartidas, agenda, responsables, pagos, documentos e historial.
- Mensajes entrantes de texto/imagen como origen de nota o pago; archivo privado de imágenes y comprobación de correspondencia cliente/orden.
- Traspaso con aceptación, cartera habitual separada, vista administrativa por empleado/cliente y participación registrada desde el nuevo CRM.
- Propuesta técnica versionada, fotos por pieza, aprobación de oficina y revisión posterior al cierre técnico.
- Pagos reportados separados de confirmados; verificación manual con referencia, recibo operativo, prevención de reutilización de comprobantes/referencias.
- Efectivo asociado a quien lo recibió; entrega parcial a oficina reduce custodia sin repetir cobro al cliente.
- Cierre diario: ingresos y transferencias calculados sobre pagos confirmados del día. Datos antiguos de efectivo marcados por conciliar.
- Facturación existente accesible desde el chat y envío explícito de resumen/enlace de garantía. No se implementó PDF de recibo.
- Protección de pagos administrados por CRM y aprobación versionada en reglas; comprobantes privados en Storage.

## Validaciones
121/121 pruebas automáticas pasaron tras las últimas correcciones de mensajes y cierre diario. Compilación pasó; última ampliación de acceso desde Pagos pendientes se está comprobando nuevamente.
Emulador Firestore: 11 comprobaciones de reglas; Storage: 3; recorrido de servicio: 15 comprobaciones con transacciones reales sobre datos ficticios y autenticación simulada.
Visual: resumen y creación de nota ficticia revisados. Interacción posterior del navegador quedó afectada por un diálogo; reemplazado por confirmación inline y probado mediante test de componente. No afirmar recorrido visual completo.
Dos controles de publicación siguen fallando porque las reglas modificadas todavía no se desplegaron (P005/P013). No se alteraron los marcadores para ocultarlo.

## Pendientes antes de activar
- Publicar reglas y versión de pruebas juntas después de revisar compatibilidad con facturación y formularios antiguos; completar prueba con cuentas reales por rol.
- Conciliación de efectivo histórico, paginación completa del historial (actual límite con aviso), emisión real de factura y archivo real de imagen de WhatsApp sin perder protección.
- Chequeo RD$2,000/30 días: auditoría anterior reproduce cuatro fallos aún sin corregir; falta precisar inicio del plazo, uso único/mismo equipo y cancelación antes de aplicar una política nueva.
- Confirmar si aprobación de presupuesto autoriza cierre o exige autorización adicional. No asumir respuesta.
- Revisión exhaustiva de todos los módulos no está concluida. No promover www ni afirmar software totalmente probado.

## Decisiones confirmadas
Sin integración Google Calendar. Garantías vuelven a secretaría; operaria puede agendar como suplencia. Supervisora revisa después del cierre técnico. Transferencia se verifica manualmente en banco por la oficina. Anticipos sin porcentaje fijo. No se realizaron pagos, mensajes, facturas ni movimientos reales durante estas pruebas.

Fuente: tarea 01a09b59-84f9-7543-bf2a-ff5256165bbc.
