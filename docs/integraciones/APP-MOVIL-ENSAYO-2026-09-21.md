# App técnica y entorno de ensayo — 21/09/2026

Estado: **Android compilado y publicado para instalar; iPhone pendiente de Xcode/firma; pruebas físicas pendientes. No equivale a software íntegro validado ni a liberación para clientes.**

## Recursos de prueba creados

- Firebase: `mister-service-ensayo-260921`, Firestore y Storage en US-EAST1.
- Blaze vinculado por autorización explícita del usuario. Las alertas no limitan gasto; no se configuró un presupuesto automático en este avance.
- Android, iOS y web registrados en ese proyecto. Identificadores no secretos en `config/mobile.staging.json`.
- Vercel: proyecto **mister-service-ensayo**, equipo Mister Service RD Team. Dominio `https://mister-service-ensayo.vercel.app`.
- Instalador: `https://mister-service-ensayo.vercel.app/descargas/mister-service-ensayo.apk`.
- APK debug firmado, 17,993,167 bytes; SHA256 `266be8febb0e2bfbba464aba7b7a120ac9b88137bffdcba35524c118ec04bffc`.
- Cinco cuentas ficticias: administrador, secretaria, operaria, coordinadora y técnico. Credenciales solo en archivo privado local, excluidas de documentación, repositorio, APK y despliegue.
- Credencial de backend de pruebas con roles limitados al proyecto nuevo; guardada cifrada en Vercel. Copia temporal local retirada. No usar credenciales del Firebase productivo.
- Registro público de cuentas desactivado. Reglas del ensayo generadas con `scripts/mobile/reglas-ensayo.mjs` y desplegadas con `firebase.mobile-ensayo.json`; bloquean escrituras anónimas usadas por formularios públicos. Estas variantes no deben reemplazar reglas productivas sin revisar esos formularios.
- `.firebaserc` productivo NO cambiado. Todo comando de despliegue de ensayo debe especificar `--project mister-service-ensayo-260921` y la configuración de ensayo.

## Implementado

- Capacitor 7.6.9, proyectos Android e iOS con siete plugins nativos; dependencias sincronizadas.
- Cámara nativa obligatoria en inicio y foto de cierre, sin opción de galería ni guardado en álbum personal. Evidencias con origen/fecha; GPS ausente se conserva como ausente.
- Jornada explícita: iniciar/finalizar, precisión y hora real, envío objetivo cada 60 segundos cuando el sistema operativo suministra datos, estados reciente/retrasada/sin datos. No garantiza un punto exacto cada minuto.
- GPS simulado rechazado; sesiones ajenas, vencidas y muestras repetidas controladas por servidor. Oficina recibe la posición en su colección existente.
- Si falla la retirada del sensor, se conserva error y opción de reintentar. No informar falsamente que el seguimiento terminó.
- App Check obligatorio en servicios de jornada y dispositivo, con lista de aplicaciones permitidas. La compilación de ensayo usa proveedor debug: **cada teléfono debe autorizarse; esto NO valida resistencia a root/jailbreak**. Producción requiere configurar y verificar Play Integrity/App Attest, firma y políticas propias.
- API por HTTPS nativo, sin redirección de credenciales; compilación móvil restringida al proyecto/dominio de ensayo registrados.
- Chat técnico con autorización por asignación vigente y revocación tras cierre/reasignación. Consulta únicamente mensajes con `ordenId`; no expone notas de oficina.
- Canal preparado para avisos FCM y renovación del dispositivo. Worker de avisos implementado, sin programación automática activada ni prueba física de recepción.
- Identificación visible de ENSAYO. WhatsApp real bloqueado explícitamente en este despliegue; no hay credenciales de Meta ni envíos reales.

## Verificado

