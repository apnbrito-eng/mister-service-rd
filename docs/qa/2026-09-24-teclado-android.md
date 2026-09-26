# Teclado, desplazamientos y credenciales — Android 24/09/2026

Solicitud: corregir teclado que tapa el acceso en Samsung S24 Ultra, revisar chat y formularios, sesión y guardado de credenciales. Producción autorizada en esta tarea. No pruebas ni mensajes a clientes reales.

## Causas y correcciones
- Capacitor Android 7.6.9, target35: su listener edge-to-edge consume insets de barras/cutout pero omite IME. MainActivity reserva la unión de barras/cutout/teclado en Android15+, con adjustResize declarado para anteriores. Clase de teclado permite ocultar navegación inferior mientras se escribe.
- Altura visible compartida con VisualViewport para login, layout, IA móvil y modal; no modifica zoom manual. Solo desplaza campos fuera del área visible, no reinicia chats ni listas a cada pulsación. Reduce cabecera del login al escribir.
- Conversación ocupa espacio flex restante en el contenedor principal sin sumar la altura de otras cabeceras.
- Modal compartido heredaba 24px del space-y-6 de Cotizaciones. Se reproduce overlay y=24, bottom551 en viewport527. Portal a body elimina herencia; overlay y0/bottom527 y textarea bottom511.8. La comprobación inicial fue moviendo el DOM del componente en el emulador; source final usa createPortal equivalente.
- Login: name=username/password, autocomplete=username/current-password, sin autocapitalizar correo, acciones Next/Go; plugin Android solicita commit a AutofillManager solo tras login exitoso, sin transmitir o almacenar contraseñas en plugin. Firebase ya tiene indexedDBLocalPersistence; conservada.
- Respeta preferencia global de movimiento reducido. No se añadió animación de altura al teclado porque compite con la animación nativa.

## Evidencia
- Emulador Android API35, teclado completo (se desactivó escritura con lápiz y se habilitó teclado en pantalla en el emulador).
- Login: viewport839 sin teclado →527 con teclado. Correo bottom355.5; contraseña bottom447; botón bottom507, todos visibles. Tab del correo a contraseña correcto.
- Cuenta ficticia administrador: login correcto y sesión conserva acceso después de forzar cierre y relanzar. No se guardan credenciales en informe.
- Chat de ensayo vacío/ventana24h cerrada: habilitado el textarea SOLO en DOM para probar distribución, sin cambiar regla de negocio ni enviar. Composer bottom508.1 con viewport527; navegación inferior oculta. Esto NO valida envío WhatsApp ni conversaciones largas.
- Cotizaciones: abierto formulario sin guardar; textarea visible tras cambio de portal. No emitidas cotizaciones.
- 224/224 pruebas, 47 archivos; TypeScript y lint dirigido pasan. Debug y release compilan, apksigner verifica misma firma de versión1.0.0.

## Publicación
APK real1.0.1/code2, com.misterservicerd.app. Instalar como actualización sin desinstalar. Web real actualizada con cambios de interfaz; las correcciones nativas requieren APK nuevo.

## Límites de la revisión
No es una certificación de cada función/rol/modal del sistema. El recorrido administrativo prueba apertura y un campo editable visible por pantalla, no operaciones financieras o funcionalidad completa. Pendientes Samsung físico, iPhone/iOS, Samsung Pass/Google Password Manager (oferta de guardar depende de configuración de usuario/proveedor), orientación y teclados flotantes, formularios específicos que no usan Modal, chats largos y todos los roles. No afirmar que se probó guardar/recuperar contraseña en Samsung ni capacidades push/GPS.

Recorrido administrativo final: 48 rutas abiertas como administrador de ensayo, 17 con primer campo de texto editable probado; todos esos campos quedaron dentro del viewport tras activar teclado. No hubo redirección a login ni pantallas vacías en las observaciones finales. Datos detallados en evidencias-teclado-20260924/recorrido-administrativo.json.

Publicación verificada: Vercel dpl_7PY8NA2Zu1w5GcpsfSP5zFGvBV8D READY. Login/guía HTTP200; APK /descargas/mister-service-rd-1.0.1.apk HTTP200, MIME APK, 15.093.747 bytes, idéntico a release local. SHA256 f242bca7c48c4930cb4a292c74940433955838ceba20ea0a854a788c3498f6db. Se conserva APK1.0.0 para referencia; guía descarga1.0.1.
