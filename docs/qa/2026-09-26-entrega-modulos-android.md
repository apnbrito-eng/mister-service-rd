# Entrega de módulos y Android — 26/09/2026

## Alcance autorizado
Jorge pidió implementar todos los módulos discutidos y construir/publicar para probar en Android. Fuente: chat `01a0e013-8ae2-7ed0-be3e-23142f7e2ae3`. Incluye correcciones GPS/auditoría, ficha de cliente y garantías dentro del Inbox, nombres+teléfonos, Clientes y Responsables con filtros/búsqueda, contadores por buzón, Mis órdenes del día, y conexión revisable Ponche→Nómina→Estado de resultados.

Orden final del Inbox: Todos, Atiendo yo, Mis órdenes del día, Mi cartera, Órdenes del día, No leídos, Pendientes. Los avisos de mensajes cuentan conversaciones sin leer; los de órdenes cuentan órdenes activas aunque algunas no tengan chat vinculado. Refresco15s mientras visible, estado de fallo no se representa como cero.

## Verificación local
- 295 pruebas de integración /68 archivos pasan. Seis pruebas de clientes y cola se repitieron tras ajustes de lint, pasan.
- 63 pruebas de reglas/API /7 archivos pasan contra emulador Firestore.
- TypeScript app y API pasan; build web y mobile-production pasan.
- Lint global: cero errores,287 avisos. Se corrigieron cuatro errores triviales previos (Boolean redundante y tipos Function en test).
- Cazadores de regresión: P005 pendiente hasta desplegar reglas; P010,P015,P019 conservan seis hallazgos previos (notificación CRM, consultas y catches Meta). No se anuló el hook ni se presenta el barrido como limpio.
- Navegador local: excusa con motivo quedaRD$0; falta requiere confirmación; vista390px sin salida horizontal. No se escribieron asistencias, descuentos, pagos ni mensajes reales.
- El guard de build Android confundía `debugToken:!1` (false minificado) con true; corregido y probado para true/1/!0 y false/0/!1. App Check sigue activo y sin debug productivo.

## Android
- Versión1.0.10, versionCode11, package `com.misterservicerd.app`.
- Certificado SHA256 idéntico a1.0.9: `d65aec5154307ec45f707402ba180d0f9a22746d7e37dda46886f4950e8ca2cd`.
- APK SHA256: `c2f2211618d484984300ded9940cd33c80cca72fc0079b49c24479b18419dd27`.
- Firma verificada v1/v2/v3. Gradle assembleRelease pasa con Java21. Snapshot nativo fuera del repo en `/tmp/mister-android-release-20260926`, proyecto raíz mantiene configuración de ensayo. Clave de firma fuera del repo y de la carga a Vercel.
- Instalador `public/descargas/mister-service-rd-1.0.10.apk`; guía Android actualizada. No se modificó la guía separada de ensayo.

## Publicación
Completada en producción:
- Vercel deploy `G5iwJeQaCorv3L52cmoJLvRigVxQ`, URL `https://mister-service-opvq9r66v-mister-service-rd-team.vercel.app`, dominio `https://www.misterservicerd.com`. CLI terminó con código0. Build remoto completo, version.json muestra commit basebc59269 y builtAt2026-09-27T03:40:45.893Z. Incluye cambios del árbol local aún sin commit; no equivale a que ese commit base contenga toda la entrega.
- Se corrigió vínculo local antiguo de equipo conservando mismo projectId; CLI53 completó publicación. No se cambiaron permisos del proyecto.
- Firestore rules publicadas en `mister-service-app-cloude`; lock actualizado después del éxito. SHA2561c69d44db29c945d12d29e6360759a5e6c195b026ab86e50085bed5f183911a8. Storage sin cambios.
- APK pública descargada:15962606bytes, SHA256 idéntico al local documentado arriba. Endpoint asistencia sin sesión devuelve401.
- Navegador autenticado producción: Inbox18chats cargados, nombres+teléfonos visibles donde cliente identificado, Todos/No leídos muestran2 sin leer; orden final de botones correcto; asistencia administrativa carga personas y propuestas sin escribir datos reales; ClientesResponsables carga tarjetas14clientes/21órdenes con buscador por número/ID. Guía pública muestraAndroid1.0.10.
- Después del deploy P005 queda resuelto; los tres cazadores previos P010/P015/P019 continúan como deuda, sin ocultarlos ni ampliar alcance.

## Límites
Prueba física Samsung pendiente: instalación/actualización, sesión, App Check, cámara, audio, ubicación y push no se certifican por compilar. Calendario laboral cargado solo2026; otros años bloqueados para aprobación hasta verificar feriados. Correcciones de asistencia ya incorporada requieren proceso posterior; no se reescriben nóminas aplicadas/pagadas. No se auditó toda contabilidad ni todo el software.

Ver detalles en `2026-09-26-ponche-nomina-conexiones.md`, `2026-09-26-inbox-ficha-integrada.md` y `2026-09-26-seguridad-gps-auditoria.md`.
