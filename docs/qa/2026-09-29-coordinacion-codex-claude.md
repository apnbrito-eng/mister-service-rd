# Coordinación Codex y Claude — 29/09/2026

## Autorización y responsabilidades
Jorge autorizó manejar sus sesiones abiertas de Claude y Claude Code para comparar propuestas y organizar el trabajo. Sigue vigente sin publicar.

- Codex: coordina, contrasta hallazgos, implementa y prueba los cambios autorizados.
- Claude Cowork, conversación «Mister service app contexto»: segunda opinión de procesos y prioridades, solo lectura.
- Claude Code, sesión «Diagnóstico mister-service-rd»: revisión técnica acotada al checkpoint actual, solo lectura. Su diagnóstico antiguo no representa el estado actual.
- Un solo implementador por archivo. Las revisiones no autorizan despliegues, cambios de permisos ni datos reales.

## Base y evidencia
Checkpoint revisado: `80f704d3833ddb9e37f0e2cc31d41cb8ac75dfa4`. La ronda anterior pasó 547 pruebas; estas no cubren por sí solas los nuevos escenarios. Claude Cowork leyó código con git show y declaró que no ejecutó pruebas.

Sesiones fuente: Cowork `cse_01MV7iWEuJPeMCfKnSgLcFX3`; Code `local_48d90bc3-228e-4e4c-a3da-91e4c02b0aae`.

## Comparativa y decisiones
| Tema | Claude | Contraste de Codex / decisión |
|---|---|---|
| Seis correcciones anteriores | Aprobadas por lectura | Conservadas; aprobación no cubre el nuevo caso |
| Comisión tardía | Borrador existente no incorpora nuevas comisiones; futura nómina excluye fechas antiguas | Confirmado por lectura de generarLiquidacion líneas61–71 y133–136; falta reproducción automatizada específica |
| Conciliar fecha antigua | Puede dejar comisión fuera de una nómina cerrada y otra abierta esperando | Servicio no comprueba destino y resolución exige liquidada/anulada; pendiente prioritario |
| Prohibir toda fecha de período cerrado | Protección temporal insuficiente | Mantener fecha real; diseñar recuperación de atrasos sin reabrir pagos |
| Quitar bloqueo fueraPeriodo | Propuesta de lista informativa | Solo cuando exista ruta comprobada de incorporación y seguimiento de cada pendiente |
| Fecha anterior a creación de orden | Propone rechazar | No imponer a importados históricos sin validar procedencia |
| Permisos | Propone restringir comisiones/préstamos/avances | Diseñar por operación y probar roles; no retirar funciones legítimas por regla genérica |

## Orden de los próximos lotes
1. **Comisiones tardías y nómina:** reproducción A/B/C/D, fecha real separada del período de liquidación, incorporación explícita de pendientes a empleados abiertos, exclusividad concurrente y compatibilidad con nóminas antiguas. Preservar sueldos, pagos y descuentos ya cerrados.
2. **Permisos y validación:** matriz por rol/operación, pruebas de reglas, prueba móvil real. Preparar publicación coordinada; no ejecutarla en este alcance.
3. **Cobros y cierres:** distinguir por cobrar/por verificar; enlazar conduce, pago de orden, banco y cierre diario sin duplicar movimientos.
4. **Servicio y seguimiento:** cotización, pieza autorizada/pedida/recibida/instalada, taller, mantenimiento y avisos con acceso a orden y WhatsApp.
5. **Históricos y visión del negocio:** vigencias de sueldo/porcentajes, métricas compartidas y comparativas; después retomar personal, feedback, marketing, web, inventario y conocimiento según plan maestro.

## Criterios para cerrar el siguiente lote
- Comisión creada después del borrador recuperable y liquidada una sola vez.
- Fecha real de período cerrado conservada, atraso visible y destino de liquidación explícito.
- Empleado cerrado en nómina parcial permanece inalterado.
- Dos cierres/borradores concurrentes no duplican comisión ni descuento.
- No marcar pendiente como resuelto sin evidencia ni inventar fechas.
- Prueba de regresión, revisión externa y checkpoint antes de considerar publicación.

## Estado de esta ronda
Coordinación real iniciada en ambas interfaces. Cowork respondió y recibió el contraste. Claude Code confirmó por lectura los dos casos y señaló una carrera de creación frente a cierre como hipótesis que requiere emulador. No se cambió código de producción en esta ronda.

## Contraste técnico adicional de Claude Code
Coincide con Cowork en comisión posterior al borrador y conciliación de período cerrado. Propone recuperar atrasos preservando devengo y probar concurrencia real. No ejecutó las nuevas pruebas.

Matices de Codex que deben regir la implementación:
- Devolver el borrador existente no garantiza exclusividad concurrente: la creación actual puede duplicarse. Evitar llamar idempotente al flujo completo.
- El SDK cliente instalado define Transaction.get sobre DocumentReference, no queries (node_modules/@firebase/firestore/dist/index.d.ts:2908). La propuesta de tx.get(query) no se puede copiar al servicio actual; una consulta fuera de transacción tampoco impide nuevas inserciones concurrentes. Diseñar coordinación por documentos o servidor con recuperación garantizada.
- La comisión se devenga al terminar trabajo según decisión de Jorge, no al cobrar. Conservar semántica aunque el campo heredado se llame fechaCobro.
- No es necesario aprobar migración masiva ni cambiar fechaCobro por un campo nuevo para establecer la separación conceptual; evaluar compatibilidad antes.
- Dos cierres concurrentes pueden ser reintentos exitosos sin efectos repetidos. El criterio es aplicar una sola vez, no exigir exactamente un error.
- Traslado automático, cambio de reglas y backfill propuestos por Claude no fueron ejecutados ni se consideran decisiones confirmadas del usuario.
