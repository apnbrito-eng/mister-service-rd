# Entrega del primer lote — 29/09/2026

## Resultado
Primer lote del plan combinado implementado y revisado localmente. El plan completo continúa por etapas; no se ha construido todavía el registro central de movimientos ni el nuevo flujo completo de servicio.

### Correcciones nuevas
- IA: flecha, X, minimizar, Escape y prioridad de Atrás Android. Conserva conversación/borrador; el fondo no recibe el clic. Controles de44px con iconos pequeños.
- Órdenes: búsqueda por número, cliente, teléfono, equipo/modelo y falla; admite tildes, formatos telefónicos y prefijo dominicano. Conserva permisos y filtros existentes.
- Nómina: comisión, avance, cuota de préstamo y cierre en una transacción. Un fallo aborta todo; dos usuarios o reintentos no duplican descuentos. Conserva fórmulas y períodos existentes.
- Estado de Resultados: conserva pérdidas brutas y operativas en vez de recortarlas a cero.

### Trabajo anterior preservado y comprobado
Clientes/Inbox ya tenían cambios locales anteriores: alta independiente, dos canales WhatsApp y editor de ubicación. Se preservaron. En navegador móvil con datos ficticios se verificó abrir ficha, volver a lista y acceder al destino Inbox empresarial correspondiente. La creación independiente y las ubicaciones están cubiertas por las pruebas de integración existentes; no se creó ningún cliente real.

## Evidencia
- Suite final:104 archivos,474 pruebas de integración aprobadas.
- Finanzas dirigidas:14 pruebas aprobadas; emulador Firestore3/3 con reglas reales, incluyendo admin/coordinadora concurrentes y rechazo de técnico.
- Revisión independiente:GO tras corregir compatibilidad de comisiones antiguas sin estado, préstamos sin historial aún íntegros y recuperación con saldo inconsistente.46 pruebas focales aprobadas y lint limpio.
- Compilación web y tipos web/API aprobados; advertencia conocida por chunks grandes.
- Nuevos cazadores P028–P031 aprobados. La suite de regresión conserva dos bloqueos previos P005/P013 por reglas Firestore/Storage pendientes de despliegue; no se alteraron locks ni desactivaron controles.
- QA navegador375×812: IA abre/cierra con X, flecha, minimizar y Escape; borrador preservado y foco vuelve al botón. Clientes vuelve a lista y WhatsApp empresa llega al cliente elegido.
- QA escritorio1440×900: controles44px y hit-test sobre selector inferior devuelve backdrop, evitando pulsaciones al módulo detrás.
- Atrás Android probado con listener real y Capacitor simulado. Samsung desconectado: prueba física pendiente.

## Guardado y publicación
Respaldo previo de465 archivos, parche y manifiesto en ~/.codex/artifacts/mister-service/2026-09-29/lote1-resguardo/. Referencia Git local codex/resguardo-pre-lote1-20260929, commit5968915c94a435f31665efdb8b6051a9e82c1b52. Este respaldo incluye trabajo anterior, no atribuye todos esos cambios al lote.

Se conservará además una referencia local separada del lote, con inventario exacto en el manifiesto de entrega. Es un checkpoint para revisión; no es una publicación aprobada ni certificación de todos los cambios anteriores. La rama activa y su índice se mantienen. No push, despliegue, envíos WhatsApp, cobros ni descuentos reales.

## Próximos pasos del plan
1. Prueba Samsung con paquete y servidor compatibles. El checkout nativo actual conserva identidad de ensayo com.misterservicerd.tecnicos, distinta de la app instalada anteriormente com.misterservicerd.app; no generar un reemplazo engañoso ni sobrescribir configuración.
2. Revisar las reglas pendientes y el conjunto previo antes de publicar. Los bloqueos de despliegue no se resuelven publicando reglas sin revisar.
3. Auditoría financiera del siguiente lote: fechas ausentes (incluida fechaCobro en EstadoResultado), movimientos únicos y conciliación histórica. El período de comparación en paralelo debe concluir por criterios de conciliación comprobados, además del tiempo acordado.
4. Integración del servicio: piezas, taller, mantenimiento, solo chequeo, cotización, conduce, garantía y feedback; después reportes, personal/nómina y marketing/web según el plan maestro.

## Informes relacionados
- 2026-09-29-lote1-ia.md
- 2026-09-29-lote1-busqueda.md
- 2026-09-29-lote1-finanzas.md
- 2026-09-29-plan-maestro-mejoras.md
