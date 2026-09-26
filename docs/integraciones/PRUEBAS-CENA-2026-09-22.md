# Pruebas CRM — 22 de septiembre de 2026

## Entorno
Copia aislada /private/tmp/mister-cena-qa-20260922, Firebase demo-mister-ensayo; emuladores Auth9398, Firestore8389 y Storage9498. Interfaz5196. Usuarios y cliente ficticios. Sin escrituras de producción ni envíos a WhatsApp, Meta o bancos.

## Verificado
- 187 pruebas de integración en 40 archivos correctas. Compilación web/API correcta.
- API autenticada por rol: traspaso y aceptación del responsable, propuesta8000 y aprobación por oficina; técnico no puede autoaprobarse.
- Transferencia3000 pendiente no descuenta saldo; operaria no puede confirmarla; coordinadora sí. Efectivo5000 confirmado deja saldo0. Entregas parciales de efectivo3000+2000; exceso rechazado, sin duplicar ingresos.
- Notas internas separadas de notas compartidas con técnico; este no recibe datos de pagos del panel de oficina.
- Reglas de Firestore: factura sin revisión y cierre directo rechazados; revisión válida aceptada; cambios de precio, técnico, cierre y pagos invalidan revisión. Factura por operaria rechazada.
- Navegador: secretaria registra cita ficticia, confirma y asigna operaria/técnico. Técnico ve su cita OS-0001. La fecha fue adelantada por una semilla local para simular el día de llegada; no cuenta como prueba de reprogramación por interfaz.

## Correcciones
El botón Marcar Realizado permitía abrir el formulario sin aprobación, aunque Firestore rechaza persistir ese cierre. Se unificó la condición con las reglas, incluyendo revisión de propuesta vigente, se protegió el acceso desde detalle y el envío del formulario. Cuatro regresiones cubren orden nueva, pendiente/rechazada, aprobaciones antiguas y propuesta modificada. Verificación visual: desaparece el cierre anticipado y el acceso desde detalle no abre el asistente.
Citas ya no carga Google Places con una clave ausente; conserva entrada manual. Este guard está revisado en código; falta repetir el formulario desde una carga limpia para comprobar ausencia del error visual.

## Límites y pendientes
No se completaron en este recorrido foto/firma/cierre técnico/factura desde la interfaz. Las pruebas de reglas usan fixtures de cierre, no equivalen a esas interacciones. Tampoco se probaron teléfono físico, cámara, GPS o notificaciones nativas, ni WhatsApp/Meta reales.
Se observó una aserción interna de Firestore11.10 en navegación del entorno de emulación; una navegación directa recuperó la pantalla. Falta reproducir/aislar causa; no se declara corregida.
Los cambios de este informe están en el checkout y copia local; no publicados en ensayo alojado ni producción, ni reconstruidos instaladores. El build mantiene advertencia de paquetes grandes.

Fuente: tarea 01a09b59-84f9-7543-bf2a-ff5256165bbc.
