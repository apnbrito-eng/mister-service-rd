# Formularios públicos y subidas: revisión local

## Cambios

- `/f/:slug` envía por `/api/publico/solicitud`, con App Check obligatorio, campos/tipos/opciones leídos de la definición guardada, metadatos de empresa del servidor, cuota y creación idempotente en una transacción.
- El requestId se conserva cuando el POST falla. Los permisos se conservan por Blob, destino y campo, incluso ante respuesta perdida del PUT; primero se intenta recuperar la finalización. Las subidas exitosas se reutilizan por archivo y campo; un reintento no cambia el contenido de la petición accidentalmente. La referencia conserva los últimos ocho caracteres del documento para localizarla en administración.
- Archivos de `/f`, `/agendar` y calendario público usan `/api/publico/subida`. El archivo viaja directamente a Storage con PUT firmado: ruta aleatoria del servidor, cinco minutos de vigencia, MIME explícito, longitud exacta firmada y `x-goog-if-generation-match:0` para impedir sobrescribir/reutilizar una subida exitosa.
- El navegador no establece Content-Length manualmente: envía Blob y calcula su longitud. La firma sí incluye esa longitud. Cabeceras en minúsculas para evitar duplicados en el SDK.
- Completar comprueba tamaño, MIME y marcador privado en metadata; agrega el token de descarga Firebase usando su clave JSON exacta. El registro de formulario comprueba URL, bucket, ruta, token, permiso finalizado y pertenencia al campo/formulario. No acepta URLs arbitrarias.
- Firestore y Storage cierran creación/subida anónima directa. Las operaciones de staff y archivos antiguos se conservan. No se alteró el comodín autenticado de Storage.

## Límites técnicos provisionales

Configurables exclusivamente en servidor, no cifras confirmadas por Jorge: 500 solicitudes dinámicas/hora, 1000 permisos de archivo y 100 MiB reservados por hora. Las reservas fallidas conservan cupo durante la hora. No se usa IP para bloquear una oficina o red compartida. Límite individual: fotos menores de5 MiB y archivos dinámicos menores de10 MiB. MIME: JPEG, PNG, WebP, GIF, HEIC, HEIF y PDF; PDF solo en campo archivo, SVG rechazado.

Los permisos firmados no limitan intentos de red fallidos; la precondición impide segundas escrituras exitosas. No se configuró limpieza automática de objetos abandonados ni retención de documentos de cuota en esta unidad: deben definirse antes de certificar costes prolongados.

## Verificación

- `/f`: cuatro pruebas de emulador, incluida concurrencia, tipos dinámicos, formulario inactivo, cuota y HTTP local real con cuerpo string/objeto.
- Citas públicas: nueve pruebas de servidor siguen pasando con el nuevo contrato de archivos.
- Subidas: cuatro pruebas de emulador con adaptador de Storage falso. Validan firma parametrizada, cuota, PDF de9 MiB, SVG rechazado, tamaño incorrecto, finalización y enlace a campo/bucket; HTTP local real, sin subir archivos.
- Cliente: dos pruebas de reintento/doble toque; una prueba del SDK real con firma local sustituida comprueba que Content-Length y generación0 participan en la firma sin duplicar Content-Type. No llama Google.
- Storage Emulator: tres pruebas rechazan visitantes en las tres rutas y conservan escritura autenticada.
- Firestore público: doce pruebas, incluyendo rechazo de create directo.
- Cazador P-026 ampliado; P-005/P-013 señalarán reglas pendientes hasta despliegue real. No alterar locks para simular publicación.

## Bloqueos de despliegue y prueba pendiente

**No se publicaron reglas ni endpoints ni se subieron archivos reales.** La firma Google Storage, CORS del bucket y el PUT con longitud automática en Safari/Android no han sido probados contra infraestructura real. No se cambiaron IAM ni CORS. Antes de cerrar reglas en producción se debe probar una subida autorizada controlada, validar el rechazo de segunda escritura y tamaño/MIME incorrectos, y comprobar que el token Firebase permite ver el archivo desde administración. Si falta CORS o permiso de firma, corregir configuración de forma explícita y repetir la prueba; nunca reabrir subidas anónimas como parche.

Los endpoints y frontend deben publicarse coordinadamente antes del cierre de reglas; pestañas antiguas necesitan recarga. No dar por terminado este circuito real solo por los mocks.

Referencia técnica: [Google Cloud Storage PUT Object](https://docs.cloud.google.com/storage/docs/xml-api/put-object), Content-Length y precondición de generación0. La implementación instalada del SDK conserva extensionHeaders al canonicalizar la firma.
