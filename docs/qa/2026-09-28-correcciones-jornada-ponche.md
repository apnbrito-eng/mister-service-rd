# Correcciones posteriores a revisión de Claude — 28/09/2026

## Decisión confirmada
Jorge confirma comisión al terminar el trabajo, sin exigir cobro previo. Se conserva la generación existente al cierre administrativo y se aclara el texto de ganancias. No se introduce una política de comisión cobrada ni se cambian porcentajes. La creación antes de cobrar deja de clasificarse como fallo por sí misma.

## Cambios implementados localmente
- API de jornada consulta entrada/salida del día RD en transacción. Sin entrada abierta no inicia; salida o vencimiento detienen jornada y marcador del mapa al sincronizar. Las muestras previas al inicio se ignoran sin invalidar la sesión.
- Ponche nativo de técnico inicia/reconcilia tras guardar entrada y detiene tras guardar salida. Un fallo GPS se informa aparte; no presenta el ponche ya guardado como fallido ni invita a duplicarlo.
- Jornada conserva el estado activo y error ante fallos de autorización/red, reconcilia con el servidor ante conflicto, al montar el panel, al regresar de segundo plano y recuperar conexión. Cierre fallido conserva reintento. Inicio cancelado con respuesta tardía se compensa.
- Auth renueva una vez ante 401; transporte nativo renueva App Check una vez ante 403, sin ampliar roles ni permisos. La app ya usaba CapacitorHttp nativo y useLegacyBridge; no se añadió exclusión de ahorro de batería basada en una hipótesis.
- Panel remite al ponche para entrada/salida y ofrece sincronización. Cabecera técnica permite dos filas; nombre y contador no compiten por todo el ancho con acciones.

## Limpieza QA
Transacción limitada a OS-0011 / QA Test / modelo QA-ANDROID-20260928, comprobando precio100 y comisión10 pendiente antes de escribir. Precio final/sugerido y comisión/base se dejaron en0. Se conservaron valores anteriores, motivo y fecha de neutralización, historial, fotos y marca T de prueba. Sin borrar registros ni crear pagos, sin modificar otra orden, empleado o porcentaje. La garantía simulada y el registro QA siguen conservados como evidencia; no constituyen reparación real.

## Verificación
- Suite general:327 pruebas pasaron en72 archivos.
- Tras dos casos adicionales:16 pruebas dirigidas de jornada/renovación pasaron (13+3).
- Emulador Firestore aislado:14 pruebas del API móvil pasaron, incluida muestra previa y salida.
- TypeScript web/API, compilación web, recursos móviles de producción y lint de archivos modificados pasaron. Aviso habitual de tamaño de bundles.
- Una ejecución inicial más amplia del emulador incluyó chat-orden:3 fallos fuera del recorrido modificado, dos por App Check no configurado en ese fixture y uno del caso cierre/pausa. No se ocultaron ni se consideran aprobados. La repetición dirigida de jornada pasó completa.

## Límites y siguiente paso
Cambios en código local, NO desplegados, NO instalados en el Samsung. La APK publicada sigue1.0.16. No declarar resuelto el segundo plano físico: requiere publicar API y preparar/instalar APK compatibles, probar entrada/salida QA, bloqueo, regreso, reinicio, red interrumpida y al menos varios minutos en segundo plano. Android puede detener una app forzada por usuario/SO; no se promete seguimiento tras force-stop. No se modificaron reglas de seguridad ni se ejecutaron ponches de producción en esta corrección.
