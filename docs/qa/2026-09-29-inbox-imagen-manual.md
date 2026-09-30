# Imagen manual en Inbox

- Nuevo AdjuntarImagen: archivo local JPEG/PNG hasta 5 MB, validarFoto y firma básica de cabecera. Vista previa y texto antes del botón Enviar imagen.
- Subida sólo después del clic explícito a whatsapp-media/{waId}/imagen-{tempId}. No recibe URLs externas ni transfiere automáticamente fotos del modal de suplidores.
- Gate del Inbox: roles oficina, sesión, conversación del destinatario actual, ventana abierta, sin bajaSolicitada y sin envío de texto ocupado. Se preservó bajaSolicitada al leer la conversación; antes se omitía ese campo aunque UI ya lo consultaba.
- Revalida disponibilidad después de subir y antes de enviar. Cambiar receptor/desmontar invalida tareas anteriores y revoca vista previa. No puede retirar una solicitud de envío que ya llegó al servidor.
- Bloqueo síncrono evita doble clic. Reintentos conservan tempId, URL y texto. Después del primer intento texto/archivo quedan congelados para repetir exactamente el mismo envío. Un fallo nunca muestra éxito.
- Storage utiliza ruta ya existente y reglas autenticadas actuales; no se añadieron reglas ni endpoint. La validación MIME/cabecera del cliente no sustituye endurecimiento de permisos de Storage pendiente.

## Pruebas

5 pruebas mock: selección no envía; error y reintento mismo ID/una subida; doble clic; cambio receptor durante subida; revocación durante subida; validación MIME/tamaño/firma. No se enviaron mensajes reales ni se subieron archivos reales. TypeScript y lint verificados por separado. Pendiente prueba física y envío real autorizado.
