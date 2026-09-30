# Piezas y taller — entrega local para revisión

## Alcance implementado

- Taller conserva estados históricos y añade descartado/no reparable con motivo, fecha y actor.
- Nueva recepción exige selección explícita de orden. Equipos históricos sin vínculo permiten asociar una orden por ID. Desde equipo vinculado se abre orden e Inbox empresarial; abrir chat no envía mensajes.
- Pasar taller a espera de piezas usa una transacción y una solicitud estable `taller_{equipoId}`. Repetir no borra ni duplica detalle.
- Solicitud de pieza requiere orden/cliente existente. Toma identidad del documento de orden, permite completar detalle y foto, y actualiza la espera de la orden dentro de la misma transacción.
- Foto reutiliza el uploader `fotos-piezas/{ordenId}/{piezaId}.jpg`, previa validación de tamaño y MIME. No se cambian Storage Rules.
- Llegada relee pieza en transacción y registra aviso con ID estable. Repetir llegada no duplica aviso. Destino: operaria/responsable exacto de orden resuelto contra `personal.uid`; fallback admin/coordinadora activa con UID. Sin destino válido aborta, sin afirmar éxito.
- La llegada no agenda visita ni reactiva orden. UI impide reactivación si conoce otras piezas pendientes. Esto no constituye una exclusión transaccional frente a solicitudes simultáneas nuevas.

## PRECHANGE respetado

`dc72250`: se conserva atomicidad taller/pieza, ahora transaccional e idempotente. `3733237`/P007: no usar personal.id como userId; UID explícito. P009: no se cambiaron tipos parseados centrales, tipos locales conservan campos crudos existentes. No se mutan flags terminales de orden (P011). P015: se conserva listado existente, sin índice compuesto nuevo. P017: ninguna operación envía WhatsApp.

## Permisos y límites

- Lectura de usuarios restringida impide listar usuarios desde operaria; se reutiliza personal con UID explícito, como emisores existentes. No se certifica vigencia de Firebase Auth de ese UID desde cliente.
- Permisos de escritura actuales equipos/standby son staff oficina. No se amplían reglas. Falta QA visual y emulador de transacción de este lote.
- Fotos tienen token de descarga según mecanismo existente; no compartir públicamente ni con suplidores de forma automática. Una subida exitosa y fallo posterior del guardado puede dejar foto huérfana; no se borra a ciegas tras timeout ambiguo.
- La solicitud estable del taller representa su bloqueo actual. Si una reparación requiere otra pieza después de llegar la anterior, registrar solicitud nueva explícitamente; no sobrescribir historial recibido.
- Directorio de suplidores, autorización/pedido/consumo de piezas e inventario siguen pendientes de siguiente lote. No están implementados aquí.
- La asociación histórica requiere selección humana exacta; no adivina por nombre.

## Verificación

Pruebas de servicio con transacciones simuladas: idempotencia, motivos, actor, estado de orden conservado, UID, destino faltante/ambiguo y asociación exacta. Detector P010 ampliado mediante AST para reconocer tx.set en notificaciones, con pruebas de comentarios y otra colección. P036 agregado y registrado para atomicidad/dedupe.

No hay despliegue, modificación de datos reales ni envío real de mensajes. El coordinador debe registrar resultados finales de compilación, regresión y revisión independiente antes de cerrar.

## Corrección tras revisión del coordinador

Taller→standby relee la orden vinculada y la pone en espera en el mismo commit que equipo/solicitud; orden eliminada o terminal se rechaza sin escritura. Vincular equipo histórico relee su solicitud estable y propaga orden/cliente al mismo tiempo; llegada previa o vínculo conflictivo requiere revisión explícita. Actor UID se captura antes de las operaciones asíncronas, sin fallback vacío. Pruebas nuevas cubren éxito y abortos sin escrituras parciales.

## Evidencia final focal

- `npx tsc --noEmit`: limpio (`/tmp/servicio-revision-tsc-final.log`).
- Servicio + detector P010: 21/21 (`/tmp/servicio-revision-tests-final.log`).
- Firestore Emulator con reglas reales, `tests/rules/piezas-taller.rules.test.ts`: 4/4 (`/tmp/servicio-emulador.log`). Admin y operaria realizan taller→orden/pieza y llegada concurrente con un aviso; técnico no puede escribir; operaria vincula histórico y solicitud en el mismo commit. Esto sustituye el pendiente de emulador de la sección anterior; QA visual sigue pendiente.

## Revisión final de ciclos e identidad

Se rechaza también `estado: completado` legacy sin fase. Si la solicitud estable del taller ya llegó, repetir standby muestra “La solicitud anterior ya llegó; registra una nueva pieza en Pendiente de piezas” y no cambia equipo/orden. La recepción usa ahora `recibirEquipoTaller`: relee la orden en transacción y toma cliente ID/nombre/teléfono y equipo de esa fuente; campos de nombre/teléfono aparecen de solo lectura. Acciones UI consultan `puede(userProfile, 'ordenesModificar')` y rol oficina, sin ampliar permisos de servidor.


## Reactivación concurrente — continuación
- Escritura actual de standby_piezas centralizada en flujoPiezasTaller.service; Ordenes/OrdenDetalle/TecnicoVista/IA son lectores. seedData solo fixtures sin vínculo orden.
- Crear/editar/vincular/cambiar estado/llegada incrementan standbyRevision en orden dentro de su transacción. Reactivar captura revisión ANTES consulta de piezas y revalida orden/revisión/refs en transacción; no usa tx.get(query).
- Nueva pieza concurrente invalida reactivación; nueva pieza posterior vuelve a poner la orden en espera. Piezas pendientes y orden finalizada bloquean. Repetir no duplica auditoría; actor registrado auth UID.
- No mueve fase ni agenda visita. Orden sin piezas documentadas puede quitar espera humana explícita, sin inventar pieza.
- Garantía de concurrencia requiere escritores compatibles: clientes antiguos, scripts directos o futuras rutas sin revisión podrían insertar sin conflicto. No se afirma exclusión backend total ni compatibilidad garantizada con APK vieja. Requiere controlar versiones/escrituras antes publicación.
- TypeScript limpio y 18 pruebas focales pasan. Nuevos tests emulador standby-reactivar.rules.test.ts preparados; primer arranque rechazado por puerto ocupado de suite coordinator, no ejecutados aún.

Verificación final reactivación: emulador Firestore 8/8 PASS (4 nuevos + 4 taller); /tmp/standby-reactivar-emulator.log. Puerto liberado.
