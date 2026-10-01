# Accesos superiores y agenda hacia WhatsApp — 01/10/2026

## Petición y cambio
Jorge pide que Agendar servicio y Escribir por WhatsApp aparezcan primero, también en móvil, y que al enviar se guarde la solicitud interna y se abra el WhatsApp del cliente hacia la empresa.

- Campo de correo retirado del formulario y del resumen por petición posterior de Jorge. Campo de contacto: «Teléfono o WhatsApp».
- Barra persistente con ambas acciones debajo de la marca, antes de la imagen y del contenido, independiente del menú. Jorge corrigió la posición inicial por quedar demasiado arriba.
- Formulario ancho en tabletas hasta 1100px; corrige el campo de dirección estrecho.
- Tras respuesta satisfactoria de `/api/publico/cita`, se monta la confirmación y se navega a `wa.me/18495646767` con el resumen. Se conserva enlace manual y el guardado no depende de WhatsApp.
- Mensaje incluye contacto, equipo, falla, fecha/hora, campos personalizados y, si fueron proporcionados, GPS, RNC/razón social y enlace de foto.
- Aviso previo y confirmación explican que el cliente debe pulsar Enviar en WhatsApp. Abrir WhatsApp no demuestra entrega del mensaje.
- Rechazo del servidor o fallo de red no abre WhatsApp. Fallo de navegación conserva la confirmación del guardado.

## Validación local
- Build web/API PASS; aviso existente de chunks grandes.
- 13 pruebas PASS: formulario (6), navegación (2), canal público (2), catálogo (3).
- Lint focalizado y git diff --check PASS; cazadores de regresión 0 hits.
- Navegador: portada 320/390/1280px, agenda 320/768px; acciones arriba y sin desborde horizontal. A 768px el formulario pasa de 440px aproximadamente a 714px.
- Envío probado con API simulada; no se crearon citas ni se enviaron mensajes reales. Apertura nativa y envío final pendientes de prueba en teléfono físico.
- Cambios de producción limitados a tres archivos públicos; sin cambios API, reglas, IA o usuarios.

## Publicación
Pendiente de registrar deployment y versión verificada.

Fuente: conversación 01a0f833-70e2-7e63-b204-027995df6176, solicitud de Jorge del 01/10/2026.
