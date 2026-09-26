# App para todos los roles: revisión del 21/09/2026

## Conclusión

La app Capacitor empaqueta la aplicación React completa, con las mismas rutas, menús, permisos y base de datos configurada que la web de su entorno. No es necesario crear cinco apps. El paquete de ensayo solo conecta a Firebase y servidor de ensayo. Supervisora corresponde al rol existente `coordinadora`; no se creó un rol nuevo ni se ampliaron permisos de usuarios reales.

Compartir código no acredita equivalencia operativa completa en Android/iPhone: todavía hacen falta recorridos físicos por rol y revisión de funciones propias del navegador.

## Matriz revisada

| Rol | Entrada | Funciones disponibles según permisos | Comprobación actual |
|---|---|---|---|
| Administrador | Panel de oficina | Gestión, órdenes, clientes, Inbox, administración | Rutas compartidas revisadas; política de entrada y registro de dispositivo probados |
| Secretaría | Panel de oficina | Clientes, citas, Inbox y módulos autorizados | Misma política y menú que web; pruebas de acceso/registro |
| Operaria | Panel de oficina | Órdenes, seguimiento, presupuestos, Inbox y módulos autorizados | Misma política y menú que web; pruebas de acceso/registro |
| Supervisora/coordinadora | Panel de oficina | Revisión, pagos, cierres y comisiones autorizadas | Misma política y menú que web; pruebas de acceso/registro |
| Técnico | Sus trabajos | Información autorizada, cámara, jornada y chat por orden | Asignación, revocación y permiso de contacto probados en servidor |

No se ejecutaron todas las acciones de cada módulo desde un teléfono. Esta matriz describe el acceso estructural revisado, no certifica toda la operación.

## Correcciones realizadas

1. La entrada raíz de la app lleva al login y desde allí al espacio correspondiente al rol; la portada pública de la web se conserva.
2. Perfiles desconocidos, inexistentes, eliminados o desactivados no pasan el guard de sesión.
3. Al cambiar de cuenta se limpia el perfil anterior y se ignoran respuestas tardías de cargas previas. La eliminación del perfil o un error del listener elimina el acceso visual en vez de conservar el perfil anterior.
4. El menú móvil se cierra al elegir un módulo. Enlaces de precios, inventario y métricas se alinearon con los permisos exigidos por sus rutas, sin conceder permisos adicionales.
5. Oficina tiene botón para registrar avisos móviles. API de dispositivos admite los cinco roles, mantiene GPS exclusivo de técnico y no permite eliminar el dispositivo de otra persona. Worker preparado para los cinco roles; sigue sin activación programada ni entrega física validada.
6. El cierre de sesión de oficina intenta retirar el dispositivo antes de salir. No se afirma garantía de retirada inmediata sin conexión.
7. Envío del técnico exige permiso explícito de contacto en servidor, antes de cada intento. La interfaz muestra solo lectura cuando falta ese permiso. Consultar textos compartidos sigue sujeto a asignación y orden abierta.
8. Nombre de configuración móvil unificado como Mister Service · Ensayo, conservando identificador instalado para permitir actualización. Android incrementa versión a 1.0.1-ensayo, código 2.

## Pruebas

- 180 pruebas de integración / 37 archivos: correctas.
- 17 pruebas de API sobre Firestore emulado aislado: correctas, incluyendo los cinco roles, propiedad de dispositivo, GPS exclusivo, permiso de contacto y revocación.
- Compilación web y móvil con TypeScript de frontend/API: correcta.
- Las pruebas de worker usan transporte simulado; no se enviaron notificaciones, WhatsApp ni eventos de Meta reales.

## Faltantes antes de asegurar paridad completa

