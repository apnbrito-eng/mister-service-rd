# Pendientes de mejoras — revisión con Jorge

Fecha:27/09/2026. Fuente: chat01a0e013-8ae2-7ed0-be3e-23142f7e2ae3. Jorge pide construir una lista a partir de capturas; esta petición no autoriza implementar automáticamente cada propuesta.

## Captura1 — Inbox WhatsApp móvil, menú de mensaje

Evidencia: [captura](evidencias-mejoras-20260927/01-inbox-menu-movil.png). No se abrió ni modificó la conversación real para esta revisión. Prioridades provisionales; propuestas pendientes de confirmar con Jorge.

| ID | Observación en la imagen | Mejora propuesta | Prioridad provisional | Estado |
|---|---|---|---|---|
| UI-01 | Jorge pide poder salir del menú tocando fuera, sin depender de «Cerrar». | Cerrar el menú al tocar cualquier zona exterior; tocar una opción conserva su acción normal. Mantener «Cerrar» como alternativa. | Por priorizar con Jorge | Requisito confirmado; solo plan |
| UI-02 | Mensajes salientes muestran literalmente asteriscos alrededor del nombre del remitente. | Revisar presentación del nombre y formato de WhatsApp para que no aparezcan marcas de formato como texto. | Media | Pendiente de confirmar y reproducir |
| UI-03 | Aviso amarillo de ventana cerrada, botón de plantilla y caja deshabilitada consumen una zona amplia abajo y repiten la indicación. | Compactar el estado y mantener una acción clara para enviar plantilla, conservando el motivo del bloqueo. | Media | Pendiente de confirmar |

## Lo que la captura no demuestra

No confirma si guardar en orden, guardar en expediente o registrar pago fallan; tampoco si el estado de ventana24h está mal calculado. No hay suficiente contexto de fechas para juzgar la cronología. El reproductor de audio se ve, pero no hay evidencia sobre si reproduce correctamente. No tratar esas posibilidades como fallos confirmados.

## Siguiente paso

Recibir las siguientes capturas y las aclaraciones de Jorge; consolidar prioridades antes de implementar. No se modificó código ni se desplegó nada por esta captura.

## Aclaración de Jorge — captura1
El cambio solicitado es únicamente el cierre al tocar fuera del menú. No queda aprobado rediseñar su tamaño o posición. Criterios de aceptación propuestos: toque exterior cierra sin activar otra acción accidental; toque interior sobre una opción ejecuta esa opción; «Cerrar» sigue disponible; comprobar móvil y web. Comportamiento actual al tocar fuera reportado por Jorge, no reproducido todavía.
Jorge recalca: estamos armando un plan, no corregir de golpe. UI-02 y UI-03 son observaciones del asistente, no solicitudes aprobadas. Esperar más capturas y autorización de implementación.

## Captura2 — chat móvil con menú cerrado
[Imagen](evidencias-mejoras-20260927/02-inbox-chat-movil.png). Recibida sin descripción de cambio; pendiente aclaración de Jorge. No se deduce una solicitud nueva de los asteriscos, audio, fechas o ventana24h. Se mantiene alcance exclusivamente de planificación.

### Requisito confirmado para captura2 — distribución de mensajes en móvil
**UI-04 — Espaciado y alineación de burbujas.** Jorge indica que los mensajes se ven demasiado juntos, uno encima del otro, y pide que los mensajes entrantes estén un poco más hacia la izquierda. Registrar como requisito confirmado para el plan, pendiente de priorización e implementación.
Criterios propuestos: reducir el margen izquierdo de las burbujas recibidas sin pegarlas al borde; aumentar la separación vertical entre mensajes para evitar sensación de amontonamiento; conservar enviados a la derecha, texto legible y acceso al menú sin invadir la burbuja. No se ha acordado una medida exacta en píxeles. Validar el ajuste en móvil con textos cortos/largos y mensajes de audio. No modificar código todavía.

## Captura3 — Clientes en iPad horizontal
[Imagen](evidencias-mejoras-20260927/03-clientes-ipad-horizontal.png).

**UI-05 — Nombres y filas legibles al girar el iPad.** Jorge reporta que el módulo Clientes se ve cortado al girar el dispositivo a horizontal. La captura confirma nombres divididos letra por letra, filas excesivamente altas y botones junto al texto estrechado. Es el módulo Clientes; Jorge indica que Clientes y Responsables ya fue resuelto. La expresión «nombre en forma vertical» describe el defecto observado, no una petición de diseñar texto vertical.

