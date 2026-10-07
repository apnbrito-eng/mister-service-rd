# Equipos reales e inactivos separados

Objetivo de Jorge (06/10/2026): sustituir la organización estática por columnas de usuarios guardados y separar desactivados en un desplegable.

Fuente funcional: f534902. Dirección para administrador/coordinadora sin equipo; A/B según equipo asignado; demás activos sin equipo en columna propia. El rol no asigna automáticamente otro equipo. Acciones individuales conservadas y botón a modal de rol/permisos existente. La plantilla inicial se conserva plegada al final. La lista se recarga con cambios de personal y tras finalizar la sincronización del modal de permisos.

Validación local: build web correcto; 184 archivos / 1,261 pruebas de integración correctas; dos pruebas nuevas de organización y movimiento entre columnas; ESLint sin advertencias y cazadores sin hits al commit. No se cambiaron reglas ni permisos del servidor.

La publicación y la instalación Android se registrarán tras verificarlas. La activación pendiente de los 16 empleados requiere aplicar la plantilla con la clave introducida por Jorge; este cambio de vista no activa cuentas por sí mismo.

## Publicación verificada

Web oficial: commit 07a3be1, builtAt 2026-10-07T01:27:06.086Z, Vercel dpl_744cD8TSCQBJCFS4vDVjnGeGpEh8 promovido. Chrome producción: Dirección 2, A 7, B 7; Desactivados 20. Desplegable abierto/cerrado sin mutar cuentas. Vista 412px: contenido 412px, tres secciones apiladas con ancho 340px. Capturas locales /tmp/equipos-dinamicos-web-produccion.png y /tmp/equipos-dinamicos-movil-produccion.png (no subir datos privados de cuenta al repositorio).

Android 1.0.24/code25 instalado en Samsung R5CWC2EWGJN, Success y dumpsys corroboran versión; aplicación abre sesión existente de Jorge. Firma oficial validada; 257 recursos contrastados y tres archivos de organización coinciden con source-manifest.json. SHA256 instalador local y descarga oficial: 055362d02919435c0cee008a242ec542b470bb2f112819d0658285889b3daa0b. No se ejecutaron modificaciones de empleados reales como pruebas.

La plantilla ya fue aplicada: 16 accesos activos verificados en DOM. Esto reemplaza el pendiente de activación mencionado arriba. Prueba de movimiento entre equipos y desactivación se hizo con fixtures, no con cuentas de producción.
