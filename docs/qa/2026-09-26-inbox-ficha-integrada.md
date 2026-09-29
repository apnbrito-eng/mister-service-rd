# WhatsApp: ficha integrada y referencia Android

## Estado

Implementación local en la carpeta del Escritorio. Sin commit, publicación web ni APK nueva. Esta entrega modifica WhatsApp y la ficha; no certifica el flujo completo del software.

## Cambios

- Ficha con nombre, contacto, dirección, ubicación guardada y edición inline de nombre, correo, dirección, sector, ciudad y referencia. Guarda mediante el servicio existente y conserva el borrador ante errores.
- Una carga compartida de cliente y órdenes; error con reintento distinto de cliente inexistente.
- Responsable de cartera y atención del chat separados del equipo de cada orden. Controles de atención/traspaso desplegables; mismas operaciones existentes.
- Órdenes activas primero; gestión de orden dentro de la ficha, con regreso sin desmontar notas ni campos de edición. En móvil, volver al chat oculta la ficha conservando el componente.
- Notas/archivos, órdenes anteriores, garantías, facturas e historial desplegables. Animación respeta movimiento reducido. Facturas se consultan al primer uso, con estado de error/reintento que no afirma ausencia de garantías.
- Corrección del indicador de fase: el helper devuelve clases CSS y antes se usaba como un color inline inválido. Garantías que ya vencieron no se rotulan como vigentes.
- Nombre de cliente en ambas bandejas y cabecera del chat, búsqueda por nombre, teléfono secundario. Suscripciones agrupadas por hasta 30 teléfonos, actualización en vivo y limpieza entre sesiones. Si no hay coincidencia válida, conserva el teléfono.
- Fondo cálido de electrodomésticos, mensajes salientes verde claro, entrantes blancos y contraste de estados de envío adaptado. Etiquetas y control del bot conservados en Opciones de conversación.

## Verificación

- Suite completa: 274/274 pruebas de integración al incorporar las seis pruebas de ficha.
- Después: 12/12 pruebas dirigidas (seis de ficha, tres de nombres recién añadidas y tres de gestión CRM) tras ajustes de navegación y nombres.
- Compilación app/API y Vite exitosa. Aviso de tamaño de paquetes existente.
- Lint dirigido: cero errores, cinco avisos en código preexistente (refs/any).
- `git diff --check` sin hallazgos.
- Navegador local con componente real PanelCliente360 y servicios sustituidos por datos ficticios: editar/guardar sector, abrir garantía, abrir gestión de orden y volver conservando garantía y edición. En 390 × 844: documento de 390 px, sin desbordamiento horizontal, un scroll de ficha.
- Vista de escritorio con chat ilustrativo y ficha real; el chat del fixture no sustituye una prueba completa de InboxConversacion conectado.
- Evidencia: `evidencias-inbox-20260926/ficha-escritorio.png` y `garantias-movil.png`.
- Vista reproducible: `tests/manual/inbox.html`, configuración `tests/manual/inbox.vite.config.ts`. Los servicios del fixture no escriben Firebase ni envían WhatsApp. Errores reproducibles con `?error=ficha`, `?error=guardar`, `?error=garantias`.

## Límites y pendientes

- El teléfono principal sigue en lectura: es el vínculo canónico con el chat; el servicio de edición actual no contempla su cambio. No se introdujo una migración de identidad ni los campos ficticios del prototipo que no existen en el modelo.
- Respuestas rápidas personales siguen pendientes; se conserva el flujo compartido de insertar borradores.
- Sin prueba de envío real, cambio de responsables real, edición de clientes reales ni pruebas en Android físico.
- Las alertas de regresión generales ya documentadas en el informe de seguridad no quedan resueltas por este rediseño.
- Antes de publicar: incorporar revisión de Claude si se recibe, validar recorrido conectado y preparar web/reglas/Android de manera coordinada.

## APK proporcionada por Jorge

