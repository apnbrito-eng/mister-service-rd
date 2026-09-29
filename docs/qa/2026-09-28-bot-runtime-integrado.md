# Asistente de servicio: integración preparada, desactivada

## Alcance construido

La entrada validada del webhook prepara trabajos dentro de su transacción habitual. Se conserva la recepción del Inbox aunque no exista configuración del asistente. El worker obtiene trabajos duraderos, agrupa hasta ocho mensajes por conversación y utiliza reserva de presupuesto antes de consultar al proveedor. Guarda equipo, servicio, falla, foto recibida y ubicación compartida o dirección escrita. La dirección debe aparecer literalmente en un mensaje recibido; si el modelo propone otra, se descarta y se vuelve a preguntar. Mantenimiento no exige una falla.

La respuesta pública está limitada a preguntas breves predefinidas. El modelo extrae datos estructurados: no decide destinatario, precios, citas, URLs ni herramientas internas. La primera respuesta identifica al asistente como IA; las siguientes evitan repetir esa presentación. Cuando hay suficientes datos, una solicitud de persona o un rechazo a aportar foto/ubicación, entrega el caso a oficina con resumen y pendientes. El reparto reutiliza el helper de equipos y conserva asignaciones existentes.

Tomar/traspasar atención y enviar manualmente pausa la sesión mediante una versión transaccional. Se vuelve a comprobar esa versión antes del transporte. Un mensaje que Meta ya aceptó, o cuya petición ya está en vuelo, no se puede cancelar retroactivamente. Las pruebas verifican pausa durante generación y antes del HTTP; no prometen cancelación después de la aceptación externa.

## Archivos de esta unidad

- Nuevos `api/_lib/botServicioPipeline.ts`, `botServicioRuntime.ts`, `botServicioStore.ts`, `botServicioAnthropic.ts`, `botServicioMeta.ts`.
- Nuevos endpoints `api/whatsapp/bot-worker.ts`, `bot-sesion.ts`.
- Conexiones en `api/whatsapp/webhook.ts`, `api/crm/atencion.ts`, `api/whatsapp/send.ts`, `src/services/whatsappInbox.service.ts`.
- Índices de la cola en `firestore.indexes.json` y cron por minuto en `vercel.json`.
- Pruebas `tests/integraciones/bot-servicio-{pipeline,worker,meta}.test.ts`, `tests/ensayo/bot-runtime-emulador.test.ts`, configuración dedicada `vitest.bot-runtime.config.ts`. Fixture de traspaso conserva sus aserciones y añade soporte de referencia Admin SDK.
- Configuración/UI, presupuesto y reparto pertenecen a la unidad paralela; su revisión es independiente.

## Operación y habilitación

Por defecto no hay llamadas externas. Se requieren conjuntamente configuración válida habilitada, `BOT_SERVICIO_ENABLED=true`, `ALLOW_EXTERNAL_SENDS=true`, credenciales Anthropic/Meta, `CRON_SECRET` y coincidencia exacta entre `BOT_CENTRAL_PHONE_NUMBER_ID` y la línea central validada del servidor. No se activaron flags, proveedor, envíos ni cron desplegado durante estas pruebas.

El cron procesa hasta tres trabajos concurrentes por minuto, con función de 60 segundos y límites de HTTP de 20/20/15 segundos para conteo/generación/envío. Una cola grande tendrá demora: esto no equivale a respuesta instantánea ni capacidad ilimitada. Los índices deben desplegarse y estar listos antes de habilitar.

Sonnet 4.6 estándar usa tarifa de servidor de USD 3/15 por millón de tokens de entrada/salida; máximo 6000/400 tokens, reserva máxima USD 0.024. Fuente contrastada: https://platform.claude.com/docs/en/about-claude/pricing . No se usa tarifa del navegador, caché, herramientas ni pensamiento extendido.

Un timeout o proceso perdido después de iniciar proveedor/envío no se reintenta automáticamente. Se retiene la reserva conservadora y se entrega a revisión humana. Los leases vencidos tras efectos externos se recuperan como ambiguos. Eso evita duplicar gasto/respuestas, pero requiere conciliación operativa de casos inciertos. Los clientes ya vinculados comparten cupo por ID de cliente; conversaciones sin cliente utilizan el teléfono. La vinculación posterior fusiona los turnos del teléfono en la identidad del cliente mediante el core transaccional de presupuesto; no reinicia el cupo. La prueba de integración con cupo de una respuesta pasó: vincular el cliente no permite una segunda llamada.

## Evidencia local

