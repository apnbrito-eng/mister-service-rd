# Unificación de áreas — entrega para revisión

## Objetivo y autorización
Jorge aprobó el ensayo y pidió implementar, construir y preparar el trabajo para revisión de Claude antes de la siguiente publicación web/APK. Fuente: conversación 01a0e013-8ae2-7ed0-be3e-23142f7e2ae3, 27–28/09/2026. La última publicación verificada sigue siendo 1.0.11. Esta entrega está en el árbol local, pendiente de revisión y publicación.

## Distribución implementada
Una entrada lateral por área, con opciones internas:

| Área | Contenido |
|---|---|
| Mi día | Resumen y ponche |
| Atención y clientes | Inbox completo, clientes, clientes y responsables, solicitudes, citas por confirmar y empresas aliadas |
| Servicios | Órdenes, agenda, calendario, rutas, reprogramaciones, sugerencias de chequeo, piezas, taller, mantenimiento, anuladas y calendarios públicos |
| Contabilidad | Cotizaciones, pagos, conduces, cierre, gastos, bancos, resultados, reporte avanzado, nómina, comisiones, avances y préstamos |
| Equipo | Personal, accesos, asistencia, rendimiento y métricas |
| Marketing y recursos | Marketing, NPS, web, formularios, plantillas, precios, inventario y conocimientos |
| Asistente IA | Chat e historial |
| Pie | Configuración y cierre de sesión |

Las rutas existentes se conservan para enlaces y notificaciones. El menú lateral compacto también muestra áreas, en vez de decenas de iconos. Los permisos y contadores de las entradas originales se conservan en el catálogo compartido; el área muestra la suma de avisos de sus entradas visibles. El Inbox conserva sus buzones y contadores propios.

## Archivos principales
- `src/navigation/areas.ts`: catálogo extraído del Sidebar, con permisos originales y agrupación final.
- `src/components/Sidebar.tsx`, `Layout.tsx`, `NavegacionMovil.tsx`: accesos por área.
- `src/pages/AreaTrabajo.tsx`, `src/components/EspacioTrabajo.tsx`, `src/App.tsx`: páginas de área y navegación interna; Solicitudes y Citas comparten subnavegación.
- `src/context/AtencionContext.tsx`: selección de cliente en memoria durante la sesión del layout.
- `src/pages/Clientes.tsx`, `InboxConversacion.tsx`, `Inbox.tsx`, `Solicitudes.tsx`, `Citas.tsx`: continuidad de selección y filtro por teléfono. La ficha usa ID cuando está disponible; al regresar a una conversación conocida se conserva su identificador. «Ver todos» limpia la selección y vuelve al área.
- `src/navigation/clienteSeleccionado.ts`: comparación de teléfonos que rechaza vacíos y no recorta códigos internacionales distintos.
- `src/pages/Solicitudes.tsx`: búsqueda, estado y empresa en controles verticales para móvil y en columnas para escritorio.
- `src/pages/Clientes.tsx`: nombre ocupa una fila propia y las acciones se distribuyen debajo, evitando la compresión letra por letra.
- `src/components/inbox/MensajeBubble.tsx`: cierre exterior/Escape, capa exterior para evitar activar otra acción, separación vertical y acciones después de la burbuja entrante.

## Verificación
- Batería completa: 303 pruebas de integración pasan (69 archivos), tras los cambios de navegación y contexto.
- Pruebas nuevas: todos los destinos antiguos presentes una vez, nómina/IA ubicadas, visibilidad por rol, suma de avisos, normalización de teléfono y continuidad de cliente/limpieza de selección.
- Prueba antigua actualizada: nómina pertenece ahora a Contabilidad; asistencia sigue en Equipo.
- Compilación web con TypeScript de app y API: pasa. Recursos móviles de producción: pasan, con guardas de App Check activas.
- Lint dirigido: cero errores; avisos de hooks/refresh/tipos aún presentes. No se presenta como auditoría limpia del repositorio.
- Navegador: componentes reales de área y navegación con proveedor ficticio. Subnavegación Recibidas/Citas visible en 390px; ancho del documento 390px, sin desbordamiento. Esa prueba no carga datos reales de las páginas destino.
- Evidencia: `evidencias-mejoras-20260927/06-navegacion-real-movil.png`. Ensayo navegable: `tests/manual/areas.html`, servidor local puerto 5210 mientras esté activo.

