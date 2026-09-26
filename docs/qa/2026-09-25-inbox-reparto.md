# Mensajería y reparto de conversaciones — 25/09/2026

## Decisiones confirmadas
- Autoasignar chats sin responsable válido solamente a secretarias y operarias activas con entrada registrada en la jornada de República Dominicana y sin salida posterior.
- Conservar responsables existentes. Sin personal de turno, dejar la conversación sin asignar y avisar a administración. El reparto se ejecuta al llegar un mensaje, no al fichar entrada.
- Transferir únicamente la cita seleccionada; conservar otras citas y órdenes cerradas. La cita transferida queda sin técnico hasta que la nueva responsable lo asigne.
- Al cambiar técnico mediante agenda CRM o edición de orden, resolver su operaria y actualizar responsable/chat con auditoría. Rechazar técnicos sin una responsable válida y conflictos de horario.

## Cambios
- Vista previa automática de imágenes/stickers cercanos a pantalla; video con controles, precarga de metadatos y primer fotograma solicitado, sin reproducción automática.
- Texto aparece pendiente inmediatamente y se conserva por usuario y mensaje en el almacenamiento local. Reintentos con el mismo identificador tras fallos de red evitan duplicación. Corre con la aplicación abierta; no constituye una tarea garantizada del sistema operativo con la app cerrada.
- Inbox muestra hora en las últimas 24 horas, fecha después. Mantener pulsado u opciones abre favorito, lista, silenciar, ficha y limpieza de la vista personal.
- Ocultar/vaciar afecta la vista del usuario, no borra el expediente compartido. Un mensaje posterior vuelve a mostrar una conversación oculta.
- Silenciar excluye avisos de mensajes en el despachador; no silencia avisos de órdenes.
- Rotación de reparto y recepción se confirman en una transacción; cambios de responsable/cita incrementan versiones y rechazan estados obsoletos.

## Verificación
- 248 pruebas automatizadas, 54 archivos, todas pasan.
- Nuevas pruebas: rotación equitativa y turnos, cola sin red y respuesta perdida, aislamiento de sesión, mensajes añadidos durante envío, traspaso de una sola cita entre varias, rechazo de cerradas, idempotencia y precarga sin autoplay.
- TypeScript frontend/API y compilación móvil de producción correctos.
- APK 1.0.6 / código 7: firma de producción conservada; sin APKs anteriores anidados.
- SHA-256: b23fab20a6586a41f85ff77737272c0de6912c39722e5674081e9d4b9adbb910.

## Límites de esta comprobación
- No se enviaron WhatsApps ni se reasignaron clientes reales durante las pruebas.
- El Samsung no aparece conectado por ADB; la recepción de archivos reales, el primer fotograma según códec, notificaciones con app cerrada y el recorrido táctil requieren la comprobación en el teléfono.
- iOS no se recompiló en esta entrega.
- Favoritos/listas filtran las conversaciones cargadas; se puede ampliar el listado. Los otros filtros especializados aún no tienen la misma actualización en vivo que Todos.

## Publicación verificada
Producción Vercel READY: `mister-service-9puzf7346-mister-service-rd-team.vercel.app`, alias `www.misterservicerd.com`. Login HTTP200; APK 1.0.6 HTTP200 y hash igual al firmado. APIs de preferencias/atención rechazan consultas sin sesión (401). APK instalado y pantalla de acceso abierta en emulador; no constituye prueba autenticada de todos los módulos.
