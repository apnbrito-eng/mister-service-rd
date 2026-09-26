# Atención, cartera y expediente — 22 septiembre 2026

## Implementado
- Cartera habitual separada de responsable activa del chat.
- Traspaso con resumen y aceptación exclusiva de destinataria; hasta entonces conserva la responsabilidad anterior.
- Estado pendiente/resuelto independiente de lectura. Nuevo mensaje vuelve a pendiente.
- Bandeja paginada: Todos, No leídos, Mi cartera, Atiendo yo, Órdenes del día, Pendientes.
- Expediente permanente de oficina con categorías, autor, fecha y referencia al mensaje original. Separado de evidencias de la orden y de confirmaciones de pago.
- Presencia de redacción temporal, orientativa, sin guardar el borrador.
- Avisos internos de traspaso/mensaje, con enlace autorizado. Registro atómico evita duplicar avisos cuando Meta reintenta.
- Apertura nativa desde aviso preparada; envío push protegido por activación explícita y bloqueo de envíos externos.

## Verificación
- 193 pruebas de integración en 41 archivos y compilación web/API correctas.
- Auth/Firestore locales: roles, aceptación, conflicto concurrente, reintentos, cartera intacta, seis filtros, expediente ajeno rechazado, autor original conservado.
- Webhook firmado simulado entregado dos veces: un mensaje, un aviso nuevo a la responsable activa.
- Firestore emulado rechaza reasignación directa fuera del procedimiento.
- Interfaz local: guardar mensaje en expediente, resolver atención, cartera intacta. Corregido un fallo de interfaz que perdía la referencia al mensaje.
- Anchura 390 px: bandeja y expediente accesibles sin desbordamiento horizontal de documento. No equivale a prueba en iPhone físico.
- Reglas publicadas exclusivamente en Firebase mister-service-ensayo-260921.

## Límites pendientes
- No recepción push real en iPhone: firma Personal Team sin APNs; tampoco se programó un trabajador de envío periódico.
- No prueba externa de descarga de imágenes de Meta en este recorrido. Texto y referencias sí comprobados.
- Sin prueba de carga de 5.000 clientes: sidebar/dashboard todavía conservan suscripciones anteriores; búsqueda de bandeja es solo sobre páginas cargadas y ordenación no cronológica.
- Pendientes muestra chats ya gestionados o con nuevos mensajes; no migra automáticamente el histórico.
- No nueva pantalla de reparto masivo de cartera. Se reutiliza asignación existente.
- Envío de WhatsApp real, Meta Purchase y app instalada en XR no actualizados/validados por este cambio.
- Trabajador push actual examina últimos 50 avisos de 24 horas: necesita cola/paginación antes de activarse a escala.
- Categoría Documentos no incorpora aún carga de PDF.

Producción sin cambios. No se enviaron mensajes reales ni compras a Meta.

## Publicación de ensayo
Segunda publicación completada READY, alias https://mister-service-ensayo.vercel.app. Login HTTP200 y nueva bandeja sin autenticación HTTP401. No se validó sesión autenticada remota en este cierre; recorrido autenticado realizado en emulador local. API de no leídos ajustada para dirección de índice documental compatible con orden descendente. Informe fuente del turno 01a09b59-84f9-7543-bf2a-ff5256165bbc.