- 166 pruebas generales pasan (35 archivos).
- Cinco pruebas de API móvil pasan en un emulador nuevo y aislado (puerto 8299, 5.21 s). La repetición contra el emulador antiguo falló por `OutOfMemoryError` confirmado en su registro. Se conservó ese ensayo anterior y se añadió `firebase.movil-tests.json` para ejecutar y detener un emulador independiente limitado a 1 GB, sin debilitar aserciones.
- TypeScript frontend/API y compilación web/móvil completadas.
- Android `assembleDebug` correcto; firma APK verificada. Archivo descargado por HTTPS coincide byte por byte con el APK local.
- Login publicado visible con etiqueta ENSAYO.
- Autenticación HTTP real de administrador y técnico ficticios correcta. Cartera del administrador devuelve 200; APIs sin sesión devuelven 401; móvil sin App Check devuelve 403.
- Subida de PNG ficticio con cuenta técnica a Storage devuelve 200; sin sesión devuelve 403. Archivo temporal eliminado después de comprobarlo.
- Envío WhatsApp en ensayo devuelve 403 por bloqueo explícito, sin llamar a Meta.
- Auditoría de dependencias: 28 avisos (10 altos, 18 moderados), ninguno crítico en el último análisis. No equivale a auditoría integral ni a cero riesgos.

## Pendientes que impiden afirmar fase completa

1. Conectar Android, autorizar su token de ensayo y recorrer inicio, cámara, presupuesto, cierre, permisos denegados, pérdida de red, cambio de cuenta y ubicación en segundo plano. La cola GPS actual es en memoria; no prometer recuperación durable tras cerrar el proceso.
2. Xcode completo: usuario indicó que lo instalará. Compilar y probar iOS. No tiene Apple Developer; TestFlight sigue bloqueado hasta disponer de cuenta/programa y firma. No se generó IPA.
3. Push: configurar APNs en iPhone, activar la ejecución del worker y validar recepción en primer plano/segundo plano. Revisar paginación/límites de la cola antes de programarlo.
4. WhatsApp: los mensajes entrantes todavía no tienen vinculación automática general a `ordenId`. Terminar el enrutamiento explícito desde oficina antes de presentar el chat técnico como conversación completa; probar posteriormente con número autorizado.
5. Meta Purchase y validación externa de WhatsApp siguen pendientes; no se enviaron eventos ni mensajes reales.
6. Seguridad preexistente: reglas de archivos autenticados siguen siendo amplias; falta endurecimiento por orden/rol y pruebas correspondientes antes de uso real. Las variantes de ensayo cierran anónimos, no resuelven esta deuda global.
7. Persisten deudas previas de comisiones/facturas y revisión global del software. No atribuirles cobertura por las pruebas móviles.
8. Las copias del Escritorio y este checkout siguen divergentes. No hubo conciliación global ni commit/push de estos cambios.

## Preparación reproducible

- Entorno móvil privado: `.env.mobile.local`, basado en `config/mobile.env.example`.
- `npm run mobile:build`, `npx cap sync`, `npm run mobile:preflight`.
- Android: SDK 35 y Build Tools instalados en `~/Library/Android/sdk`; JDK 21 local en `~/.codex/deps/mister-mobile/`.
- Compilar Android con `JAVA_HOME` al JDK21 y `ANDROID_HOME` al SDK; `./android/gradlew -p android assembleDebug`.
- iOS: `npm run mobile:ios` cuando Xcode esté instalado. Configuración Firebase privada ya incorporada como recurso al proyecto.
- Prueba API aislada: `JAVA_TOOL_OPTIONS=-Xmx1024m npx firebase-tools emulators:exec --only firestore --project demo-mister-ensayo --config firebase.movil-tests.json "FIRESTORE_EMULATOR_HOST=127.0.0.1:8299 npx vitest run --config vitest.movil-ensayo.config.ts"`.
- El despliegue aislado se preparó desde una copia seleccionada de fuentes en `/private/tmp/mister-service-ensayo-deploy-260921`; nunca copiar `.env` ni credenciales productivas.

Fuente: tarea `01a09b59-84f9-7543-bf2a-ff5256165bbc`.
