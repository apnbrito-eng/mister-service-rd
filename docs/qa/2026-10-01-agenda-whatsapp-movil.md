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
- Cambios iniciales limitados a cabecera, estilos y formulario; ampliación posterior del carrusel descrita abajo. Sin cambios API, reglas, IA o usuarios.

## Publicación
PUBLICADO y promovido: commit `22f6512`, deployment `dpl_4vWfWoHzXsARZcKFsDqXtrqSZjwJ`, https://mister-service-ba7okgo32-mister-service-rd-team.vercel.app. Dominio oficial devuelve versión22f6512 (builtAt2026-10-01T20:32:13.268Z). Cinco imágenes públicas descargadas para comprobar SHA256 idéntico al archivo fuente; APK1.0.20 sigue respondiendo200.

Navegador oficial390px: imágenes cargadas, carrusel visible, botones debajo de la marca y sin desborde. Agenda oficial sin input email, etiqueta Teléfono o WhatsApp y explicación del envío presentes. Capturas: `~/.codex/artifacts/mister-service/agenda-whatsapp-20261001/portada-publicada.png` y `agenda-publicada.png`. No se envió una solicitud real ni un WhatsApp; recorrido nativo Samsung pendiente. Intermedias08222fa/b1c0f55/e65fde1 no promovidas; intento7caa366 cancelado para incorporar la corrección de toque, reemplazado por22f6512.

Fuente: conversación 01a0f833-70e2-7e63-b204-027995df6176, solicitud de Jorge del 01/10/2026.

## Ampliación: equipos armados y desarmados
Petición posterior: diapositivas cada 3 o 5 segundos, secadora independiente negra/gris oscuro y pares armado/desarmado sin animación de piezas. Implementado intervalo de 5 segundos y cambio directo, sin fundido. Incluye lavadora blanca, nevera, aire, estufa y secadora gris oscuro, 10 vistas. Imágenes generadas con imagegen y guardadas como cinco sprites JPEG (aprox. 1.5 MB en conjunto); originales conservados fuera del proyecto en generated_images. Son ilustraciones comerciales, no despieces técnicos verificados.

Controles anterior/siguiente/pausa; pausa por selección manual, foco, puntero de ratón o pestaña oculta; respeta movimiento reducido. La intención Instalación viaja a agenda y WhatsApp igual que Reparación/Mantenimiento. Conserva contenido CMS, disponibilidad y presentación opcional.

Validación ampliada: 22 pruebas del flujo público PASS (21 iniciales y una adicional de pausa/reanudación táctil), build web/API PASS, lint focalizado PASS. Pruebas cubren 5 segundos exactos, pares de imágenes, cambio de equipo, pausa manual, movimiento reducido, secadora independiente e intención Instalación. Navegador local 390/1280px: secadora oscura, vista armada/desarmada y servicios visibles. Se ajustó el encuadre para ocultar restos de la otra mitad del sprite. La representación móvil no equivale a prueba física en Samsung. Samsung SM-S928U detectado conectado; control remoto Chrome bloqueado por política de la herramienta, sin eludir el bloqueo.

## Ajuste de transición — 01/10/2026
Jorge reporta que el cambio directo es brusco y pide suavizarlo. Sustituido por fundido cruzado de650ms easeInOut entre las fotos estáticas; intervalo5s conservado. Respeta movimiento reducido (duración0), encuadre y controles existentes. Comprobación navegador local390px: ambas fotos coexistieron con opacidades0.711/0.289 durante la transición; no interpolación de piezas/posición.9pruebas de carrusel, TypeScript y lint focalizado PASS. Publicación del ajuste pendiente de registrar.
