# Revisión de simuladores — 23/09/2026

**Estado: revisión parcial, no aprobada para producción.** Solicitud: revisar cada módulo y función en iPhone y Android. Se preservó el trabajo previo del checkout. No se desplegó, no se modificaron clientes reales, no se enviaron mensajes ni eventos externos.

## Correcciones realizadas

- Agenda: “En progreso” ya no incluye citas agendadas o en gestión sin inicio de chequeo. Se añadieron seis pruebas.
- Avisos: destino técnico incluye la orden concreta, después de validar asignación en servidor. La vista abre esa orden por identificadores exactos y rechaza una asignación diferente. Cuatro pruebas del endpoint.
- Vista técnica: se eliminó el reconocimiento de órdenes por coincidencia parcial de nombre; se usan UID o ID exacto de perfil legacy. Tres pruebas. Panel de jornada recibe auth.uid.
- Android: se identificaron tres copias idénticas `config N.xml` que impedían compilar; se preservaron fuera del árbol de recursos. Una copia reapareció durante el trabajo: la corrección del entorno de archivos no está concluida. Compilación final exitosa desde snapshot local fuera de Documents, excluyendo únicamente esas copias inválidas.
- Chat técnico: filtro visibleTecnico aplicado antes del límite; 90 mensajes privados ya no desplazan dos mensajes compartidos. Dos índices compuestos preparados, NO publicados.
- Calidad: ESLint excluye bundles generados de Capacitor; cuatro firmas de callbacks de pruebas sustituyen el tipo Function. No se deshabilitaron reglas sobre src. Se justificaron falsos positivos del cazador orderBy mediante los filtros/campos persistidos y un catch de autorización que todavía no llama a Meta.

## Pruebas ejecutadas

| Comprobación | Resultado | Límite |
|---|---|---|
| Integraciones | 206/206, 44 archivos | No equivalen a recorrer todas las pantallas |
| API móvil con Firestore aislado | 18/18, 2 archivos | App Check/autenticación simulados por esos tests; almacenamiento y concurrencia locales reales |
| Recorrido CRM con Auth/Firestore emulados | Pasó | Presupuesto, roles, anticipo, confirmación, efectivo y rendición; no cámara/firma visual |
| Reglas de facturación con SDK cliente | Pasó | Rechaza sin revisión, cambios posteriores, saldo y operaria; acepta snapshot vigente |
| Atención, expediente y webhook simulado | Pasó | Traspaso, seis buzones, permisos y reintentos; no WhatsApp real |
| TypeScript frontend/API y bundle móvil | Pasó | Compilación, no comprobación de negocio completa |
| ESLint | 0 errores, 150 advertencias | Advertencias pendientes; no certificar código sin deuda |
| Cazadores | 22 pasan; 2 bloqueos de publicación esperados | Firestore y Storage locales difieren del último deploy de producción registrado; no se publicaron para silenciar el control |

La primera invocación de los tests móviles usó 8289: jornada pasó, pero chat rechazó ese puerto por aislamiento. Se repitió con su configuración 8299 y pasaron los 17; tras agregar el caso de volumen pasaron 18.

## Pantallas observadas

iOS: Device Hub, simulador Mister Service Ensayo, iOS 27.0; cuenta coordinadora de prueba, paquete nativo staging. Compilación iOS final e instalación del paquete actualizado correctas; falta observar el nuevo paquete tras el desbloqueo. No es una prueba del XR físico ni de iOS 18 del XR. Dashboard, Agenda, Órdenes, creación de orden, Clientes, Citas por confirmar, registro de cita, Calendario, Inbox, Conduces de garantía y Pagos pendientes abrieron. Las listas estaban vacías; esto solo valida carga y presentación. Se probó escritura y desplazamiento en Registrar cita, sin guardar. Quedó un borrador ficticio sin confirmar cuando la Mac se bloqueó.

Android: AVD Mister_Service_QA, API 35 arm64. SDK Manager instaló inicialmente emulador Intel incompatible; se descargó variante oficial ARM64 con checksum verificado. APK inicial instalado y actividad iniciada; APK final recompilado desde snapshot aislado e instalado correctamente; sin errores AndroidRuntime en la consulta realizada. CUA no identifica la ventana del emulador como aplicación controlable, por lo que no se recorrieron sus módulos. La ausencia de errores de arranque no valida login, App Check ni funciones.

## Bloqueos y riesgos abiertos