Descargada el 26/09/2026 desde `https://www.misterservicerd.com/descargas/mister-service-rd-1.0.9.apk` y analizada sin instalarla.

- Identidad: `com.misterservicerd.app`.
- Versión: `1.0.9`, código `10`.
- Firma verificada por apksigner. Certificado: Mister Service RD / Fixman SRL.
- SHA-256 certificado: `d65aec5154307ec45f707402ba180d0f9a22746d7e37dda46886f4950e8ca2cd`.
- SHA-256 APK: `3288edf9a7c15af2bbffebfda227a36db87e917eeed20850210dc4d4e521f954` (coincide con el informe de la publicación anterior).

La configuración local conserva `com.misterservicerd.tecnicos`, versión `1.0.3-ensayo`, código `4`. No generar la actualización productiva usando esos valores. La entrega de Android deberá usar la identidad productiva, la misma clave de firma y un código superior a 10; comprobarlos después de compilar antes de actualizar el enlace público. El enlace permite verificar la firma, no recuperar la clave privada. No se ha generado ni distribuido una APK nueva en esta tarea.

## Aprobación visual de bandeja y preparación — 26/09/2026

Jorge aprobó la bandeja «Todos» con nombre del cliente y teléfono debajo, antes de entrar al chat, y pidió dejarla lista para publicar. La aprobación corresponde al cambio de la bandeja; la publicación general y APK siguen dentro de la entrega coordinada pendiente.

- Lista principal, lista lateral y cabecera del chat muestran nombre asociado y teléfono. Sin nombre asociado se conserva el teléfono.
- Buscador de bandeja incluye nombre y su texto ahora lo indica.
- Vista `tests/manual/bandeja.html` renderiza el componente Inbox real con servicios y nombres ficticios, sin conexión a datos reales; no demuestra permisos de Firestore en producción. Captura `evidencias-inbox-20260926/bandeja-nombres-web.png`.
- Verificación actual: 285 pruebas de integración pasan, 63 archivos. ESLint de Inbox, InboxConversacion y hook: cero errores y tres avisos en Inbox (tipos any y contador de peticiones). Diff sin errores de espacios.
- No se ha hecho commit, despliegue, envío de WhatsApp ni APK nueva. Conexión real de nombres y Android físico siguen pendientes de comprobación en la entrega.
- Compilación completa final (TypeScript app/API y Vite) completada correctamente; aviso de tamaño de fragmentos habitual. Logs locales: /tmp/ms-prepublicacion-build.log y /tmp/ms-prepublicacion-tests.log.

## Contadores y Mis órdenes del día

Se añadió GET autenticado bandeja?conteos=1, manteniendo guard de oficina. Conteos de conversaciones sin leer para Todos/No leídos/cartera/asignadas/pendientes, independientes de las páginas cargadas; respeta ocultamiento personal/global. Órdenes del día cuenta todas las órdenes activas programadas en Santo Domingo; Mis órdenes del día usa responsabilidad CRM, con alternativas de responsable de orden/operaria. Ambos cuentan órdenes incluso sin chat, mientras sus listas muestran conversaciones vinculadas. El filtro personal pagina las órdenes fuente, por lo que una página puede no tener coincidencias y conservar cursor.

Hook refresca cada15s mientras visible y al recuperar foco. Errores muestran sin datos, no cero. Pruebas helper/hook:5 pasan, cubren >25 chats, múltiples mensajes, ocultos, nuevos mensajes, ventana local diaria y responsabilidad. TypeScript app/API pasan. Build previo a Mis órdenes del día pasó; no afirmar build final de este añadido. Sin lecturas conectadas ni escrituras reales; validar latencia/coste de consulta sinLeer + órdenes diarias antes de entrega. Fixture muestra contadores ficticios.

Orden de botones aprobado: Todos, Mis órdenes del día, Órdenes del día, No leídos, Mi cartera, Atiendo yo, Pendientes.
