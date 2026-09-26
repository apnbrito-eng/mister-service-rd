# PDF interno — Android 1.0.7

Implementado: tarjeta PDF por MIME o extensión, primera página y total de páginas, precarga al acercarse al viewport, visor interno con paginación, zoom 1–3, progreso/error/reintento, cierre con vuelta al chat y restauración de foco. Motor PDF.js y worker empaquetados localmente; sin servicio externo de conversión. La autorización del archivo conserva media-proxy existente.

Validación: TypeScript pasa; 251 pruebas/55 archivos pasan. Prueba visual local con PDF sintético de dos páginas: miniatura, apertura interna, página siguiente, zoom y regreso. Bundle móvil producción y APK firmado 1.0.7/code8 generados, proyecto Firebase y origen API reales comprobados en assets. APK 15.962.150 bytes; SHA256 abb5f2ab7a31eae968e424fc1da8ec91f29a515df19369a03e19facb516bc58c.

Límites: todavía sin prueba física Samsung ni PDF real recibido vía Meta en esta revisión. No certifica notificaciones ni el resto de formatos. El visor pagina por botones; no incluye búsqueda, selección de texto, impresión, compartir nativo ni contraseña para PDF protegido. El guardado en expediente continúa desde las acciones existentes del mensaje. Publicación pendiente de verificación remota al redactar.

Publicación completada: Vercel q5ciolpdz en alias producción. Login y guía HTTP200; guía enlaza1.0.7; APK remoto HTTP200/application/vnd.android.package-archive, tamaño y SHA256 idénticos al firmado local. Emulador actualizado sin desinstalar y pantalla de login verificada. Samsung físico pendiente.

## Fallo físico posterior y corrección de Storage
El usuario reportó PDF real con vista previa no disponible en1.0.7. Lectura configuración bucket producción confirmó CORS limitado a antiguo dominioVercel ylocalhost5173; excluía https://localhost(Android),capacitor://localhost(iOS) ywww.misterservicerd.com. Añadida regla GET/HEAD para esos orígenes máshttp://localhost ydominioapex,exposiciónRange/Content-Range/Content-Length/Accept-Ranges. Reglaspreviasconservadas,metagenerationprecondition,backupprivado sin credenciales. Sin modificarACL/reglasFirebase/firmas.
Verificación: OPTIONS origenAndroidHTTP200alloworiginexacto; lectura parcial autenticada del únicoPDFalmacenado HTTP206,encabezado%PDF-,Content-Range yAllowOriginAndroidpresentes. Falta confirmación interfazSamsung; no afirmar que errorprotegido era diagnóstico, era mensaje genérico. Corrección servidor aplica APK1.0.7 existente.
