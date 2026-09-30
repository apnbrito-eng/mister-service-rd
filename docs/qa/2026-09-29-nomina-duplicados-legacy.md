# Nómina: duplicados legacy de comisión

Generación, actualización y cierre identifican más de un registro activo para la misma orden real y persona resuelta de forma única por ID/UID. No agrupan personas distintas, ni órdenes sintéticas factura-manual (reparto por ítems), ni comisiones anuladas. Historial totalmente liquidado no vuelve a bloquear salarios futuros; pendiente frente a liquidada requiere revisión.

La generación/actualización excluye importes sospechosos y conserva IDs en comisionesDuplicadas. Sólo ese empleado queda bloqueado. Nómina muestra motivo e IDs; los demás pueden cerrar y cobrar. No se selecciona automáticamente un ganador ni se borran documentos.

El cierre descubre candidatos y relee documentos en su transacción antes de excluir afectados. Una comisión duplicada descubierta después de generar impide liquidar al afectado. Inserciones de escritores legacy posteriores a la consulta no quedan excluidas transaccionalmente: la consulta no reserva la colección. Los nuevos escritores canónicos reducen ese vector, pero no sustituyen la conciliación de datos antiguos.

## Recuperación

Tras conciliación administrativa auditada de los duplicados, Actualizar comisiones relee los registros y retira el bloqueo si queda un devengo válido. Comisiones incorpora una sección administrativa para revisar el grupo, comparar comisión/costos/ajuste de garantía, elegir explícitamente el registro válido y escribir motivo con evidencia. El servicio relee documentos e identidades, exige administrador activo y bloquea si alguien ya liquidó un registro. Conserva el elegido intacto y marca los demás anulados con duplicadaDe, actor y fecha; auditoría guarda originales, selección y motivo en la misma transacción. Después se actualizan comisiones desde Nómina. Nunca tocar automáticamente una comisión ya liquidada.

## Evidencia

47 pruebas focales iniciales: 23 cierre parcial, 17 cierre atómico, 2 detector y 5 cazador. Se añadió posteriormente caso del cazador contra eliminación del detector. Casos: dos registros UID/doc de misma persona, técnico distinto, manuales por ítems, anuladas, ambos liquidados, pendiente/liquidada y duplicado creado después del borrador. P030 y P006 pasan; regression sólo P005/P013 pendientes. No pruebas nuevas con emulador ni datos reales.


## Entrega de conciliación

8 pruebas mock adicionales pasan: selección y auditoría, fallo sin parcial, dos decisiones concurrentes sólo un commit, liquidada/referencia de liquidación/liquidadaPor rechazadas, cambios de importe o grupo requieren revisión nueva, coordinadora denegada y sin selección no continúa. TypeScript y lint limpios. No se ejecutó emulador en este sublote; las pruebas de concurrencia usan cola transaccional simulada. No se promete exclusión frente a nuevas inserciones legacy posteriores a consulta.