1. Recorrer menú, creación/gestión de orden y cambio de cuenta en Android y en iPhone con cada rol. Cámara, GPS, permisos denegados y notificaciones requieren dispositivo.
2. Impresión de conduces usa `window.open` y mecanismos del navegador. Exportar, imprimir y compartir documentos necesita adaptación o verificación nativa; no está acreditado con la compilación.
3. Unificar fuente de perfil: AppContext puede priorizar `personal` por correo mientras APIs usan `usuarios/{uid}`. Si divergen roles/permisos, puede aparecer una función que el servidor rechace. La conciliación de registros/identificadores y sus reglas merece una migración separada con pruebas; no se modificaron datos reales.
4. Algunos módulos dependen de guardas internas además del menú/ruta. Falta auditoría exhaustiva de autorización por operación y reglas de datos; esta revisión no la sustituye.
5. Push: activar y probar worker, revisar paginación de pendientes, permisos y APNs. Registrar teléfono no demuestra entrega.
6. WhatsApp real permanece bloqueado en ensayo. Chat técnico permite textos autorizados y tiene límite de historial; compartir fotografías técnicas y documentos requiere flujo específico que preserve privacidad de cobros.
7. iOS requiere Xcode y firma; sin cuenta Apple Developer no hay TestFlight. Android físico aplazado por Jorge.
8. Persisten pendientes globales de Storage por orden/rol, Meta Purchase y conciliación de copias del proyecto.

Fuente: tarea 01a09b59-84f9-7543-bf2a-ff5256165bbc.

## Preparación del instalador

Android `assembleDebug` completado y firma verificada: versión 1.0.1-ensayo (código 2). SHA256: `9d361e67687547af8e4a657675fc8e3e741f6c35f90ba36fb5d8a9afc8527244`.
Se encontró `android/app/src/main/res/xml/config 2.xml`, duplicado idéntico de `config.xml`, que impedía compilar por contener un espacio en el nombre. Se conservó copia fuera del árbol de compilación antes de retirarlo. No se conoce la causa de su creación.

Xcode completo no está en `/Applications/Xcode.app`; la ruta activa sigue en CommandLineTools. No se generó IPA.

## Recorrido de aceptación pendiente en el teléfono

1. Secretaría: iniciar sesión, abrir y cerrar menú, encontrar cliente, agendar y consultar orden/WhatsApp.
2. Operaria: recibir caso, asignar/reasignar técnico, gestionar presupuesto y registrar abono pendiente.
3. Técnico: ver solo su orden, consultar texto compartido, comprobar chat de solo lectura sin permiso y envío autorizado en entorno controlado; cámara e inicio/cierre.
4. Supervisora: verificar pago, revisar trabajo y comisión, emitir documento; probar impresión/compartición nativa.
5. Administrador: gestión de usuarios/permisos, revisión de historial y restricciones personalizadas.
6. En el mismo teléfono: cerrar sesión y alternar roles; no deben quedar datos, sensores ni avisos de la cuenta anterior. Repetir con pérdida de conexión y cuenta desactivada.

Estas pruebas físicas no se sustituyen por las 197 pruebas automáticas.

El transporte nativo redirige las llamadas relativas `/api/` al servidor HTTPS configurado; Firebase mantiene sus SDK y el proyecto de ensayo. El Inbox de oficina utiliza ese transporte compartido, mientras el técnico usa el endpoint de orden asignada. No se sustituyó WhatsApp empresarial por WhatsApp personal.

## Publicado en ensayo y verificación remota

Web y APK actualizados solo en `mister-service-ensayo.vercel.app`, deployment `mister-service-ensayo-fax74g2j6-mister-service-rd-team.vercel.app` en estado READY. Descarga HTTPS del APK coincide con el SHA256 local indicado arriba.

Autenticación HTTP de las cinco cuentas ficticias correcta. Consulta de vínculo de una orden inexistente: administrador/coordinadora/secretaria/operaria reciben 404 esperado; técnico recibe 403; sin sesión 401. WhatsApp de ensayo continúa bloqueado con 403. Esto verifica acceso HTTP, no el recorrido visual de cada rol en teléfono.
