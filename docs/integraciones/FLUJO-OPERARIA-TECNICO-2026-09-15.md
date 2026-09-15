# Revisión del flujo operaria–técnico

## Contexto confirmado por Jorge

El software aún no está implantado en la operación. Hoy WhatsApp y varios Google Calendars coordinan visitas; un mismo técnico aparece en varios calendarios. Oficina registra teléfono, ubicación escrita, ubicación compartida, equipo, falla, día y hora. El técnico inicia la visita, documenta piezas y propone costos; oficina negocia con el cliente y aprueba o rechaza. Solo oficina autoriza el cierre. Se busca control efectivo con una experiencia sencilla y colaborativa, no una interfaz punitiva.

Pendiente de precisión: ¿aprobar la reparación autoriza cerrar con evidencias, o existe una segunda autorización de cierre? Pregunta enviada; no asumir una respuesta.

## Alcance de esta revisión

Lectura del código de la rama integraciones-marketing-conocimiento-20260915 (base 5976a7d y documentación posterior): cita/inicio, sugerencias de precio, aprobación, registro de piezas, cierre, notificaciones y reglas de Firestore. No se ejecutaron escrituras de ataque, ni cierres reales, ni pruebas como técnico. Las conclusiones sobre reglas corresponden al archivo del repositorio; no se verificó aquí la versión desplegada de esas reglas.

## Lo que ya está construido

- Iniciar chequeo registra foto, hora y GPS cuando está disponible; marca el diagnóstico y contempla GPS no verificado como excepción. `src/components/ordenes/IniciarChequeoButton.tsx:160` y `:235`.
- Proponer precio registra auditoría, avanza diagnóstico a cotización y notifica operaria/administración. `src/pages/TecnicoVista.tsx:437`.
- Aprobar precio guarda precio aprobado, precio final, autor, fecha y fase. `src/pages/OrdenDetalle.tsx:188`.
- Oficina y técnico usan listeners en tiempo real. Hay base para actualizar el siguiente paso sin recargar ni reenviar mensajes.
- Cierre solicita foto final, respuestas, piezas, período de garantía y firma. Esto es validación de interfaz, no garantía por sí sola de protección en la base de datos.

## Brechas encontradas y prioridad

### P0 — La aprobación no protege todo el resultado aprobado

`firestore.rules:197` protege estadoAprobacion, precioAprobado y sello de aprobación, pero no precioFinal en ese grupo. En la rama de actualización técnica (`:379`), `ordenAprobada()` hace verdadera la alternativa que también permite modificar precioFinal. Por lo tanto, la regla del repositorio no vuelve inmutable el precio final después de aprobar. Es un hallazgo de lógica de reglas, no una acusación de uso indebido real.

Corrección necesaria: técnico propone; solo oficina fija o modifica precio/costo autorizado. Una aprobación debe estar ligada a la versión exacta de propuesta, piezas, cantidades y alcance. Modificar una propuesta no puede conservar autorización anterior para ejecutar cambios.

### P0 — Protección de cierre incompleta y distinta entre pantallas

`intentaTrabajoRealizado()` (`firestore.rules:108`) solo reconoce la transición a trabajo_realizado. No cubre por sí sola cerrado, estadoSimple=completado, creación/reemplazo de cierreServicio u otros campos equivalentes. La rama técnica permite campos no protegidos expresamente.

En la tarjeta técnica, el bloqueo depende de que exista precioSugerido y falte aprobación (`TecnicoVista.tsx:1158`). Sin sugerencia puede aparecer Marcar Realizado. El detalle ofrece otra entrada Cerrar Servicio sin la misma comprobación (`:1607`). El wizard revisa evidencias locales, sin una autorización de cierre específica (`CierreServicioWizard.tsx:338`). El backend puede rechazar algunos intentos, produciendo una traba tardía después de completar foto/firma.

Corrección necesaria: una política única de transiciones y campos, aplicada en la base de datos/servidor y reflejada en todos los botones. Impedir todas las representaciones de cierre sin autorización vigente; verificar nuevamente al guardar. Falta resolver si se requieren una o dos autorizaciones de oficina.

### P0 — Piezas y validación administrativa no separadas suficientemente

Las piezas se registran dentro del cierre y su foto no es obligatoria para guardar (`PiezaFormModal.tsx:48`). El técnico propone un precio general en una nota (`TecnicoVista.tsx:1493`), no una propuesta estructurada completa de piezas y mano de obra previa al trabajo.

Las reglas revisadas no protegen específicamente los campos anidados de validación administrativa de piezas frente a cambios del técnico asignado. No basta con que la UI solo muestre el botón aprobar a administración.

Corrección necesaria: registrar propuesta previa con pieza, foto, cantidad, origen, costo de adquisición estimado y soporte cuando corresponda. Separar la propuesta técnica de lo autorizado por oficina. Solo oficina escribe validación, costo autorizado y versión aprobada. Una foto identifica una pieza, pero no demuestra cuánto costó: compra externa necesita cotización/comprobante o adquisición coordinada desde oficina.

### P1 — Falta separar tres decisiones económicas

1. Costo de adquisición de piezas: lo que paga el negocio.
2. Mano de obra/precio de venta: lo que se cotiza al cliente.
3. Importe final aceptado por el cliente: lo que oficina negocia y autoriza.