Resultado previsto: nombres legibles en líneas normales, sin fragmentarlos letra por letra; acciones accesibles sin comprimir el nombre ni superponerse; lista y ficha adaptadas al espacio disponible. Comprobar ambas orientaciones, el giro sin recargar, nombres largos y menú lateral abierto/cerrado. Causa técnica y comportamiento al girar pendientes de reproducir; la captura por sí sola no los demuestra. Estado: requisito para el plan, sin implementación ni despliegue.

### Referencias anteriores de WhatsApp
Jorge pidió recuperar capturas anteriores para comparar la presentación de mensajes. Se identificó el chat «Flujo CRM y garantías», pero todavía no se han recuperado ni comparado visualmente esas imágenes. Pendiente de continuar la búsqueda.

## UI-06 — Organización de Solicitudes en móvil
Jorge considera desorganizada la vista móvil, especialmente sus botones. Requisito confirmado: reorganizar la pantalla; distribución concreta pendiente de acordar. Propuesta para revisión: búsqueda arriba; filtro principal de estado compacto; empresa como filtro secundario; espacio claro para la lista. Mantener accesibles todos los estados existentes. Comprobar textos legibles, botones cómodos y ausencia de desbordamiento horizontal.
Evidencias: [web](evidencias-mejoras-20260927/04-solicitudes-web.png) y [móvil](evidencias-mejoras-20260927/05-solicitudes-movil.png). Son capturas del sitio publicado con viewport de escritorio y móvil; no prueba física de APK. En esta sesión había cero solicitudes, por lo que falta evaluar filas y detalles con registros. Solo planificación; no se modificó código de aplicación.

### Aprobación del ensayo de Solicitudes
Jorge indica «Me parece bien» tras mostrar solicitudes-ensayo.html. Diseño aceptado para futura integración; aún no aplicado al código de la app. Pide continuar revisando el menú lateral completo.

## UI-07 — Unificar navegación de Solicitudes y Citas
Jorge pide colocar Citas por confirmar dentro de Solicitudes. Decisión confirmada: una entrada lateral Solicitudes con dos secciones internas, Solicitudes recibidas y Citas por confirmar; eliminar acceso independiente del menú lateral y ajustar navegación superior. Mantener los procesos de aprobación/conversión y confirmación/agendamiento de cada origen. Preservar acceso por enlaces existentes y avisos pendientes al integrar. Ensayo local actualizado; producción aún no modificada.

## UI-08 — Atención y clientes unificado
Jorge confirma unificar Conversaciones (Inbox WhatsApp), Clientes y Solicitudes en un espacio con tres pestañas, con Citas por confirmar dentro de Solicitudes. Conservar cliente seleccionado al cambiar de vista; móvil una vista a la vez con regreso a lista; web lista y detalle. Ensayo interactivo atencion-unificada.html con datos ficticios. Pendiente integración real, preservar filtros globales y bandejas completas, permisos, enlaces y contadores existentes. Aprobación de estructura; no se ha desplegado.

### Alcance confirmado de Atención y clientes
Jorge pide reunir todo lo relacionado con atención al cliente en ese módulo. Incluir Inbox completo (Todos, Atiendo yo, Mis órdenes del día, Mi cartera, Órdenes del día, No leídos, Pendientes y contadores), Clientes, Solicitudes con Citas por confirmar, Clientes y responsables y Empresas Aliadas. Una sola entrada lateral con navegación interna. Distribución interna adicional por ensayar; preservar funcionalidades, permisos y acceso a expedientes/órdenes/garantías. No se acuerda mover los módulos operativos de servicios o contabilidad. Pendiente integración real.

## Actualización de entrega — 28/09/2026
La lista anterior conserva el historial de planificación. La autorización posterior permitió implementar y publicar la unificación y los ajustes visuales en Android 1.0.16 y web.
- UI-01: cierre al tocar fuera, Escape, teclado y acciones implementados y probados.
- UI-04: separación vertical de mensajes y menú de recibidos situado después de la burbuja incorporados; no equivale a una reproducción completa de WhatsApp.
- UI-05: distribución adaptable de Clientes implementada; comprobada en navegador móvil/escritorio. Sigue pendiente iPad físico al girar.
- UI-06/UI-07/UI-08: Solicitudes, citas internas y área de Atención unificadas, con pruebas de contexto de cliente y navegación.
- UI-02/UI-03 siguen siendo propuestas no confirmadas, no requisitos ejecutados.
- Botón IA movible añadido, probado y publicado. Evidencia, límites y descarga en `../diseno/REVISION-GLOBAL-2026-09-28.md`.
