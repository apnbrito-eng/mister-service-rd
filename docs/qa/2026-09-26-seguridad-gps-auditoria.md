# Corrección local: credencial GPS e identidad en auditoría

26 de septiembre de 2026. Base: bc59269. Estado: implementado y probado localmente; publicación pendiente. No se modificaron servicios remotos.

## Cambios

- `firestore.rules:698`: configuración GPS legible únicamente por administrador. El servidor conserva acceso mediante Admin SDK.
- `src/services/gps.service.ts:86`: consulta de ubicación sin leer configuración privada; envía únicamente vehículo e identificación de sesión al servidor.
- `src/pages/Configuracion.tsx`: lectura y formulario de configuración GPS limitados al administrador.
- `api/gps/ubicacion.ts`: cuando el proveedor configurado es el dispositivo del técnico, devuelve 503 sin consultar un proveedor externo; el cliente conserva el resultado null. La ubicación del dispositivo se consulta por las suscripciones existentes, no por este proxy.
- `firestore.rules:979`: creación de auditoría exige al menos uno de los campos `actorUid` o `solicitanteUid`. Todos los presentes deben coincidir con la sesión. Rechaza ambos ausentes, valores vacíos, tipos incorrectos e identidades contradictorias.
- Compatibilidad: confirmación de pagos añade `actorUid`; reactivación de campañas y eliminación de comisiones usan identidad autenticada. Citas y facturas pasan el UID de sesión en lugar del identificador de perfil. No se modificaron cálculos de dinero.

Los eventos automáticos escritos por Admin SDK quedan fuera de las reglas de cliente. Este cambio no audita todos los escritores de servidor ni demuestra veracidad semántica de cualquier acción registrada.

## Evidencia

1. Antes de corregir: las pruebas que exigen seguridad fallaron en seis casos (cinco roles leían GPS; técnico creaba auditoría sin actor). Tres controles pasaron.
2. Después: suite completa de reglas, **54/54**. Incluye bloqueo de cinco roles no administradores, acceso de administrador y compatibilidad de ambos formatos legítimos de auditoría.
3. Integraciones: **264/264** en la suite, incluidas tres nuevas pruebas de GPS sin lectura de credenciales.
4. Cuatro pruebas adicionales de escritores: **4/4**. Confirman identidad y escrituras de pago/campaña/comisión, conservación del monto del pago y ausencia de mutaciones sin sesión.
5. Compilación de aplicación y API: correcta. Advertencia del empaquetador sobre archivos grandes.
6. Revisión de diff: sin errores de whitespace.
7. Cazadores: cuatro alertas; reglas pendientes de despliegue y avisos en notificaciones, consultas WhatsApp y manejo de errores Meta. Los archivos señalados por estos tres últimos no fueron modificados. Estos avisos ya figuran en la transcripción previa aportada por Jorge; no se ejecutó una comparación de toda la suite contra un checkout limpio de la base.

Pruebas: `tests/rules/seguridad-residual.rules.test.ts`, `tests/integraciones/gps-credencial-privada.test.ts`, `tests/integraciones/auditoria-identidad-writers.test.ts`.

## Límites y publicación

Entorno: emulador Firestore con proyecto demo y datos ficticios; integración GPS con servidor simulado. No se leyó una credencial real ni se consultó el proveedor. No equivale a prueba en móvil físico, despliegue ni validación de reglas remotas.

Para publicar, coordinar aplicación/API y reglas: primero los escritores compatibles y el cliente GPS sin lectura privada, después las restricciones de reglas. La rama contiene cambios anteriores ajenos a esta corrección; revisar el conjunto antes de publicar. No se hizo commit, push ni despliegue en esta tarea.


## Segunda revisión de Claude contrastada — 26/09/2026

Fuente: transcripción aportada por Jorge, revisión de solo lectura sobre la corrección previa al rediseño WhatsApp. No certifica el rediseño añadido después.

- **H1 corregido:** el formulario ya no recibe el id de perfil como identidad. El servicio obtiene el UID de Auth y guarda configuración y auditoría en un lote atómico. Si la auditoría falla, no se guarda la configuración ni se muestra éxito. Sin sesión rechaza antes de escribir.
- **H2 reforzado:** confirmación de pago obtiene actorUid de Auth para el pago y auditoría. El argumento id se conserva por compatibilidad, pero no determina la identidad. Sin sesión devuelve una razón explícita que la pantalla comunica.
- **H3 reforzado:** descuento por piezas de garantía obtiene solicitanteUid de Auth y rechaza sin sesión antes de consultar/aplicar ajustes. Valores vacíos o ids de perfil del caller ya no llegan al descuento ni a su auditoría. No cambia el cálculo ni la atomicidad del ajuste financiero.
- **Matiz importante H1/H3:** las reglas de la base bc59269 ya rechazaban un campo presente con UID ajeno, vacío o null. El cambio reciente exige además que exista al menos un campo de identidad; no introdujo el rechazo de esos valores presentes. El escenario sin documento usuarios/{uid} tampoco demuestra que el guardado de configuración pudiera completarse: las reglas exigen ese perfil para esAdminOCoord. Sí existía la fragilidad de aceptar un id de perfil y tragar el error de auditoría.
- **H4:** pruebas nuevas invocan los servicios reales de formulario, pago y descuento usando el SDK real contra el emulador. Solo se sustituye la selección de conexión/sesión; las escrituras, transacciones y reglas no se simulan. También se verifica rollback del lote de formulario si la identidad capturada no coincide. No constituye cobertura exhaustiva de todos los escritores del proyecto ni de Admin SDK.
- **H5:** corregida arriba la descripción del proxy GPS.
- **H6 confirmado:** obtenerUbicacionAPI no tiene callers en src; es defensa de un helper actualmente sin uso. La superficie activa corregida era la lectura de configuración GPS en Configuracion. No se elimina el helper en esta tarea.
- **H7 aclarado:** se conserva configuración/credencial GPS solo para administrador. Esto no cambia las lecturas de ubicaciones ni el mapa; no equivale a retirar el GPS operativo a coordinadora. No se amplían permisos de acceso a la credencial.

Verificación adicional: reglas59/59 (cinco nuevas con escritores reales), integraciones279/279 (incluye nueve de ficha/nombres y dos nuevas de identidad de descuento). Las pruebas comprueban que el monto del pago y el descuento se conservan, y que configuración/auditoría se guardan o rechazan juntas. Sigue pendiente publicación coordinada web/reglas/APK, proveedor GPS real y teléfono físico.
