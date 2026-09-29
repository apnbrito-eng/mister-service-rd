# Revisión independiente — base Bot Servicio

Revisión estática 28/09/2026. Alcance: política, presupuesto, jobs, equipos y endpoint administrativo. No envíos, proveedores ni modificaciones de producción durante la revisión.

## Hallazgo que requiere corrección

`api/_lib/equiposAtencion.ts:27-46` (versión inicial revisada): usa clienteId para reservas/cartera pero el ID de `crm_atencion` es waId. Una misma persona podía contarse dos veces; una cartera con responsable vigente pero sin equipoId explícito podía no conservar su equipo. La relación ya existe en `whatsapp_conversaciones/{waId}.clienteId` (ver `api/crm/atencion.ts:94`). Builder informado y corrigiendo; requiere repetir prueba con dos chats de un cliente y cartera existente.

## Controles comprobados por lectura

- Presupuesto reserva diario/mensual y ventana móvil del cliente en una sola transacción; hash de petición para idempotencia; resultado ambiguo conserva la reserva; conciliación repetida compatible no duplica devolución.
- Configuración solo administrador con token verificado y revisión de perfil activo. Versionado y auditoría se guardan juntos. La configuración rechaza habilitado=true y modo distinto de simulación.
- No imports o llamadas de envío Meta/proveedor desde esta base; el endpoint simular solo evalúa política. Logs inesperados del endpoint contienen clase genérica, sin mensajes del SDK ni datos del cliente.
- Jobs usan lease y epoch, invalidación humana y bloqueo por conversación; finalización idempotente. No constituye aprobación para futuros envíos externos: estos necesitan barrera previa y tratamiento de resultado ambiguo.
- Nuevas colecciones quedan bajo default-deny de Firestore; operaciones administrativas usan Admin SDK.

## Limitaciones de alcance

`politicaBotServicio.ts:8-11` y `bot-config.ts:41`: límites diarios/mensuales son valores permanentes; ampliación diaria con vencimiento todavía no implementada. No afirmar que todo el contrato IA está terminado. Reservas/jobs/equipos no están conectados al webhook ni al flujo real de respuesta.

## Evidencia independiente

14 pruebas aprobadas: `bot-servicio-politica.test.ts` (11) y `formulario-portada.test.ts` (3). Log `/tmp/ia-review-tests.log`.

La prueba del formulario usa el componente real y verifica preselección de equipo, descripción vacía obligatoria, intención agregada solo al envío y conservación de texto ante llegada tardía de configuración. No envía solicitudes reales.

Tests de concurrencia Admin SDK del emulador están bajo ejecución del builder; esta revisión no los atribuye como ejecución propia.

## Revisión posterior a corrección

Builder añadió vínculo explícito conversación→cliente y equipo derivado de responsable de cartera, además de rechazo de contradicciones/no vinculación. Releído el código: el hallazgo de identidad señalado queda corregido para el ensayo. Nueva prueba del builder enfrenta carga empatada para detectar doble conteo y preserva cartera sin equipoId. GO estático para base desactivada; no aprobación de operación real ni de ampliaciones temporales aún pendientes. El escaneo transaccional completo de varias colecciones requiere evaluar volumen antes de integrar reparto al tráfico real.

## Reglas verificadas contra emulador

`tests/rules/bot-servicio-acceso.rules.test.ts`: cuatro pruebas, 180 aserciones negativas sobre nueve colecciones (configuración, presupuesto, reservas, jobs, clientes, alertas, sesiones, asignaciones y reparto). Administrador, técnico, secretaria y anónimo no pueden leer documentos/listar/crear/editar/borrar desde el SDK cliente. PASS en emulador aislado8298, proyecto demo-bot-rules-aislado; log `/tmp/bot-rules-review.log`. No fue necesario modificar reglas.

## Revisión jornada y registro seguro

`api/movil/estado.ts` conserva identidad del token, App Check nativo, rol técnico, ponches del día en transacción y muestras limitadas a sesión propia. La respuesta inesperada ya era genérica, pero faltaba observabilidad. Con autorización del coordinador se añadió únicamente registro `ESTADO_MOVIL_ERROR` y clase genérica, sin mensaje del SDK/token/coordenadas. `movil-estado-privacidad.test.ts` comprueba que un error con texto sensible no se imprime ni devuelve. No cambia lógica de jornada ni permisos. Prueba física sigue pendiente; Samsung bloqueado no cuenta como validación.

## Ampliación administrativa y panel — revisión posterior

La limitación anterior sobre ampliación diaria ya está implementada para el simulador: documento con clave de día RD; al cambiar de día deja de participar del presupuesto. Mensual permite período actual o cambio permanente explícito. Reserva lee límites y gasto diario/mensual juntos, por lo que ampliar un tope no elimina el otro. `guardar` ya rechaza cambiar límites fuera del flujo auditado.