No mezclar los tres en precioSugerido. Mantener margen y decisiones comerciales en oficina. El técnico ve el alcance y las cantidades autorizadas necesarias para trabajar. Diferencias posteriores se tramitan como solicitud de cambio, sin editar silenciosamente el presupuesto autorizado.

### P1 — Asignación y lectura demasiado amplias para asumir control por operaria

Las reglas permiten lectura de órdenes a todo staff; TecnicoVista carga todas las órdenes y filtra después (`:135`). Eso no limita los datos descargados a las visitas asignadas. La rama oficina permite actualización general a administrador, coordinadora, secretaria y operaria (`firestore.rules:90`).

Revisar alcance por responsable y sustituciones autorizadas; administración conserva supervisión global. Cambiar reglas y consultas conjuntamente para evitar dejar al personal sin acceso durante la migración. No aplicar un filtro de interfaz y llamarlo protección.

### P1 — Google Calendar no equivale a la agenda interna

La búsqueda de integración Calendar en src/api muestra calendarios internos y Google Maps, sin una sincronización de Google Calendar identificada en esas rutas. Esto no descarta herramientas externas o automatizaciones fuera del repositorio.

Propuesta: una orden y una asignación por visita como fuente central. Los calendarios son vistas/proyecciones de esa misma visita, no copias independientes. Mantener un ID de evento externo, reprogramaciones y cancelaciones trazables. Comprobar disponibilidad del técnico entre agendas. Inventariar primero los calendarios actuales antes de migrar o eliminar alguno.

## Flujo propuesto: una ficha, dos vistas

| Paso | Técnico | Oficina | Control persistente |
|---|---|---|---|
| Cita coordinada | Ve cliente, contacto, ubicación, falla, horario y responsable | Confirma cita, técnico y operaria; revisa conflictos | Identificador único de visita |
| Visita iniciada | Pulsa Iniciar visita, añade evidencia | Ve inicio y excepciones | Hora de servidor y evidencia; GPS faltante se gestiona explícitamente |
| Diagnóstico enviado | Describe falla, piezas y servicio, adjunta fotos, propone importes | Recibe una tarjeta accionable | Propuesta numerada/versionada |
| Propuesta revisada | Ve Aprobado, Necesita información o No autorizado | Valida piezas/costos y acuerdo con cliente | Autor y versión exacta aprobada |
| Trabajo en curso | Sigue alcance aprobado; solicita cambios si aparecen otros hallazgos | Atiende cambios sin repetir toda la ficha | Cambios nuevos quedan pendientes; nunca heredan autorización silenciosamente |
| Trabajo terminado | Envía prueba de funcionamiento, foto y conformidad | Revisa resultado y autoriza cierre si se decide segundo control | Autorización vigente y ligada a las evidencias |
| Cierre registrado | Confirma el paso final habilitado | Sigue cobro/conduce/garantía | Cierre único, trazable e idempotente |

Si la decisión de negocio es una sola autorización, unir los dos últimos pasos operativos conservando evidencias y controles de versión. No implantar dos autorizaciones por inferencia.

## Experiencia de uso

- Técnico: una pantalla de visita, progreso visible y una acción principal por etapa. Ejemplos: Iniciar visita, Enviar diagnóstico, Esperando respuesta de oficina, Solicitar cambio, Enviar trabajo terminado.
- Oficina: agenda y una bandeja Necesita mi respuesta; abrir cada caso muestra diagnóstico, fotos, propuesta, tarifa de referencia, diferencia e historial en el mismo panel.
- Pedir información con motivo breve, sin obligar al técnico a volver a cargar todo. Conservar borradores y fotos frente a mala señal; indicar claramente pendiente de enviar frente a recibido por oficina.
- Las notificaciones avisan; el estado persistente de la orden determina qué está pendiente. No depender de que alguien vea un aviso o tenga la aplicación abierta.
- Reintentar un envío no duplica propuesta, cita, compra ni cierre. Responder sobre una versión vieja avisa que hay cambios y requiere revisarla de nuevo.
- Excepciones explícitas: cliente ausente, diagnóstico sin reparación, falta de pieza, sin internet/GPS, reprogramación y cambio de técnico. No usar cerrar como salida universal.

## Implementación y validación recomendadas

1. Resolver la autorización única/doble y documentar el contrato de estados y permisos por campo.
2. Preparar pruebas de reglas con dos identidades reales de prueba en entorno aislado: no autoaprobar, no cambiar precio autorizado, no validar piezas propias, no cerrar por otro campo, no actuar sobre otra asignación. Incluir operaciones legítimas para no endurecer rompiendo el trabajo.
3. Introducir propuesta técnica estructurada y revisión en la misma ficha, con versiones y decisiones trazables.
4. Alinear reglas/servidor, formularios, botones y notificaciones; guardar transición y auditoría juntas. Tratar registros antiguos explícitamente para no autorizar cierres por defecto.
5. Hacer piloto con una operaria y un técnico, desde WhatsApp/cita hasta cierre, incluyendo rechazos, cambios, desconexión y respuestas simultáneas.
6. Después integrar Calendar como proyección, revisar conflictos y ampliar progresivamente. El usuario indica que todavía no se ha implantado el sistema: aprovechar esa etapa para validar primero el recorrido completo.

Esta revisión no cambia las reglas desplegadas ni afirma que el control ya esté asegurado. La revisión administrativa de garantías añadida antes corresponde al ajuste económico posterior; no resuelve por sí misma la autorización de reparación o cierre analizada aquí.
