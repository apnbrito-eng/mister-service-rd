# Acceso real y marca Android — 24/09/2026

Usuario reportó error genérico de acceso en APK1.0.1 con cuenta habitual y pidió actualizar logo/icono/eslogan.

## Diagnóstico y solución
- Verificada configuración pública empaquetada: Firebase mister-service-app-cloude, API www.misterservicerd.com. No apuntaba a ensayo. No se cambiaron cuentas ni contraseñas.
- Firebase Authentication de producción exige App Check (sondeo con datos ficticios devuelve 401 Firebase App Check token is invalid).
- API playintegrity.googleapis.com estaba DISABLED en proyecto342961599729, aunque FirebaseAppCheck estaba ENABLED y Android registrado/firma configurada. Se activó Play Integrity mediante Service Usage, luego GET confirmó ENABLED. No se relajó enforcement, no debug tokens, no cambio de integridad mínima.
- Usuario reabrió el APK existente1.0.1 en Samsung y confirmó «ya entro». Esto verifica acceso según usuario; aún no hay captura de logs físicos/ADB del Samsung ni pruebas completas de operaciones.
- Login móvil nuevo verifica disponibilidad del token antes de autenticar para mostrar APP-VERIFY en caso de problema de certificación, no mensaje genérico de contraseña/conexión. Correo se recorta sin modificar contraseña.

## Marca
- Nueva mascota/icono generada a partir de logo-compacto original: public/logo-app-2026.png; originales conservados.
- Logo de interfaz ahora muestra nombre tipográfico legible, versión clara sobre fondo oscuro. Login usa eslogan ya existente del sitio: «Lo arreglamos en tu casa, el mismo día».
- Sustituidos launcher normal/round/adaptive en densidades Android, con fondo azul e inset de seguridad. Eliminado ícono genérico de Capacitor. Año pie dinámico.
- Captura del APKrelease en emulador: /tmp/mister-logo-login.png. Revisada legibilidad/maquetación, sin introducir credenciales reales.

## Paquete y verificaciones
- com.misterservicerd.app versión1.0.2/code3; misma firma release para actualización sin desinstalar.
- Typecheck y lint dirigido pasan;224/224 pruebas47archivos; buildmobile y assembleRelease correctos; apksigner verify correcto.
- APK1.0.2 instalado y lanzado en emulador para inspección visual. La prueba de acceso físico confirmada por usuario fue1.0.1 tras corrección de servidor.
- Pendientes habituales: funciones nativas, guardar credenciales del gestor, mensajería/notificaciones/GPS y todos roles no quedan certificados por este cambio.

Launcher Android inspeccionado en emulador: nuevo ícono circular de producción legible y sin recortar rostro/llave; captura evidencias-acceso-logo-20260924/icono-android.png. Ícono genérico que aparece al lado corresponde a app separada de ensayo, que no se actualizó en este turno.

Publicación final READY dpl_7EiKambCTXKN3oybZ8ndQoe8JseR. Web real/login200, logoPNG200, guía1.0.2/200. APK /descargas/mister-service-rd-1.0.2.apk MIMEcorrecto/200/15.953.184bytes, hashidénticolocal 5e5380e360bb474e495c3ecb7f71c0de74845899ec7f5700eb72f789f3ff2be1.