1. Mac bloqueada: CUA exige desbloqueo manual; solicitud enviada al usuario. Falta continuar pantallas, roles, creación y flujo completo en cada plataforma.
2. Resolver control visible del emulador Android y validar acceso de ensayo/App Check. No se concede ninguna confianza adicional automáticamente.
3. Push: trabajador sigue limitado a últimos 50 avisos de 24 horas y sin programación confirmada; puede dejar avisos anteriores fuera cuando aumenta el volumen. Recepción con app cerrada/APNs no probada. El enlace exacto corregido necesita repetición visual.
4. Firestore local permite lectura de órdenes a todos los roles staff. El filtro visual corregido **no** sustituye aislamiento servidor. Revisar conjuntamente consultas técnicas/clientes y reglas antes de reducir acceso, incluyendo compatibilidad legacy. No afirmar seguridad integral.
5. Chat técnico: corregido el desplazamiento por mensajes privados y probado con volumen. Falta publicar API + índices y probar en el paquete nativo; el historial sigue limitado a los últimos 40 por sentido, sin paginación.
6. Recurrencia de copias de recursos Android en Documents; investigar sincronización antes de considerar reproducible la compilación desde ese directorio.
7. WhatsApp/Meta reales, cámara/GPS físicos, segundo plano, notificaciones reales y todas las operaciones contables no están certificados por esta revisión.

## Inventario para continuar módulo por módulo

“Abrió” significa pantalla observada, no todas sus funciones. Todos los módulos compilan. Android: recorrido visual pendiente en todos.

| Ruta | iOS en esta revisión |
|---|---|
| `/admin/dashboard` | Abrió; operaciones completas pendientes |
| `/admin/ordenes` | Abrió; operaciones completas pendientes |
| `/admin/ordenes/:id` | Pendiente de recorrido visual |
| `/admin/citas` | Abrió; operaciones completas pendientes |
| `/admin/calendario` | Abrió; operaciones completas pendientes |
| `/admin/agenda-dia` | Abrió; operaciones completas pendientes |
| `/admin/calendarios` | Pendiente de recorrido visual |
| `/admin/standby` | Pendiente de recorrido visual |
| `/admin/mapa` | Pendiente de recorrido visual |
| `/admin/clientes-responsables` | Pendiente de recorrido visual |
| `/admin/clientes` | Abrió; operaciones completas pendientes |
| `/admin/cotizaciones` | Pendiente de recorrido visual |
| `/admin/facturas` | Abrió; operaciones completas pendientes |
| `/admin/taller` | Pendiente de recorrido visual |
| `/admin/productos` | Pendiente de recorrido visual |
| `/admin/rendimiento` | Pendiente de recorrido visual |
| `/admin/metricas-mensuales` | Pendiente de recorrido visual |
| `/admin/reporte-avanzado` | Pendiente de recorrido visual |
| `/admin/mantenimiento` | Pendiente de recorrido visual |
| `/admin/gastos` | Pendiente de recorrido visual |
| `/admin/personal` | Pendiente de recorrido visual |
| `/admin/usuarios` | Pendiente de recorrido visual |
| `/admin/web` | Pendiente de recorrido visual |
| `/admin/empresas-aliadas` | Pendiente de recorrido visual |
| `/admin/formularios` | Pendiente de recorrido visual |
| `/admin/formularios/:id` | Pendiente de recorrido visual |
| `/admin/solicitudes` | Pendiente de recorrido visual |
| `/admin/marketing` | Pendiente de recorrido visual |
| `/admin/conocimiento` | Pendiente de recorrido visual |
| `/admin/asistente` | Pendiente de recorrido visual |
| `/admin/asistente/historial` | Pendiente de recorrido visual |
| `/admin/configuracion` | Pendiente de recorrido visual |
| `/admin/cierre-dia` | Pendiente de recorrido visual |
| `/admin/precios` | Pendiente de recorrido visual |
| `/admin/inventario` | Pendiente de recorrido visual |
| `/admin/comisiones` | Pendiente de recorrido visual |
| `/admin/nomina` | Pendiente de recorrido visual |
| `/admin/historial-anuladas` | Pendiente de recorrido visual |
| `/admin/bancos` | Pendiente de recorrido visual |
| `/admin/facturacion-pendiente` | Pendiente de recorrido visual |
| `/admin/pagos-pendientes` | Abrió; operaciones completas pendientes |
| `/admin/avances` | Pendiente de recorrido visual |
| `/admin/prestamos` | Pendiente de recorrido visual |
| `/admin/estado-resultado` | Pendiente de recorrido visual |
| `/admin/configuracion/usuarios` | Pendiente de recorrido visual |
| `/admin/ponches` | Pendiente de recorrido visual |
| `/admin/feedback` | Pendiente de recorrido visual |
| `/admin/sugerencias-chequeo` | Pendiente de recorrido visual |
| `/admin/reprogramaciones` | Pendiente de recorrido visual |
| `/admin/configuracion-marketing` | Pendiente de recorrido visual |
| `/admin/inbox` | Abrió; operaciones completas pendientes |
| `/admin/inbox/:waId` | Pendiente de recorrido visual |
| `/admin/notificaciones` | Pendiente de recorrido visual |
| `/admin/*` | Pendiente de recorrido visual |