Revisión independiente sin editar código del builder:
- 15 pruebas backend aprobadas en emulador aislado8298, incluidas concurrencia global, idempotencia, cupo móvil, conciliación, pausa, roles, identidad y vencimiento diario/cambio mensual permanente. Log `/tmp/bot-backend-independent.log`.
- 3 pruebas UI aprobadas, incluida doble pulsación y mismo requestId al reintentar después de POST aplicado y GET fallido. Log `/tmp/bot-ui-review.log`.
- Colección `bot_servicio_sim_limites` agregada a comprobación negativa: ahora10colecciones/200aserciones,4pruebas aprobadas. Log `/tmp/bot-rules-review.log`.
- Lectura móvil: columnas se apilan, fieldsets min-w-0, controles44px y errores con salto de palabra. La comprobación visual real corresponde al QA del coordinador.

GO para panel y ampliación del simulador. El pipeline/store runtime separado aún está en construcción y no recibe esta aprobación; no activar envíos reales por este informe.

## Revisión independiente del runtime integrado (cierre local)

- GO local del pipeline/store tras corregir dos hallazgos: timeout inmediato debe producir handoff visible; una entrega tardía debe respetar epoch/pausa de atención humana. No se autorizaron ni ejecutaron llamadas reales a Anthropic/Meta.
- 10 pruebas de store real en emulador aislado8299 PASS. 16 pruebas de pipeline/worker/Meta PASS (11 pipeline tras endurecimiento de dirección literal). 22 colecciones×4 perfiles×5 operaciones=440 aserciones negativas de reglas PASS, incluidas colecciones de handoff y reparto.
- Preparación de runtime y ampliaciones:17 pruebas backend independientes PASS antes de ampliación de alias; la validación final global debe incluir las nuevas pruebas del builder para alias.
- Identidad canónica preserva el cupo al vincular teléfono y cliente; presupuesto real separado del simulador. Flags explícitos, cron autenticado y canal central verificado.
- No equivale a habilitación en producción: índices, configuración, credenciales, tokens legítimos, cron y prueba controlada de entrega continúan siendo verificaciones de despliegue.
- Conocimiento: el editor propone texto manual vacío inicialmente y no copia datos de conversaciones. Cola pendiente y aprobación humana ya existentes; todavía no alimenta al bot público. Se señaló al builder idempotencia faltante ante respuesta HTTP perdida al crear propuesta.

## Contadores del menú

Ocho destinos tienen badge: WhatsApp, Solicitudes, Citas, Reprogramaciones, Sugerencias de chequeo, Piezas, Pagos y Conduces. Los restantes no tienen contadores universales implementados. No se deben presentar ceros inventados en módulos sin una definición de pendiente.

El contador WhatsApp pasó de suma de mensajes a cantidad de conversaciones sin leer. Prueba dedicada cubre dos mensajes de un mismo chat=1 y actualización al leer. Se preservan suscripción y permisos; esta unidad no equipara filtros personales de chats ocultos del endpoint de bandeja con el contador lateral.

Otros riesgos de semántica preexistentes: Piezas suma dos fuentes sin deduplicar entidades; Citas cuenta documentos de la colección entera. Confirmar unidades deseadas antes de ampliar ese comportamiento. Los totales genéricos de Clientes/Empresas no equivalen a pendientes de atención.


## Revisión independiente final de reparto y entradas públicas

El reparto tiene bandera independiente de la IA, desactivada por defecto. El canal web usa identidad separada y no vincula ni modifica una ficha o conversación por un teléfono declarado por el visitante. Se preservan responsables previos; el cursor y las asignaciones se escriben en la transacción que lee las cargas.

Se detectó y devolvió al builder una carrera al cambiar configuración entre recuperación y reclamación de trabajo: la cancelación dejaba de ser recuperable sin atención visible. La rama corregida crea el aviso humano y el pendiente en la misma transacción. La pausa humana conserva su rama propia.

La revisión de subidas detectó reintentos que podían crear otro permiso y consumir cuota otra vez tras una respuesta perdida. El cliente corregido conserva permiso por archivo y contexto, comparte la operación en curso y consulta finalización antes de repetir PUT. La firma V4 fija tamaño, MIME y creación exclusiva; la finalización valida metadatos y permite recuperar un objeto existente tras caducar el permiso.

Verificación independiente: 17 pruebas backend de citas, formularios dinámicos y permisos de subida pasaron con Firestore emulado y HTTP local; tres pruebas de reintento/firma SDK pasaron. Se ampliaron las reglas negativas a 33 colecciones privadas: cuatro roles por cinco operaciones, 660 denegaciones verificadas. Evidencia local: `/tmp/review-public-final.log`, `/tmp/review-private-final.log`.

Dictamen de entradas públicas: GO local; publicación retenida hasta verificar App Check legítimo, firma y CORS del bucket desde navegador, y secuencia API/frontend antes del cierre de reglas. Los ensayos de Storage usan adaptadores: no prueban IAM ni transferencia real. El comodín de Storage para usuarios autenticados sigue siendo una limitación anterior, preservada en este alcance. No se hicieron envíos externos ni modificaciones de producción.

Reparto/runtime: 19 pruebas independientes en emulador aislado8299 PASS, incluyendo webhook real hacia handoff, visitante sin ficha, reparto con IA apagada, separación de identidad web y cambio de configuración entre recuperación y claim. Evidencia: `/tmp/review-runtime-integrated-final.log`. Dictamen GO local de la integración; no certifica proveedor, Meta, cron productivo ni teléfono físico.
