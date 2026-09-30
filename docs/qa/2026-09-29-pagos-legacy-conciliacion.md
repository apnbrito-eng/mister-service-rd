# B2 — pagos históricos pendientes de confirmar

## Cambio

La bandeja incluye pagos `verificado !== true`, conservando datos crudos y fecha inválida visible, sin completar con hoy. Pagos confirmados permanecen fuera de la bandeja. ID ausente/duplicado, fecha inválida, importe inválido o método desconocido impiden confirmar.

La confirmación relee el perfil autorizado por pagosVerificar y el pago dentro de la transacción. Rechaza datos incompletos; conserva actor Auth y auditoría atómica. Un pago legacy con datos válidos puede confirmarse explícitamente tras revisar la evidencia. El precheck del conduce ahora coincide con el gate transaccional: sin true se solicita conciliación.

## Reparación explícita

Para pagos no confirmados sin ID único o fecha válida, la bandeja ofrece Conciliar ID y fecha. Requiere fecha/hora real RD y motivo con evidencia. Relee snapshot por índice y huella; si cambió o ya fue confirmado, aborta. Genera ID sólo cuando falta o está duplicado; conserva fecha válida existente. Guarda antes/después y motivo en auditoría dentro de la misma transacción. Mantiene verificado false y no modifica importe/método. Después se requiere confirmar por separado.

Importe o método inválidos continúan bloqueados y necesitan revisión de datos; este lote no habilita alterar dinero ni inventa importes. Órdenes crmGestion conservan su flujo propio y no usan reparación legacy.

## Evidencia y límites

15 pruebas mock focales pasan (pagos/helper/auditoría/imagen). Cubren legacy undefined/false, confirmados excluidos, fecha e ID ausentes, reparación auditada sin confirmación, snapshot cambiado, pago confirmado y permiso denegado. Fixture existente de auditoría emulador actualizado para incluir fecha/método reales; emulador pendiente en este lote. P023 ampliado a bandeja y precheck; sin excepción nueva.

No hubo escritura de datos reales, despliegue ni envío de WhatsApp. La UI de reparación requiere QA integrado; tests de servicio no equivalen a prueba manual.