## Puntos que Claude debe revisar
1. Comparar catálogo previo de Sidebar con el nuevo: destinos, roles, permisos y avisos. Revisar el caso de coordinación que puede ver Citas pero no Solicitudes de formularios.
2. Verificar continuidad del cliente, liberación de selección, cliente sin teléfono y conversaciones sin cliente vinculado. El filtro de solicitudes/citas usa teléfono, no una migración ni fusión de registros; números compartidos pueden agrupar más de un registro.
3. El Inbox continúa buscando sobre páginas cargadas. Una conversación antigua no cargada puede no aparecer al entrar desde Clientes; no afirmar búsqueda global. Revisar este límite antes de publicación.
4. Revisar cierre exterior del menú de mensajes, posición con burbujas largas, teclado y lector de pantalla. Falta prueba física Android de estos gestos.
5. Verificar Clientes en iPad físico al girar y Solicitudes con registros reales en lectura. La corrección de distribución aún no tiene validación física.
6. Revisar navegación de enlaces antiguos y permisos de rutas: se reutilizan los actuales, no se ampliaron reglas de Firestore ni roles.
7. El árbol contiene cambios previos de GPS, auditoría, nómina, ficha y Android ya publicados. Distinguirlos de esta entrega; no revertirlos ni atribuirlos todos a la unificación.

## Revisión solicitada
Revisar en modo lectura. No editar, publicar, instalar ni ejecutar acciones sobre registros reales. Entregar hallazgos con severidad, archivo y evidencia, distinguiendo fallos confirmados de hipótesis. Indicar si bloquean la publicación. Este informe no certifica recorridos que no se probaron.

## Pendientes de entrega
Revisión de Claude, resolver hallazgos, comprobación integral de atención con datos controlados y prueba física Android. Publicar web y APK después de esa revisión; no presentar el ensayo ni una compilación como publicación completada.

## APK candidata construida
- Versión 1.0.12, código 13, identidad `com.misterservicerd.app`.
- Archivo local: `/Users/jorgeluisbritogarcia/.codex/artifacts/mister-service/2026-09-28/mister-service-rd-1.0.12-candidata.apk`. No subida a descargas públicas.
- Gradle release pasa. Firma verificada; certificado SHA256 `d65aec5154307ec45f707402ba180d0f9a22746d7e37dda46886f4950e8ca2cd`, igual a la versión publicada.
- SHA256 APK: `1122b2d1969e096b5039c1146266273f7e63a6dfe63853e835ad098d2b36c8da`.
- Contenido del instalador verificado: nuevas áreas, subnavegación de citas y versión móvil de producción. No se instaló en teléfono físico.
- Snapshot nativo temporal: `/tmp/mister-android-review-20260928/android`. Se adaptó identidad, recursos Firebase y paquetes Java (incluido VoiceNote), y se excluyeron únicamente copias idénticas con nombres inválidos del snapshot. El proyecto Android de ensayo del repositorio se conserva.
- Última batería completa: 303/303 pruebas. Compilación web/API y recursos móviles pasan. No se cambió ni desplegó seguridad Firebase en esta entrega.

## Cierre de revisión y publicación posterior
El informe de Claude se contrastó con el código: los permisos de Métricas/Precios/Inventario ya existían antes de esta entrega; no se aplicó truncado de teléfonos internacionales porque puede unir clientes distintos. Sí se corrigió el menú de mensajes: cierre al tocar fuera/Escape, foco de teclado y posición dentro de pantalla. Seis pruebas nuevas; total309 aprobadas. Android1.0.12/code13 y web publicados; APK remota idéntica al instalador firmado (SHA-256 `f52be99fc84f4e9745888fe98eaf05d11d35ded53c71e8097e9a35ab34223e47`). El enlace se entregó a Jorge. No se probó instalación en teléfono físico.
La siguiente revisión visual global se documenta en `docs/diseno/REVISION-GLOBAL-2026-09-28.md`.
