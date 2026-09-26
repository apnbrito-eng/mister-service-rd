# Chat móvil, notas de voz y avisos — 24/09/2026

## Cambios
- Conversación móvil ocupa su propia pantalla: una cabecera, perfil pulsable para cliente/órdenes y regreso al chat. Navegación global y asistente flotante ocultos en esta vista. Conserva gestión/expediente y acciones por mensaje.
- IA y plantillas bajo menú de acciones; campo de mensaje de una línea, crecimiento limitado, botones táctiles de 44px.
- Audio entrante: descarga autenticada por media-proxy y reproductor. Audio saliente: captura nativa Android AAC/M4A, escucha previa, descarte y envío explícito. Máximo 2 minutos/2MB. Web/iOS usan MediaRecorder solo si ofrecen MP4 u Ogg Opus; no se envía WebM fingiendo ser otro formato.
- Audio usa envío existente con validación de ventana/opt-out y clave de reintento estable. Registro de autor en archivo. Micrófono liberado y archivo temporal borrado al cancelar/destruir/pausar en Android.
- Avisos: permiso/registro al iniciar sesión nativa, aviso en primer plano, cron autenticado cada minuto, paginación de 200 y deduplicación por aviso/dispositivo. Solo nuevos avisos desde activación; no envío masivo histórico. Chat asignado avisa al responsable; sin responsable válido avisa a administradores activos.

## Verificación
- 227 pruebas/48 archivos pasan; TypeScript frontend/API pasan; lint dirigido sin errores tras corrección.
- Debug y release Android compilados. APK1.0.3/code4 firmado con misma clave.
- Emulador Android: grabación real local generó M4A de 20.092bytes, cabecera ftyp; sin subida ni mensaje externo.
- Pantalla chat: 624px de conversación con ventana cerrada en viewport839px. Con teclado viewport527px, conversación312px y campo termina519px. La ventana estaba cerrada: campo habilitado solo en DOM para medición, sin alterar datos ni enviar.
- Perfil abre detalles y regreso al chat. Prueba con conversación ficticia sin mensajes; no es validación completa de historial largo ni del flujo real de órdenes.
- Consulta producción dispositivos_moviles: sin dispositivos registrados antes de nueva versión. Esto confirma que aún no se puede afirmar recepción física.

## Pendientes explícitos
- Instalar1.0.3 en Samsung, conceder notificaciones y probar audio real y aviso con app cerrada usando destinatario autorizado.
- Revisión de todas las funciones de todos los módulos sigue parcial; esta entrega aborda chat y mecanismos compartidos, no certifica todo el software.
- iOS no recompilado en esta entrega; APNs depende de configuración/cuenta Apple aún pendiente. No afirmar push iPhone funcionando.
- Entrega y reproducción real de audio Meta no probadas; no se enviaron mensajes a clientes.
- Audios salientes tienen URL firmada de7d; reproducción histórica requiere futura renovación de enlace.

## Publicación
Vercel producción READY https://mister-service-c5yskb33w-mister-service-rd-team.vercel.app, alias www.misterservicerd.com. APK público1.0.3 HTTP200, MIME APK,15.955.731bytes; SHA256 c5cc2763074039d77652364d52ecda2942cdb962797fb0038ffea3e9a2a8863e idéntico al archivo firmado. Login/guía200; worker sin autorización401. CRON_SECRET/MOBILE_PUSH_ENABLED/MOBILE_PUSH_START_AT configurados en producción sin exponer valores. No dispositivo real registrado/entrega push aún comprobados.
