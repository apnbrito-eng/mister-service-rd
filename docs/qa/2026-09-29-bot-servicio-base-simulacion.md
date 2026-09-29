# Bot de servicio: configuración y presupuesto para revisión

## Estado de esta unidad

Implementación local. No hubo mensajes, consumo de proveedor, escrituras de producción ni despliegue. Esta unidad prepara configuración y presupuestos; la integración del pipeline, worker y almacén corresponde a otra unidad concurrente y debe verificarse por separado.

El endpoint incorpora activar/desactivar con confirmacion administrativa, preflight y auditoria; no se activo fuera del emulador. Puede guardar el ensayo y preparar `bot_servicio_runtime/sistema` con `habilitado:false`. No copia tarifas del navegador al runtime: importa el contrato/tarifa del servidor que mantiene el pipeline. La línea comercial es 18495646767; el identificador Meta se resuelve en servidor desde `config/whatsapp_numeros`, con coincidencia única de `numeroReal`. No se usa un ID histórico ni una credencial proporcionada por el navegador.

## Archivos y contratos

- `api/_lib/politicaBotServicio.ts`: horario RD, política determinista, validación de configuración, línea única, coste máximo. Reparación necesita descripción; mantenimiento no exige inventar una falla. Foto, equipo y ubicación completan el mantenimiento.
- `api/_lib/presupuestoBotServicio.ts`: core de reserva/conciliación dentro de la transacción del consumidor y wrappers para ensayo. Namespaces cerrados `simulacion` y `produccion`; nunca toma una ruta arbitraria del navegador. El caller real debe validar configuración, lease y permisos antes de reservar.
- `api/_lib/equiposAtencion.ts`: dos parejas operaria líder + secretaria de atención, validación de roles activos, preservación de cartera y reparto por carga leída íntegramente en transacción. Serializa asignaciones nuevas mediante cursor. No usa contadores atrasados.
- `api/_lib/trabajosBotServicio.ts`: trabajos simulados durables por línea+wamid, lease/intento, exclusión por conversación, pausa humana y finalización idempotente. Estado ambiguo no se reintenta automáticamente.
- `api/whatsapp/bot-config.ts`: GET consumo/configuración real y ensayo; POST guardar ensayo, preparar runtime desactivado, ampliar presupuesto auditado, simular decisión.
- `src/components/configuracion/BotServicioConfiguracion.tsx`: panel para administrador, integrado en WhatsApp de `Configuracion.tsx`.

## Presupuesto y auditoría

Inicial: USD5/día, USD50/mes, 15 respuestas reservadas/enviadas por cliente en las últimas 24 horas. Se usa fecha de República Dominicana. Cargos y reservas son enteros en microdólares.

La ampliación diaria vence al cambiar el día RD. La mensual permite elegir período actual o límite permanente explícito. El destino real/simulado es visible. Cada cambio requiere motivo, identidad administrativa e idempotencia; configuración y auditoría se guardan juntas. El cambio de período mientras el administrador tiene abierto el formulario produce conflicto y exige recargar.

La reserva usa modelo/tarifa/versiones exactos y coste máximo acotado. Sin tarifa no se reserva. Resultado incierto mantiene fondos y cupo. Conciliación confirmada libera solo lo no gastado y es idempotente; no se puede liberar nuevamente una reserva confirmada. Alertas al 80% tienen documento único por período. El panel muestra consumo y aviso; conexión a campana/notificaciones todavía no pertenece a esta unidad.

## Identidad y carga

Los pendientes de `crm_atencion` se vinculan mediante `whatsapp_conversaciones.clienteId`; se deduplican con reservas del mismo cliente. La cartera deriva equipo de su responsable si aún no tiene equipoId. Vínculos contradictorios, chats sin cliente vinculado, responsables fuera de equipos u órdenes sin equipo clasificable bloquean el reparto para revisión. No se infieren miembros ni se truncan teléfonos internacionales.

Las consultas completas sirven para el ensayo y exactitud inicial. Hay que medir volumen antes de usar el reparto en producción. No existe migración automática ni una garantía de rendimiento para toda la base histórica.

