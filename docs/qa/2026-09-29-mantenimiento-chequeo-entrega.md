# Mantenimiento y seguimiento de solo chequeo — entrega local

## Cambios

- Generación manual de mantenimiento con identidad por mantenimiento + instante programado. Una transacción relee la programación y la orden; una repetición devuelve la orden existente sin volver a avanzar fecha ni notificar. Cambio de frecuencia, fecha, cliente, equipo o técnico obliga actualizar la vista.
- Numeración reservada por `contadores.service`: la reserva puede dejar huecos si gana otra solicitud; no se genera OS en el navegador. Nunca se genera orden desde el cron.
- Fechas ausentes del mantenimiento aparecen como incidencia; no se sustituyen por hoy. Se consulta la colección sin `orderBy` que ocultaba documentos sin fecha.
- Se conserva la aprobación/rechazo técnico de solo chequeo. Nuevo bloque comercial para órdenes `soloChequeo`: abrir orden exacta, abrir Inbox por cliente validado, registrar responsable UID, fecha, resultado y nota. No cambia fase, precio, cobros ni comisiones; un cliente interesado requiere continuar por la orden explícitamente.
- Seguimiento y auditoría viven en campos raw de la orden (`seguimientoChequeo`, `historialSeguimientoChequeo`), tipos locales. No duplican campañas masivas ni sus envíos/cooldown. Cada guardado se notifica atómicamente al responsable; repetición idéntica no escribe.
- Cron autenticado de mantenimiento invoca además avisos de chequeo. Vencimiento por fecha RD, UID oficina vigente, identidad orden/fecha/responsable; reintentos concurrentes no duplican. `no_interesado` detiene el seguimiento sin borrar historial. Ningún envío WhatsApp automático ni oferta/precio inventado.

## Verificación

- 12/12 pruebas de integración locales: fechas RD, doble solicitud, programación modificada, responsable inválido, conservación financiera, vencimientos/reintento/cancelación.
- 4/4 pruebas emulador real: generación simultánea una orden/un avance bajo reglas actuales; snapshot cambiado; cron concurrente una notificación; cancelación/reprogramación.
- `npx tsc --noEmit` y `npx tsc --noEmit -p tsconfig.api.json`: limpios.
- `npm run check:regression`: ejecuta sin error runtime; P039 pasa. Permanecen solamente P005/P013 previos de despliegue de reglas.
- Archivist PRE-CHANGE advertía batch no idempotente y fecha inventada: resuelto con transacción por ocurrencia y incidencia explícita.

## Límites de entrega

- Sin despliegue, datos reales ni mensajes. La ejecución real del cron requiere publicar/configuración existente y revisión de permisos antes del lanzamiento.
- Revisión visual móvil aún requiere pasada independiente. Guardado comercial ya probado con reglas reales, ver revisión posterior.
- Equipos viejos con UID técnico inválido y mantenimientos sin cliente/fecha requieren conciliación explícita. La entrega no migra datos ni inventa vínculos.
- Reserva de número previa a transacción conserva patrón existente. No se garantiza continuidad sin huecos del contador.
- P039 usa hash base auditada, no afirma conocer commit que introdujo bug; coordinator debe asociar el hash del checkpoint final.

## Revisión posterior de permisos y doble clic

- Root detectó que operaria/secretaria no pueden leer `usuarios/{otroUid}`. Reproducido explícitamente en emulador. El servicio ahora busca `personal.uid` exacto, exige un único documento y lo relee transaccionalmente; la cuenta propia del actor sí se valida en `usuarios/{auth.uid}`. No se ampliaron reglas.
- Selector ya usa personal.uid; no se usa personal.id como destinatario. Falta vínculo o duplicidad exige corrección visible. La unicidad de la consulta se valida al inicio; no constituye un bloqueo global contra inserciones simultáneas de personal por administración.
- Nota normalizada antes de comparar y escribir: doble clic con espacios no crea una segunda notificación ni historial.
- 5/5 pruebas reales adicionales: admin, secretaria y coordinadora asignan a operaria; operaria asigna a otra operaria; vínculos ambiguos se rechazan. Total emulator de esta entrega: 9/9.
- Último tsc durante edición concurrente mostró solo `consultaSuplidor.ts:93` ajeno a ownership (retorno texto vs mensaje); comunicado al coordinator.

## Revisión independiente: calendario y responsables

- La próxima fecha ahora se calcula por meses civiles RD, independiente de zona del dispositivo, limitando al último día del mes. Caso Auckland 30 enero → 28 febrero y bisiesto 31 enero → 29 febrero cubiertos.
- Una orden cancelada no admite nuevos seguimientos ni avisos; cerrados legítimos como solo chequeo se conservan.
- El cron exige tanto usuario vigente como un único documento Personal activo con UID exacto. Desactivar Personal o tener vínculos ambiguos detiene avisos.
- P039 ampliado para proteger fecha sin addMonths local y los guards de cancelación/personal activo.

Verificación de revisión: 11/11 focales y 11/11 emulador (6 guardado bajo rules y 5 cron); cron conserva closed legítimo. Helper `soloChequeoDisponible` compartido entre UI, servicio y cron; la selección comercial se cierra si la orden deja de estar disponible. No se ejecutó QA visual móvil en esta revisión. ESLint sin errores, con aviso preexistente de ref en Mantenimiento.
