# Citas públicas: corrección del control de envíos

## Alcance y antecedentes

PRE-CHANGE: `666cb14` añadió límites básicos de shape, sin antispam. La lectura anónima necesaria para deduplicar estaba denegada y el catch continuaba con la escritura. Se preservó el guardado atómico de configuración y auditoría (`bd025d7`), y la creación interna de Citas/garantías por staff.

Archivos: API `publico/cita`, helper `citaPublica`, cliente `solicitudesPublicas.service`, consumidores `/agendar` y `/cita/:calendarId`, reglas de citas, tests y cazador P-026. Sin cambios a Formularios dinámicos `/f/:slug` (superficie independiente todavía pendiente de controles servidor).

## Controles

- App Check obligatorio en el servidor, aunque el flag legado de enforcement esté apagado. La web necesita `VITE_RECAPTCHA_SITE_KEY` y dominio registrado; Android conserva su proveedor existente. No hay fallback a escritura directa si falta token.
- Validación del tamaño total y campos, coordenadas, fechas, foto HTTPS de Storage y campos personalizados. Identidad de calendario y empleado asignado sale del documento servidor, con días/horas configurados y fecha no pasada.
- Corrección de política al cerrar la revisión: la deduplicación en 24 horas compara la huella completa de la solicitud validada, no solo el teléfono. El mismo teléfono puede solicitar otro equipo o servicio sin recibir un éxito falso. Duplicados/reintentos concurrentes responden éxito neutro, sin exponer ID ni datos de otra solicitud. No se aplica cuota por IP: visitantes de una misma red pueden enviar.
- Valores técnicos provisionales configurables: 5 solicitudes nuevas por teléfono/hora (`maxSolicitudesTelefonoHora`, entero1..100) y 500 solicitudes globales por hora; no es una cifra confirmada por Jorge; configurable solo en servidor `citas_publicas_config/limites.maxSolicitudesHora` (entero1..100000). Configuración, contadores, dedup y alertas no son accesibles al SDK cliente, ni administrador. El documento de alerta `citas_publicas_alertas/{hora}` registra que se agotó el cupo; todavía no hay pantalla de monitoreo para esa alerta.
- Cuota, dedup, cita y notificaciones se guardan en una transacción. Agotamiento retorna429 y no borra el formulario. Los datos de una cita entrante no se envían a logs.
- Fotos siguen usando la ruta Storage existente antes del submit; estos controles no constituyen una cuota de uploads ni prueban App Check enforcement de Storage. No se hizo ninguna subida real.

## Verificación

20 pruebas emulador PASS:8 servidor concurrentes/API (incluido HTTP local real y compatibilidad de teléfonos de diez dígitos) y12 reglas públicas. Incluyen reintentos, cuota, cambio de hora/24h, App Check, calendario AM/PM heredado, privacidad, bloqueo anónimo y creación interna. No se crearon citas reales. tsc web/API pasó; lint dirigido sin errores (API excluida por configuración del repositorio).

## Orden de publicación obligatorio

1. Publicar endpoint y frontend nuevo juntos; comprobar token App Check legítimo y ambos formularios en entorno controlado.
2. Publicar reglas que cierran create anónimo. P-005 queda pendiente hasta despliegue real; no modificar su lock para aparentar verificación.
3. Pedir recarga a pestañas antiguas; una APK antigua con el formulario directo deberá actualizarse. El API nunca vuelve a abrir escritura anónima.
4. Probar confirmación interna de cita y garantía, foto opcional, error429 conservando datos y notificaciones de staff. No se ha certificado este recorrido en producción ni en Android físico.

Limitación: App Check reduce automatización desde clientes ajenos, pero no autentica al propietario del teléfono ni sustituye un control contra todo abuso. Los formularios dinámicos y las subidas requieren una unidad posterior si la entrega exige la misma protección en todas las superficies públicas.

## Actualización de revisión conjunta, 22:33

La indicación inicial de preservar una solicitud por teléfono/día se corrigió: no era una decisión de Jorge y habría bloqueado solicitudes legítimas. El nuevo caso verifica dos equipos distintos del mismo teléfono, bloqueo explícito al superar cuota y reintento idéntico sin crear duplicado. Nueve pruebas servidor pasan. El reparto interno por equipos se añadió con bandera independiente, apagada inicialmente; nunca trata el teléfono declarado como prueba de identidad ni modifica cartera por esa coincidencia. La respuesta pública no expone asignación interna.