- API TypeScript: PASS.
- Pipeline y worker: 14 pruebas PASS (11 y 3).
- Firestore real aislado, proyecto `demo-bot-runtime`, puerto 8299: 10 pruebas PASS; proveedores y transporte ficticios. Incluye deduplicación, dos workers, ráfaga, presupuesto, memoria, saludo único, dirección, toma humana recuperación de lease vencido y cupo acumulado al vincular teléfono con cliente.
- Suite de integraciones a las 22:18:02: 407 pruebas PASS en 92 archivos. Después pasó una prueba adicional de dirección inventada; la verificación global final debe incluirla.
- `git diff --check`: PASS.
- Regresión: un aviso P-005 de reglas modificadas aún sin desplegar por la corrección paralela del formulario público. No se omitió ni se añadió a excepciones; requiere despliegue de reglas al publicar.
- ESLint por defecto ignora los archivos API: sus advertencias de archivo ignorado no constituyen análisis de ese código. TypeScript sí los comprobó.

No certifica envío real, proveedor real, cron en Vercel, revisión independiente final ni APK.

## Siguiente unidad: conocimiento supervisado

Ya existe cola `conocimiento_equipo` y API `api/ai/conocimiento.ts`: crear/importar siempre queda pendiente, aprobación/archivo con versión y auditoría. Se añadió un botón de oficina `Proponer conocimiento` para redactar un procedimiento general desde una conversación y guardarlo como propuesta pendiente. El editor abre vacío y no recibe datos de la conversación. Sin copiar nombres, teléfonos o conversación automáticamente, sin consumo de IA ni autoaprobación. Dos pruebas del componente: PASS, incluyendo error que conserva borrador, doble envío bloqueado y reintento. Lint dirigido: cero errores, una advertencia previa de cleanup/ref en AtencionChat.

Los conocimientos internos aprobados no quedan autorizados por ello para clientes externos. Para consultarlos desde el asistente público hace falta una clasificación y aprobación explícita de alcance público. Esa conexión permanece pendiente; la recopilación actual no consulta conocimientos internos.

## Revisión independiente y ajustes

El revisor detectó que un timeout inmediato pausaba sin aviso visible; ahora deja handoff y atención pendiente. También se añadió comprobación de epoch/pausa antes de repartir para no modificar una toma humana concurrente. Los casos ambiguos permanecen sin reintento. El helper de reparto se ejecuta después de esa comprobación, incluso si el webhook había asignado automáticamente responsable, conservando la cartera vigente.

- Transporte Meta: dos pruebas PASS (flags ausentes y pausa justo antes de HTTP no llaman a la red).

### Propuestas: respuesta perdida y reintento

El revisor detectó riesgo de duplicar una propuesta si el servidor guardaba y se perdía la respuesta. El editor conserva un requestId por borrador; el endpoint crear registra uid+requestId y huella dentro de la misma transacción que propuesta, cuota y auditoría. Un reintento devuelve el mismo ID sin gastar otra cuota; cambiar contenido con el mismo requestId devuelve 409. Los creadores existentes sin requestId siguen siendo compatibles. Nueve pruebas dirigidas pasan; TypeScript API y ESLint con `--no-ignore` de endpoint/editor pasan. Revisión independiente solicitada.

### Comandos preparados para el cierre global

Esperar estabilidad de formularios `/f` y cargas antes de ejecutar: `npm run test:integraciones`, `npm run build`, `npm run typecheck:api`, `npm run lint`, ESLint `--no-ignore` sobre archivos API modificados, `npm run check:regression`. No omitir P-005 si aún no se publicaron reglas.

El emulador runtime usa `firebase.movil-tests.json`, Firestore 8299, proyecto demo-bot-runtime y `vitest.bot-runtime.config.ts`. El emulador de equipos/presupuesto del otro builder usa 8080: no detener procesos ajenos ni compartir datos de prueba. Estas ejecuciones no publican reglas ni generan APK.

## Cierre de reparto y recuperación, 22:33

- Dieciocho pruebas de runtime en emulador pasan, incluyendo webhook real → embudo → prospecto sin ficha → secretaria del equipo de menor carga; petición de persona sin proveedor; flags apagados con reparto anterior; recuperación administrativa con runtime apagado, versión cambiada y flags apagados.
- La recuperación local autenticada sigue ejecutándose sin habilitar proveedores. Revisa lotes de veinte con cursor persistente para no dejar trabajos antiguos ocultos por los primeros registros. Deja pendientes visibles; no envía ni devuelve gasto incierto.
- `repartoHabilitado` es independiente de habilitar IA, usa el mismo catálogo de equipos y arranca en false. Administración puede guardar/activar reparto con motivo, versión y auditoría sin activar proveedores ni configurar una línea de IA.
- WhatsApp sin IA y solicitudes web utilizan el mismo cálculo de carga. Web conserva identidad de prospecto separada: no modifica ficha o chat de un cliente solo por un teléfono declarado. Sus solicitudes pendientes se incluyen en la carga. Nueve pruebas del servidor de citas pasan.
- Pruebas de conservación, empate y concurrencia del core siguen a cargo del revisor de esa unidad. Falta revisar la nueva acción API/UI de reparto y cerrar batería global tras uploads/formulario dinámico.