## Seguridad y límites

- Solo administrador configura, amplía y simula. Usa `accesoEquipo` existente.
- No se modificaron reglas; las colecciones nuevas se mantienen bajo denegación implícita a clientes. La verificación de reglas negativas la realiza el revisor.
- Logs inesperados no contienen mensajes del proveedor, secretos ni teléfonos.
- Foto/ubicación en simulador son indicadores: no se suben archivos ni se captura ubicación física.
- Tarifa editable dentro de «Avanzado» corresponde únicamente al ensayo. La tarifa real es una constante de servidor revisada en la unidad del pipeline.
- El panel prepara horario y equipos, y ofrece activar/desactivar de forma explicita. Distingue autorizacion del runtime de flags externos del servidor; si faltan, informa que los envios siguen bloqueados.
- Doble toque bloqueado inmediatamente con ref. Tras un POST aplicado y una recarga fallida, repetir conserva el ID de solicitud.

## Verificación propia

12 pruebas de política y 3 pruebas UI. Pruebas con Admin SDK real en emulador `demo-bot-servicio`: concurrencia de presupuesto/reparto, duplicados, rolling24h, períodos mensuales, conciliación, leases, pausa humana, identidad de cartera, roles, ampliaciones temporales/permanentes, preparación runtime y separación de presupuestos. Harness HTTP local verifica cuerpos JSON string/objeto y rechazo de secretaria.

Tipos web/API y cazadores de regresión se ejecutan al cerrar la unidad. La revisión independiente y el recorrido completo de worker/handoff/proveedor son verificaciones separadas.

Fixture visual: `tests/manual/bot-servicio.html`, con API sustituida en memoria; datos ficticios y sin Firebase. Sirve para 375 y 1440px, sin simular una activación real.

## Integración que debe revisarse antes de habilitar

1. Almacén/worker: unir autorización, reserva, orden de mensajes y lease dentro de la misma transacción.
2. Webhook: encolar idempotentemente y responder sin esperar IA.
3. Handoff: resumen visible, pausa al tomar/responder manualmente, no reiniciar al siguiente mensaje del cliente sin política explícita.
4. Outbox Meta y reconciliación ante aceptación externa seguida de fallo al guardar. No prometer exactamente una vez entre sistemas.
5. Alertas administrativas y clasificación de cartera histórica antes de reparto real.
6. Validar límites de tokens y tarifa del modelo, reglas/permisos, revisión independiente y conversación autorizada de prueba antes de activar.

No se hicieron commits ni publicación en esta unidad.

## Extension CRM y reparto real

`prepararAsignacionEquipoReal` devuelve un callback para aplicar la asignacion junto al handoff en una transaccion. Sin equipos o datos clasificables devuelve null; errores Firestore se propagan. Cuenta pendientes CRM reales, no reservas persistentes atrasadas. La nueva asignacion conserva trazabilidad en bot_servicio_real_reparto_eventos.

`api/crm/atencion.ts` entrega un DTO seguro del handoff solo a roles de oficina: no URLs privadas ni coordenadas crudas. `ResumenBotServicio.tsx` lo presenta en AtencionChat. Resolver la atencion marca el handoff resuelto en la misma transaccion para no mostrar pendientes antiguos. La conexion desde el worker la mantiene la unidad del pipeline.

## Continuidad del cupo al vincular un cliente

El núcleo acepta alias previos verificados por el servidor y fusiona sus turnos con el cliente canónico dentro de la reserva. La fusión se conserva incluso cuando se rechaza por cupo o presupuesto; cambiar de teléfono asociado no reinicia la ventana de 24 horas. Una conciliación de reserva antigua sigue la redirección validada para liberar el turno correcto. Alias que pertenecen a otro cliente fallan de forma cerrada.

Verificación local: 22/22 pruebas de backend en Firestore Emulator; TypeScript web y API sin errores. Incluye migración con 14 y 15 turnos, rechazo sin perder la fusión, liberación de reserva antigua y conflicto de identidad. No se alteraron datos de producción.