## Evidencia local

Logs en `/tmp/mister-qa-*`: tests-final3, movil-api-final2, flujo, reglas, atencion, lint-final2, regression-final2, mobile-final3, ios-final3, android-final-isolated. Los archivos temporales no son almacenamiento permanente. Fuente: tarea 01a09b59-84f9-7543-bf2a-ff5256165bbc.

## Continuación 24/09/2026 — equipo desbloqueado

Estado: parcial, no aprobado para producción. Se arrancaron iOS27 y Android API35. No se utilizó el XR físico aunque apareció intermitentemente en Device Hub.

### Hallazgos y cambios nuevos
- Reproducido en iOS: validación de cotización quedaba bajo la zona de cámara/status. Toaster ahora respeta safe-area y aviso de ensayo. Recompilado/reinstalado y repetido envío vacío: «Cliente es requerido» completo bajo el aviso, sin escribir registros.
- Modal compartido respeta áreas seguras y banner; cabecera no encoge, contenido tiene su propio desplazamiento. Formulario de cotización observado tras instalar; falta repetir formularios largos con teclado de software.
- Cotizaciones: campo precio admite centavos (step 0.01), impide negativos; validación antes de persistir rechaza cliente/descripción vacíos o solo espacios, cantidades no enteras/positivas, importes no finitos y total desbordado. Once pruebas pasan. Esta validación de formulario no sustituye seguridad del servidor/reglas.
- Gastos: eliminada estimación fija de RD$3500 por orden cerrada. Gráfico y cobros del mes usan pagos explícitamente verificados por fecha de pago; excluyen eliminadas, pendientes, fechas desconocidas/futuras y montos corruptos. No se imputa fecha actual a pagos sin fecha. Cuatro pruebas de períodos/anticipos/saldos/importes pasan. Texto aclara alcance: pagos de órdenes, no contabilidad integral.

### Cobertura visual adicional iOS
- Clientes y responsables: filtros y tabla vacía observados (no completar carga/CRUD certificado).
- Cotizaciones: lista, nueva cotización, rechazo por cliente vacío, cierre de modal; sin creación válida.
- Cierre del día: resumen vacío y controles visibles; no ejecutar cierre ficticio.
- Bancos: lista vacía, formulario nuevo y cancelación; no guardar datos bancarios.
- Comisiones: filtros y acceso de garantías visibles, sin datos para liquidar.
- Personal: agrupación operaria/técnico y lista de cuentas ficticias; formulario nuevo abierto/cancelado por reinstalación, no crear cuentas.

### Verificación nueva
- 221/221 pruebas de integración, 46 archivos: /tmp/mister-qa-integraciones-20260924.log.
- TypeScript frontend/API, bundle y sincronización móvil pasan: /tmp/mister-qa-mobile-final-20260924b.log.
- Lint dirigido a Gastos, Modal y helpers nuevos: sin errores/advertencias. Diff check de archivos cambiados pasa.
- iOS build final pasa e instalado/abierto: /tmp/mister-qa-ios-final-20260924b.log.
- Android build final pasa, APK instalado con Success: /tmp/mister-qa-android-final-20260924c.log. Snapshot fuera de Documents excluye config N.xml duplicados; intento previo de copiar todo incluía archivos build y se interrumpió. Se repitió excluyendo build/.gradle y copias inválidas. No corregida aún su reaparición en origen.
- CUA no presenta ventana Android en inventario. No se hicieron taps/capturas por otros mecanismos. Recorrido visual Android sigue pendiente.
- Sin despliegue web/API/reglas, sin envíos externos, sin escrituras de negocio reales. Inventario anterior continúa pendiente donde no se detalla avance aquí. No confundir pruebas unitarias con validación completa nativa.
