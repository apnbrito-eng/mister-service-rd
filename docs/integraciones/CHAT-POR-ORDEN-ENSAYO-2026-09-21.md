# Chat por orden: avance y pruebas, 21/09/2026

## Comportamiento implementado

La oficina selecciona una orden en el panel del chat y pulsa «Vincular nuevos mensajes aquí». Solo existe un vínculo activo por teléfono. Cambiarlo no traslada el historial anterior. La escritura comprueba una versión para impedir que dos empleadas sobrescriban su selección sin advertencia.

Los mensajes entrantes posteriores al vínculo se asocian a esa orden mediante la transacción del webhook. Un mensaje antiguo recibido con retraso no se asigna al vínculo nuevo; los reintentos del mismo mensaje mantienen la deduplicación existente. Una orden cerrada, eliminada o con otro teléfono deja de recibir asociaciones.

Vincular no concede visibilidad al técnico. La oficina puede seleccionar un texto del cliente desde el menú del mensaje y compartirlo explícitamente, o retirarlo. No se comparten imágenes ni comprobantes por esta función. Las evidencias de cobro conservan su gestión privada. Tampoco se entregan al técnico mensajes salientes de oficina por defecto.

El técnico puede consultar textos compartidos de sus órdenes abiertas y sus propios mensajes nuevos. El envío exige que la oficina haya activado el vínculo de esa orden, además de comprobar asignación y destinatario antes de cada intento. Reasignar, cerrar, eliminar la orden o desactivar el usuario revoca el acceso según los controles del servidor.

Las acciones de vínculo y visibilidad guardan actor, fecha y orden en colecciones privadas del servidor. Aún falta incorporarlas a la línea de tiempo visual unificada.

## Verificación

- 166 pruebas de integración, 35 archivos: correctas.
- 10 pruebas sobre Firestore emulado aislado: correctas; incluyen concurrencia, otra orden, otro cliente, fechas antiguas, ocultación, comprobantes privados, reasignación, eliminación, cierre y pausa.
- Compilación TypeScript de frontend/API y Vite: correcta.
- Sin mensajes reales ni eventos de compra enviados.

## Límites y siguiente validación

No se ha probado este recorrido completo en un teléfono físico. El Android sigue pendiente del dispositivo. La función de compartir textos no habilita compartir fotografías técnicas; requiere un flujo separado que no abra comprobantes de pago. El chat móvil muestra como máximo los 40 mensajes recientes consultados de cada dirección; no es un archivo histórico completo.

La auditoría global de reglas de Storage, notificaciones push, iOS, WhatsApp real y Meta Purchase sigue pendiente. No considerar este cambio como cierre de esas tareas ni como validación completa del software.

Fuente: tarea 01a09b59-84f9-7543-bf2a-ff5256165bbc.

## Publicación y comprobación remota

Publicado únicamente en https://mister-service-ensayo.vercel.app (despliegue `mister-service-ensayo-av549p3kk-mister-service-rd-team.vercel.app`). Verificación HTTP con cuentas ficticias: administrador sobre orden inexistente devuelve 404; técnico intentando gestionar vínculo devuelve 403; sin sesión devuelve 401; envío WhatsApp de ensayo permanece bloqueado con 403.

La sesión del ensayo publicado está en el login. No se completó un recorrido visual autenticado de estos controles. El entorno local antiguo en 5190 falla al cargar la ficha; no se utilizó como evidencia de funcionamiento. Las pruebas funcionales de este avance se ejecutaron en un emulador nuevo y aislado en 8299. El APK anterior se conserva; no cambió el código visual del chat nativo en este avance.
